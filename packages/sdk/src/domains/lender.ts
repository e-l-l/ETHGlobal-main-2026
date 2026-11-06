import { encodeAbiParameters, keccak256, parseAbiItem, type Hex } from "viem";
import { trancheVaultAbi } from "../abi/index.js";
import type { Addr, PositionSnapshot, ProtocolSnapshot } from "../chain/chain.js";
import type { Ctx } from "../context.js";
import { MRAError } from "../errors.js";
import * as L from "../mock/lend.js";
import type {
  DepositView,
  EarnView,
  JuniorView,
  KV,
  LossTier,
  PositionRowVM,
  PositionView,
  TradeRowVM,
  TradeView,
  TxResult,
  TxStep,
  VaultVM,
} from "../viewmodels.js";
import { ago, clock, int, money, num, pctStr, shortDate, toBase, usd } from "./util.js";

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
  const [snapR, posR, twapR, spotR, woR, shopsR, splitR, deployR, depR, wdR] = await Promise.allSettled([
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
  );
  const writtenOff = writeOffs.reduce((t, e) => t + usd(e.args.loss as bigint), 0);
  const reserveBps = 10_000 - snap.seniorFeeBps - snap.juniorFeeBps;
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
    coverage: pctStr(snap.seniorOutstanding > 0n ? (usd(snap.juniorAssets) / usd(snap.seniorOutstanding)) * 100 : 0),
    feeShareJunior: pctStr(snap.juniorFeeBps / 100, 0),
    feeSplit: `${snap.seniorFeeBps / 100}% senior · ${snap.juniorFeeBps / 100}% junior · ${reserveBps / 100}% reserve`,
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

export function lenderDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  const mockVault = (): VaultVM => ({ ...L.VAULT });

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
    junior,
    /** Relative time helper for "x ago" labels in lender tables. */
    ago: (unix: number) => ago(unix, ctx.now()),
  };
}

export type LenderDomain = ReturnType<typeof lenderDomain>;
