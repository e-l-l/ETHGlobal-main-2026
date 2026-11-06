"use client";

/**
 * Proof center ("Verify it yourself"): one read, `mra.protocol.proofCenter()`, rendered as 7 cards, live checks
 * first. The read streams: each card appears as its data arrives, and the others show a skeleton meanwhile. Every hash and address copies and, where the SDK gives an explorer URL, links to Etherscan. Each card
 * renders on its own: section errors from `v.errors` go in a small muted list, and a card that crashes while
 * rendering is replaced by one line instead of blanking the page.
 */
import { Component, useEffect, useId, useState, type ReactNode } from "react";
import { Button, Card, CheckIcon, Chips, CopyIcon, CrossIcon, Heading, Label, Ledger, PageHead, Pill, StatGrid, Text } from "@/final";
import { REASON_MESSAGES, type AiActor, type PrivacyItemVM, type ProofCenterView, type ProofTxKind, type ZkProofKind } from "@repo/sdk";
import { cn } from "@/lib/cn";
import { errorCode, getMRA, isMock } from "@/lib/mra";
import { MRAState, SkeletonBlock } from "@/lib/mra-state";
import { LendShell } from "./lend/shell";

/* ------------------------------------------------------------- small parts */

const shortHex = (v: string) => (v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v);

/** A hash or address: shortened, linked to the explorer when there is a URL, with a copy button. */
function HashLink({ value, href, label }: { value: string; href?: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState(false);
  const text = shortHex(value);
  return (
    <span className="inline-flex items-center gap-0.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={value}
          aria-label={`${label ?? "Open"} ${text} on the explorer`}
          className="font-ledger text-ledger text-hunter tabular-nums underline decoration-hunter/30 underline-offset-[3px] hover:decoration-hunter"
        >
          {text}
        </a>
      ) : (
        <Ledger title={value}>{text}</Ledger>
      )}
      <button
        type="button"
        aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-charcoal-muted hover:bg-well hover:text-charcoal"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            },
            () => undefined,
          )
        }
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </button>
    </span>
  );
}

/** ✅ / ❌ / ⚪ as a small round badge. */
function Tick({ ok }: { ok: boolean | null }) {
  const label = ok === true ? "Passed" : ok === false ? "Failed" : "Could not check";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full",
        ok === true ? "bg-honeydew text-hunter" : ok === false ? "bg-risk-tint text-risk" : "bg-well text-charcoal-muted",
      )}
    >
      {ok === true ? <CheckIcon size={16} /> : ok === false ? <CrossIcon size={16} /> : <span aria-hidden className="size-2.5 rounded-full border-2 border-current" />}
    </span>
  );
}

/** One proof-center card: numbered label, title, copy line, body. */
function ProofCard({ n, title, copy, children, className }: { n: number; title: string; copy?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} padding="lg" className={className}>
      <div className="flex flex-col gap-1.5">
        <Label>{String(n).padStart(2, "0")}</Label>
        <Heading id={id} level={2} size="h2">
          {title}
        </Heading>
        {copy ? <Text size="note">{copy}</Text> : null}
      </div>
      <Guard name={title}>{children}</Guard>
    </Card>
  );
}

/** Placeholder for a card whose data hasn't arrived yet. Keeps its number and title so the page doesn't jump. */
function CardSkeleton({ n, title }: { n: number; title: string }) {
  return (
    <Card as="section" padding="lg" aria-busy="true" aria-label={`${title}, loading`}>
      <div className="flex flex-col gap-1.5">
        <Label>{String(n).padStart(2, "0")}</Label>
        <Heading level={2} size="h2">
          {title}
        </Heading>
      </div>
      <div className="flex flex-col gap-3" aria-hidden>
        <SkeletonBlock className="h-4 w-11/12" />
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
    </Card>
  );
}

/** A card body that throws while rendering shows one line instead of taking the page down. */
class Guard extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <Text size="note" tone="muted">{`Couldn't show ${this.props.name.toLowerCase()} right now.`}</Text>;
    return this.props.children;
  }
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Text size="note" tone="muted" className="m-0 rounded-md bg-well p-4">
      {children}
    </Text>
  );
}

const ROW = "flex flex-col gap-1.5 border-t border-hairline py-3.5 first:border-t-0 first:pt-0 last:pb-0";

/* ------------------------------------------------------------------ labels */

const ZK_KIND: Record<ZkProofKind, string> = { business_pass: "Business Pass proof", standing_pass: "Standing Pass proof", pass_issued: "Pass issued" };

