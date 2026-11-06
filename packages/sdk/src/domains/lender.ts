import { encodeAbiParameters, keccak256, maxUint256, parseAbiItem, type Hex } from "viem";
import { erc20Abi, riskHookAbi, trancheVaultAbi } from "../abi/index.js";
import type { RiskStatus } from "../api/types.js";
import type { Addr, PositionSnapshot, ProtocolSnapshot, Receipt } from "../chain/chain.js";
import type { Ctx } from "../context.js";
import { ChainError, ConfigError, MRAError } from "../errors.js";
import { decodeBalanceDelta, decodeSlot0, parseSwapReceipt, poolIdOf, poolKeyOf, poolManagerAbi, poolSlots, poolSwapTestAbi, priceLimit, priceOf } from "../chain/swap.js";
import * as L from "../mock/lend.js";
import type {
  DepositView,
  EarnView,
  JuniorView,
  KV,
  LossTier,
  PositionRowVM,
  PositionView,
  RiskPanelView,
  SwapResult,
  SwapSide,
  TradeRowVM,
  TradeView,
  TxResult,
  TxStep,
  VaultVM,
  WaterfallView,
} from "../viewmodels.js";
import { gatherRiskRaw, riskPanelFrom, waterfallFrom, type RiskRaw } from "./lender-risk.js";
import { ago, clock, coveragePct, coverageStr, int, money, num, pctStr, shortDate, toBase, usd } from "./util.js";

const DAY = 86_400;
const BLOCKS_PER_DAY = 7_200n;
const SAMPLES = 12;
const swapEvent = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

export type Tranche = "senior" | "junior";

export type LenderSnapshot = {
  vault: VaultVM;
  snap: ProtocolSnapshot;
  pos: PositionSnapshot | null;
  writeOffBlocks: bigint[];
  feeSplit: KV[];
  waterfall: [LossTier, LossTier, LossTier];
};

const dash = "—";
const settled = <T>(r: PromiseSettledResult<T>): T | undefined => (r.status === "fulfilled" ? r.value : undefined);
/** Price of junior in USDC from a v4 tick (junior is currency0, both 6 decimals). */
const tickPrice = (tick: number) => Math.pow(1.0001, tick);
const usd3 = (n: number) => `$${n.toFixed(3)}`;

