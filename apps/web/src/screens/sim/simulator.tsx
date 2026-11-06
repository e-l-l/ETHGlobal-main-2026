"use client";

import { useCallback, useEffect, useState, type ReactNode, type SVGProps } from "react";
import { Banner, Button, Card, Columns, Heading, Label, Ledger, Pill, Spinner, Text, TextLink } from "@/final";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  ARCHETYPES,
  SIM_DEMO,
  SimBusyError,
  isBanStep,
  isRefusedRetry,
  latestLedger,
  sim,
  type Archetype,
  type ArchetypeId,
  type RecentRun,
  type SimLedger,
  type SimRun,
  type SimStep,
} from "@/lib/sim";
import { LendHero, LendShell } from "@/screens/lend/shell";

/* ------------------------------------------------------------------ icons (line, currentColor) */

function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
      {children}
    </svg>
  );
}
const I = {
  shop: <Svg><path d="M4 10h16l-1.5-5h-13z" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></Svg>,
  dip: <Svg><path d="M3 7l6 6 4-4 8 8" /><path d="M21 11v6h-6" /></Svg>,
  loop: <Svg><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></Svg>,
  stop: <Svg><circle cx="12" cy="12" r="9" /><path d="M9 9h6v6H9z" /></Svg>,
  again: <Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Svg>,
  proof: <Svg><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></Svg>,
  world: <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></Svg>,
  agent: <Svg><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4" /><circle cx="9.5" cy="13.5" r="1" /><circle cx="14.5" cy="13.5" r="1" /></Svg>,
  doc: <Svg><path d="M6 3h9l3 3v15H6z" /><path d="M9 12h6M9 16h6" /></Svg>,
  money: <Svg><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></Svg>,
  sale: <Svg><path d="M4 7h16v10H4z" /><path d="M8 11h3" /></Svg>,
  check: <Svg><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></Svg>,
  clock: <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  risk: <Svg><path d="M3 12h4l3-7 4 14 3-7h4" /></Svg>,
  swap: <Svg><path d="M7 7h12l-3-3" /><path d="M17 17H5l3 3" /></Svg>,
  pass: <Svg><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h5" /></Svg>,
  loss: <Svg><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></Svg>,
  ban: <Svg><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></Svg>,
  eye: <Svg><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>,
  unlock: <Svg><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></Svg>,
  info: <Svg><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Svg>,
  dot: <Svg><circle cx="12" cy="12" r="3" /></Svg>,
};

const ARCH_ICON: Record<string, ReactNode> = { honest_kiosk: I.shop, slow_week: I.dip, wash_ring: I.loop, defaulter: I.stop, repeat_borrower: I.again };
const ARCH_PILL: Record<string, string> = { wash_ring: "Fraud", defaulter: "Best demo", repeat_borrower: "Returning" };

type Tone = "plain" | "warn" | "bad" | "moment";
const KIND: Record<string, { icon: ReactNode; tone?: Tone }> = {
  business_pass: { icon: I.proof },
  zk_proof: { icon: I.proof },
  shop: { icon: I.shop },
  world_id: { icon: I.world },
  human: { icon: I.world },
  critic: { icon: I.agent },
  underwriter: { icon: I.agent },
  redlines: { icon: I.ban, tone: "warn" },
  offer: { icon: I.doc },
  draw: { icon: I.money },
  sale: { icon: I.sale },
  repay: { icon: I.check },
  late: { icon: I.clock, tone: "warn" },
  warp: { icon: I.clock },
  risk: { icon: I.risk, tone: "warn" },
  swap: { icon: I.swap },
  standing_pass: { icon: I.pass },
  writeoff: { icon: I.loss, tone: "bad" },
  ban: { icon: I.ban, tone: "bad" },
  refused: { icon: I.ban, tone: "moment" },
  world_view: { icon: I.eye },
  unlock: { icon: I.unlock },
  info: { icon: I.info },
  error: { icon: I.ban, tone: "bad" },
};
/** The kind picks the icon; the World ID ban and the refused retry get their own look whatever kind carries them. */
function styleOf(s: SimStep): { icon: ReactNode; tone?: Tone } {
  if (isRefusedRetry(s)) return { icon: I.ban, tone: "moment" };
  if (isBanStep(s)) return { icon: I.ban, tone: "bad" };
  return KIND[s.kind] ?? { icon: I.dot };
}

/* ------------------------------------------------------------------ ledger strip */

