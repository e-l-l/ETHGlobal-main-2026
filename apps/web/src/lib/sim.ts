/**
 * The judge-facing simulator on the public devnet (agents API, /sim). There is no SDK module for it: these are the
 * wire shapes from agents/src/mra_agents/sim.py and sim_runner.py, typed loosely so new step kinds or ledger keys
 * never break the page.
 *
 * Mock mode (the default, and e2e) never touches the network: it plays a scripted run locally.
 */
import { isMock } from "@/lib/mra";

export const SIM_URL = (process.env.NEXT_PUBLIC_SIM_URL ?? "https://api-devnet.65-1-36-70.sslip.io").replace(/\/+$/, "");
/** Mock mode, or NEXT_PUBLIC_SIM_MODE=demo: play scripted runs instead of calling the devnet. */
export const SIM_DEMO = isMock || process.env.NEXT_PUBLIC_SIM_MODE === "demo";

export type ArchetypeId = "honest_kiosk" | "slow_week" | "wash_ring" | "defaulter" | "repeat_borrower" | (string & {});

export type Archetype = { id: ArchetypeId; name: string; city: string; emoji?: string; blurb: string; expected: string };

/** Chain state in USD (SimRunner.ledger). Every key is optional: a failed read leaves it out. */
export type SimLedger = Partial<{
  senior_assets: number;
  junior_assets: number;
  reserve: number;
  junior_share_price: number;
  junior_pool_price: number;
  outstanding: number;
  advanced: number;
  repaid: number;
  written_off: number;
  tier_caps: number[];
  merchant_tier: number;
  merchant_limit: number;
}>;

/** Known kinds pick an icon; anything else falls back to a dot. */
export type StepKind =
  | "business_pass"
  | "zk_proof"
  | "shop"
  | "world_id"
  | "human"
  | "critic"
  | "underwriter"
  | "redlines"
  | "offer"
  | "draw"
  | "sale"
  | "repay"
  | "late"
  | "warp"
  | "risk"
  | "swap"
  | "standing_pass"
  | "writeoff"
  | "ban"
  | "refused"
  | "world_view"
  | "unlock"
  | "info"
  | "error"
  | (string & {});

export type SimStep = {
  i: number;
  at: number;
  sim_day: number;
  kind: StepKind;
  title: string;
  detail: string;
  data: Record<string, unknown> & { ledger?: SimLedger };
  tx: string | null;
};

export type RunStatus = "queued" | "running" | "done" | "failed";

export type SimRun = {
  run_id: string;
  archetype: ArchetypeId;
  status: RunStatus;
  ahead: number;
  started_at: number | null;
  /** The API sends { pseudonym, shop_id }; the local demo fills a plain pseudonym. */
  shop: string | { pseudonym: string; shop_id: string } | null;
  steps: SimStep[];
  ledger: SimLedger | null;
  done_reason: string | null;
};

export type RecentRun = { id: string; archetype: ArchetypeId; status: RunStatus; done_reason: string | null };
export type SimState = { ledger: SimLedger | null; recent: RecentRun[] };

/** 429: the devnet is already running as many scenarios as it can. Nothing was started. */
export class SimBusyError extends Error {
  constructor() {
    super("busy");
  }
}

/** The five cards, used before /sim/archetypes answers and whenever it can't. Copy follows the design. */
export const ARCHETYPES: Archetype[] = [
  { id: "honest_kiosk", name: "Honest kiosk", city: "Buenos Aires", blurb: "Steady sales every day.", expected: "Repays on time and claims a Standing Pass." },
  { id: "slow_week", name: "Slow week", city: "Lagos", blurb: "Sales dip for a week, then recover.", expected: "Repayment slows. Still on time, no penalty." },
  { id: "wash_ring", name: "Wash ring", city: "", blurb: "Circular funding and very few real payers.", expected: "Red lines fire or the Critic agent rejects it." },
  { id: "defaulter", name: "Defaulter", city: "", blurb: "Sales stop right after drawing.", expected: "Write-off and a World ID ban. The retry on a new wallet is stopped at the World ID check." },
  { id: "repeat_borrower", name: "Repeat borrower", city: "", blurb: "A merchant who has repaid before.", expected: "Uses the Standing Pass: tier 1, first draw capped at 50% of the limit." },
];