/** Read everything the lender/public screens show, once, and format it like apps/web's VAULT. */
export async function lenderSnapshot(ctx: Ctx): Promise<LenderSnapshot> {
  const chain = ctx.chain();
  const account = (chain.walletAddress() ?? ctx.cfg.account) as Addr | undefined;
  const latest = await chain.blockNumber();
  const from30d = latest > 30n * BLOCKS_PER_DAY ? latest - 30n * BLOCKS_PER_DAY : 0n;
  const [snapR, posR, twapR, spotR, woR, shopsR, splitR, deployR, depR, wdR, lateR] = await Promise.allSettled([
    chain.protocol(),
    account ? chain.position(account) : Promise.resolve(null),
    chain.juniorTwapTick(3600),
    chain.juniorTwapTick(60),
    chain.bookLogs("AdvanceWrittenOff"),
    chain.bookLogs("ShopRegistered"),
    chain.bookLogs("RepaymentSplit", undefined, from30d, latest),
    chain.blockTime(BigInt(chain.deployment.deployBlock)),
    account ? chain.vaultLogs("senior", "Deposit", { owner: account }) : Promise.resolve([]),
    account ? chain.vaultLogs("senior", "Withdraw", { owner: account }) : Promise.resolve([]),
    chain.bookLogs("LateFeePaid", undefined, from30d, latest),
  ]);
  if (snapR.status === "rejected") throw snapR.reason;
  const snap = snapR.value;
  const pos = settled(posR) ?? null;
  const now = ctx.now();

  const seniorP = usd(snap.seniorSharePrice);
  const juniorBook = usd(snap.juniorSharePrice);
  const ageDays = Math.max(1, (now - (settled(deployR) ?? now - DAY)) / DAY);
  const apy = seniorP > 1 ? (Math.pow(seniorP, 365 / ageDays) - 1) * 100 : 0;
  const writeOffs = settled(woR) ?? [];
  const opened = Number(snap.nextAdvanceId) - 1;
  const repaid30d = (settled(splitR) ?? []).reduce(
    (t, e) => t + usd((e.args.principalPart as bigint) + (e.args.seniorFee as bigint) + (e.args.juniorFee as bigint) + (e.args.reserveFee as bigint)),
    0,
  ) + (settled(lateR) ?? []).reduce((t, e) => t + usd(e.args.amount as bigint), 0); // late fee: 100% to the reserve
  const writtenOff = writeOffs.reduce((t, e) => t + usd(e.args.loss as bigint), 0);
  const reserveBps = snap.reserveFeeBps;
  const twap = settled(twapR);
  const spot = settled(spotR);
  const deposited = (settled(depR) ?? []).reduce((t, e) => t + usd(e.args.assets as bigint), 0) - (settled(wdR) ?? []).reduce((t, e) => t + usd(e.args.assets as bigint), 0);
  const seniorValue = pos ? usd(pos.seniorValue) : 0;
  const earned = pos ? seniorValue - deposited : 0;

  const vault: VaultVM = {
    apy: pctStr(apy),
    totalLent: money(usd(snap.seniorAssets)),
    tvl: money(usd(snap.seniorAssets)),
    senior: money(usd(snap.seniorAssets)),
    advancesOut: int(Math.max(0, opened)),
    defaultRate: pctStr(opened > 0 ? (writeOffs.length / opened) * 100 : 0),
    sharePrice: usd3(seniorP),
    outstanding: money(usd(snap.seniorOutstanding)),
    repaid30d: money(repaid30d),
    writtenOff: money(writtenOff),
    junior: money(usd(snap.juniorAssets)),
    juniorCushion: money(usd(snap.juniorAssets)),
    juniorBalance: pos ? `${num(usd(pos.juniorShares), 0)} jUSD` : dash,
    reserve: money(usd(snap.reserve)),
    coverage: coverageStr(coveragePct(snap.juniorAssets, snap.reserve, snap.seniorOutstanding)),
    feeShareJunior: pctStr(snap.juniorFeeBps / 100, 0),
    feeSplit: `${snap.seniorFeeBps / 100}% senior · ${snap.juniorFeeBps / 100}% junior/DRIP · ${reserveBps / 100}% reserve · ${snap.protocolFeeBps / 100}% protocol`,
    receivedShares: pos ? `${num(usd(pos.seniorShares))} sUSD` : dash,
    juniorPrice: spot !== undefined ? usd3(tickPrice(spot)) : usd3(juniorBook),
    juniorTwap: twap !== undefined ? usd3(tickPrice(twap)) : dash,
    juniorBook: Math.round(juniorBook * 1000) / 1000,
    shopsActive: int((settled(shopsR) ?? []).length),
    walletUsdc: pos ? money(usd(pos.usdc)) : dash,
    walletJarJ: pos ? Math.round(usd(pos.juniorShares)) : 0,
    availableToWithdraw: pos ? money(usd(pos.seniorMaxWithdraw)) : dash,
    positionShares: pos ? num(usd(pos.seniorShares)) : dash,
    positionValue: pos ? money(seniorValue) : dash,
    positionEarned: pos ? `${earned >= 0 ? "+" : "-"}${money(Math.abs(earned))}` : dash,
  };
  const feeSplit: KV[] = [
    { k: "Senior", v: pctStr(snap.seniorFeeBps / 100, 0) },
    { k: "Junior", v: pctStr(snap.juniorFeeBps / 100, 0) },
    { k: "Reserve", v: pctStr(reserveBps / 100, 0) },
    { k: "Protocol", v: pctStr(snap.protocolFeeBps / 100, 0) },
  ];
  const waterfall: [LossTier, LossTier, LossTier] = [
    { title: "Junior", description: "Takes the first write-off", amount: vault.junior },
    { title: "Reserve", description: "Fees held back", amount: vault.reserve },
    { title: "Senior", description: "Paid back before junior", amount: vault.senior },
  ];
  return { vault, snap, pos, writeOffBlocks: writeOffs.map((e) => e.blockNumber), feeSplit, waterfall };
}

