"use client";

import { useId, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { arsText, usdText } from "./format";
import { Button, Chips, Icon, Pill, SettingRow, SplitBar, SplitLegend, type PillKind } from "./controls";
import { JarMark, TierMeter } from "./mark";

/* ---------------------------------------------------------------- JarCard */

/** Say the number once: dollars, local under it, what happens next. */
export function JarCard({
  label,
  amount,
  status,
  statusKind,
  repaid,
  total,
  next,
}: {
  label: string;
  amount: number;
  status: string;
  statusKind: PillKind;
  repaid: number;
  total: number;
  next: ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, repaid / total));
  return (
    <section className="dj-jar" aria-label={label}>
      <div className="dj-between">
        <span className="dj-label">{label}</span>
        <Pill kind={statusKind}>{status}</Pill>
      </div>
      <div className="dj-stack pub" style={{ gap: 2 }}>
        <span className="dj-balance dj-jar__figure dj-wrap">{usdText(amount, 2)}</span>
        <span className="dj-local dj-wrap">{arsText(amount)} · example rate</span>
      </div>
      <div
        className="dj-jar__track"
        role="progressbar"
        aria-label="Repaid so far"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
      >
        <div className="dj-jar__fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
      <p className="dj-small dj-wrap">{next}</p>
    </section>
  );
}

/* --------------------------------------------------------------- SaleRow */

export type Sale = { id: number; amount: number; time: string };

export function SaleRow({ sale }: { sale: Sale }) {
  const jar = sale.amount * 0.1;
  return (
    <li className="dj-sale pub">
      <div className="dj-between">
        <span style={{ fontWeight: 700, fontFamily: "var(--f-display)", fontSize: 18 }} className="dj-wrap">
          {usdText(sale.amount, 2)}
        </span>
        <span className="dj-mono" style={{ color: "var(--text-3)" }}>
          {sale.time}
        </span>
      </div>
      <SplitBar />
      <SplitLegend you={usdText(sale.amount - jar, 2)} jar={usdText(jar, 2)} />
    </li>
  );
}

/* --------------------------------------------------------------- LiveSales */

const VOICE = {
  en: (a: number, j: number) => `You received ${a} dollars. ${j} went to your jar.`,
  es: (a: number, j: number) => `Recibiste ${a} dólares, ${j} fue a tu alcancía.`,
};

/**
 * Home sales strip with the demo's voice moment. New rows enter with a CSS transition
 * (@starting-style), so five sales in a second retarget instead of stacking keyframes.
 */
