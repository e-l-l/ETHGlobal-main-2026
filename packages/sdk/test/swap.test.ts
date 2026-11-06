import { describe, expect, it } from "vitest";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeEventTopics,
  maxUint256,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";
import { abi, createMRA, decodeBalanceDelta, decodeSlot0, deploymentFor, MemoryVault, poolIdOf, poolKeyOf, poolSlots, priceLimit, priceOf, type FetchFn } from "../src/index.js";

const D = deploymentFor("sepolia");
const ACCOUNT = `0x${"11".repeat(20)}` as const;
const Q96 = 2n ** 96n;
const word = (n: bigint) => `0x${BigInt.asUintN(256, n).toString(16).padStart(64, "0")}` as Hex;
const delta = (a0: bigint, a1: bigint) => (BigInt.asUintN(128, a0) << 128n) | BigInt.asUintN(128, a1);
const sqrtOf = (price: number) => BigInt(Math.floor(Math.sqrt(price) * 2 ** 96));

describe("swap helpers", () => {
  it("decodes a BalanceDelta (signed halves)", () => {
    expect(decodeBalanceDelta(BigInt.asIntN(256, delta(19_800_000n, -20_000_000n)))).toEqual({ amount0: 19_800_000n, amount1: -20_000_000n });
    expect(decodeBalanceDelta(BigInt.asIntN(256, delta(-10_000_000n, 9_978_515n)))).toEqual({ amount0: -10_000_000n, amount1: 9_978_515n });
  });

  it("decodes slot0 (negative tick) and liquidity words", () => {
    const tick = -51;
    const w = (BigInt.asUintN(24, BigInt(tick)) << 160n) | Q96;
    expect(decodeSlot0(word(w), word(7_703_246_708n))).toEqual({ sqrtPriceX96: Q96, tick: -51, liquidity: 7_703_246_708n });
    expect(priceOf(Q96)).toBe(1);
  });

  it("computes the live Sepolia pool id and its StateLibrary slot", () => {
    const id = poolIdOf(poolKeyOf(D));
    expect(id).toBe("0x557bfad078d4d51b866d804b2253ef4dd71f1463819ec9642910c36e4d065bb0");
    const s = poolSlots(id);
    expect(BigInt(s.liquidity) - BigInt(s.slot0)).toBe(3n);
  });

  it("puts the price limit on the right side, past the quoted move plus slippage", () => {
    const up = priceLimit(false, 1, 1.004, 100); // buy: price rises
    const down = priceLimit(true, 1, 0.996, 100); // sell: price falls
    expect(priceOf(up)).toBeCloseTo(1 + 2 * 0.004 + 0.01, 6);
    expect(priceOf(down)).toBeCloseTo(1 - 2 * 0.004 - 0.01, 6);
  });
});