/** Share value at SAMPLES points since deploy (needs an archive-capable RPC; falls back to a flat line). */
async function shareSeries(ctx: Ctx, tranche: Tranche, current: number, writeOffBlocks: bigint[]) {
  const chain = ctx.chain();
  const latest = await chain.blockNumber();
  const start = BigInt(chain.deployment.deployBlock);
  const blocks = Array.from({ length: SAMPLES }, (_, i) => start + ((latest - start) * BigInt(i)) / BigInt(SAMPLES - 1));
  const address = tranche === "senior" ? chain.addresses.senior : chain.addresses.junior;
  const vals = await Promise.allSettled(
    blocks.map((blockNumber) => chain.client.readContract({ address, abi: trancheVaultAbi, functionName: "convertToAssets", args: [1_000_000n], blockNumber })),
  );
  const scale = tranche === "senior" ? 100 : 1;
  const series = vals.map((v) => Math.round((v.status === "fulfilled" ? usd(v.value as bigint) : current) * scale * 1000) / 1000);
  const lastWo = writeOffBlocks.at(-1);
  const writeOffIndex = lastWo === undefined ? -1 : blocks.findIndex((b) => b >= lastWo);
  return { series, writeOffIndex };
}

async function positionRows(ctx: Ctx, account: Addr): Promise<PositionRowVM[]> {
  const chain = ctx.chain();
  const [dep, wd] = await Promise.all([chain.vaultLogs("senior", "Deposit", { owner: account }), chain.vaultLogs("senior", "Withdraw", { owner: account })]);
  const rows = await Promise.all(
    [...dep.map((e) => ({ e, action: "Deposited" })), ...wd.map((e) => ({ e, action: "Withdrew" }))].map(async ({ e, action }) => ({
      at: await chain.blockTime(e.blockNumber),
      row: { id: `${e.transactionHash}:${e.logIndex}`, action, amount: money(usd(e.args.assets as bigint)), shares: num(usd(e.args.shares as bigint)) },
    })),
  );
  return rows.sort((a, b) => b.at - a.at).map(({ at, row }) => ({ ...row, when: shortDate(at) }));
}

async function tradeRows(ctx: Ctx): Promise<TradeRowVM[]> {
  const chain = ctx.chain();
  const d = chain.deployment;
  const poolId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [d.poolKey.currency0 as Hex, d.poolKey.currency1 as Hex, d.poolKey.fee, d.poolKey.tickSpacing, d.poolKey.hooks as Hex],
    ),
  );
  const latest = await chain.blockNumber();
  const logs = await chain.client.getLogs({ address: d.PoolManager as Hex, event: swapEvent, args: { id: poolId }, fromBlock: latest > BLOCKS_PER_DAY ? latest - BLOCKS_PER_DAY : 0n, toBlock: latest });
  const rows = await Promise.all(
    logs.slice(-3).reverse().map(async (l) => {
      const a0 = l.args.amount0 ?? 0n;
      const a1 = l.args.amount1 ?? 0n;
      const sell = a0 < 0n; // swapper paid junior into the pool
      const sp = Number(l.args.sqrtPriceX96 ?? 0n) / 2 ** 96;
      return {
        id: `${l.transactionHash}:${l.logIndex}`,
        time: clock(await chain.blockTime(l.blockNumber)),
        side: sell ? "Sell" : "Buy",
        amount: sell ? `${num(usd(-a0), 0)} jUSD` : `${num(usd(a1 < 0n ? -a1 : a1), 0)} USDC`,
        price: usd3(sp * sp),
      };
    }),
  );
  return rows;
}