/** The badge for a row. A draw under a mandate carries no proof of its own (it was checked when the mandate was registered). */
function zkBadge(p: { kind: ZkProofKind; fn?: string | undefined }): { label: string; tone: "onchain" | "saving" | "locked" } {
  if (p.fn === "drawByMandate") return { label: "Mandate draw", tone: "locked" };
  return { label: ZK_KIND[p.kind] ?? p.kind, tone: p.kind === "pass_issued" ? "onchain" : "saving" };
}

const TX_KIND: Record<ProofTxKind, string> = {
  sale: "Sale",
  repayment_split: "Repayment split",
  advance_opened: "Advance opened",
  advance_repaid: "Advance repaid",
  advance_written_off: "Written off",
  late_fee: "Late fee",
  mandate: "Mandate",
  swap: "Swap",
  limits_changed: "Limits changed",
  pass_issued: "Pass issued",
  standing_pass: "Standing Pass",
  shop_registered: "Shop registered",
};
const TX_ORDER = Object.keys(TX_KIND) as ProofTxKind[];

const ACTOR: Record<AiActor, string> = { underwriter: "Underwriter", critic: "Critic", managed_agent: "Shop agent", risk_agent: "Risk agent" };

const CIRCUIT = { business_pass: "Business Pass", standing_pass: "Standing Pass" } as const;

/* ------------------------------------------------------------------ cards */

function ChecksCard({ v }: { v: ProofCenterView }) {
  const checks = v.checks ?? [];
  return (
    <ProofCard n={1} title="Live checks" copy="Checks your browser just ran against the chain. Nothing here is precomputed.">
      {checks.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 border-t border-hairline py-3 first:border-t-0 first:pt-0 last:pb-0">
              <Tick ok={c.ok} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-body text-read font-semibold text-charcoal">{c.label}</span>
                <span className="font-body text-note text-charcoal-muted [overflow-wrap:anywhere]">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No checks ran this time. Refresh to run them again.</Empty>
      )}
    </ProofCard>
  );
}