export function LiveSales({ initial, onSale, worst }: { initial: Sale[]; onSale?: (amount: number) => void; worst?: boolean }) {
  const [sales, setSales] = useState(initial);
  const [voice, setVoice] = useState(false);
  const [lang, setLang] = useState<"en" | "es">("es");
  const [announce, setAnnounce] = useState("");

  const addSale = () => {
    const amount = worst ? 123456.78 : [10, 4.5, 22, 7.25, 15][sales.length % 5]!;
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setSales((s) => [{ id: Date.now() + Math.random(), amount, time }, ...s].slice(0, 6));
    onSale?.(amount);
    const jar = Math.round(amount * 0.1 * 100) / 100;
    const line = VOICE[lang](amount, jar);
    setAnnounce(line);
    if (voice && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = lang === "es" ? "es-AR" : "en-US";
      window.speechSynthesis.cancel(); // newest sale wins; never queue a backlog
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="dj-card">
      <div className="dj-between" style={{ alignItems: "center" }}>
        <h3 className="dj-h2">Today&apos;s sales</h3>
        <span className="dj-mono">{sales.length} sales</span>
      </div>
      <ul className="dj-list" style={{ gap: 0 }} aria-label="Sales, newest first">
        {sales.map((s) => (
          <SaleRow key={s.id} sale={s} />
        ))}
      </ul>
      <hr className="dj-divider" />
      <SettingRow title="Read each sale out loud" hint="Like a soundbox at the till" checked={voice} onChange={setVoice} />
      <Chips
        label="Voice language"
        value={lang}
        onChange={setLang}
        options={[
          { value: "es", label: "Español" },
          { value: "en", label: "English" },
        ]}
      />
      <Button variant="ghost" onClick={addSale}>
        Simulate a sale
      </Button>
      <p role="status" aria-live="polite" className="sr-only-dj">
        {announce}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- AgentDecision */

export type DecisionKind = "drew" | "declined" | "waited" | "paused";
const decisionPill: Record<DecisionKind, { kind: PillKind; text: string }> = {
  drew: { kind: "saving", text: "Drew" },
  declined: { kind: "risk", text: "Declined" },
  waited: { kind: "locked", text: "Waited" },
  paused: { kind: "slow", text: "Paused" },
};

/** M11 / M14. Every decision says why, and which of your limits it stayed inside. */
export function AgentDecision({
  kind,
  title,
  when,
  reasons,
  limits,
  defaultOpen,
  actions,
}: {
  kind: DecisionKind;
  title: string;
  when: string;
  reasons: string[];
  limits?: { label: string; used: number; cap: number }[];
  defaultOpen?: boolean;
  actions?: ReactNode;
}) {
  const p = decisionPill[kind];
  const [open, setOpen] = useState(!!defaultOpen);
  const bodyId = useId();
  return (
    <article className="dj-card" style={{ gap: 12 }}>
      <div className="dj-between" style={{ alignItems: "center" }}>
        <Pill kind={p.kind}>{p.text}</Pill>
        <span className="dj-mono" style={{ color: "var(--text-3)" }}>
          {when}
        </span>
      </div>
      <h3 className="dj-h2 dj-wrap">{title}</h3>
      <button
        type="button"
        className="dj-row"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 44, background: "none", border: 0, padding: 0, color: "var(--text)", font: "inherit", fontWeight: 600, cursor: "pointer", gap: 6, width: "fit-content" }}
      >
        Why it {kind === "drew" ? "drew this" : kind === "declined" ? "declined" : kind === "waited" ? "waited" : "paused"}
        <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }}>
          <Icon.chevronDown />
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="dj-stack priv" style={{ gap: 12 }}>
        <ul className="dj-list">
          {reasons.map((r, i) => (
            <li key={i} className="dj-body dj-wrap">
              <span aria-hidden style={{ color: "var(--accent)", flex: "none" }}>
                →
              </span>
              {r}
            </li>
          ))}
        </ul>
        {limits?.length ? (
          <div className="dj-stack" style={{ gap: 10 }}>
            <span className="dj-label">Inside your limits</span>
            {limits.map((l) => (
              <div key={l.label} className="dj-stack" style={{ gap: 4 }}>
                <div className="dj-between">
                  <span className="dj-small">{l.label}</span>
                  <span className="dj-mono">
                    {usdText(l.used)} of {usdText(l.cap)}
                  </span>
                </div>
                <div className="dj-progress" aria-hidden>
                  <span style={{ transform: `scaleX(${Math.min(1, l.used / l.cap)})` }} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {actions}
    </article>
  );
}

/* ----------------------------------------------------------- MandateEditor */

type Purpose = "stock" | "rent" | "repairs";
type Cap = "50" | "100" | "250" | "500";

/** M07. Limits shown as fences the agent can't cross. */
export function MandateEditor({ tierCap = 100 }: { tierCap?: number }) {
  const [per, setPer] = useState<Cap>("100");
  const [month, setMonth] = useState(250);
  const [purpose, setPurpose] = useState<Purpose>("stock");
  const [supplier, setSupplier] = useState(true);
  const monthId = useId();
  const caps: Cap[] = ["50", "100", "250", "500"];
  return (
    <div className="dj-card priv">
      <h3 className="dj-h2">Your agent&apos;s limits</h3>
      <div className="dj-stack">
        <span className="dj-label">
          Most per advance
        </span>
        <Chips
          label="Most per advance"
          value={per}
          onChange={setPer}
          options={caps.filter((c) => Number(c) <= tierCap).map((c) => ({ value: c, label: `$${c}` }))}
        />
        <span className="dj-small">Higher amounts unlock as you repay.</span>
      </div>
      <div className="dj-stack">
        <label className="dj-label" htmlFor={monthId}>
          Most per month (USD)
        </label>
        <input
          id={monthId}
          className="dj-input"
          inputMode="numeric"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value.replace(/\D/g, "")) || 0)}
        />
      </div>
      <div className="dj-stack">
        <span className="dj-label">For</span>
        <Chips
          label="Purpose"
          value={purpose}
          onChange={setPurpose}
          options={[
            { value: "stock", label: "Stock" },
            { value: "rent", label: "Rent" },
            { value: "repairs", label: "Repairs" },
          ]}
        />
      </div>
      <SettingRow title="Pay my supplier directly" hint="The money goes to the supplier, not to cash." checked={supplier} onChange={setSupplier} />
      <hr className="dj-divider" />
      <p className="dj-body dj-wrap">
        Your agent can draw up to <strong style={{ color: "var(--text)" }}>${per}</strong> at a time and{" "}
        <strong style={{ color: "var(--text)" }}>{usdText(month)}</strong> a month, only for {purpose}
        {supplier ? ", paid to your supplier" : ""}. Lowering a limit works right away.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- ApprovalOutcome */

/** M09. Denied is calm, not an error: nothing happened, and that is the point. */
export function ApprovalDenied({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="dj-card" role="status">
      <JarMark lit={0} variant="meter" size={48} />
      <h3 className="dj-h1">No agent set up</h3>
      <p className="dj-body">Nothing will be drawn. Your limits are saved on this phone, so trying again takes one step.</p>
      <Button onClick={onRetry}>Try again with World</Button>
    </div>
  );
}

/* ---------------------------------------------------------------- BadWeek */

export function BadWeek({ days }: { days: { usual: number; now: number } }) {
  return (
    <div className="dj-card" style={{ borderColor: "color-mix(in oklab, var(--warn) 45%, transparent)" }}>
      <Pill kind="slow">Slow week</Pill>
      <h3 className="dj-h2">Sales were slower. Repayment slowed with them.</h3>
      <p className="dj-body">No penalty, no extra fee. You still repay $115 in total, it just takes longer.</p>
      <dl className="dj-kv">
        <div>
          <dt>At your usual pace</dt>
          <dd>~{days.usual} days</dd>
        </div>
        <div>
          <dt>At this week&apos;s pace</dt>
          <dd>~{days.now} days</dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------- Pass cards */

export function BusinessPass({ facts }: { facts: { k: string; v: string }[] }) {
  return (
    <div className="dj-card">
      <div className="dj-between" style={{ alignItems: "center" }}>
        <span className="dj-label">Business Pass</span>
        <Pill kind="locked">On this phone</Pill>
      </div>
      <dl className="dj-kv priv">
        {facts.map((f) => (
          <div key={f.k}>
            <dt>{f.k}</dt>
            <dd className="dj-wrap">{f.v}</dd>
          </div>
        ))}
      </dl>
      <p className="dj-body" style={{ color: "var(--text)", fontWeight: 600 }}>
        That&apos;s all we learned.
      </p>
    </div>
  );
}

export function StandingPass({ tier, repaid }: { tier: 0 | 1 | 2 | 3; repaid: number }) {
  const caps = ["$50", "$100", "$250", "$500"];
  return (
    <div className="dj-card priv">
      <span className="dj-label">Standing Pass</span>
      <TierMeter tier={tier} />
      <h3 className="dj-h1">Your limit is now {caps[tier]}</h3>
      <p className="dj-body">
        You&apos;ve repaid {repaid} advance{repaid === 1 ? "" : "s"}. Nobody can see your history.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- LossWaterfall */

export type Layer = "jar" | "junior" | "reserve" | "senior";
const layers: { id: Layer; title: string; desc: string }[] = [
  { id: "jar", title: "Shop's jar", desc: "What the shop already put aside" },
  { id: "junior", title: "Junior", desc: "First-loss capital, earns more" },
  { id: "reserve", title: "Reserve", desc: "Fee slice plus pool fees" },
  { id: "senior", title: "Senior", desc: "Lenders, touched last" },
];

export function LossWaterfall({ viewer }: { viewer: Layer }) {
  return (
    <ol className="dj-fall pub" aria-label="Who takes a loss, in order">
      {layers.map((l, i) => (
        <li key={l.id}>
          {i > 0 ? (
            <span className="dj-fall__arrow" aria-hidden>
              <Icon.chevronDown />
            </span>
          ) : null}
          <div className="dj-fall__tier" data-you={l.id === viewer}>
            <span className="dj-label" style={{ width: 16 }}>
              {i + 1}
            </span>
            <span className="dj-stack" style={{ gap: 0, flex: 1 }}>
              <span style={{ fontWeight: 700 }}>
                {l.title}
                {l.id === viewer ? " · you" : ""}
              </span>
              <span className="dj-small">{l.desc}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- PixelDune */

/** Columns = days of sales. 4px squares on a 6px pitch. Real data only. */
export function PixelDune({ days, rows = 10 }: { days: number[]; rows?: number }) {
  const max = Math.max(...days, 1);
  const w = days.length * 6 - 2;
  const h = rows * 6 - 2;
  const total = days.reduce((a, b) => a + b, 0);
  return (
    <svg className="dj-dune pub" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Sales for the last ${days.length} days, ${usdText(total)} in total. Today ${usdText(days[days.length - 1] ?? 0)}.`}>
      {days.map((d, x) => {
        const on = Math.max(d > 0 ? 1 : 0, Math.round((d / max) * rows));
        return Array.from({ length: rows }, (_, y) => {
          const lit = rows - y <= on;
          const cls = lit ? (x === days.length - 1 ? "today" : "on") : "off";
          return <rect key={`${x}-${y}`} className={cls} x={x * 6} y={y * 6} width={4} height={4} />;
        });
      })}
    </svg>
  );
}

/* -------------------------------------------------------------- WaveHeader */

export function WaveHeader({ children }: { children: ReactNode }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="dj-wave">
      <svg className="dj-wave__pattern" aria-hidden>
        <defs>
          <pattern id={`w${id}`} width="32" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <path d="M0 18C8 18 8 6 16 6S24 18 32 18" fill="none" stroke="currentColor" strokeWidth="7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#w${id})`} />
      </svg>
      <div className="dj-wave__content">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ ShopQR */

export function ShopQR({ name, id, url }: { name: string; id: string; url: string }) {
  return (
    <div className="dj-card" style={{ alignItems: "center", textAlign: "center" }}>
      <div className="dj-qr pub">
        <QRCodeSVG value={url} size={176} level="M" fgColor="currentColor" bgColor="transparent" role="img" aria-label={`Pay ${name}`} />
      </div>
      <span className="dj-h2 dj-wrap">{name}</span>
      <span className="dj-mono pub dj-wrap">{id}</span>
    </div>
  );
}

/* --------------------------------------------------------------- BottomNav */

export function BottomNav({ active }: { active: "home" | "agent" | "pass" | "settings" }) {
  const items = [
    { k: "home", l: "Home", i: <Icon.home /> },
    { k: "agent", l: "Agent", i: <Icon.agent /> },
    { k: "pass", l: "Pass", i: <Icon.pass /> },
    { k: "settings", l: "Settings", i: <Icon.settings /> },
  ] as const;
  return (
    <nav className="dj-nav" aria-label="Merchant">
      {items.map((it) => (
        <a key={it.k} href={`#nav-${it.k}`} aria-current={it.k === active ? "page" : undefined}>
          {it.i}
          {it.l}
        </a>
      ))}
    </nav>
  );
}
