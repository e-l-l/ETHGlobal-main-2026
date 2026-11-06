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
};

export type AdvanceOnchain = {
  id: bigint;
  shopId: Hex;
  principal: bigint;
  totalOwed: bigint;
  repaid: bigint;
  holdbackBps: number;
  tier: number;
  lastSaleAt: bigint;
  /** 0 None, 1 Active, 2 Repaid, 3 WrittenOff */
  status: number;
  credentialClaimed: boolean;
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

type Receipt = { status: "success" | "reverted"; transactionHash: Hex; logs: readonly unknown[] };
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
  bookLogs(eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint): Promise<LogEntry[]>;
  registryLogs(eventName: string, fromBlock?: bigint): Promise<LogEntry[]>;
  vaultLogs(tranche: "senior" | "junior", eventName: string, args?: Record<string, unknown>): Promise<LogEntry[]>;
  /** Approve `allowance` (default `amount`) unless the current allowance already covers `amount`. */
  approveUsdc(spender: Addr, amount: bigint, allowance?: bigint): Promise<Receipt | null>;
  deposit(tranche: "senior" | "junior", assets: bigint): Promise<Receipt>;
  withdraw(tranche: "senior" | "junior", assets: bigint): Promise<Receipt>;
  pay(shopId: Hex, amount: bigint): Promise<Receipt>;
  registerShop(shopId: Hex, payout: Addr): Promise<Receipt>;
  issueBusinessPass(att: { businessNullifier: Hex; commitment: Hex; expiresAt: number }, signature: Hex): Promise<Receipt>;
  signMandate(r: MandateRequestArgs): Promise<Hex>;
  parseLogs(receipt: { logs: readonly unknown[] }): { eventName: string; args: any }[];
  receipt(hash: Hex): Promise<Receipt>;
}

const TRANSIENT_WRITE = /insufficient funds|rate limit|exceeds defined limit|too many requests|\b429\b|timed? ?out|fetch failed|network/i;

/** Pre-broadcast write errors worth retrying (viem nests the RPC error in `cause`). Never reverts. */
export function isTransientWriteError(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 8; x = (x as { cause?: unknown }).cause, i++) {
    const m = `${(x as { shortMessage?: string }).shortMessage ?? ""} ${(x as { details?: string }).details ?? ""} ${(x as Error).message ?? ""}`;
    if (/revert/i.test(m)) return false;
    if (TRANSIENT_WRITE.test(m)) return true;
  }
  return false;
}

export function createChain(opts: ChainOptions): Chain {
  const d = opts.deployment;
  const chain = chainFor(d.chainId);
  const transport = http(opts.url, {
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn as typeof fetch } : {}),
    retryCount: 1,
    timeout: opts.timeoutMs ?? 20_000,
  });
  const client = createPublicClient({ chain, transport }) as PublicClient;
  const A = {
    book: d.AdvanceBook as Addr,
    registry: d.BusinessPassRegistry as Addr,
    senior: d.SeniorVault as Addr,
    junior: d.JuniorVault as Addr,
    hook: d.RiskHook as Addr,
    usdc: d.USDC as Addr,
  };
  const chunk = BigInt(opts.logChunk ?? 9_000);
  const blockTimes = new Map<bigint, number>();

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
    for (let attempt = 0; hash === undefined; attempt++) {
      try {
        hash = await wallet.writeContract({ ...params, account, chain } as never);
      } catch (e) {
        if (attempt < 3 && isTransientWriteError(e)) {
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

  async function logs(address: Addr, abi: readonly unknown[], eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint) {
    const latest = toBlock ?? (await read("blockNumber", () => client.getBlockNumber()));
    let from = fromBlock ?? BigInt(d.deployBlock);
    if (from < BigInt(d.deployBlock)) from = BigInt(d.deployBlock);
    const out: any[] = [];
    for (let start = from; start <= latest; start += chunk) {
      const end = start + chunk - 1n > latest ? latest : start + chunk - 1n;
      const get = (to: bigint) => client.getContractEvents({ address, abi, eventName, args, fromBlock: start, toBlock: to } as never);
      let part: unknown;
      try {
        part = await get(end);
      } catch (e) {
        // Load-balanced public RPCs: eth_blockNumber came from a node a block or two ahead of the one serving
        // eth_getLogs ("block range extends beyond current head"). Stop short of the head; the next poll gets it.
        if (end !== latest || end - 2n < start) throw new ChainError("chain_read_failed", `chain read failed: logs ${eventName}`, e);
        part = await read(`logs ${eventName}`, () => get(end - 2n));
      }
      out.push(...(part as any[]));
    }
    return out as LogEntry[];
  }

  return {
    client,
    deployment: d,
    addresses: A,
    chain,
    hasWallet: () => !!opts.wallet?.account,
    walletAddress: () => opts.wallet?.account?.address as Addr | undefined,

    blockNumber: () => read("blockNumber", () => client.getBlockNumber()),
    async blockTime(n: bigint): Promise<number> {
      const hit = blockTimes.get(n);
      if (hit !== undefined) return hit;
      const b = await read("getBlock", () => client.getBlock({ blockNumber: n }));
      const t = Number(b.timestamp);
      blockTimes.set(n, t);
      return t;
    },

    async protocol(): Promise<ProtocolSnapshot> {
      return read("protocol", async () => {
        const [sa, ss, so, sp, ja, js, jp, reserve, exposure, maxExposure, next, sf, jf, ...caps] = await Promise.all([
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
          book("SENIOR_FEE_BPS"),
          book("JUNIOR_FEE_BPS"),
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
      const a = await read("advance", () => book("getAdvance", [id]));
      return {
        id,
        shopId: a.shopId,
        principal: a.principal,
        totalOwed: a.totalOwed,
        repaid: a.repaid,
        holdbackBps: Number(a.holdbackBps),
        tier: Number(a.tier),
        lastSaleAt: a.lastSaleAt,
        status: Number(a.status),
        credentialClaimed: a.credentialClaimed,
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

    bookLogs: (eventName: string, args?: Record<string, unknown>, fromBlock?: bigint, toBlock?: bigint) =>
      logs(A.book, advanceBookAbi, eventName, args, fromBlock, toBlock),
    registryLogs: (eventName: string, fromBlock?: bigint) => logs(A.registry, businessPassRegistryAbi, eventName, undefined, fromBlock),
    vaultLogs: (tranche: "senior" | "junior", eventName: string, args?: Record<string, unknown>) =>
      logs(tranche === "senior" ? A.senior : A.junior, trancheVaultAbi, eventName, args),

    /* ------------------------------------------------------------- writes */

    async approveUsdc(spender: Addr, amount: bigint, allowanceTarget?: bigint) {
      const { account } = requireWallet();
      const allowance = (await read("allowance", () =>
        client.readContract({ address: A.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, spender] }),
      )) as bigint;
      if (allowance >= amount) return null;
      const target = allowanceTarget !== undefined && allowanceTarget > amount ? allowanceTarget : amount;
      return write("approve", { address: A.usdc, abi: erc20Abi, functionName: "approve", args: [spender, target] });
    },
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

    /** Decode AdvanceBook / registry events from a receipt. */
    parseLogs(receipt: { logs: readonly unknown[] }) {
      return parseEventLogs({ abi: [...advanceBookAbi, ...businessPassRegistryAbi], logs: receipt.logs as never }) as unknown as { eventName: string; args: any }[];
    },
    receipt: (hash: Hex) => read("receipt", () => client.waitForTransactionReceipt({ hash })) as Promise<Receipt>,
  };
}