function ContractsCard({ v }: { v: ProofCenterView }) {
  const rows = v.contracts ?? [];
  return (
    <ProofCard n={2} title="Contracts" copy="Every contract, as deployed. The code size is read live, so an empty address would show 0.">
      {rows.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((c) => (
            <li key={c.name} className={cn(ROW, "md:flex-row md:items-center md:justify-between md:gap-4")}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-body text-read font-semibold text-charcoal">{c.name}</span>
                <span className="font-body text-note text-charcoal-muted">{c.role}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
                <HashLink value={c.address} href={c.explorerUrl} label={`${c.name} address`} />
                {c.codeSize === null ? (
                  <Pill tone="locked">Code not read</Pill>
                ) : (
                  <Pill tone={c.codeSize > 0 ? "saving" : "risk"}>
                    {c.codeSize > 0 ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
                    {`${c.codeSize.toLocaleString("en-US")} bytes of code`}
                  </Pill>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>The contract list didn't load this time.</Empty>
      )}
    </ProofCard>
  );
}

function ZkCard({ v }: { v: ProofCenterView }) {
  const rows = v.zkProofs ?? [];
  return (
    <ProofCard n={3} title="ZK proofs verified onchain" copy="Newest first. Each one was checked by a verifier contract in the same transaction.">
      {rows.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((p) => (
            <li key={`${p.txHash}-${p.kind}`} className={cn(ROW, "gap-2")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-body text-read font-semibold text-charcoal">{p.title}</span>
                <Pill tone={zkBadge(p).tone}>{zkBadge(p).label}</Pill>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-note text-charcoal-soft">
                <span className="inline-flex items-center gap-1">
                  Checked by <strong className="font-semibold text-charcoal">{p.verifier.name}</strong>
                  <HashLink value={p.verifier.address} href={p.verifier.explorerUrl} label={`${p.verifier.name} address`} />
                </span>
                {p.fn ? <code className="rounded-sm bg-well px-1.5 py-0.5 font-ledger text-ledger text-charcoal">{p.fn}</code> : null}
                {p.proofBytes ? (
                  <Pill tone="locked">
                    {`${p.proofBytes.toLocaleString("en-US")} bytes`}
                    {p.publicInputCount !== undefined ? ` · ${p.publicInputCount} public inputs` : ""}
                  </Pill>
                ) : null}
              </div>
              {p.publicInputs?.length ? (
                <details className="group rounded-md bg-well px-3 py-2">
                  <summary className="cursor-pointer font-body text-note font-semibold text-hunter">
                    Public inputs ({p.publicInputCount ?? p.publicInputs.length})
                  </summary>
                  {p.publicInputCount !== undefined && p.publicInputCount > p.publicInputs.length ? (
                    <Text size="note" tone="muted" className="m-0 mt-1">
                      {`${p.publicInputs.length} named below; the verifier takes ${p.publicInputCount} in all (a group, such as the country list, is one row).`}
                    </Text>
                  ) : null}
                  <dl className="m-0 mt-2 flex flex-col gap-1">
                    {p.publicInputs.map((i) => (
                      <div key={i.label} className="flex flex-wrap justify-between gap-x-4">
                        <dt className="font-body text-note text-charcoal-soft">{i.label}</dt>
                        <dd className="m-0 font-ledger text-ledger text-charcoal [overflow-wrap:anywhere]">{i.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-note text-charcoal-muted">
                {p.nullifierShort ? (
                  <span>
                    one-time nullifier <Ledger>{p.nullifierShort}</Ledger>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  {p.explorerUrl ? (
                    <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="text-hunter underline decoration-hunter/30 underline-offset-[3px]">
                      {p.when}
                    </a>
                  ) : (
                    p.when
                  )}
                  <span aria-hidden>·</span>
                  <HashLink value={p.txHash} href={p.explorerUrl} label="transaction" />
                </span>
              </div>
              <Text size="note" className="m-0">
                {p.note}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No proofs onchain yet in this window. Open an advance to see one appear here.</Empty>
      )}
    </ProofCard>
  );
}

function DeviceCard({ v }: { v: ProofCenterView }) {
  const rows = v.deviceProofs ?? [];
  return (
    <ProofCard n={5} title="Proofs made on this device" copy="Your secrets never left this phone. The proof was generated here, in your browser, and only the proof was sent.">
      {rows.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((d, i) => (
            <li key={`${d.at}-${i}`} className={cn(ROW, "md:flex-row md:items-center md:justify-between")}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-body text-read font-semibold text-charcoal">{CIRCUIT[d.circuit] ?? d.circuit}</span>
                {d.ok ? (
                  <span className="font-body text-note text-charcoal-muted">
                    {`${(d.ms / 1000).toFixed(1)} s on this device · ${d.proofBytes.toLocaleString("en-US")} bytes`}
                    {d.verifiedLocally === true ? " · verified here" : d.verifiedLocally === false ? " · failed the local check" : ""}
                  </span>
                ) : (
                  <span className="font-body text-note text-risk">{`Failed: ${d.error ?? "unknown error"}`}</span>
                )}
              </span>
              <Ledger>{d.when}</Ledger>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No proofs generated on this device yet. Get a Business Pass or draw an advance.</Empty>
      )}
    </ProofCard>
  );
}

function TxCard({ v }: { v: ProofCenterView }) {
  const rows = v.transactions ?? [];
  const counts = v.transactionCounts ?? {};
  const [kind, setKind] = useState<"all" | ProofTxKind>("all");
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const present = TX_ORDER.filter((k) => (counts[k] ?? 0) > 0 || rows.some((r) => r.kind === k));
  const options = [
    { value: "all" as const, label: `All · ${total || rows.length}` },
    ...present.map((k) => ({ value: k, label: `${TX_KIND[k]} · ${counts[k] ?? rows.filter((r) => r.kind === k).length}` })),
  ];
  const shown = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
  return (
    <ProofCard n={4} title="Transactions" copy="Newest first, up to 5 of each kind. Sales, repayment splits, advances, late fees, mandates and Uniswap v4 swaps.">
      {rows.length ? (
        <>
          <Chips label="Transaction kind" value={kind} onChange={setKind} options={options} />
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((t, i) => (
              <li key={`${t.txHash}-${t.kind}-${i}`} className={cn(ROW, "md:flex-row md:items-center md:justify-between md:gap-4")}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone="locked">{TX_KIND[t.kind] ?? t.kind}</Pill>
                    <span className="font-body text-read font-semibold text-charcoal">{t.title}</span>
                  </span>
                  <span className="font-body text-note text-charcoal-muted">{t.detail}</span>
                </span>
                <span className="flex items-center gap-2 md:shrink-0">
                  <HashLink value={t.txHash} href={t.explorerUrl} label="transaction" />
                  <Ledger>{t.when}</Ledger>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>No transactions in this window yet.</Empty>
      )}
    </ProofCard>
  );
}

const reasonText = (code: string) => REASON_MESSAGES[code];

function AiCard({ v }: { v: ProofCenterView }) {
  const ai = v.ai;
  if (!ai) {
    return (
      <ProofCard n={6} title="AI decisions">
        <Empty>AI decisions didn't load this time.</Empty>
      </ProofCard>
    );
  }
  const s = ai.summary;
  return (
    <ProofCard n={6} title="AI decisions" copy={ai.note}>
      {ai.source === "unavailable" ? null : (
        <>
          <StatGrid
            className="md:grid-cols-3"
            items={[
              { label: "Offers made", value: s.offersMade },
              { label: "Refused by red lines", value: s.refusedByRedLines },
              { label: "Critic send-backs", value: s.criticSendBacks },
              { label: "Agent draws", value: s.agentDraws },
              { label: "Agent skips", value: s.agentSkips },
              { label: "Limits lowered", value: s.limitsLowered },
            ]}
          />
          {ai.latest.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {ai.latest.map((d, i) => (
                <li key={`${d.at}-${i}`} className={ROW}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={d.actor === "critic" ? "slow" : d.actor === "risk_agent" ? "onchain" : "saving"}>{ACTOR[d.actor] ?? d.actor}</Pill>
                    <span className="font-body text-read font-semibold text-charcoal">{d.title}</span>
                    <Ledger className="ml-auto">{d.when}</Ledger>
                  </span>
                  <span className="font-body text-note text-charcoal-soft">{d.reason}</span>
                  {d.reasonCodes.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {d.reasonCodes.map((c) => (
                        <span key={c} title={reasonText(c)} className="rounded-chip bg-well px-2.5 py-1 font-body text-note text-charcoal-soft">
                          {reasonText(c) ?? c.replace(/_/g, " ")}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </ProofCard>
  );
}

function PrivacyList({ title, items }: { title: string; items: PrivacyItemVM[] | undefined }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-well p-4">
      <Label>{title}</Label>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(items ?? []).map((it) => (
          <li key={it.label} className="flex flex-col">
            <strong className="font-body text-read font-semibold text-charcoal">{it.label}</strong>
            <span className="font-body text-note text-charcoal-muted">{it.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The browser's live Anon-RPC state beats what the SDK knows from config. Live modes only (mock never loads it). */
function useAnonRpcLabel(ready: boolean): { label: string; detail?: string } | null {
  const [state, setState] = useState<{ label: string; detail?: string } | null>(null);
  useEffect(() => {
    if (isMock || !ready) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    void import("@/lib/mra-browser").then((m) => {
      if (!alive) return;
      const anon = m.getAnonRpc();
      const mode = m.MRA_BROWSER_STATUS.anonRpc;
      const detail =
        mode === "anon"
          ? "Chain reads go through Anon-RPC, so the RPC provider can't tie them to your IP."
          : mode === "direct-fallback"
            ? "Anon-RPC couldn't connect, so reads went directly to the RPC."
            : mode === "fail-closed"
              ? "Anon-RPC couldn't connect, and direct reads are switched off."
              : "Reads go directly to the RPC.";
      if (anon) {
        setState({ label: anon.status().label, detail });
        unsub = anon.onStatus((s) => alive && setState({ label: s.label, detail }));
      } else if (mode !== "off") setState({ label: mode === "anon" ? "Anon-RPC" : "Direct RPC", detail });
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [ready]);
  return state;
}

function PrivacyCard({ v }: { v: ProofCenterView }) {
  const p = v.privacy;
  const live = useAnonRpcLabel(Boolean(p));
  if (!p) {
    return (
      <ProofCard n={7} title="Privacy">
        <Empty>The privacy summary didn't load this time.</Empty>
      </ProofCard>
    );
  }
  const rpc = live ?? { label: p.rpc.label, detail: p.rpc.detail };
  return (
    <ProofCard n={7} title="Privacy" copy="What is public, what is never stored, and what the AI can and cannot see.">
      <div className="grid gap-3 md:grid-cols-2">
        <PrivacyList title="Public onchain" items={p.publicOnchain} />
        <PrivacyList title="Never stored, anywhere" items={p.neverStored} />
        <PrivacyList title="What the AI sees" items={p.aiSees} />
        <PrivacyList title="What the AI never sees" items={p.aiNeverSees} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="onchain" dot>{`RPC: ${rpc.label}`}</Pill>
        {rpc.detail ? <span className="font-body text-note text-charcoal-muted">{rpc.detail}</span> : null}
      </div>
    </ProofCard>
  );
}

/* ------------------------------------------------------------------ screen */

/**
 * The proof-center read, handed over part by part. With server data (mock mode) it never fetches. `reload` keeps what
 * is already on screen and replaces each part as the new read delivers it.
 */
function useProofCenter(initial: ProofCenterView | null) {
  const [part, setPart] = useState<Partial<ProofCenterView>>(initial ?? {});
  const [done, setDone] = useState(initial !== null);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (initial && nonce === 0) return;
    let alive = true;
    void (async () => {
      try {
        const mra = await getMRA();
        const full = await mra.protocol.proofCenter({ onPartial: (p) => alive && setPart((prev) => ({ ...prev, ...p })) });
        if (!alive) return;
        setPart(full);
        setError(undefined);
      } catch (e) {
        if (alive) setError(errorCode(e));
      } finally {
        if (alive) setDone(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initial, nonce]);
  const reload = () => {
    setDone(false);
    setError(undefined);
    setNonce((n) => n + 1);
  };
  return { part, done, error, reload };
}

export function ProofScreen({ initial }: { initial: ProofCenterView | null }) {
  const { part, done, error, reload } = useProofCenter(initial);
  if (error && part.network === undefined) {
    return (
      <LendShell>
        <PageHead label="Proof center" title="Verify it yourself">
          Every check on this page is read live from the contracts: the checks, contract addresses, ZK proofs, transactions,
          AI decisions and privacy settings, each with a link you can open yourself.
        </PageHead>
        <MRAState error={error} />
      </LendShell>
    );
  }
  // Each card only reads its own part, so a part that hasn't arrived yet is a skeleton, not an empty list.
  const v = part as ProofCenterView;
  const net = part.network;
  const explorerName = part.explorer?.name ?? "the explorer";
  return (
    <LendShell>
      <PageHead
        label="Proof center"
        title="Verify it yourself"
        actions={
          <Button variant="secondary" size="sm" width="auto" loading={!done} onClick={reload}>
            Refresh
          </Button>
        }
      >
        {net
          ? `Everything below is read live from ${net.name}${net.block !== null ? `, block ${net.block.toLocaleString("en-US")}` : ""}. Tap any row to check it on ${explorerName}.`
          : "Reading the chain. Each section appears as soon as it is ready."}
      </PageHead>
      <div className="flex flex-wrap items-center gap-2">
        {part.source === "mock" ? <Pill tone="slow">Example data</Pill> : <Pill tone="saving" dot>Live</Pill>}
        {part.window ? <Ledger>{`Blocks ${part.window.fromBlock.toLocaleString("en-US")} to ${part.window.toBlock.toLocaleString("en-US")}`}</Ledger> : null}
        {part.explorer && !part.explorer.baseUrl && part.explorer.appRoute ? (
          <a href={part.explorer.appRoute} className="font-body text-note font-semibold text-hunter underline decoration-hunter/30 underline-offset-[3px]">
            No public explorer on this network: open the app explorer
          </a>
        ) : null}
        {error ? <span className="font-body text-note text-charcoal-muted">{`Refresh failed (${error}); showing the last read.`}</span> : null}
      </div>

      {/* Checks sit beside the long contract list and follow it down the page, so the left column is never empty. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-20">{part.checks ? <ChecksCard v={v} /> : <CardSkeleton n={1} title="Live checks" />}</div>
        {part.contracts ? <ContractsCard v={v} /> : <CardSkeleton n={2} title="Contracts" />}
      </div>
      {part.zkProofs ? <ZkCard v={v} /> : <CardSkeleton n={3} title="ZK proofs verified onchain" />}
      {part.transactions ? <TxCard v={v} /> : <CardSkeleton n={4} title="Transactions" />}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {part.deviceProofs ? <DeviceCard v={v} /> : <CardSkeleton n={5} title="Proofs made on this device" />}
        {part.ai ? <AiCard v={v} /> : <CardSkeleton n={6} title="AI decisions" />}
      </div>
      {part.privacy ? <PrivacyCard v={v} /> : <CardSkeleton n={7} title="Privacy" />}

      {done && part.errors?.length ? (
        <section className="flex flex-col gap-1" aria-label="Parts that didn't load">
          <Label>Some parts didn't load</Label>
          <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 font-body text-note text-charcoal-muted">
            {part.errors.map((e, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {e}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </LendShell>
  );
}