export type JuniorSwapOptions = {
  /** "buy": spend `amount` USDC on DRIP. "sell": sell `amount` DRIP for USDC. */
  side: SwapSide;
  amount: number;
  /** Price tolerance on top of the quoted price move. Default 100 (1%). */
  slippageBps?: number;
  onStep?: (s: TxStep) => void;
  /** Base delay before re-sending a swap that failed before broadcast (stale RPC node). Default 3000 ms. */
  retryDelayMs?: number;
};

const FEE_DENOMINATOR = 1_000_000n;

/**
 * One real Uniswap v4 swap through Uniswap's PoolSwapTest router on the RiskHook pool, from the connected wallet.
 * Both directions are sized so the unspecified side is USDC, so the RiskHook takes its USDC fee on each:
 *  - sell: exact-in `amount` DRIP -> USDC (hook fee comes out of the USDC received)
 *  - buy: exact-out of the DRIP that `amount` USDC buys (quoted by simulating), so the USDC paid ≈ `amount`,
 *    fee included (an exact-in buy would leave DRIP unspecified and the hook would take nothing)
 * Slippage: the swap carries a v4 sqrtPriceLimit; past it the swap fills partially, never at a worse price.
 */
async function juniorSwap(ctx: Ctx, o: JuniorSwapOptions): Promise<SwapResult> {
  const chain = ctx.chain();
  const d = chain.deployment;
  const router = d.PoolSwapTest as Addr | undefined;
  if (!router) throw new ConfigError("config_invalid", "this deployment has no PoolSwapTest router for the junior swap");
  const buy = o.side === "buy";
  const slippageBps = o.slippageBps ?? 100;
  const steps: TxStep[] = [];
  const step = (s: TxStep) => {
    const i = steps.findIndex((x) => x.label === s.label);
    if (i >= 0) steps[i] = s;
    else steps.push(s);
    o.onStep?.(s);
  };

  try {
    await ctx.ensureFunded(buy ? { usdc: o.amount } : {});
  } catch (e) {
    // The demo faucet waits for its own receipts, so its answer can outlast the API timeout while the funds still
    // land. Wait for them (bounded) instead of failing the first tap.
    if (!(e instanceof MRAError && e.code === "timeout")) throw e;
    const addr = chain.walletAddress()!;
    const ok = async () => {
      const [eth, u] = await Promise.all([chain.client.getBalance({ address: addr }), chain.usdcBalance(addr)]);
      return eth > 0n && (!buy || u >= toBase(o.amount));
    };
    let funded = false;
    for (let i = 0; i < 15 && !(funded = await ok().catch(() => false)); i++) await new Promise((r) => setTimeout(r, o.retryDelayMs ?? 3_000));
    if (!funded) throw e;
  }
  const account = chain.walletAddress()!;
  const key = poolKeyOf(d);
  const poolId = poolIdOf(key);
  const slots = poolSlots(poolId);
  const pm = d.PoolManager as Addr;
  const junior = chain.addresses.junior;
  const usdc = chain.addresses.usdc;
  const [tokenIn, tokenOut] = buy ? [usdc, junior] : [junior, usdc];
  const base = toBase(o.amount);

  const readPool = async () => {
    const [w0, wl] = await Promise.all([
      chain.client.readContract({ address: pm, abi: poolManagerAbi, functionName: "extsload", args: [slots.slot0] }),
      chain.client.readContract({ address: pm, abi: poolManagerAbi, functionName: "extsload", args: [slots.liquidity] }),
    ]);
    return decodeSlot0(w0 as Hex, wl as Hex);
  };
  const [pool, balIn, feePips] = await Promise.all([
    readPool(),
    chain.client.readContract({ address: tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
    chain.client.readContract({ address: chain.addresses.hook, abi: riskHookAbi, functionName: "feePips" }).then((v) => BigInt(v as number)),
  ]);
  if (pool.sqrtPriceX96 === 0n || pool.liquidity === 0n) throw new MRAError("bad_state", "the DRIP/USDC pool has no liquidity yet");
  if (balIn < base) throw new MRAError("insufficient_balance", `not enough ${buy ? "USDC" : "DRIP"} in this wallet`);
  const priceBefore = priceOf(pool.sqrtPriceX96);

  // 1. Approve the router once (max allowance), skipped when it already covers this swap.
  const approveLabel = buy ? "Approve USDC" : "Approve DRIP";
  step({ label: approveLabel, status: "pending" });
  const a = await chain.approveToken(tokenIn, router, base, maxUint256);
  step({ label: approveLabel, status: a ? "done" : "skipped", ...(a ? { hash: a.transactionHash } : {}) });

  // 2. Quote by simulating through the router (the approval is in place now), then set the price limit.
  const settings = { takeClaims: false, settleUsingBurn: false } as const;
  const sim = async (zeroForOne: boolean, amountSpecified: bigint, limit: bigint) => {
    const r = await chain.client.simulateContract({
      account,
      address: router,
      abi: poolSwapTestAbi,
      functionName: "swap",
      args: [key, { zeroForOne, amountSpecified, sqrtPriceLimitX96: limit }, settings, "0x"],
    });
    return decodeBalanceDelta(r.result as bigint);
  };
  const open = (zeroForOne: boolean) => (zeroForOne ? 4295128740n : 1461446703485210103287273052203988822378723970341n);
  const zeroForOne = !buy; // currency0 = DRIP, so selling DRIP is zeroForOne
  let amountSpecified: bigint;
  if (buy) {
    // Pool input such that input + hook fee ≈ the USDC budget (2 units of rounding headroom).
    const poolIn = (base * FEE_DENOMINATOR) / (FEE_DENOMINATOR + feePips) - 2n;
    const q = await sim(false, -poolIn, open(false));
    if (q.amount0 <= 0n) throw new MRAError("bad_state", "the pool quoted zero DRIP for this amount");
    amountSpecified = q.amount0; // exact output of DRIP
  } else {
    amountSpecified = -base; // exact input of DRIP
  }
  const quote = await sim(zeroForOne, amountSpecified, open(zeroForOne));
  const qJ = Number(quote.amount0 < 0n ? -quote.amount0 : quote.amount0);
  const qU = Number(quote.amount1 < 0n ? -quote.amount1 : quote.amount1);
  const limit = priceLimit(zeroForOne, priceBefore, qJ > 0 ? qU / qJ : priceBefore, slippageBps);

  // 3. Swap.
  step({ label: "Swap on Uniswap v4", status: "pending" });
  // A load-balanced RPC can estimate gas on a node that hasn't seen the approve (or the faucet's USDC) yet, which looks
  // like a revert. Those fail before broadcast (nothing was sent), so retry them a couple of times; a mined revert is final.
  let receipt: Receipt | undefined;
  for (let attempt = 0; !receipt; attempt++) {
    try {
      receipt = await chain.send("swap", {
        address: router,
        abi: poolSwapTestAbi,
        functionName: "swap",
        args: [key, { zeroForOne, amountSpecified, sqrtPriceLimitX96: limit }, settings, "0x"],
      });
    } catch (e) {
      const preBroadcast = e instanceof ChainError && e.message.startsWith("transaction rejected or failed");
      if (!preBroadcast || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, (o.retryDelayMs ?? 3_000) * (attempt + 1)));
    }
  }
  step({ label: "Swap on Uniswap v4", status: "done", hash: receipt.transactionHash });

  const fill = parseSwapReceipt(receipt, { account, tokenIn, tokenOut, hook: chain.addresses.hook, poolManager: pm, poolId });
  const [after, oracle] = await Promise.all([
    fill.sqrtPriceAfter === undefined ? readPool().catch(() => undefined) : Promise.resolve(undefined),
    chain.client.readContract({ address: chain.addresses.hook, abi: riskHookAbi, functionName: "oracleState", args: [poolId] }).catch(() => undefined),
  ]);
  const sqrtAfter = fill.sqrtPriceAfter ?? after?.sqrtPriceX96 ?? pool.sqrtPriceX96;
  const count = Array.isArray(oracle) ? Number(oracle[1]) : undefined;
  ctx.emit("lender.junior.swap", o.side);
  return {
    hash: receipt.transactionHash,
    txHash: receipt.transactionHash,
    steps,
    simulated: false,
    side: o.side,
    tokenIn: buy ? "USDC" : "DRIP",
    tokenOut: buy ? "DRIP" : "USDC",
    amountIn: usd(fill.amountIn),
    amountOut: usd(fill.amountOut),
    hookFeeUsdc: usd(fill.hookFee),
    priceBefore,
    priceAfter: priceOf(sqrtAfter),
    ...(count !== undefined ? { observationCount: count } : {}),
  };
}

/** Mock swap: same shape, priced off the mock DRIP price with the 0.3% LP fee and 0.3% hook fee. */
function mockSwap(o: JuniorSwapOptions): SwapResult {
  const p = Number(L.VAULT.juniorPrice.replace(/[^0-9.]/g, "")) || 1;
  const buy = o.side === "buy";
  const fee = 0.003;
  const hookFeeUsdc = buy ? o.amount * (fee / (1 + fee)) : o.amount * p * (1 - fee) * fee;
  const amountOut = buy ? ((o.amount - hookFeeUsdc) * (1 - fee)) / p : o.amount * p * (1 - fee) - hookFeeUsdc;
  const steps: TxStep[] = [
    { label: buy ? "Approve USDC" : "Approve DRIP", status: "done" },
    { label: "Swap on Uniswap v4", status: "done" },
  ];
  steps.forEach((s) => o.onStep?.(s));
  const hash = L.explorerEvents[0]!.hash;
  const move = buy ? 1.004 : 0.996;
  return {
    hash,
    txHash: hash,
    steps,
    simulated: true,
    side: o.side,
    tokenIn: buy ? "USDC" : "DRIP",
    tokenOut: buy ? "DRIP" : "USDC",
    amountIn: o.amount,
    amountOut: Math.round(amountOut * 1e6) / 1e6,
    hookFeeUsdc: Math.round(hookFeeUsdc * 1e6) / 1e6,
    priceBefore: p,
    priceAfter: Math.round(p * move * 1e6) / 1e6,
  };
}

export function lenderDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  const mockVault = (): VaultVM => ({ ...L.VAULT });

  /** One public read shared by riskPanel() and waterfall() when a screen asks for both at once (15 s). */
  let riskRead: { at: number; p: Promise<RiskRaw> } | undefined;
  const RISK_TTL_MS = 15_000;
  function riskRaw(): Promise<RiskRaw> {
    if (riskRead && Date.now() - riskRead.at < RISK_TTL_MS) return riskRead.p;
    const chain = ctx.chain();
    let api: { riskStatus(): Promise<RiskStatus> } | undefined;
    try {
      api = ctx.cfg.apiUrl ? ctx.api() : undefined;
    } catch {
      api = undefined;
    }
    const p = gatherRiskRaw(chain, { api, now: ctx.now(), account: (chain.walletAddress() ?? ctx.cfg.account) as Addr | undefined });
    riskRead = { at: Date.now(), p };
    p.catch(() => {
      if (riskRead?.p === p) riskRead = undefined;
    });
    return p;
  }

  async function move(kind: "deposit" | "withdraw", tranche: Tranche, amount: number, onStep?: (s: TxStep) => void): Promise<TxResult> {
    if (!(amount > 0)) throw new MRAError("invalid_request", "amount must be positive");
    const label = tranche === "senior" ? "sUSD" : "jUSD";
    if (isMock) {
      const steps: TxStep[] = kind === "deposit"
        ? [{ label: "Approve USDC", status: "done" }, { label: `Deposit, receive ${label}`, status: "done" }]
        : [{ label: `Withdraw USDC`, status: "done" }];
      steps.forEach((s) => onStep?.(s));
      return ctx.mocked({ hash: L.explorerEvents[0]!.hash, steps, simulated: true });
    }
    const chain = ctx.chain();
    const base = toBase(amount);
    const steps: TxStep[] = [];
    await ctx.ensureFunded(kind === "deposit" ? { usdc: amount } : {});
    if (kind === "deposit") {
      const spender = tranche === "senior" ? chain.addresses.senior : chain.addresses.junior;
      const a = await chain.approveUsdc(spender, base);
      steps.push({ label: "Approve USDC", status: a ? "done" : "skipped", ...(a ? { hash: a.transactionHash } : {}) });
      onStep?.(steps.at(-1)!);
      const r = await chain.deposit(tranche, base);
      steps.push({ label: `Deposit, receive ${label}`, status: "done", hash: r.transactionHash });
      onStep?.(steps.at(-1)!);
      return { hash: r.transactionHash, steps, simulated: false };
    }
    const r = await chain.withdraw(tranche, base);
    steps.push({ label: "Withdraw USDC", status: "done", hash: r.transactionHash });
    onStep?.(steps.at(-1)!);
    return { hash: r.transactionHash, steps, simulated: false };
  }

  const junior = {
    /** J01 Junior. */
    async overview(): Promise<JuniorView> {
      if (isMock) return ctx.mocked({ vault: mockVault(), juniorSeries: [...L.juniorSeries], writeOffIndex: L.JUNIOR_WRITE_OFF_INDEX, waterfall: L.waterfall.map((t) => ({ ...t })) as [LossTier, LossTier, LossTier], source: "mock" as const });
      const s = await lenderSnapshot(ctx);
      const { series, writeOffIndex } = await shareSeries(ctx, "junior", s.vault.juniorBook, s.writeOffBlocks);
      return { vault: s.vault, juniorSeries: series, writeOffIndex, waterfall: s.waterfall, source: "chain" };
    },
    /** J02 Mint (deposit USDC → jUSD). */
    deposit: (amount: number, opts: { onStep?: (s: TxStep) => void } = {}) => move("deposit", "junior", amount, opts.onStep),
    /** J02 Redeem (jUSD → USDC). */
    withdraw: (amount: number, opts: { onStep?: (s: TxStep) => void } = {}) => move("withdraw", "junior", amount, opts.onStep),
    /** J02 view. */
    mintView: async (): Promise<DepositView> => (isMock ? ctx.mocked({ vault: mockVault(), source: "mock" as const }) : { vault: (await lenderSnapshot(ctx)).vault, source: "chain" }),
    /** J03 Trade: junior/USDC price, TWAP and recent swaps (Uniswap v4 pool with RiskHook). */
    async trade(): Promise<TradeView> {
      if (isMock) return ctx.mocked({ vault: mockVault(), juniorSeries: [...L.juniorSeries], writeOffIndex: L.JUNIOR_WRITE_OFF_INDEX, tradeRows: L.tradeRows.map((r) => ({ ...r })), source: "mock" as const });
      const s = await lenderSnapshot(ctx);
      const [{ series, writeOffIndex }, rows] = await Promise.all([shareSeries(ctx, "junior", s.vault.juniorBook, s.writeOffBlocks), tradeRows(ctx).catch(() => [])]);
      return { vault: s.vault, juniorSeries: series, writeOffIndex, tradeRows: rows, source: "chain" };
    },
    /**
     * J03 Swap DRIP ⇄ USDC for real: Uniswap v4 PoolSwapTest → PoolManager → RiskHook (fee + TWAP), from the
     * connected (burner) wallet. Approves the router once, waits for the receipt. Mock mode simulates.
     */
    async swap(opts: JuniorSwapOptions): Promise<SwapResult> {
      if (opts.side !== "buy" && opts.side !== "sell") throw new MRAError("invalid_request", "side must be buy or sell");
      if (!(opts.amount > 0)) throw new MRAError("invalid_request", "amount must be positive");
      const bps = opts.slippageBps ?? 100;
      if (!Number.isInteger(bps) || bps < 0 || bps > 5_000) throw new MRAError("invalid_request", "slippageBps must be an integer in 0..5000");
      if (isMock) return ctx.mocked(mockSwap(opts));
      return juniorSwap(ctx, opts);
    },
  };

  return {
    /** L01 Earn. */
    async overview(): Promise<EarnView> {
      if (isMock) return ctx.mocked({ vault: mockVault(), feeSplit: L.FEE_SPLIT.map((x) => ({ ...x })), waterfall: L.waterfall.map((t) => ({ ...t })) as [LossTier, LossTier, LossTier], seniorSeries: [...L.seniorSeries], source: "mock" as const });
      const s = await lenderSnapshot(ctx);
      const { series } = await shareSeries(ctx, "senior", usd(s.snap.seniorSharePrice), s.writeOffBlocks);
      return { vault: s.vault, feeSplit: s.feeSplit, waterfall: s.waterfall, seniorSeries: series, source: "chain" };
    },
    /** L02 Deposit view. */
    depositView: async (): Promise<DepositView> => (isMock ? ctx.mocked({ vault: mockVault(), source: "mock" as const }) : { vault: (await lenderSnapshot(ctx)).vault, source: "chain" }),
    /** L02 Deposit USDC into the senior vault (approve + deposit, from the connected wallet). */
    deposit: (amount: number, opts: { onStep?: (s: TxStep) => void } = {}) => move("deposit", "senior", amount, opts.onStep),
    /** L02 Withdraw tab. */
    withdraw: (amount: number, opts: { onStep?: (s: TxStep) => void } = {}) => move("withdraw", "senior", amount, opts.onStep),
    /** L03 Position (senior). */
    async position(): Promise<PositionView> {
      if (isMock) {
        return ctx.mocked({ vault: mockVault(), positionRows: L.positionRows.map((r) => ({ ...r })), positionActivity: L.positionActivity.map((r) => ({ ...r })), seniorSeries: [...L.seniorSeries], source: "mock" as const });
      }
      const s = await lenderSnapshot(ctx);
      const account = (ctx.chain().walletAddress() ?? ctx.cfg.account) as Addr | undefined;
      const [rows, { series }] = await Promise.all([account ? positionRows(ctx, account) : Promise.resolve([]), shareSeries(ctx, "senior", usd(s.snap.seniorSharePrice), s.writeOffBlocks)]);
      return { vault: s.vault, positionRows: rows, positionActivity: rows.map((r) => ({ when: r.when, what: r.action, amount: r.amount })), seniorSeries: series, source: "chain" };
    },
    /**
     * L01 / J01 "Risk, in public": default rate, repayment buckets, cohort curve, coverage, the market's view of DRIP
     * and the Risk agent's caps. Public chain data only (plus the agents API's public /risk/status when it answers).
     * Aggregate: no shop id or pseudonym anywhere in the result.
     */
    async riskPanel(): Promise<RiskPanelView> {
      if (isMock) return ctx.mocked(L.RISK_PANEL);
      return riskPanelFrom(await riskRaw());
    },
    /** L01 "Who absorbs a loss first", with live amounts per layer, in the order a loss hits them. */
    async waterfall(): Promise<WaterfallView> {
      if (isMock) return ctx.mocked(L.WATERFALL);
      return waterfallFrom(await riskRaw());
    },
    junior,
    /** Relative time helper for "x ago" labels in lender tables. */
    ago: (unix: number) => ago(unix, ctx.now()),
  };
}

export type LenderDomain = ReturnType<typeof lenderDomain>;
