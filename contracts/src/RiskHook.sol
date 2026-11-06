// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/base/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAdvanceBookReserve} from "./interfaces/IAdvanceBookReserve.sol";

/// @title RiskHook
/// @notice Uniswap v4 hook for the junior-share/USDC pool.
///  1. Fee: on every swap whose UNSPECIFIED currency is USDC, the hook charges `feePips` (1e6 = 100%)
///     of the unspecified amount. It returns the fee as the afterSwap delta and immediately calls
///     `poolManager.take` so the USDC lands in this contract as plain ERC-20 (no ERC-6909 claims).
///     - exact-in, USDC out: the swapper receives `out - fee`.
///     - exact-out, USDC in: the swapper pays `in + fee`.
///     The fee rounds down (in the swapper's favour). Swaps whose unspecified currency is not USDC pay nothing.
///  2. Reserve: `flush()` (permissionless) sends the accrued USDC to `book.depositReserve`.
///  3. TWAP oracle: per pool, a 64-slot ring buffer of (timestamp, tickCumulative), written in
///     afterInitialize and afterSwap, at most once per block (keyed on block.timestamp).
///     The hook tracks the latest pool tick (`lastTick`, read via StateLibrary.getSlot0 after each swap),
///     so a new observation accumulates the tick that actually prevailed since the previous observation
///     (Uniswap v3 semantics). A same-block move-and-revert therefore contributes nothing.
///     `consult` interpolates linearly between the two observations around the target time (exact, because
///     the tick is constant between observations) and extrapolates from the newest observation with `lastTick`.
///     Like any TWAP it is not proof against a manipulator who holds the price across blocks; callers should
///     use a window long enough for their risk.
contract RiskHook is BaseHook, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint16 public constant CARDINALITY = 64;
    uint24 public constant FEE_DENOMINATOR = 1e6;

    struct Observation {
        uint32 timestamp;
        int56 tickCumulative;
    }

    struct OracleState {
        uint16 index; // slot of the newest observation
        uint16 count; // number of populated slots (<= CARDINALITY)
        int24 lastTick; // pool tick after the most recent swap (or at init)
        bool initialized;
    }

    address public immutable usdc;
    address public immutable book;
    uint24 public immutable feePips;

    mapping(PoolId => Observation[64]) internal _observations;
    mapping(PoolId => OracleState) public oracleState;

    event FeeTaken(PoolId indexed poolId, address indexed sender, uint256 amount);
    event Flushed(address indexed book, uint256 amount);

    error ZeroAddress();
    error FeeTooHigh(uint24 feePips);
    error NothingToFlush();
    error FlushIncomplete(uint256 leftover);
    error PoolNotInitialized();
    error ZeroWindow();
    error InsufficientHistory(uint32 target, uint32 oldest);

    constructor(IPoolManager pm, address usdc_, address book_, uint24 feePips_) BaseHook(pm) {
        if (usdc_ == address(0) || book_ == address(0)) revert ZeroAddress();
        if (feePips_ >= FEE_DENOMINATOR) revert FeeTooHigh(feePips_);
        usdc = usdc_;
        book = book_;
        feePips = feePips_;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory p) {
        p.afterInitialize = true;
        p.afterSwap = true;
        p.afterSwapReturnDelta = true;
    }

    // ------------------------------------------------------------------ hooks

    function _afterInitialize(address, PoolKey calldata key, uint160, int24 tick) internal override returns (bytes4) {
        PoolId id = key.toId();
        _observations[id][0] = Observation({timestamp: uint32(block.timestamp), tickCumulative: 0});
        oracleState[id] = OracleState({index: 0, count: 1, lastTick: tick, initialized: true});
        return this.afterInitialize.selector;
    }

    function _afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        _recordObservation(id);

        // Specified currency is currency0 iff (exactInput == zeroForOne); the unspecified one is the other.
        bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        Currency unspecified = specifiedIs0 ? key.currency1 : key.currency0;
        if (Currency.unwrap(unspecified) != usdc || feePips == 0) return (this.afterSwap.selector, 0);

        int128 amt = specifiedIs0 ? delta.amount1() : delta.amount0();
        uint256 absAmt = amt < 0 ? uint256(uint128(-amt)) : uint256(uint128(amt));
        uint256 fee = absAmt * feePips / FEE_DENOMINATOR;
        if (fee == 0) return (this.afterSwap.selector, 0);

        // Positive return = hook is owed `fee` of the unspecified currency; PoolManager subtracts it
        // from the swapper's delta. `take` settles the hook's credit by sending the ERC-20 here.
        poolManager.take(unspecified, address(this), fee);
        emit FeeTaken(id, sender, fee);
        return (this.afterSwap.selector, int128(int256(fee)));
    }

    // ------------------------------------------------------------------ reserve

    /// @notice Send all accrued USDC to the AdvanceBook reserve. Permissionless.
    function flush() external nonReentrant {
        IERC20 token = IERC20(usdc);
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) revert NothingToFlush();
        token.forceApprove(book, amount);
        IAdvanceBookReserve(book).depositReserve(amount);
        uint256 leftover = token.balanceOf(address(this));
        if (leftover != 0) revert FlushIncomplete(leftover);
        token.forceApprove(book, 0);
        emit Flushed(book, amount);
    }

    // ------------------------------------------------------------------ oracle

    function _recordObservation(PoolId id) internal {
        OracleState memory s = oracleState[id];
        (, int24 tickNow,,) = poolManager.getSlot0(id);
        Observation memory last = _observations[id][s.index];
        uint32 nowTs = uint32(block.timestamp);
        if (nowTs != last.timestamp) {
            // Accumulate the tick that held since the last observation (lastTick), then advance the ring.
            uint16 next = (s.index + 1) % CARDINALITY;
            _observations[id][next] = Observation({
                timestamp: nowTs,
                tickCumulative: last.tickCumulative + int56(s.lastTick) * int56(uint56(nowTs - last.timestamp))
            });
            s.index = next;
            if (s.count < CARDINALITY) s.count++;
        }
        s.lastTick = tickNow;
        oracleState[id] = s;
    }

    /// @notice Time-weighted mean tick over [now - secondsAgo, now]. Rounds toward negative infinity.
    /// @dev Reverts with InsufficientHistory if the oldest stored observation is newer than now - secondsAgo.
    function consult(PoolKey calldata key, uint32 secondsAgo) external view returns (int24 meanTick) {
        if (secondsAgo == 0) revert ZeroWindow();
        PoolId id = key.toId();
        OracleState memory s = oracleState[id];
        if (!s.initialized) revert PoolNotInitialized();

        uint32 nowTs = uint32(block.timestamp);
        if (secondsAgo > nowTs) revert InsufficientHistory(0, _oldest(id, s).timestamp);
        uint32 target = nowTs - secondsAgo;

        int56 cumNow = _cumulativeAt(id, s, nowTs);
        int56 cumThen = _cumulativeAt(id, s, target);
        int56 diff = cumNow - cumThen;
        int56 window = int56(uint56(secondsAgo));
        meanTick = int24(diff / window);
        if (diff < 0 && diff % window != 0) meanTick--;
    }

    function _oldest(PoolId id, OracleState memory s) internal view returns (Observation memory) {
        uint16 i = s.count < CARDINALITY ? 0 : (s.index + 1) % CARDINALITY;
        return _observations[id][i];
    }

    function _cumulativeAt(PoolId id, OracleState memory s, uint32 t) internal view returns (int56) {
        Observation memory newest = _observations[id][s.index];
        if (t >= newest.timestamp) {
            return newest.tickCumulative + int56(s.lastTick) * int56(uint56(t - newest.timestamp));
        }
        Observation memory oldest = _oldest(id, s);
        if (t < oldest.timestamp) revert InsufficientHistory(t, oldest.timestamp);

        // Walk back from the newest until we find the observation at or before t (<= 63 steps).
        uint16 i = s.index;
        Observation memory after_ = newest;
        while (true) {
            i = i == 0 ? CARDINALITY - 1 : i - 1;
            Observation memory before = _observations[id][i];
            if (before.timestamp <= t) {
                if (before.timestamp == t) return before.tickCumulative;
                int56 slope = (after_.tickCumulative - before.tickCumulative)
                    / int56(uint56(after_.timestamp - before.timestamp));
                return before.tickCumulative + slope * int56(uint56(t - before.timestamp));
            }
            after_ = before;
        }
        revert(); // unreachable
    }

    /// @notice Raw observation access (slot i of the ring) for offchain readers and tests.
    function observation(PoolId id, uint256 i) external view returns (uint32 timestamp, int56 tickCumulative) {
        Observation memory o = _observations[id][i % CARDINALITY];
        return (o.timestamp, o.tickCumulative);
    }
}
