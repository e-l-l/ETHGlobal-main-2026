# Uniswap v4 developer feedback

Project: Merchant Revenue Advance (ETHGlobal Mumbai, From Scratch). Track: Build with Uniswap.

Paths are relative to the repo root. Contract line numbers refer to the code as submitted.

## What we built with v4

The junior tranche of our lending book is an ERC-4626 vault, and its shares are the "junior token". It takes first loss on merchant defaults. We list it against USDC on a v4 pool with a custom hook, so the market prices default risk in public, and our Risk agent reads that price.

| Piece | Where |
|---|---|
| `RiskHook`, a `BaseHook` from OpenZeppelin uniswap-hooks. Permissions: `afterInitialize`, `afterSwap`, `afterSwapReturnDelta` | [`contracts/src/RiskHook.sol` L36-L86](../../contracts/src/RiskHook.sol#L36-L86) |
| **USDC-only fee to the reserve.** The fee is charged only when the swap's *unspecified* currency is USDC. It is taken with `poolManager.take` and returned as the afterSwap delta. Swaps whose unspecified side is the junior token pay nothing. | [`_afterSwap`, L97-L120](../../contracts/src/RiskHook.sol#L97-L120) |
| **Permissionless `flush()`** sends accrued USDC to `AdvanceBook.depositReserve`. The reserve covers losses after the junior tranche. | [L125-L135](../../contracts/src/RiskHook.sol#L125-L135), [`contracts/src/AdvanceBook.sol` L561](../../contracts/src/AdvanceBook.sol#L561) |
| **64-slot TWAP oracle.** Per pool, a ring buffer of `(timestamp, tickCumulative)`, written at most once per block. It accumulates the tick that held since the last observation (v3 semantics), so a same-block move-and-revert adds nothing. | [`_recordObservation`, L139-L156](../../contracts/src/RiskHook.sol#L139-L156) |
| **`consult(key, secondsAgo)`** returns the time-weighted mean tick, interpolating between observations | [L160-L206](../../contracts/src/RiskHook.sol#L160-L206) |
| Risk agent reads `consult` (1h vs 24h TWAP; a drop of more than 10% fires a trigger). It can only call `lowerLimits` (downward, above floors). | [`agents/src/mra_agents/chain.py` L352-L355](../../agents/src/mra_agents/chain.py#L352), [`agents/src/mra_agents/risk.py`](../../agents/src/mra_agents/risk.py), [`contracts/src/Policy.sol` L125-L133](../../contracts/src/Policy.sol#L125) |
| Hook address mined with `HookMiner`; pool initialised (fee 3000, tick spacing 60, `sqrtPriceX96 = 2^96`, i.e. price 1) | [`contracts/script/Deploy.s.sol` L65-L77](../../contracts/script/Deploy.s.sol#L65-L77) |
| Tests: 21 tests, including fee direction, flush, TWAP and the HookMiner address | [`contracts/test/RiskHook.t.sol`](../../contracts/test/RiskHook.t.sol) |
| **In-app swap on Sepolia.** `/junior/trade` swaps DripCoin (DRIP) ⇄ USDC for real from the app's burner wallet through Uniswap's official v4 `PoolSwapTest`. Buys are exact-output, so both directions leave USDC unspecified and pay the hook fee. The result shows the fee and the new TWAP observation. The pool is seeded by a script. | [`packages/sdk/src/domains/lender.ts`](../../packages/sdk/src/domains/lender.ts) (`junior.swap`), [`packages/sdk/src/chain/swap.ts`](../../packages/sdk/src/chain/swap.ts), [`apps/web/src/screens/lend/client.tsx`](../../apps/web/src/screens/lend/client.tsx), [`agents/scripts/seed_junior_pool.py`](../../agents/scripts/seed_junior_pool.py) |

Live on Sepolia: RiskHook `0xd9cfcadf7ea8a753198383ce7f210070e5559044` on PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`. Pool key: junior `0x26c6…38f4` / MockUSDC `0x6603…55bb`, fee 3000, tick spacing 60 (`agents/deployments/sepolia.json`).

Not built: Uniswap API swaps at checkout (customer pays in USDT, it settles in USDC). Checkout takes USDC only at submission; the app defaults to USDC in live mode and does not claim a swap. The v4 integration we ship is the junior-token market above, which is core to the product: it prices default risk and drives the Risk agent.

## What worked

- **`afterSwapReturnDelta` plus `take`** gave us a clean "fee in one specific token" with no ERC-6909 claims to manage. The fee lands in the hook as a plain ERC-20, and `flush()` is a two-line transfer.
- **`StateLibrary.getSlot0`** made it simple to read the post-swap tick for the oracle without extra hooks.
- **OpenZeppelin `BaseHook`** removed the boilerplate: permission validation and `onlyPoolManager` (tested in `test_onlyPoolManager_canCallAfterSwap`).
- **v4-core's test `Deployers`** let us test the hook against a real PoolManager locally.
- **The official Sepolia deployment list was accurate.** We checked every address with `cast code` plus an identity call before deploying (`contracts/README.md`, "Verified Sepolia addresses").

## Friction

1. **PoolManager's exact solc pin.** `PoolManager.sol` pins `pragma solidity 0.8.26` exactly, and hook tests compile it, so nothing in the same compilation unit may require a newer compiler. In our build that was the Barretenberg-generated ZK verifier (`>=0.8.27`), which we had to compile as a separate unit and never import. The same applies to newer OpenZeppelin modules: we checked OpenZeppelin Contracts 5.7.0, where most files are `^0.8.20`–`^0.8.26`, but new modules such as `utils/RateLimiter.sol` and `crosschain/CrosschainRemoteExecutor.sol` are `^0.8.27`. A floating `^0.8.26` pragma on PoolManager, or a note in the v4 docs, would have saved time.
2. **We use uniswap-hooks' bundled OpenZeppelin (5.5.0).** To avoid two OZ copies, every `@openzeppelin/contracts/` import is remapped to `lib/uniswap-hooks/lib/openzeppelin-contracts`, and v4-core and v4-periphery are also taken from inside uniswap-hooks ([`contracts/remappings.txt`](../../contracts/remappings.txt)). It works, but it ties our whole project's OZ version to the hooks library. We had to make this a rule: "never add or upgrade libraries" ([`contracts/SPEC.md`](../../contracts/SPEC.md), Toolchain).
3. **`afterSwapReturnDelta` sign conventions.** The hard part was not the code. It was working out three things:
   - which currency is "unspecified": it is currency0 if and only if `exactInput != zeroForOne` ([L105-L107](../../contracts/src/RiskHook.sol#L105-L107))
   - that the sign of `amountSpecified` encodes exact-in vs exact-out
   - that a **positive** returned `int128` means the hook is owed that amount, which PoolManager then takes from the swapper's delta ([L115-L119](../../contracts/src/RiskHook.sol#L115-L119))

   The result is that exact-in/USDC-out swappers receive `out - fee` and exact-out/USDC-in swappers pay `in + fee`. We pinned each of the four direction cases with a test, plus a fuzz test ([`RiskHook.t.sol` L244-L290](../../contracts/test/RiskHook.t.sol#L244-L290)). A table of the four cases in the custom-accounting guide would help.
4. **HookMiner deployer address.** In tests the CREATE2 deployer is the test contract (`HookMiner.find(address(this), …)`). In a `forge script` broadcast it is the CREATE2 factory `0x4e59b44847b379578588920cA78FbF26c0B4956C` ([`Deploy.s.sol` L23, L70](../../contracts/script/Deploy.s.sol#L23)). If you pass the wrong one, the address silently fails to match the flags. We added `require(address(hook) == predicted)` (L72). HookMiner could return or document this more clearly.
5. **PoolManager pragma (see 1).** Because PoolManager is pinned, the whole Foundry project needs auto-detected solc. One `solc_version` setting in `foundry.toml` won't work, which we noted in [`contracts/foundry.toml`](../../contracts/foundry.toml).
6. **We missed the existing oracle hook.** v3 had a built-in oracle; in v4 we wrote a 64-slot ring buffer and the interpolation ourselves. After building it we found that uniswap-hooks already ships one: `src/oracles/panoptic/BaseOracleHook.sol` (and `OracleHookWithV3Adapters`), present even in the version we vendored. We didn't find it because the v4 docs' hook guides and the custom-accounting pages don't mention it, and its name doesn't say "TWAP". A "Need a price oracle? Use BaseOracleHook" pointer in the v4 hook docs would have saved us the work. We kept our own because it is small, tested (21 tests) and tailored to one fee-taking hook, but we would start from `BaseOracleHook` next time.

## Sepolia notes

From [`contracts/README.md`](../../contracts/README.md), "Deploying on current Sepolia: use `--skip-simulation`":

- Sepolia (reth 2.8, after the fork activated around Oct 2026) charges **about 1,584 gas per byte** of deployed code, not the classic 200.
- Foundry 1.2.2's local simulator still uses the old price, so its estimates were **about 7× too low**. Creation txs ran out of gas inside the CREATE2 factory, which is exactly where the hook gets deployed.
- **Workaround:** `forge script … --broadcast --slow --skip-simulation`, so the node estimates gas. Two earlier attempts failed and cost only gas.
- Use one consistent RPC. Tenderly's gateway worked. publicnode's load balancer returned "block not found" mid-script.

This isn't a Uniswap bug, but hook deployments hit it first because they go through CREATE2 with a mined salt. A line in the v4 Sepolia docs would help other teams.

## Developer Feedback Form

**TODO (human): submit the Uniswap Developer Feedback Form and note the date here.**