const usd = (v: number | undefined) => (v === undefined ? "–" : formatMoney(v));
const price = (v: number | undefined) => (v === undefined ? "–" : `$${v.toFixed(3)}`);

function Delta({ now, before, fmt }: { now?: number; before?: number; fmt: (d: number) => string }) {
  if (now === undefined || before === undefined || Math.abs(now - before) < 1e-6) return null;
  const up = now > before;
  return <span className={cn("font-ledger text-ledger", up ? "text-fern" : "text-caution")}>{up ? "▲" : "▼"} {fmt(Math.abs(now - before))}</span>;
}

function LedgerStrip({ ledger, before, live }: { ledger: SimLedger | null; before?: SimLedger | null; live: boolean }) {
  const l = ledger ?? {};
  const b = before ?? undefined;
  const caps = l.tier_caps?.length ? l.tier_caps : [50, 100, 200, 300];
  const items: { k: string; v: ReactNode; d?: ReactNode; wide?: boolean }[] = [
    { k: "Vault", v: usd(l.senior_assets), d: <Delta now={l.senior_assets} before={b?.senior_assets} fmt={formatMoney} /> },
    { k: "DRIP price", v: price(l.junior_pool_price ?? l.junior_share_price), d: <Delta now={l.junior_pool_price} before={b?.junior_pool_price} fmt={(d) => `$${d.toFixed(3)}`} /> },
    { k: "Reserve", v: usd(l.reserve), d: <Delta now={l.reserve} before={b?.reserve} fmt={formatMoney} /> },
    { k: "Outstanding", v: usd(l.outstanding), d: <Delta now={l.outstanding} before={b?.outstanding} fmt={formatMoney} /> },
    {
      k: "Tier caps",
      wide: true,
      v: (
        <span className="flex flex-nowrap gap-x-1.5 whitespace-nowrap">
          {caps.map((c, i) => (
            <span key={i} className={cn(b?.tier_caps?.[i] !== undefined && b.tier_caps[i] !== c && "text-lime")}>
              ${Math.round(c)}
              {i < caps.length - 1 ? " ·" : ""}
            </span>
          ))}
        </span>
      ),
    },
  ];
  return (
    <section aria-label="Live ledger" className="flex flex-col gap-3 rounded-lg bg-charcoal p-4 text-canvas md:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("size-2 rounded-full bg-lime", live && "animate-pulse motion-reduce:animate-none")} />
        <Label className="text-lime">{SIM_DEMO ? "Ledger · demo" : "Live ledger · devnet"}</Label>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        {items.map((it) => (
          <div key={it.k} className={cn("flex min-w-0 flex-col gap-1", it.wide && "col-span-2 sm:col-span-4 lg:col-span-1")}>
            <dt className="font-ledger text-tag font-medium uppercase text-honeydew">{it.k}</dt>
            <dd className="m-0 font-display text-h2 tabular-nums">{it.v}</dd>
            {it.d ? <dd className="m-0 min-h-4">{it.d}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ picker */

function ArchetypeCard({ a, onRun, busy }: { a: Archetype; onRun: (id: ArchetypeId) => void; busy: boolean }) {
  const dark = a.id === "defaulter";
  const pill = ARCH_PILL[a.id] ?? a.city;
  return (
    <article className={cn("flex min-w-0 flex-col gap-4 rounded-lg border p-5", dark ? "border-charcoal bg-charcoal text-canvas" : "border-hairline bg-surface text-charcoal")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-11 items-center justify-center rounded-md", dark ? "bg-hunter text-lime" : "bg-honeydew text-hunter")}>{ARCH_ICON[a.id] ?? I.shop}</span>
        {pill ? (
          <span className={cn("rounded-chip px-2.5 py-1 font-ledger text-tag font-semibold uppercase", dark ? "bg-lime text-charcoal" : "bg-well text-charcoal-soft")}>{pill}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className={cn("m-0 font-display text-h2", dark ? "text-canvas" : "text-charcoal")}>{a.name}</h3>
        <p className={cn("m-0 font-body text-note", dark ? "text-honeydew" : "text-charcoal-soft")}>{a.blurb}</p>
      </div>
      <div className={cn("flex flex-col gap-1 rounded-md p-3", dark ? "bg-deep" : "bg-well")}>
        <span className={cn("font-ledger text-tag font-medium uppercase", dark ? "text-lime" : "text-charcoal-muted")}>What should happen</span>
        <span className={cn("font-body text-note", dark ? "text-canvas" : "text-charcoal")}>{a.expected}</span>
      </div>
      <Button className="mt-auto" variant={dark ? "lime" : "secondary"} size="sm" width="full" disabled={busy} onClick={() => onRun(a.id)}>
        Run {a.name.toLowerCase()}
      </Button>
    </article>
  );
}

function RecentRuns({ recent, names }: { recent: RecentRun[]; names: Map<string, string> }) {
  if (!recent.length) return null;
  return (
    <Card as="section" gap="sm">
      <div className="flex items-center justify-between gap-3">
        <Heading level={2} size="h2">Recent runs</Heading>
        <TextLink href={routes.explorer} arrow>All receipts in Explorer</TextLink>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {recent.slice(0, 6).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0">
            <span className="min-w-0 truncate font-body text-note text-charcoal">{names.get(r.archetype) ?? r.archetype}</span>
            <span className="flex items-center gap-2">
              <Ledger className="text-charcoal-muted">{r.id.slice(0, 4)}</Ledger>
              <StatusPill status={r.status} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatusPill({ status, day }: { status: SimRun["status"]; day?: number }) {
  if (status === "running") return <Pill tone="repaying" dot>Running{day !== undefined ? ` · day ${day}` : ""}</Pill>;
  if (status === "queued") return <Pill tone="locked">Queued</Pill>;
  if (status === "failed") return <Pill tone="risk">Failed</Pill>;
  return <Pill tone="saving">Done</Pill>;
}

/* ------------------------------------------------------------------ run view */

const toneCls: Record<Tone, { icon: string; title: string }> = {
  plain: { icon: "bg-honeydew text-hunter", title: "text-charcoal" },
  warn: { icon: "bg-caution-tint text-caution", title: "text-charcoal" },
  bad: { icon: "bg-risk-tint text-risk", title: "text-risk" },
  moment: { icon: "bg-lime text-charcoal", title: "text-canvas" },
};

function Timeline({ steps, running }: { steps: SimStep[]; running: boolean }) {
  return (
    <ol aria-label="Run steps" aria-live="polite" className="m-0 flex list-none flex-col p-0">
      {steps.map((s, idx) => {
        const k = styleOf(s);
        const tone = k.tone ?? "plain";
        const t = toneCls[tone];
        const last = idx === steps.length - 1;
        const moment = tone === "moment";
        return (
          <li key={s.i} className={cn("flex gap-3 border-b border-hairline py-4 last:border-b-0", moment && "-mx-4 my-2 rounded-lg border-b-0 bg-charcoal px-4 md:-mx-5 md:px-5")}>
            <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full", t.icon)}>
              {k.icon}
              {last && running ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-lime/40 motion-reduce:animate-none" /> : null}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn("font-ledger text-tag font-medium uppercase", moment ? "text-lime" : "text-charcoal-muted")}>
                {moment ? "The moment to watch · " : ""}Day {s.sim_day} · {s.kind.replace(/_/g, " ")}
              </span>
              <span className={cn("font-body font-semibold", moment ? "text-h2 font-display" : "text-read", t.title)}>{s.title}</span>
              {s.detail ? <span className={cn("font-body text-note", moment ? "text-honeydew" : "text-charcoal-soft")}>{s.detail}</span> : null}
              {moment ? <RefusalFacts step={s} /> : null}
            </div>
            {s.tx ? (
              <a
                href={`${routes.explorer}?tx=${s.tx}`}
                className={cn("shrink-0 self-start pt-5 font-ledger text-ledger underline-offset-4 hover:underline", moment ? "text-lime" : "text-hunter")}
                aria-label={`Receipt for ${s.title}`}
              >
                tx ↗
              </a>
            ) : null}
          </li>
        );
      })}
      {running ? (
        <li className="flex items-center gap-3 py-4 text-charcoal-muted">
          <Spinner size={18} label="Waiting for the next step" />
          <span className="font-body text-note">Next step lands onchain…</span>
        </li>
      ) : null}
    </ol>
  );
}

/** Under the refused retry: what never happened, in chips a judge can read from across the room. */
function RefusalFacts({ step }: { step: SimStep }) {
  const d = step.data ?? {};
  const out = typeof d.outstanding_after === "number" ? d.outstanding_after : undefined;
  const facts = [
    `World ID: ${typeof d.reason === "string" ? d.reason : "human_banned"}`,
    `Business Pass: ${typeof d.business_pass === "string" ? d.business_pass : "not started"}`,
    `Shop: ${typeof d.shop === "string" ? d.shop : "not created"}`,
    out !== undefined ? `Outstanding: ${formatMoney(out)}${d.unchanged === false ? "" : ", unchanged"}` : "No money moved",
  ];
  return (
    <ul aria-label="What the retry never reached" className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
      {facts.map((f) => (
        <li key={f} className="rounded-chip bg-deep px-2.5 py-1 font-ledger text-tag font-semibold uppercase text-lime">{f}</li>
      ))}
    </ul>
  );
}

function Queued({ ahead }: { ahead: number }) {
  return (
    <Card as="section" gap="sm" className="max-w-[560px]">
      <Label>In line</Label>
      <Heading level={2} size="h1">{ahead === 0 ? "You're next" : `${ahead} ${ahead === 1 ? "run" : "runs"} ahead of you`}</Heading>
      <Text>Runs go one at a time so every step lands onchain in order. Each takes about a minute. This page starts on its own when it&rsquo;s your turn.</Text>
      <Ledger className="text-charcoal-muted">≈ {Math.max(1, ahead)} min</Ledger>
    </Card>
  );
}

function Busy({ onRetry }: { onRetry: () => void }) {
  const [left, setLeft] = useState(60);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card as="section" gap="sm" className="max-w-[560px]">
      <Label className="text-caution">Too many runs right now</Label>
      <Heading level={2} size="h1">Busy, try in a minute</Heading>
      <Text>The devnet is already running as many scenarios as it can. Nothing was started, so there&rsquo;s nothing to cancel.</Text>
      <Button variant="secondary" width="auto" disabled={left > 0} onClick={onRetry}>
        {left > 0 ? `Try again in 0:${String(left).padStart(2, "0")}` : "Try again"}
      </Button>
    </Card>
  );
}

function RunAside({ run, archetype, onAgain }: { run: SimRun; archetype?: Archetype; onAgain: () => void }) {
  const refused = run.steps.some(isRefusedRetry);
  const defaulter = run.archetype === "defaulter" || refused;
  const finished = run.status === "done";
  return (
    <div className="flex flex-col gap-4">
      {defaulter ? (
        <Card tone="hunter" as="section" gap="sm">
          <Label className="text-lime">{refused ? "Retry refused at the World ID step" : "The moment to watch"}</Label>
          <Heading level={2} size="h2" className="text-canvas">One person can&rsquo;t default and start over on a new shop.</Heading>
          <p className="m-0 font-body text-note text-honeydew">
            The shop owner proved they&rsquo;re a unique person with World ID. After the write-off that anonymous ID is banned, so the retry on a fresh shop is refused before any model runs.
          </p>
        </Card>
      ) : null}
      {archetype ? (
        <Card as="section" gap="sm">
          <Label>Scenario</Label>
          <span className="font-body text-read font-semibold text-charcoal">{archetype.blurb}</span>
          <Text size="note">Expected: {archetype.expected.charAt(0).toLowerCase() + archetype.expected.slice(1)}</Text>
        </Card>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button width="full" onClick={onAgain}>Run another</Button>
        <Button width="full" variant="secondary" href={routes.explorer}>Open in Explorer</Button>
        {finished ? (
          <TextLink href={routes.proof} arrow className="self-center">
            See these proofs onchain
          </TextLink>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

type View = { kind: "pick" } | { kind: "busy"; archetype: ArchetypeId } | { kind: "run"; id: string; archetype: ArchetypeId };

export function SimulatorScreen() {
  const [archetypes, setArchetypes] = useState<Archetype[]>(ARCHETYPES);
  const [stateLedger, setStateLedger] = useState<SimLedger | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [view, setView] = useState<View>({ kind: "pick" });
  const [run, setRun] = useState<SimRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Cards and the global ledger. Failures keep the static cards and say so only when a run is attempted.
  useEffect(() => {
    let live = true;
    sim.archetypes().then((a) => live && setArchetypes(a), () => undefined);
    const loadState = () =>
      sim.state().then(
        (s) => {
          if (!live) return;
          setStateLedger(s.ledger);
          setRecent(s.recent ?? []);
        },
        () => undefined,
      );
    void loadState();
    const t = SIM_DEMO ? undefined : setInterval(loadState, 10_000);
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
  }, []);

  // Poll the run every second while it's queued or running.
  const runId = view.kind === "run" ? view.id : null;
  useEffect(() => {
    if (!runId) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    const tick = async () => {
      try {
        const r = await sim.run(runId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        misses = 0;
        setError(null);
        setRun(r);
        if (r.status === "done" || r.status === "failed") return;
      } catch {
        if (ctrl.signal.aborted) return;
        misses += 1;
        if (misses >= 5) setError("We lost the connection to the devnet. Still trying…");
      }
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  const start = useCallback(async (archetype: ArchetypeId) => {
    setStarting(true);
    setError(null);
    try {
      const id = await sim.start(archetype);
      setRun(null);
      setView({ kind: "run", id, archetype });
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof SimBusyError) setView({ kind: "busy", archetype });
      else setError("The devnet didn't answer. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }, []);

  const back = () => {
    setView({ kind: "pick" });
    setRun(null);
    setError(null);
  };

  const names = new Map(archetypes.map((a) => [a.id, a.name]));

  if (view.kind === "pick") {
    return (
      <LendShell>
        <LendHero label={SIM_DEMO ? "Simulator · demo" : "Simulator · public devnet"} title="Watch DripMoni run, live on our devnet.">
          Pick a shop. You&rsquo;ll see a real ZK proof, the AI underwriter, and money moving between the shop, the vault, DripCoin and the reserve. Each run takes under a minute.
        </LendHero>
        <LedgerStrip ledger={stateLedger} live={!SIM_DEMO} />
        <section aria-labelledby="pick-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Heading id="pick-h" level={2} size="h2">Pick a scenario</Heading>
            <Text size="note">Runs go one at a time. If someone is ahead of you, you&rsquo;ll wait in line.</Text>
          </div>
          {error ? <Banner tone="caution">{error}</Banner> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {archetypes.map((a) => (
              <ArchetypeCard key={a.id} a={a} onRun={start} busy={starting} />
            ))}
          </div>
        </section>
        <RecentRuns recent={recent} names={names} />
      </LendShell>
    );
  }

  const archetype = archetypes.find((a) => a.id === view.archetype);
  const title = archetype?.name ?? view.archetype;

  if (view.kind === "busy") {
    return (
      <LendShell>
        <Head title={title} onBack={back} />
        <Busy onRetry={() => void start(view.archetype)} />
      </LendShell>
    );
  }

  const ledger = latestLedger(run) ?? stateLedger;
  const running = !run || run.status === "running";
  const lastDay = run?.steps.at(-1)?.sim_day;

  return (
    <LendShell>
      <Head
        title={title}
        onBack={back}
        sub={run?.shop ? `Run ${run.run_id.slice(0, 4)} · ${typeof run.shop === "string" ? run.shop : run.shop.pseudonym} · ${SIM_DEMO ? "demo" : "devnet"}` : undefined}
        status={run ? <StatusPill status={run.status} day={lastDay} /> : <Pill tone="locked">Starting</Pill>}
      />
      {error ? <Banner tone="caution">{error}</Banner> : null}
      {run?.status === "queued" ? (
        <Queued ahead={run.ahead} />
      ) : (
        <>
          <LedgerStrip ledger={ledger} before={run?.steps.find((x) => x.data?.ledger)?.data.ledger ?? null} live={running} />
          <Columns ratio="3:2">
            <Card as="section" gap="sm">
              <Heading level={2} size="h2">What happened</Heading>
              {run?.status === "failed" ? <Banner tone="risk">{run.done_reason ?? "The run stopped early."}</Banner> : null}
              <Timeline steps={run?.steps ?? []} running={running} />
              {run?.status === "done" ? <Banner tone="tint">{run.done_reason ?? "Scenario complete."} Every step with a receipt is onchain.</Banner> : null}
            </Card>
            {run ? <RunAside run={run} archetype={archetype} onAgain={back} /> : null}
          </Columns>
        </>
      )}
    </LendShell>
  );
}

function Head({ title, onBack, sub, status }: { title: string; onBack: () => void; sub?: string; status?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onBack} className="inline-flex min-h-8 w-fit cursor-pointer items-center border-0 bg-transparent p-0 font-body text-note font-semibold text-hunter hover:text-forest">
        ‹ All scenarios
      </button>
      {sub ? <Ledger className="text-charcoal-muted">{sub}</Ledger> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Heading level={1} size="h1">{title}</Heading>
        {status}
      </div>
    </div>
  );
}
