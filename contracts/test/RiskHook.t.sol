// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RiskHook} from "../src/RiskHook.sol";

contract MockToken is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, uint8 d) ERC20(n, n) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// Records depositReserve calls and pulls the USDC like AdvanceBook does.
contract MockBook {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public totalDeposited;
    uint256 public calls;
    address public lastCaller;

    constructor(IERC20 u) {
        usdc = u;
    }

    function depositReserve(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        calls++;
        lastCaller = msg.sender;
    }
}

/// A book that accepts the call but does not pull the funds.
contract LazyBook {
    function depositReserve(uint256) external {}
}

contract RiskHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint24 constant FEE = 3000; // 0.30%
    uint160 constant FLAGS =
        uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);

    MockToken usdc;
    MockToken junior;
    MockBook book;
    RiskHook hook;
    PoolKey hookKey;
    PoolKey controlKey; // identical pool with no hook, for independent expected amounts
    bool usdcIs0;

    function setUp() public {
        deployFreshManagerAndRouters();
        usdc = new MockToken("USDC", 6);
        junior = new MockToken("jUSDC", 6);
        book = new MockBook(IERC20(address(usdc)));

        MockToken[2] memory toks = [usdc, junior];
        for (uint256 i; i < 2; i++) {
            toks[i].mint(address(this), 1e30);
            toks[i].approve(address(swapRouter), type(uint256).max);
            toks[i].approve(address(modifyLiquidityRouter), type(uint256).max);
        }

        usdcIs0 = address(usdc) < address(junior);
        (currency0, currency1) = usdcIs0
            ? (Currency.wrap(address(usdc)), Currency.wrap(address(junior)))
            : (Currency.wrap(address(junior)), Currency.wrap(address(usdc)));

        hook = _deployHook(FEE, 0x4444, address(book));
        hookKey = _initPoolWithLiquidity(IHooks(address(hook)));
        controlKey = _initPoolWithLiquidity(IHooks(address(0)));
    }

    // ------------------------------------------------------------------ helpers

    function _deployHook(uint24 feePips, uint160 salt, address book_) internal returns (RiskHook h) {
        address addr = address(FLAGS | (salt << 144));
        deployCodeTo("RiskHook.sol:RiskHook", abi.encode(manager, address(usdc), book_, feePips), addr);
        h = RiskHook(addr);
    }

    function _initPoolWithLiquidity(IHooks hooks) internal returns (PoolKey memory key) {
        key = PoolKey(currency0, currency1, 3000, 60, hooks);
        manager.initialize(key, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(
            key, ModifyLiquidityParams({tickLower: -6000, tickUpper: 6000, liquidityDelta: 1e15, salt: 0}), ""
        );
    }

    /// Returns the swapper's signed balance changes (positive = received) in currency0/currency1.
    function _swap(PoolKey memory key, bool zeroForOne, int256 amountSpecified)
        internal
        returns (int256 d0, int256 d1)
    {
        uint256 b0 = currency0.balanceOf(address(this));
        uint256 b1 = currency1.balanceOf(address(this));
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        d0 = int256(currency0.balanceOf(address(this))) - int256(b0);
        d1 = int256(currency1.balanceOf(address(this))) - int256(b1);
    }

    function _swapToPrice(PoolKey memory key, uint160 sqrtLimit) internal {
        (uint160 cur,,,) = manager.getSlot0(key.toId());
        bool zeroForOne = sqrtLimit < cur;
        swapRouter.swap(
            key,
            SwapParams({zeroForOne: zeroForOne, amountSpecified: -1e30, sqrtPriceLimitX96: sqrtLimit}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _tick(PoolKey memory key) internal view returns (int24 t) {
        (, t,,) = manager.getSlot0(key.toId());
    }

    function _unspecifiedIsUsdc(bool zeroForOne, bool exactIn) internal view returns (bool) {
        bool specifiedIs0 = exactIn == zeroForOne;
        bool unspecifiedIs0 = !specifiedIs0;
        return unspecifiedIs0 == usdcIs0;
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x < 0 ? -x : x);
    }

    function _next(uint256 dt) internal {
        vm.warp(vm.getBlockTimestamp() + dt);
        vm.roll(block.number + 1);
    }

    struct Outcome {
        int256 cSpec;
        int256 cUns;
        int256 hSpec;
        int256 hUns;
        uint256 feeTaken;
    }

    function _runBoth(RiskHook h, PoolKey memory key, bool zeroForOne, bool exactIn, uint256 amount)
        internal
        returns (Outcome memory o)
    {
        int256 spec = exactIn ? -int256(amount) : int256(amount);
        (int256 c0, int256 c1) = _swap(controlKey, zeroForOne, spec);
        uint256 hookBefore = usdc.balanceOf(address(h));
        (int256 h0, int256 h1) = _swap(key, zeroForOne, spec);
        o.feeTaken = usdc.balanceOf(address(h)) - hookBefore;
        bool specifiedIs0 = exactIn == zeroForOne;
        (o.cSpec, o.cUns) = specifiedIs0 ? (c0, c1) : (c1, c0);
        (o.hSpec, o.hUns) = specifiedIs0 ? (h0, h1) : (h1, h0);
    }

    /// Runs the same swap on the control pool and the hook pool and checks the fee against
    /// the control pool's gross unspecified amount.
    function _checkMode(RiskHook h, PoolKey memory key, uint24 feePips, bool zeroForOne, bool exactIn, uint256 amount)
        internal
    {
        Outcome memory o = _runBoth(h, key, zeroForOne, exactIn, amount);

        // The pool math is untouched by the hook: both pools end at the same price.
        (uint160 pc,,,) = manager.getSlot0(controlKey.toId());
        (uint160 ph,,,) = manager.getSlot0(key.toId());
        assertEq(ph, pc, "price diverged");
        assertEq(o.hSpec, o.cSpec, "specified side changed");

        if (_unspecifiedIsUsdc(zeroForOne, exactIn)) {
            uint256 expectedFee = _abs(o.cUns) * feePips / 1e6;
            assertEq(o.feeTaken, expectedFee, "fee amount");
            // exact-in: USDC out shrinks by fee; exact-out: USDC in grows by fee. Both: hUns = cUns - fee.
            assertEq(o.hUns, o.cUns - int256(expectedFee), "swapper unspecified delta");
        } else {
            assertEq(o.feeTaken, 0, "fee on non-USDC unspecified");
            assertEq(o.hUns, o.cUns, "swapper charged on non-USDC");
        }
        assertEq(junior.balanceOf(address(h)), 0, "hook holds junior");
    }

    // ------------------------------------------------------------------ deployment

    function test_permissions_matchAddressBits() public view {
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(p.afterInitialize && p.afterSwap && p.afterSwapReturnDelta);
        assertFalse(p.beforeSwap || p.beforeInitialize || p.beforeAddLiquidity || p.beforeSwapReturnDelta);
        assertTrue(Hooks.hasPermission(IHooks(address(hook)), Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG));
    }

    function test_hookMiner_deploysAtFlaggedAddress() public {
        bytes memory args = abi.encode(manager, address(usdc), address(book), FEE);
        (address predicted, bytes32 salt) = HookMiner.find(address(this), FLAGS, type(RiskHook).creationCode, args);
        RiskHook mined = new RiskHook{salt: salt}(manager, address(usdc), address(book), FEE);
        assertEq(address(mined), predicted);
        assertEq(uint160(address(mined)) & Hooks.ALL_HOOK_MASK, FLAGS);
    }

    function test_onlyPoolManager_canCallAfterSwap() public {
        vm.expectRevert();
        hook.afterSwap(
            address(this), hookKey, SwapParams(true, -1, MIN_PRICE_LIMIT), BalanceDelta.wrap(0), ""
        );
    }

    // ------------------------------------------------------------------ fee, four modes

    function test_fee_exactIn_zeroForOne() public {
        _checkMode(hook, hookKey, FEE, true, true, 1e9);
    }

    function test_fee_exactIn_oneForZero() public {
        _checkMode(hook, hookKey, FEE, false, true, 1e9);
    }

    function test_fee_exactOut_zeroForOne() public {
        _checkMode(hook, hookKey, FEE, true, false, 1e9);
    }

    function test_fee_exactOut_oneForZero() public {
        _checkMode(hook, hookKey, FEE, false, false, 1e9);
    }

    function test_fee_chargedInExactlyTwoOfFourModes() public {
        uint256 charged;
        for (uint256 m; m < 4; m++) {
            bool z = m & 1 == 1;
            bool ei = m & 2 == 2;
            uint256 before = usdc.balanceOf(address(hook));
            _swap(hookKey, z, ei ? -int256(1e8) : int256(1e8));
            if (usdc.balanceOf(address(hook)) > before) {
                charged++;
                assertTrue(_unspecifiedIsUsdc(z, ei), "charged when USDC was specified");
            }
        }
        assertEq(charged, 2);
    }

    function test_fee_emitsFeeTaken() public {
        // USDC unspecified: exact-in from junior to USDC.
        bool zeroForOne = !usdcIs0;
        vm.expectEmit(true, true, false, false, address(hook));
        emit RiskHook.FeeTaken(hookKey.toId(), address(swapRouter), 0);
        _swap(hookKey, zeroForOne, -1e9);
    }

    /// Fuzz feePips over its whole accepted domain [0, 1e6) and the swap size and mode.
    function testFuzz_fee(uint24 feePips, uint256 amount, uint8 mode) public {
        feePips = uint24(bound(feePips, 0, 1e6 - 1));
        amount = bound(amount, 1, 1e12);
        RiskHook h = _deployHook(feePips, 0x5555, address(book));
        PoolKey memory key = _initPoolWithLiquidity(IHooks(address(h)));
        _checkMode(h, key, feePips, mode & 1 == 1, mode & 2 == 2, amount);
    }

    function test_feeBoundary_zeroChargesNothing() public {
        RiskHook h0 = _deployHook(0, 0x6666, address(book));
        PoolKey memory k0 = _initPoolWithLiquidity(IHooks(address(h0)));
        _checkMode(h0, k0, 0, !usdcIs0, true, 1e9);
        assertEq(usdc.balanceOf(address(h0)), 0);
    }

    function test_feeBoundary_maxAccepted() public {
        // 1e6 - 1 is the largest accepted fee; 1e6 is rejected by the constructor.
        RiskHook hMax = _deployHook(1e6 - 1, 0x7777, address(book));
        PoolKey memory kMax = _initPoolWithLiquidity(IHooks(address(hMax)));
        _checkMode(hMax, kMax, 1e6 - 1, !usdcIs0, true, 1e9);
    }

    // ------------------------------------------------------------------ flush

    function test_flush_movesAccruedUsdcToBook() public {
        address protocolTreasury = makeAddr("hookTreasury");
        hook.setTreasury(protocolTreasury);
        _swap(hookKey, !usdcIs0, -1e9); // exact-in junior -> USDC: fee on USDC out
        _swap(hookKey, usdcIs0, 5e8); // exact-out USDC -> junior: fee on USDC in
        uint256 accrued = usdc.balanceOf(address(hook));
        assertGt(accrued, 0);

        uint256 bookBefore = usdc.balanceOf(address(book));
        uint256 treasuryBefore = usdc.balanceOf(hook.treasury());
        uint256 reservePart = accrued * 7500 / 10_000;
        uint256 protocolPart = accrued - reservePart;
        vm.prank(makeAddr("anyone"));
        vm.expectEmit(true, false, false, true, address(hook));
        emit RiskHook.Flushed(address(book), accrued);
        hook.flush();

        assertEq(book.calls(), 1);
        assertEq(book.lastCaller(), address(hook));
        assertEq(book.totalDeposited(), reservePart);
        assertEq(usdc.balanceOf(address(book)) - bookBefore, reservePart);
        assertEq(usdc.balanceOf(hook.treasury()) - treasuryBefore, protocolPart);
        assertEq(usdc.balanceOf(address(hook)), 0);
        assertEq(usdc.allowance(address(hook), address(book)), 0);
    }

    function test_hookTreasuryOwnerControl() public {
        address next = makeAddr("newProtocolTreasury");
        vm.expectRevert(); vm.prank(makeAddr("stranger")); hook.setTreasury(next);
        vm.expectRevert(RiskHook.ZeroAddress.selector); hook.setTreasury(address(0));
        vm.expectEmit(true, true, false, true, address(hook));
        emit RiskHook.TreasurySet(hook.treasury(), next);
        hook.setTreasury(next);
        assertEq(hook.treasury(), next);
    }

    function test_flush_revertsWhenEmpty() public {
        vm.expectRevert(RiskHook.NothingToFlush.selector);
        hook.flush();
    }

    function test_flush_revertsIfBookDoesNotPull() public {
        LazyBook lazy = new LazyBook();
        RiskHook h = _deployHook(FEE, 0x8888, address(lazy));
        PoolKey memory key = _initPoolWithLiquidity(IHooks(address(h)));
        _swap(key, !usdcIs0, -1e9);
        uint256 bal = usdc.balanceOf(address(h));
        vm.expectRevert(abi.encodeWithSelector(RiskHook.FlushIncomplete.selector, bal * 7500 / 10_000));
        h.flush();
    }

    // ------------------------------------------------------------------ TWAP

    function test_twap_meanTickAcrossSwaps() public {
        int24 t0 = _tick(hookKey);
        assertEq(t0, 0);

        _next(100);
        _swapToPrice(hookKey, TickMath.getSqrtPriceAtTick(1200));
        int24 t1 = _tick(hookKey);

        _next(200);
        _swapToPrice(hookKey, TickMath.getSqrtPriceAtTick(-2400));
        int24 t2 = _tick(hookKey);

        _next(300);
        assertTrue(t1 > 1000 && t2 < -2000, "price did not move");

        // Expected values come from slot0 reads, not from hook storage.
        assertEq(hook.consult(hookKey, 600), _floorDiv(int256(t0) * 100 + int256(t1) * 200 + int256(t2) * 300, 600));
        assertEq(hook.consult(hookKey, 300), t2);
        // 400s ago falls inside the t1 interval: needs interpolation between observations.
        assertEq(hook.consult(hookKey, 400), _floorDiv(int256(t1) * 100 + int256(t2) * 300, 400));
        // Window ending exactly at an observation timestamp.
        assertEq(hook.consult(hookKey, 500), _floorDiv(int256(t1) * 200 + int256(t2) * 300, 500));
    }

    function test_twap_sameBlockSpikeAndRevert_noEffect() public {
        _next(100);
        _swapToPrice(hookKey, TickMath.getSqrtPriceAtTick(600));
        int24 base = _tick(hookKey);
        _next(100);

        uint256 snap = vm.snapshotState();
        _swap(hookKey, true, -1e3); // tiny swap, to write an observation in this block like the spike does
        _next(100);
        int24 calm = hook.consult(hookKey, 150);
        vm.revertToState(snap);

        // Same block: tiny swap, a huge spike, then back to exactly the pre-spike price.
        (uint16 idxBefore, uint16 countBefore,,) = hook.oracleState(hookKey.toId());
        _swap(hookKey, true, -1e3);
        (uint160 pre,,,) = manager.getSlot0(hookKey.toId());
        _swapToPrice(hookKey, TickMath.getSqrtPriceAtTick(5900));
        assertGt(_tick(hookKey), 5000, "spike did not move price");
        _swapToPrice(hookKey, pre);
        (uint16 idxAfter, uint16 countAfter,,) = hook.oracleState(hookKey.toId());
        assertEq(countAfter, countBefore + 1, "more than one write in a block");
        assertEq(idxAfter, (idxBefore + 1) % 64);
        _next(100);

        int24 spiked = hook.consult(hookKey, 150);
        assertEq(spiked, calm, "same-block spike leaked into TWAP");
        assertApproxEqAbs(int256(spiked), int256(base), 1);
    }

    function test_twap_spikeHeldAcrossBlocks_isVisible() public {
        // Control for the test above: the same spike, held for 50s, does move the TWAP.
        _next(100);
        _swapToPrice(hookKey, TickMath.getSqrtPriceAtTick(5900));
        int24 high = _tick(hookKey);
        _next(50);
        _swapToPrice(hookKey, SQRT_PRICE_1_1);
        _next(50);
        assertEq(hook.consult(hookKey, 100), _floorDiv(int256(high) * 50 + int256(_tick(hookKey)) * 50, 100));
        assertGt(hook.consult(hookKey, 100), 2000);
    }

    function test_twap_noSwaps_extrapolatesInitTick() public {
        PoolKey memory key = PoolKey(currency0, currency1, 500, 10, IHooks(address(hook)));
        manager.initialize(key, TickMath.getSqrtPriceAtTick(-777));
        _next(1000);
        assertEq(hook.consult(key, 1000), -777);
    }

    function test_consult_revertsWithoutHistory() public {
        vm.expectRevert(); // InsufficientHistory: pool initialized this very second
        hook.consult(hookKey, 1);

        _next(10);
        assertEq(hook.consult(hookKey, 10), 0);
        vm.expectRevert(abi.encodeWithSelector(RiskHook.InsufficientHistory.selector, uint32(vm.getBlockTimestamp() - 11), uint32(vm.getBlockTimestamp() - 10)));
        hook.consult(hookKey, 11);

        vm.expectRevert(RiskHook.ZeroWindow.selector);
        hook.consult(hookKey, 0);

        PoolKey memory unknown = PoolKey(currency0, currency1, 100, 1, IHooks(address(hook)));
        vm.expectRevert(RiskHook.PoolNotInitialized.selector);
        hook.consult(unknown, 1);
    }

    function test_consult_ringBufferEvictsOldHistory() public {
        uint256 start = vm.getBlockTimestamp();
        for (uint256 i; i < 70; i++) {
            _next(10);
            _swap(hookKey, i % 2 == 0, -1e6);
        }
        (, uint16 count,,) = hook.oracleState(hookKey.toId());
        assertEq(count, 64);
        // Oldest kept observation is 63 writes back from the newest (at now): 630s.
        hook.consult(hookKey, 630);
        vm.expectRevert();
        hook.consult(hookKey, 631);
        vm.expectRevert();
        hook.consult(hookKey, uint32(vm.getBlockTimestamp() - start));
    }

    function _floorDiv(int256 a, int256 b) internal pure returns (int24) {
        int256 q = a / b;
        if (a % b != 0 && (a < 0) != (b < 0)) q--;
        return int24(q);
    }
}