/** Our copy wins over the API's short blurbs; unknown archetypes keep theirs. */
function withCopy(a: Archetype): Archetype {
  const ours = ARCHETYPES.find((x) => x.id === a.id);
  return ours ? { ...a, blurb: ours.blurb, expected: ours.expected, city: a.city || ours.city } : a;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SIM_URL}/sim${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (res.status === 429) throw new SimBusyError();
  if (!res.ok) throw new Error(`sim ${res.status}`);
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ demo mode: a scripted run */

const DEMO_LEDGER: Required<Pick<SimLedger, "senior_assets" | "junior_assets" | "reserve" | "junior_pool_price" | "outstanding" | "tier_caps">> = {
  senior_assets: 48_210,
  junior_assets: 9_840,
  reserve: 1_204,
  junior_pool_price: 0.986,
  outstanding: 12_450,
  tier_caps: [50, 100, 200, 300],
};

type Script = [day: number, kind: StepKind, title: string, detail: string, ledger?: Partial<SimLedger>, tx?: boolean, data?: Record<string, unknown>][];

const FAKE_TX = (n: number) => `0x${(n * 2654435761).toString(16).padStart(8, "0").repeat(8)}`;

const OPEN: Script = [
  [0, "world_id", "World ID first: a unique human, cleared to borrow", "Before any business step the merchant proved with World ID that a unique person is applying, not banned and with no open advance elsewhere."],
  [0, "info", "Business Pass issued (zkTLS stand-in)", "The seller portal's sales history, signed for this merchant only."],
  [0, "zk_proof", "Zero-knowledge proof: Business Pass", "Checked onchain. No name, no sales history shared.", undefined, true],
  [0, "shop", "Merchant opens a pseudonymous shop", "A fresh wallet. Nothing onchain links it to the person.", undefined, true],
  [0, "world_id", "Shop bound to the World ID from the first step", "Linked privately to the human checked at the start. No second scan."],
];

const SCRIPTS: Record<string, Script> = {
  honest_kiosk: [
    ...OPEN,
    [0, "underwriter", "Underwriter offers $50", "Sales look real. The Critic agent agrees."],
    [0, "offer", "Offer signed", "$50 · 0.5% a week, max 3% · 8% of each sale", undefined, true],
    [0, "draw", "Advance drawn", "$50 paid to the shop", { outstanding: 12_500 }, true],
    [6, "sale", "41 customer payments", "$412 in sales · $32.96 went to the advance", { outstanding: 12_467 }, true],
    [12, "repay", "Advance repaid", "$50 back plus a $0.86 fee, paid early", { outstanding: 12_450, reserve: 1_204.17 }, true],
    [12, "standing_pass", "Standing Pass claimed", "Tier 1 unlocked: the next advance can be up to $100.", undefined, true],
  ],
  slow_week: [
    ...OPEN,
    [0, "underwriter", "Underwriter offers $50", "Sales look real. The Critic agent agrees."],
    [0, "draw", "Advance drawn", "$50 paid to the shop", { outstanding: 12_500 }, true],
    [7, "sale", "A slow week", "Sales fell by half. Repayment slowed with them, still above the weekly minimum."],
    [14, "sale", "Sales recover", "$380 in sales this week · $30.40 went to the advance", undefined, true],
    [19, "repay", "Advance repaid", "$50 back plus a $1.36 fee. No late fee, no penalty.", { outstanding: 12_450 }, true],
  ],
  wash_ring: [
    ...OPEN,
    [0, "redlines", "Red lines fire", "Most sales come from 3 wallets that the shop funded itself."],
    [0, "critic", "Critic agent rejects", "Circular funding: the money goes around and comes back as sales."],
    [0, "offer", "No offer: no money moves", "Nothing was lent. The vault and DripCoin are untouched."],
  ],
  defaulter: [
    ...OPEN,
    [0, "underwriter", "Underwriter offers $50", "Sales look real. The Critic agent agrees."],
    [0, "offer", "Offer signed", "$50 · 0.5% a week, max 3% · 8% of each sale", undefined, true],
    [0, "draw", "Advance drawn", "$50 paid to the shop", { outstanding: 12_500 }, true],
    [1, "sale", "4 customer payments", "$28.40 in sales · $2.27 went to the advance", undefined, true],
    [2, "sale", "Sales stop", "No customer payments after day 2"],
    [9, "late", "Behind the weekly minimum", "The fee doubles to 1% a week (max 6%) until they catch up. The extra goes to the reserve."],
    [16, "risk", "Risk agent lowers the top cap", "DRIP price fell to 0.94 of its daily average. Tier 3: $300 → $225.", { junior_pool_price: 0.941, tier_caps: [50, 100, 200, 225] }, true],
    [30, "writeoff", "Written off: $47.73", "DripCoin takes the loss first. The vault is not touched.", { junior_assets: 9_792.27, outstanding: 12_452.27, junior_pool_price: 0.974 }, true],
    [30, "world_id", "World ID banned: this person can't borrow again, on any shop", "The offer signer banned the World ID behind this shop. A private list: nothing about the person went onchain.", undefined, false, { banned: true }],
    [31, "world_view", "Retry refused at World ID", "Same person, brand-new wallet, trying again. The first screen is World ID, and it refused before any business step.", undefined, false, { eligible: false, reason: "human_banned", business_pass: "not started", shop: "not created", outstanding_before: 12_452.27, outstanding_after: 12_452.27, unchanged: true }],
  ],
  repeat_borrower: [
    ...OPEN,
    [0, "standing_pass", "Standing Pass proved", "One earlier advance repaid, proved without showing which one.", undefined, true],
    [0, "standing_pass", "Tier-1 limit on the fresh pseudonym: $100", "The Standing Pass lifted the cap from $50."],
    [0, "draw", "Advance drawn: $50 paid out", "$50 paid to the shop", { outstanding: 12_500 }, true],
    [0, "unlock", "Gradual unlock: $50 of the $100 limit", "The first advance at a new level is capped at 50%. Each full week of on-time minimums unlocks 25% more: 50% = $50, 75% = $75, 100% = $100."],
    [16, "repay", "Advance repaid", "$50 back plus a $0.86 fee", { outstanding: 12_450 }, true],
  ],
};

type DemoRun = { run: SimRun; script: Script; startedAt: number };
const demoRuns = new Map<string, DemoRun>();
/** One scripted step every this many ms. */
const DEMO_PACE = 1400;

function demoView(d: DemoRun): SimRun {
  const shown = Math.min(d.script.length, Math.floor((Date.now() - d.startedAt) / DEMO_PACE) + 1);
  let ledger: SimLedger = { ...DEMO_LEDGER };
  const steps: SimStep[] = d.script.slice(0, shown).map(([day, kind, title, detail, change, tx, data], i) => {
    ledger = { ...ledger, ...change };
    return { i, at: d.startedAt / 1000 + i, sim_day: day, kind, title, detail, data: { ...data, ledger }, tx: tx ? FAKE_TX(i + 1) : null };
  });
  const done = shown >= d.script.length;
  return { ...d.run, status: done ? "done" : "running", steps, ledger, done_reason: done ? "Scenario complete" : null };
}

/* ------------------------------------------------------------------ the client */

export const sim = {
  async archetypes(): Promise<Archetype[]> {
    if (SIM_DEMO) return ARCHETYPES;
    const list = await call<Archetype[]>("/archetypes");
    return list.length ? list.map(withCopy) : ARCHETYPES;
  },

  async state(): Promise<SimState> {
    if (SIM_DEMO) return { ledger: { ...DEMO_LEDGER }, recent: [] };
    return call<SimState>("/state");
  },

  async start(archetype: ArchetypeId): Promise<string> {
    if (SIM_DEMO) {
      const id = `demo-${Math.random().toString(16).slice(2, 6)}`;
      const run: SimRun = { run_id: id, archetype, status: "running", ahead: 0, started_at: Date.now() / 1000, shop: `shop_${id.slice(5)}`, steps: [], ledger: null, done_reason: null };
      demoRuns.set(id, { run, script: SCRIPTS[archetype] ?? SCRIPTS.honest_kiosk!, startedAt: Date.now() });
      return id;
    }
    const { run_id } = await call<{ run_id: string }>("/runs", { method: "POST", body: JSON.stringify({ archetype }) });
    return run_id;
  },

  async run(id: string, signal?: AbortSignal): Promise<SimRun> {
    const demo = demoRuns.get(id);
    if (demo) return demoView(demo);
    return call<SimRun>(`/runs/${encodeURIComponent(id)}`, { signal });
  },
};

/** The ledger to show for a run: the newest step that carries one, else the run's own. */
export function latestLedger(run: SimRun | null): SimLedger | null {
  if (!run) return null;
  for (let i = run.steps.length - 1; i >= 0; i--) {
    const l = run.steps[i]?.data?.ledger;
    if (l) return l;
  }
  return run.ledger;
}

/** The World ID ban after a write-off (kind world_id, or the older "ban"). */
export function isBanStep(s: SimStep): boolean {
  return s.kind === "ban" || (s.kind === "world_id" && (s.data?.banned === true || /\bbanned\b/i.test(s.title)));
}

/** The defaulter's retry, refused at the World ID check before any business step: the demo highlight. */
export function isRefusedRetry(s: SimStep): boolean {
  return s.kind === "refused" || s.data?.reason === "human_banned" || (s.kind === "world_view" && /\bbanned\b/i.test(s.title));
}
