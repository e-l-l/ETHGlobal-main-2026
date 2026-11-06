/**
 * Chain reads (viem) against the bundled deployments, plus the few writes a user's own wallet must sign
 * (deposit, pay, registerShop, registry.issue, the mandate owner signature). Draws and claims go through the
 * relayer (AgentsApi.relay*), never the merchant's wallet.
 */
import {
  createPublicClient,
  http,
  parseEventLogs,
  type Account,
  type Chain as ViemChain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { foundry, sepolia } from "viem/chains";
import { advanceBookAbi, businessPassRegistryAbi, erc20Abi, riskHookAbi, trancheVaultAbi } from "../abi/index.js";
import { ChainError } from "../errors.js";
import type { FetchFn } from "../http.js";
import type { Deployment } from "./deployments.js";

export type Addr = `0x${string}`;
export type ChainOptions = {
  deployment: Deployment;
  url: string;
  fetchFn?: FetchFn;
  wallet?: WalletClient;
  /** Base delay between retries of a transient pre-broadcast write error. Default 2500 ms. */
  retryDelayMs?: number;
  /** Max block span per eth_getLogs call (public RPCs cap it). */
  logChunk?: number;
  timeoutMs?: number;
  /** Batch reads via Multicall3 when the chain has it. Default true. */
  multicall?: boolean;
};

export type AdvanceOnchain = {
  id: bigint;
  shopId: Hex;
  principal: bigint;
  totalOwed: bigint;
  owedNow?: bigint;
  feeSoFar?: bigint;
  feePaid?: bigint;
  drawnAt?: bigint;
  feeRateBpsPerWeek?: number;
  feeCapBps?: number;
  /** Late fee accrued so far, paid + unpaid (AdvanceBook.lateFeeOf). Only while behind the minimum; 100% to the reserve. */
  lateFee?: bigint;
  lateFeePaid?: bigint;
  /** AdvanceBook.isBehind: behind the 1%-per-7-days minimum, so the late fee is accruing now. */
  isBehind?: boolean;
  repaid: bigint;
  /** Principal returned so far (the rest of `repaid` was fee). Optional so older fakes still type-check. */
  principalRepaid?: bigint;
  holdbackBps: number;
  tier: number;
  lastSaleAt: bigint;
  /** 0 None, 1 Active, 2 Repaid, 3 WrittenOff */
  status: number;
  credentialClaimed: boolean;
  /** The Standing Pass leaf claimStandingPass will insert (0 = this advance carries none). */
  pendingCommitment?: bigint;
};

export type ProtocolSnapshot = {
  seniorAssets: bigint;
  seniorSupply: bigint;
  seniorOutstanding: bigint;
  seniorSharePrice: bigint; // assets per 1e6 shares
  juniorAssets: bigint;
  juniorSupply: bigint;
  juniorSharePrice: bigint;
  reserve: bigint;
  exposure: bigint;
  maxExposure: bigint;
  tierCaps: bigint[];
  tierCapFloors: bigint[];
  nextAdvanceId: bigint;
  seniorFeeBps: number;
  juniorFeeBps: number;
  reserveFeeBps: number;
  protocolFeeBps: number;
};

export type PositionSnapshot = {
  account: Addr;
  usdc: bigint;
  seniorShares: bigint;
  seniorValue: bigint;
  seniorMaxWithdraw: bigint;
  juniorShares: bigint;
  juniorValue: bigint;
  juniorMaxWithdraw: bigint;
};

export type MandateRequestArgs = {
  shopId: Hex;
  agentKey: Addr;
  recipient: Addr;
  limits: { maxPerDraw: bigint; maxPerPeriod: bigint; period: bigint; expiry: bigint };
  tier: number;
  band: number;
};

const ONE = 1_000_000n;
const STATUS = ["None", "Active", "Repaid", "WrittenOff"] as const;
export const advanceStatusName = (s: number) => STATUS[s] ?? "None";

function chainFor(chainId: number): ViemChain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  return { ...foundry, id: chainId, name: `chain-${chainId}` };
}

export type Receipt = { status: "success" | "reverted"; transactionHash: Hex; logs: readonly unknown[]; blockNumber?: bigint };
export type LogEntry = { args: any; blockNumber: bigint; transactionHash: Hex; logIndex: number };
export type ShopOnchain = { owner: Addr; payout: Addr; activeAdvanceId: bigint; registered: boolean };