describe("lender.junior.swap (mock)", () => {
  it("simulates both sides with the result shape", async () => {
    const mra = createMRA({ mode: "mock" });
    const steps: string[] = [];
    const buy = await mra.lender.junior.swap({ side: "buy", amount: 100, onStep: (s) => steps.push(s.label) });
    expect(buy).toMatchObject({ simulated: true, side: "buy", tokenIn: "USDC", tokenOut: "JAR-J", amountIn: 100 });
    expect(buy.hookFeeUsdc).toBeGreaterThan(0);
    expect(buy.amountOut).toBeGreaterThan(90);
    expect(buy.priceAfter).toBeGreaterThan(buy.priceBefore);
    expect(steps).toEqual(["Approve USDC", "Swap on Uniswap v4"]);
    const sell = await mra.lender.junior.swap({ side: "sell", amount: 10 });
    expect(sell).toMatchObject({ simulated: true, tokenIn: "JAR-J", tokenOut: "USDC" });
    expect(sell.priceAfter).toBeLessThan(sell.priceBefore);
  });

  it("validates its input", async () => {
    const mra = createMRA({ mode: "mock" });
    await expect(mra.lender.junior.swap({ side: "buy", amount: 0 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(mra.lender.junior.swap({ side: "hold" as never, amount: 1 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(mra.lender.junior.swap({ side: "sell", amount: 1, slippageBps: 9_000 })).rejects.toMatchObject({ code: "invalid_request" });
  });
});

/* ------------------------------------------------- live path, fake node + fake wallet */

const SEL = {
  extsload: toFunctionSelector("extsload(bytes32)"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
  allowance: toFunctionSelector("allowance(address,address)"),
  feePips: toFunctionSelector("feePips()"),
  oracleState: toFunctionSelector("oracleState(bytes32)"),
  swap: toFunctionSelector("swap((address,address,uint24,int24,address),(bool,int256,uint160),(bool,bool),bytes)"),
};
const transferEv = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const feeEv = parseAbi(["event FeeTaken(bytes32 indexed poolId, address indexed sender, uint256 amount)"]);
const swapEv = parseAbi(["event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"]);

function fakeSepolia(o: { side: "buy" | "sell"; allowance?: bigint; failSwapsBeforeBroadcast?: number }) {
  const poolId = poolIdOf(poolKeyOf(D));
  const slots = poolSlots(poolId);
  const pm = D.PoolManager.toLowerCase();
  const writes: { address: string; functionName: string; args: readonly unknown[] }[] = [];
  let failSwaps = o.failSwapsBeforeBroadcast ?? 0;
  const buy = o.side === "buy";
  // Exact-out buy of 19.8 JAR-J for 20 USDC (fee in); exact-in sell of 10 JAR-J for 9.978515 USDC (fee out).
  const quote = buy ? delta(19_800_000n, -20_000_000n) : delta(-10_000_000n, 9_978_515n);
  const fee = buy ? 59_820n : 30_025n;
  const after = sqrtOf(buy ? 1.004 : 0.997);
  const receipts = new Map<string, unknown>();

  const log = (address: string, ev: readonly unknown[], args: Record<string, unknown>, data: Hex) => ({
    address,
    topics: encodeEventTopics({ abi: ev as never, args } as never),
    data,
    blockHash: `0x${"ef".repeat(32)}`, blockNumber: "0x10", transactionHash: `0x${"aa".repeat(32)}`, transactionIndex: "0x0", logIndex: "0x0", removed: false,
  });
  const swapLogs = () => {
    const [tin, tout] = buy ? [D.USDC, D.JuniorVault] : [D.JuniorVault, D.USDC];
    const [ain, aout] = buy ? [20_000_000n, 19_800_000n] : [10_000_000n, 9_978_515n];
    return [
      log(tin, transferEv, { from: ACCOUNT, to: D.PoolManager }, encodeAbiParameters([{ type: "uint256" }], [ain])),
      log(tout, transferEv, { from: D.PoolManager, to: ACCOUNT }, encodeAbiParameters([{ type: "uint256" }], [aout])),
      log(D.RiskHook, feeEv, { poolId, sender: D.PoolSwapTest }, encodeAbiParameters([{ type: "uint256" }], [fee])),
      log(D.PoolManager, swapEv, { id: poolId, sender: D.PoolSwapTest }, encodeAbiParameters(
        [{ type: "int128" }, { type: "int128" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }, { type: "uint24" }],
        [buy ? 19_800_000n : -10_000_000n, buy ? -19_940_000n : 10_008_000n, after, 7_703_246_708n, buy ? 40 : -30, 3000],
      )),
    ];
  };

  const call = (to: string, data: Hex): Hex => {
    const sel = data.slice(0, 10);
    if (sel === SEL.extsload && to === pm) return data.slice(10).toLowerCase() === slots.slot0.slice(2) ? word(Q96) : word(7_703_246_708n);
    if (sel === SEL.balanceOf) return word(1_000_000_000n);
    if (sel === SEL.allowance) return word(o.allowance ?? 0n);
    if (sel === SEL.feePips) return word(3000n);
    if (sel === SEL.oracleState) return encodeAbiParameters([{ type: "uint16" }, { type: "uint16" }, { type: "int24" }, { type: "bool" }], [2, 3, buy ? 40 : -30, true]);
    if (sel === SEL.swap) return word(quote);
    throw new Error(`unexpected eth_call ${sel} to ${to}`);
  };

  const rpc: FetchFn = async (_u, init) => {
    const body = JSON.parse(String(init?.body));
    const one = (req: { id: number; method: string; params: any[] }) => {
      const r = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
      switch (req.method) {
        case "eth_chainId": return r("0xaa36a7");
        case "eth_blockNumber": return r("0x10");
        case "eth_gasPrice": return r("0x12");
        case "eth_getBalance": return r(`0x${(10n ** 17n).toString(16)}`);
        case "eth_call": return r(call(String(req.params[0].to).toLowerCase(), req.params[0].data ?? req.params[0].input));
        case "eth_getTransactionReceipt": return r(receipts.get(req.params[0]) ?? null);
        default: return r(null);
      }
    };
    const out = Array.isArray(body) ? body.map(one) : one(body);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  };

  let n = 0;
  const wallet = {
    account: { address: ACCOUNT, type: "local" },
    writeContract: async (p: { address: string; functionName: string; args: readonly unknown[] }) => {
      if (p.functionName === "swap" && failSwaps > 0) {
        failSwaps--;
        throw Object.assign(new Error("estimate failed"), { cause: { shortMessage: "execution reverted: ERC20InsufficientAllowance" } });
      }
      writes.push(p);
      const hash = `0x${(++n).toString(16).padStart(64, "0")}`;
      receipts.set(hash, {
        transactionHash: hash, blockHash: `0x${"ef".repeat(32)}`, blockNumber: "0x10", transactionIndex: "0x0", from: ACCOUNT, to: p.address,
        cumulativeGasUsed: "0x1", gasUsed: "0x1", effectiveGasPrice: "0x1", logsBloom: `0x${"00".repeat(256)}`, status: "0x1", type: "0x2",
        contractAddress: null, logs: p.functionName === "swap" ? swapLogs() : [],
      });
      return hash;
    },
  };
  const mra = createMRA({
    mode: "sepolia",
    apiUrl: "http://api.test",
    rpc: { url: "http://rpc.test", anonRpc: true, anonFetch: rpc, multicall: false },
    fetch: (async () => new Response("{}", { status: 404 })) as FetchFn,
    vault: new MemoryVault(),
    wallet: wallet as never,
  });
  return { mra, writes };
}

describe("lender.junior.swap (live path, fakes)", () => {
  it("buy: approves USDC once (max), swaps exact-out through PoolSwapTest, reads amounts + hook fee from the receipt", async () => {
    const { mra, writes } = fakeSepolia({ side: "buy" });
    const steps: string[] = [];
    const r = await mra.lender.junior.swap({ side: "buy", amount: 20, onStep: (s) => steps.push(`${s.label}:${s.status}`) });
    expect(writes.map((w) => w.functionName)).toEqual(["approve", "swap"]);
    expect(writes[0]!.address.toLowerCase()).toBe(D.USDC.toLowerCase());
    expect(writes[0]!.args).toEqual([D.PoolSwapTest, maxUint256]);
    const [key, params, settings, hookData] = writes[1]!.args as [any, any, any, Hex];
    expect(writes[1]!.address).toBe(D.PoolSwapTest);
    expect(key.hooks).toBe(D.RiskHook);
    expect(params.zeroForOne).toBe(false);
    expect(params.amountSpecified).toBe(19_800_000n); // exact output: the USDC side is unspecified, so the hook charges
    expect(params.sqrtPriceLimitX96 > Q96).toBe(true);
    expect(settings).toEqual({ takeClaims: false, settleUsingBurn: false });
    expect(hookData).toBe("0x");
    expect(r).toMatchObject({ simulated: false, side: "buy", tokenIn: "USDC", tokenOut: "JAR-J", amountIn: 20, amountOut: 19.8, hookFeeUsdc: 0.05982, observationCount: 3 });
    expect(r.txHash).toBe(r.hash);
    expect(r.priceBefore).toBe(1);
    expect(r.priceAfter).toBeCloseTo(1.004, 6);
    expect(steps).toEqual(["Approve USDC:pending", "Approve USDC:done", "Swap on Uniswap v4:pending", "Swap on Uniswap v4:done"]);
  });

  it("sell: skips the approval when the allowance covers it, exact-in JAR-J, retries a pre-broadcast failure", async () => {
    const { mra, writes } = fakeSepolia({ side: "sell", allowance: maxUint256, failSwapsBeforeBroadcast: 1 });
    const r = await mra.lender.junior.swap({ side: "sell", amount: 10, retryDelayMs: 1 });
    expect(writes.map((w) => w.functionName)).toEqual(["swap"]);
    const params = (writes[0]!.args as any[])[1];
    expect(params.zeroForOne).toBe(true);
    expect(params.amountSpecified).toBe(-10_000_000n);
    expect(params.sqrtPriceLimitX96 < Q96).toBe(true);
    expect(r).toMatchObject({ tokenIn: "JAR-J", tokenOut: "USDC", amountIn: 10, amountOut: 9.978515, hookFeeUsdc: 0.030025 });
    expect(r.steps[0]).toMatchObject({ label: "Approve JAR-J", status: "skipped" });
    expect(r.priceAfter).toBeLessThan(r.priceBefore);
  });

  it("refuses a deployment without a router", async () => {
    const mra = createMRA({ mode: "sepolia", rpc: { url: "http://rpc.test" }, deployment: { ...D, PoolSwapTest: undefined } as never });
    await expect(mra.lender.junior.swap({ side: "buy", amount: 1 })).rejects.toMatchObject({ code: "config_invalid" });
  });
});

// Keep the decoder honest against viem's own int256 encoding of a BalanceDelta.
it("BalanceDelta round-trips through ABI int256", () => {
  const raw = BigInt.asIntN(256, delta(-5n, 7n));
  const [v] = decodeAbiParameters([{ type: "int256" }], encodeAbiParameters([{ type: "int256" }], [raw]));
  expect(decodeBalanceDelta(v as bigint)).toEqual({ amount0: -5n, amount1: 7n });
  expect(abi.riskHookAbi.some((x) => x.type === "event" && x.name === "FeeTaken")).toBe(true);
});
