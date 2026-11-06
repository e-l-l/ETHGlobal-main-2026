/**
 * Uniswap v4 swap plumbing for the DRIP/USDC pool (the RiskHook pool): pool id, slot0 and liquidity via
 * PoolManager.extsload (StateLibrary layout), price math, and parsing a swap receipt into the numbers a screen shows.
 *
 * The router is Uniswap's PoolSwapTest (official v4 Sepolia periphery deployment, `deployment.PoolSwapTest`). It
 * pulls the input token from the caller with transferFrom, so the caller approves the router once.
 */
import { encodeAbiParameters, keccak256, parseAbi, parseEventLogs, type Hex } from "viem";
import { erc20Abi, riskHookAbi } from "../abi/index.js";
import type { Addr } from "./chain.js";
import type { Deployment } from "./deployments.js";

export const poolSwapTestAbi = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "zeroForOne", type: "bool" },
          { name: "amountSpecified", type: "int256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
      {
        name: "testSettings",
        type: "tuple",
        components: [
          { name: "takeClaims", type: "bool" },
          { name: "settleUsingBurn", type: "bool" },
        ],
      },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
  { type: "function", name: "manager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const poolManagerAbi = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);

/** TickMath.MIN_SQRT_PRICE / MAX_SQRT_PRICE (a price limit must lie strictly inside). */
export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const Q96 = 2 ** 96;
const POOLS_SLOT = 6n; // PoolManager: mapping(PoolId => Pool.State) _pools

export type PoolKey = { currency0: Addr; currency1: Addr; fee: number; tickSpacing: number; hooks: Addr };
export type Slot0 = { sqrtPriceX96: bigint; tick: number; liquidity: bigint };

export function poolKeyOf(d: Deployment): PoolKey {
  const k = d.poolKey;
  return { currency0: k.currency0 as Addr, currency1: k.currency1 as Addr, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks as Addr };
}

export function poolIdOf(k: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );
}

/** Storage slots of a pool's slot0 and liquidity (v4-core StateLibrary). */
export function poolSlots(poolId: Hex): { slot0: Hex; liquidity: Hex } {
  const base = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, POOLS_SLOT])));
  const hex = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
  return { slot0: hex(base), liquidity: hex(base + 3n) };
}

export function decodeSlot0(slot0Word: Hex, liquidityWord: Hex): Slot0 {
  const s = BigInt(slot0Word);
  const sqrtPriceX96 = s & ((1n << 160n) - 1n);
  let tick = Number((s >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  return { sqrtPriceX96, tick, liquidity: BigInt(liquidityWord) & ((1n << 128n) - 1n) };
}

/** Price of currency0 in currency1 (USDC per DRIP; both 6 decimals). */
export const priceOf = (sqrtPriceX96: bigint) => (Number(sqrtPriceX96) / Q96) ** 2;

export function sqrtX96FromPrice(price: number): bigint {
  const v = BigInt(Math.floor(Math.sqrt(Math.max(price, 0)) * Q96));
  if (v <= MIN_SQRT_PRICE) return MIN_SQRT_PRICE + 1n;
  if (v >= MAX_SQRT_PRICE) return MAX_SQRT_PRICE - 1n;
  return v;
}

/** BalanceDelta (int256): amount0 in the upper 128 bits, amount1 in the lower, both signed (caller's view). */
export function decodeBalanceDelta(d: bigint): { amount0: bigint; amount1: bigint } {
  const u = BigInt.asUintN(256, d);
  return { amount0: BigInt.asIntN(128, u >> 128n), amount1: BigInt.asIntN(128, u & ((1n << 128n) - 1n)) };
}

/**
 * Price limit for a swap: the quoted move from `priceBefore` doubled (in one liquidity range the end price moves about
 * twice as far as the average fill price) plus `slippageBps`. Past the limit the swap fills partially, never at a worse
 * price, so the caller is protected the same way a min-out check would.
 */
export function priceLimit(zeroForOne: boolean, priceBefore: number, quotedAvgPrice: number, slippageBps: number): bigint {
  const impact = Math.abs(quotedAvgPrice / priceBefore - 1);
  const room = 2 * impact + slippageBps / 10_000;
  return sqrtX96FromPrice(zeroForOne ? priceBefore * Math.max(1 - room, 1e-9) : priceBefore * (1 + room));
}

export type SwapFill = { amountIn: bigint; amountOut: bigint; hookFee: bigint; sqrtPriceAfter?: bigint };

/** Amounts the account actually paid / received (ERC-20 Transfers), the RiskHook fee and the pool's new price. */
export function parseSwapReceipt(
  receipt: { logs: readonly unknown[] },
  o: { account: Addr; tokenIn: Addr; tokenOut: Addr; hook: Addr; poolManager: Addr; poolId: Hex },
): SwapFill {
  const logs = parseEventLogs({ abi: [...erc20Abi, ...riskHookAbi, ...poolManagerAbi], logs: receipt.logs as never, strict: false }) as unknown as {
    address: string;
    eventName: string;
    args: Record<string, any>;
  }[];
  const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const fill: SwapFill = { amountIn: 0n, amountOut: 0n, hookFee: 0n };
  for (const l of logs) {
    if (l.eventName === "Transfer" && eq(l.address, o.tokenIn) && eq(l.args.from, o.account)) fill.amountIn += BigInt(l.args.value);
    else if (l.eventName === "Transfer" && eq(l.address, o.tokenOut) && eq(l.args.to, o.account)) fill.amountOut += BigInt(l.args.value);
    else if (l.eventName === "FeeTaken" && eq(l.address, o.hook)) fill.hookFee += BigInt(l.args.amount);
    else if (l.eventName === "Swap" && eq(l.address, o.poolManager) && eq(l.args.id, o.poolId)) fill.sqrtPriceAfter = BigInt(l.args.sqrtPriceX96);
  }
  return fill;
}