/** Everything the domains use from the chain. */
export interface Chain {
  readonly client: PublicClient;
  readonly deployment: Deployment;
  readonly addresses: { book: Addr; registry: Addr; senior: Addr; junior: Addr; hook: Addr; usdc: Addr };
  readonly chain: ViemChain;
  hasWallet(): boolean;
  walletAddress(): Addr | undefined;
  blockNumber(): Promise<bigint>;
  blockTime(n: bigint): Promise<number>;
  /** Deployed bytecode size in bytes (0 = no code). Cached: code at an address is immutable. */
  codeSize(address: Addr): Promise<number>;
  protocol(): Promise<ProtocolSnapshot>;
  position(account: Addr): Promise<PositionSnapshot>;
  usdcBalance(account: Addr): Promise<bigint>;
  shop(shopId: Hex): Promise<ShopOnchain>;
  advance(id: bigint): Promise<AdvanceOnchain>;
  mandate(id: bigint): Promise<any>;
  mandateContext(r: MandateRequestArgs): Promise<bigint>;
  contextFor(recipient: Addr, offerId: Hex): Promise<bigint>;
  countrySet(): Promise<readonly number[]>;
  juniorTwapTick(secondsAgo: number): Promise<number>;
  leaves(tree: "business" | "standing"): Promise<bigint[]>;
  /** AdvanceBook.isKnownRoot: every Standing Pass root ever produced (a proof may use any of them). */
  isKnownStandingRoot(root: bigint): Promise<boolean>;
  bookLogs(eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint): Promise<LogEntry[]>;
  registryLogs(eventName: string, fromBlock?: bigint): Promise<LogEntry[]>;
  vaultLogs(tranche: "senior" | "junior", eventName: string, args?: Record<string, unknown>): Promise<LogEntry[]>;
  /** Any contract's events, with the same chunking / head-lag handling (e.g. PoolManager Swap for our pool). */
  contractLogs(address: Addr, abi: readonly unknown[], eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint): Promise<LogEntry[]>;
  /** Approve `allowance` (default `amount`) unless the current allowance already covers `amount`. */
  approveUsdc(spender: Addr, amount: bigint, allowance?: bigint): Promise<Receipt | null>;
  /** Same as approveUsdc, for any ERC-20 (e.g. the DRIP share token). */
  approveToken(token: Addr, spender: Addr, amount: bigint, allowance?: bigint): Promise<Receipt | null>;
  /** Any contract write through the same path as the others: retries transient pre-broadcast errors, waits, throws on revert. */
  send(label: string, params: { address: Addr; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }): Promise<Receipt>;
  deposit(tranche: "senior" | "junior", assets: bigint): Promise<Receipt>;
  withdraw(tranche: "senior" | "junior", assets: bigint): Promise<Receipt>;
  pay(shopId: Hex, amount: bigint): Promise<Receipt>;
  registerShop(shopId: Hex, payout: Addr): Promise<Receipt>;
  issueBusinessPass(att: { businessNullifier: Hex; commitment: Hex; expiresAt: number }, signature: Hex): Promise<Receipt>;
  signMandate(r: MandateRequestArgs): Promise<Hex>;
  /** EIP-191 personal_sign of `text` with the connected wallet (e.g. the shop-owner auth message). */
  signMessage(text: string): Promise<Hex>;
  parseLogs(receipt: { logs: readonly unknown[] }): { eventName: string; args: any }[];
  receipt(hash: Hex): Promise<Receipt>;
}

const TRANSIENT_WRITE = /insufficient funds|rate limit|exceeds defined limit|too many requests|\b429\b|timed? ?out|fetch failed|network/i;
/** The node that filled in the nonce was a block behind the one that broadcast (e.g. right after a faucet mint). */
const STALE_NONCE = /nonce too low|nonce provided for the transaction is lower/i;
/** Errors after which the tx MAY have gone out: never re-send with a fresh nonce after one of these. */
const MAYBE_SENT = /timed? ?out|fetch failed|network/i;

function errorText(e: unknown): string {
  let out = "";
  for (let x: unknown = e, i = 0; x && i < 8; x = (x as { cause?: unknown }).cause, i++) {
    out += ` ${(x as { shortMessage?: string }).shortMessage ?? ""} ${(x as { details?: string }).details ?? ""} ${(x as Error).message ?? ""}`;
  }
  return out;
}

/** Pre-broadcast write errors worth retrying (viem nests the RPC error in `cause`). Never reverts. */
export function isTransientWriteError(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 8; x = (x as { cause?: unknown }).cause, i++) {
    const m = `${(x as { shortMessage?: string }).shortMessage ?? ""} ${(x as { details?: string }).details ?? ""} ${(x as Error).message ?? ""}`;
    if (/revert/i.test(m)) return false;
    if (TRANSIENT_WRITE.test(m)) return true;
  }
  return false;
}

/** Blocks behind the head after which logs are treated as final (Sepolia finalizes in ~64). */
export const FINALITY = 64n;
/** How long one eth_blockNumber answer is shared (Sepolia makes a block every 12 s). */
const HEAD_TTL_MS = 2_000;

function stableJson(v: unknown): string {
  if (v === undefined) return "";
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : typeof x === "string" ? x.toLowerCase() : x));
}

export function createChain(opts: ChainOptions): Chain {
  const d = opts.deployment;
  const chain = chainFor(d.chainId);
  const transport = http(opts.url, {
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn as typeof fetch } : {}),
    retryCount: 3,
    timeout: opts.timeoutMs ?? 20_000,
  });
  // Batch the screens' parallel eth_calls into Multicall3 calls where the chain has it (Sepolia does; a bare anvil
  // doesn't), so public RPCs don't rate-limit a screen that reads ~20 values at once.
  const multicall = opts.multicall !== false && !!(chain as { contracts?: { multicall3?: unknown } }).contracts?.multicall3;
  const client = createPublicClient({ chain, transport, ...(multicall ? { batch: { multicall: true } } : {}) }) as PublicClient;
  const A = {
    book: d.AdvanceBook as Addr,
    registry: d.BusinessPassRegistry as Addr,
    senior: d.SeniorVault as Addr,
    junior: d.JuniorVault as Addr,
    hook: d.RiskHook as Addr,
    usdc: d.USDC as Addr,
  };
  const chunk = BigInt(opts.logChunk ?? 9_000);
  const blockTimes = new Map<bigint, Promise<number>>();

  async function read<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ChainError) throw e;
      throw new ChainError("chain_read_failed", `chain read failed: ${label}`, e);
    }
  }

  // Thin typed wrappers (viem infers args/return from the const ABIs).
  const book = <F extends string>(functionName: F, args: readonly unknown[] = []) =>
    client.readContract({ address: A.book, abi: advanceBookAbi, functionName, args } as never) as Promise<any>;
  const vault = (address: Addr, functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address, abi: trancheVaultAbi, functionName, args } as never) as Promise<any>;

  function requireWallet(): { wallet: WalletClient; account: Account } {
    const wallet = opts.wallet;
    if (!wallet?.account) throw new ChainError("wallet_required", "connect a wallet (pass `wallet` to createMRA) for this action");
    return { wallet, account: wallet.account };
  }

  async function write(label: string, params: { address: Addr; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }): Promise<Receipt> {
    const { wallet, account } = requireWallet();
    let hash: Hex | undefined;
    // Transient errors from load-balanced public RPCs BEFORE broadcast (no hash came back, so nothing was sent):
    // a node that hasn't seen the faucet's ETH yet ("insufficient funds") or a rate limit. Retry those only.
    // "nonce too low" from a lagging node is retried too, but only if no earlier attempt could have been broadcast
    // (a timeout may have sent it; a fresh nonce would then send it twice).
    let maybeSent = false;
    for (let attempt = 0; hash === undefined; attempt++) {
      try {
        hash = await wallet.writeContract({ ...params, account, chain } as never);
      } catch (e) {
        const text = errorText(e);
        const staleNonce = STALE_NONCE.test(text) && !maybeSent && !/revert/i.test(text);
        if (MAYBE_SENT.test(text)) maybeSent = true;
        if (attempt < 3 && (isTransientWriteError(e) || staleNonce)) {
          await new Promise((r) => setTimeout(r, (opts.retryDelayMs ?? 2_500) * (attempt + 1)));
          continue;
        }
        throw new ChainError("chain_write_failed", `transaction rejected or failed: ${label}`, e);
      }
    }
    const receipt = await read(`receipt ${label}`, () => client.waitForTransactionReceipt({ hash }));
    if (receipt.status !== "success") throw new ChainError("chain_write_failed", `transaction reverted: ${label}`);
    return receipt as Receipt;
  }

  async function approveToken(token: Addr, spender: Addr, amount: bigint, allowanceTarget?: bigint): Promise<Receipt | null> {
    const { account } = requireWallet();
    const allowance = (await read("allowance", () =>
      client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account.address, spender] }),
    )) as bigint;
    if (allowance >= amount) return null;
    const target = allowanceTarget !== undefined && allowanceTarget > amount ? allowanceTarget : amount;
    return write("approve", { address: token, abi: erc20Abi, functionName: "approve", args: [spender, target] });
  }

  /**
   * Event scans. Three things keep them cheap over a slow transport (Anon-RPC: 0.5-30 s a hop):
   * - the chunks of one scan go out in parallel, not one after another;
   * - logs older than head - FINALITY never change, so each (address, event, args) keeps what it has already fetched
   *   up to that point and later scans only fetch the new tail;
   * - an identical scan already in flight is shared, not repeated.
   */
  type LogCache = { start: bigint; end: bigint; logs: LogEntry[] };
  const logCache = new Map<string, LogCache>();
  const inflight = new Map<string, Promise<LogEntry[]>>();

  async function fetchRange(address: Addr, abi: readonly unknown[], eventName: string, args: Record<string, unknown> | undefined, from: bigint, to: bigint): Promise<{ logs: LogEntry[]; end: bigint }> {
    const ranges: [bigint, bigint][] = [];
    for (let start = from; start <= to; start += chunk) ranges.push([start, start + chunk - 1n > to ? to : start + chunk - 1n]);
    let reached = to;
    const parts = await Promise.all(
      ranges.map(async ([start, end]) => {
        const get = (t: bigint) => client.getContractEvents({ address, abi, eventName, args, fromBlock: start, toBlock: t } as never);
        try {
          return (await get(end)) as unknown as LogEntry[];
        } catch (e) {
          // Load-balanced public RPCs: eth_blockNumber came from a node a block or two ahead of the one serving
          // eth_getLogs ("block range extends beyond current head"). Stop short of the head; the next poll gets it.
          if (end !== to || end - 2n < start) throw new ChainError("chain_read_failed", `chain read failed: logs ${eventName}`, e);
          reached = end - 2n;
          return (await read(`logs ${eventName}`, () => get(end - 2n))) as unknown as LogEntry[];
        }
      }),
    );
    return { logs: parts.flat(), end: reached };
  }

  async function scan(key: string, address: Addr, abi: readonly unknown[], eventName: string, args: Record<string, unknown> | undefined, from: bigint, latest: bigint): Promise<LogEntry[]> {
    const hit = logCache.get(key);
    const usable = !!hit && hit.start <= from && hit.end + 1n >= from;
    const cached = usable ? hit!.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= latest) : [];
    const fetchFrom = usable ? hit!.end + 1n : from;
    const fresh = fetchFrom <= latest ? await fetchRange(address, abi, eventName, args, fetchFrom, latest) : { logs: [] as LogEntry[], end: latest };
    // Keep what is now final (contiguous with the entry this scan started from; a concurrent writer wins the race).
    const safe = latest - FINALITY;
    const keepTo = safe < fresh.end ? safe : fresh.end;
    if (keepTo >= fetchFrom && logCache.get(key) === hit) {
      const kept = fresh.logs.filter((l) => l.blockNumber <= keepTo);
      logCache.set(key, usable ? { start: hit!.start, end: keepTo, logs: [...hit!.logs, ...kept] } : { start: from, end: keepTo, logs: kept });
    }
    return [...cached, ...fresh.logs];
  }

  async function logs(address: Addr, abi: readonly unknown[], eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint) {
    const latest = toBlock ?? (await head());
    let from = fromBlock ?? BigInt(d.deployBlock);
    if (from < BigInt(d.deployBlock)) from = BigInt(d.deployBlock);
    if (from > latest) return [] as LogEntry[];
    const key = `${address.toLowerCase()}|${eventName}|${stableJson(args)}`;
    const flight = `${key}|${from}|${latest}`;
    const running = inflight.get(flight);
    if (running) return running;
    const p = scan(key, address, abi, eventName, args, from, latest).finally(() => inflight.delete(flight));
    inflight.set(flight, p);
    return p;
  }

  /** eth_blockNumber, shared for HEAD_TTL_MS: one screen asks for it from several loaders at once. */
  let headCache: { at: number; p: Promise<bigint> } | undefined;
  function head(): Promise<bigint> {
    const now = Date.now();
    if (headCache && now - headCache.at < HEAD_TTL_MS) return headCache.p;
    const p = read("blockNumber", () => client.getBlockNumber({ cacheTime: 0 }));
    headCache = { at: now, p };
    p.catch(() => {
      if (headCache?.p === p) headCache = undefined;
    });
    return p;
  }

  /** Contract bytecode never changes at an address once deployed: keep its size. */
  const codeSizes = new Map<string, Promise<number>>();

  return {
    client,
    deployment: d,
    addresses: A,
    chain,
    hasWallet: () => !!opts.wallet?.account,
    walletAddress: () => opts.wallet?.account?.address as Addr | undefined,

    blockNumber: () => head(),
    /** Block timestamps are immutable: one request per block, shared by concurrent callers. */
    blockTime(n: bigint): Promise<number> {
      const hit = blockTimes.get(n);
      if (hit !== undefined) return hit;
      const p = read("getBlock", () => client.getBlock({ blockNumber: n })).then((b) => Number(b.timestamp));
      blockTimes.set(n, p);
      p.catch(() => blockTimes.delete(n));
      return p;
    },
    codeSize(address: Addr): Promise<number> {
      const k = address.toLowerCase();
      const hit = codeSizes.get(k);
      if (hit) return hit;
      const p = read("getCode", () => client.getCode({ address })).then((c) => (c ? (c.length - 2) / 2 : 0));
      codeSizes.set(k, p);
      // An empty answer may be a lagging node: don't keep it.
      p.then((n) => n === 0 && codeSizes.delete(k), () => codeSizes.delete(k));
      return p;
    },

    async protocol(): Promise<ProtocolSnapshot> {
      return read("protocol", async () => {
        const [sa, ss, so, sp, ja, js, jp, reserve, exposure, maxExposure, next, sf, jf, rf, pf, ...caps] = await Promise.all([
          vault(A.senior, "totalAssets"),
          vault(A.senior, "totalSupply"),
          vault(A.senior, "outstanding"),
          vault(A.senior, "convertToAssets", [ONE]),
          vault(A.junior, "totalAssets"),
          vault(A.junior, "totalSupply"),
          vault(A.junior, "convertToAssets", [ONE]),
          book("reserve"),
          book("exposure"),
          book("maxExposure"),
          book("nextAdvanceId"),
          book("seniorFeeBps"),
          book("juniorFeeBps"),
          book("reserveFeeBps"),
          book("protocolFeeBps"),
          ...[0n, 1n, 2n, 3n].map((i) => book("tierCap", [i])),
          ...[0n, 1n, 2n, 3n].map((i) => book("tierCapFloor", [i])),
        ]);
        return {
          seniorAssets: sa,
          seniorSupply: ss,
          seniorOutstanding: so,
          seniorSharePrice: sp,
          juniorAssets: ja,
          juniorSupply: js,
          juniorSharePrice: jp,
          reserve,
          exposure,
          maxExposure,
          nextAdvanceId: next,
          seniorFeeBps: Number(sf),
          juniorFeeBps: Number(jf),
          reserveFeeBps: Number(rf),
          protocolFeeBps: Number(pf),
          tierCaps: caps.slice(0, 4) as bigint[],
          tierCapFloors: caps.slice(4, 8) as bigint[],
        };
      });
    },

    async position(account: Addr): Promise<PositionSnapshot> {
      return read("position", async () => {
        const [usdc, sS, sMax, jS, jMax] = await Promise.all([
          client.readContract({ address: A.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
          vault(A.senior, "balanceOf", [account]),
          vault(A.senior, "maxWithdraw", [account]),
          vault(A.junior, "balanceOf", [account]),
          vault(A.junior, "maxWithdraw", [account]),
        ]);
        const [sV, jV] = await Promise.all([vault(A.senior, "convertToAssets", [sS]), vault(A.junior, "convertToAssets", [jS])]);
        return { account, usdc, seniorShares: sS, seniorValue: sV, seniorMaxWithdraw: sMax, juniorShares: jS, juniorValue: jV, juniorMaxWithdraw: jMax };
      });
    },

    usdcBalance: (account: Addr) =>
      read("usdc balance", () => client.readContract({ address: A.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] })),

    async shop(shopId: Hex) {
      const [owner, payout, activeAdvanceId] = (await read("shop", () => book("shops", [shopId]))) as [Addr, Addr, bigint];
      return { owner, payout, activeAdvanceId, registered: owner !== "0x0000000000000000000000000000000000000000" };
    },

    async advance(id: bigint): Promise<AdvanceOnchain> {
      const [a, owedNow, lateFee, isBehind, head] = await Promise.all([
        read("advance", () => book("getAdvance", [id])),
        read("advance owed", () => book("owedOf", [id])),
        read("advance late fee", () => book("lateFeeOf", [id])),
        read("advance behind", () => book("isBehind", [id])),
        client.getBlock(),
      ]);
      const rawFee = a.principal * BigInt(a.feeRateBpsPerWeek) * (head.timestamp - a.drawnAt) / (10_000n * 604_800n);
      const accrued = a.principalRepaid === a.principal ? a.feePaid :
        (rawFee < a.principal * BigInt(a.feeCapBps) / 10_000n ? rawFee : a.principal * BigInt(a.feeCapBps) / 10_000n);
      return {
        id,
        shopId: a.shopId,
        principal: a.principal,
        totalOwed: a.totalOwed,
        owedNow,
        feeSoFar: accrued,
        feePaid: a.feePaid,
        drawnAt: a.drawnAt,
        feeRateBpsPerWeek: Number(a.feeRateBpsPerWeek),
        feeCapBps: Number(a.feeCapBps),
        lateFee,
        lateFeePaid: a.lateFeePaid,
        isBehind,
        repaid: a.repaid,
        principalRepaid: a.principalRepaid,
        holdbackBps: Number(a.holdbackBps),
        tier: Number(a.tier),
        lastSaleAt: a.lastSaleAt,
        status: Number(a.status),
        credentialClaimed: a.credentialClaimed,
        pendingCommitment: a.pendingCommitment,
      };
    },

    mandate: (id: bigint) => read("mandate", () => book("getMandate", [id])),
    mandateContext: (r: MandateRequestArgs) => read("mandateContext", () => book("mandateContext", [r])) as Promise<bigint>,
    contextFor: (recipient: Addr, offerId: Hex) => read("contextFor", () => book("contextFor", [recipient, offerId])) as Promise<bigint>,
    countrySet: () =>
      read("countrySet", () => client.readContract({ address: A.registry, abi: businessPassRegistryAbi, functionName: "countrySet" })) as Promise<readonly number[]>,

    /** RiskHook TWAP tick for the junior/USDC pool. price(USDC per junior) ≈ 1.0001^tick when junior is currency0. */
    juniorTwapTick: (secondsAgo: number) =>
      read("twap", () =>
        client.readContract({
          address: A.hook,
          abi: riskHookAbi,
          functionName: "consult",
          args: [
            {
              currency0: d.poolKey.currency0 as Addr,
              currency1: d.poolKey.currency1 as Addr,
              fee: d.poolKey.fee,
              tickSpacing: d.poolKey.tickSpacing,
              hooks: d.poolKey.hooks as Addr,
            },
            secondsAgo,
          ],
        }),
      ) as Promise<number>,

    /** All leaves of a tree, in insertion order. Download them all so the RPC never learns which one is yours. */
    async leaves(tree: "business" | "standing"): Promise<bigint[]> {
      const evs = await logs(tree === "business" ? A.registry : A.book, tree === "business" ? businessPassRegistryAbi : advanceBookAbi, "LeafInserted");
      return evs.sort((a, b) => Number(a.args.leafIndex - b.args.leafIndex)).map((e) => e.args.commitment as bigint);
    },

    isKnownStandingRoot: (root: bigint) => read("isKnownRoot", () => book("isKnownRoot", [root])) as Promise<boolean>,

    bookLogs: (eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint) =>
      logs(A.book, advanceBookAbi, eventName, args, fromBlock, toBlock),
    registryLogs: (eventName: string, fromBlock?: bigint) => logs(A.registry, businessPassRegistryAbi, eventName, undefined, fromBlock),
    vaultLogs: (tranche: "senior" | "junior", eventName: string, args?: Record<string, unknown>) =>
      logs(tranche === "senior" ? A.senior : A.junior, trancheVaultAbi, eventName, args),
    contractLogs: (address: Addr, abi: readonly unknown[], eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint) =>
      logs(address, abi, eventName, args, fromBlock, toBlock),

    /* ------------------------------------------------------------- writes */

    approveUsdc: (spender: Addr, amount: bigint, allowanceTarget?: bigint) => approveToken(A.usdc, spender, amount, allowanceTarget),
    approveToken: (token: Addr, spender: Addr, amount: bigint, allowanceTarget?: bigint) => approveToken(token, spender, amount, allowanceTarget),
    send: (label, params) => write(label, params),
    async deposit(tranche: "senior" | "junior", assets: bigint) {
      const { account } = requireWallet();
      return write("deposit", { address: tranche === "senior" ? A.senior : A.junior, abi: trancheVaultAbi, functionName: "deposit", args: [assets, account.address] });
    },
    async withdraw(tranche: "senior" | "junior", assets: bigint) {
      const { account } = requireWallet();
      return write("withdraw", {
        address: tranche === "senior" ? A.senior : A.junior,
        abi: trancheVaultAbi,
        functionName: "withdraw",
        args: [assets, account.address, account.address],
      });
    },
    pay: (shopId: Hex, amount: bigint) => write("pay", { address: A.book, abi: advanceBookAbi, functionName: "pay", args: [shopId, amount] }),
    registerShop: (shopId: Hex, payout: Addr) => write("registerShop", { address: A.book, abi: advanceBookAbi, functionName: "registerShop", args: [shopId, payout] }),
    issueBusinessPass: (att: { businessNullifier: Hex; commitment: Hex; expiresAt: number }, signature: Hex) =>
      write("issue", {
        address: A.registry,
        abi: businessPassRegistryAbi,
        functionName: "issue",
        args: [{ businessNullifier: BigInt(att.businessNullifier), commitment: BigInt(att.commitment), expiresAt: BigInt(att.expiresAt) }, signature, BigInt(att.commitment)],
      }),

    /** Shop owner's EIP-712 consent for a mandate (SPEC: Mandate typehash, AdvanceBook domain). */
    async signMandate(r: MandateRequestArgs): Promise<Hex> {
      const { wallet, account } = requireWallet();
      try {
        return await wallet.signTypedData({
          account,
          domain: { name: "AdvanceBook", version: "1", chainId: d.chainId, verifyingContract: A.book },
          types: {
            Mandate: [
              { name: "shopId", type: "bytes32" },
              { name: "agentKey", type: "address" },
              { name: "recipient", type: "address" },
              { name: "maxPerDraw", type: "uint256" },
              { name: "maxPerPeriod", type: "uint256" },
              { name: "period", type: "uint64" },
              { name: "expiry", type: "uint64" },
              { name: "tier", type: "uint8" },
              { name: "band", type: "uint8" },
            ],
          },
          primaryType: "Mandate",
          message: { shopId: r.shopId, agentKey: r.agentKey, recipient: r.recipient, ...r.limits, tier: r.tier, band: r.band },
        });
      } catch (e) {
        throw new ChainError("chain_write_failed", "mandate signature rejected", e);
      }
    },

    /** EIP-191 personal_sign with the connected wallet (shop-owner auth for the agents API). */
    async signMessage(text: string): Promise<Hex> {
      const { wallet, account } = requireWallet();
      try {
        return await wallet.signMessage({ account, message: text });
      } catch (e) {
        throw new ChainError("chain_write_failed", "message signature rejected", e);
      }
    },

    /** Decode AdvanceBook / registry events from a receipt. */
    parseLogs(receipt: { logs: readonly unknown[] }) {
      return parseEventLogs({ abi: [...advanceBookAbi, ...businessPassRegistryAbi], logs: receipt.logs as never }) as unknown as { eventName: string; args: any }[];
    },
    receipt: (hash: Hex) => read("receipt", () => client.waitForTransactionReceipt({ hash })) as Promise<Receipt>,
  };
}
