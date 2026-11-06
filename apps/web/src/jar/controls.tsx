"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ------------------------------------------------------------------ icons */

type IconProps = { size?: number };
const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const Icon = {
  check: ({ size = 16 }: IconProps) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />),
  chevronDown: ({ size = 18 }: IconProps) => svg(size, <path d="M6 9l6 6 6-6" />),
  chevronRight: ({ size = 20 }: IconProps) => svg(size, <path d="M9 6l6 6-6 6" />),
  home: ({ size = 22 }: IconProps) => svg(size, <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />),
  agent: ({ size = 22 }: IconProps) => svg(size, <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9.5 13h0M14.5 13h0" /></>),
  pass: ({ size = 22 }: IconProps) => svg(size, <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 14h4M15 10h2" /></>),
  settings: ({ size = 22 }: IconProps) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>),
  speaker: ({ size = 18 }: IconProps) => svg(size, <><path d="M5 9h3l4-4v14l-4-4H5z" /><path d="M16 9a4 4 0 0 1 0 6" /></>),
};

/* ----------------------------------------------------------------- Button */

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  block?: boolean;
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({ variant = "primary", block, loading, loadingLabel = "Working", className, children, disabled, type, ...props }: ButtonProps) {
  const cls = ["dj-btn", variant !== "primary" && `dj-btn--${variant}`, block && "dj-btn--block", className].filter(Boolean).join(" ");
  return (
    <button type={type ?? "button"} className={cls} aria-busy={loading || undefined} disabled={disabled} {...props}>
      <span className="dj-btn__label">{children}</span>
      <span className="dj-btn__busy" aria-hidden={!loading}>
        {loading ? <span className="sr-only-dj">{loadingLabel}</span> : null}
        <Dots />
      </span>
    </button>
  );
}

function Dots() {
  return (
    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden>
      {[4, 14, 24].map((cx, i) => (
        <circle key={cx} cx={cx} cy="4" r="3" fill="currentColor" opacity={1 - i * 0.3} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------- Pill */

export type PillKind = "saving" | "locked" | "repaying" | "slow" | "risk";
export function Pill({ kind, children }: { kind: PillKind; children: ReactNode }) {
  return <span className={`dj-pill dj-pill--${kind}`}>{children}</span>;
}

/* ----------------------------------------------------------------- Toggle */

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="dj-toggle" onClick={() => onChange(!checked)}>
      <span className="dj-toggle__knob" />
    </button>
  );
}

export function SettingRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="dj-setting">
      <label htmlFor={id} className="dj-stack" style={{ gap: 0, cursor: "pointer" }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        {hint ? <span className="dj-small">{hint}</span> : null}
      </label>
      <Toggle id={id} checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/* -------------------------------------------------------- SegmentedControl */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const name = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label} className="dj-seg">
      <span
        aria-hidden
        className="dj-seg__thumb"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Chips */

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="dj-chips">
      {options.map((o) => (
        <label key={o.value} className="dj-chip">
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- PacePicker */

export type Pace = "slow" | "usual" | "busy";
export function PacePicker({ value, onChange, days }: { value: Pace; onChange: (p: Pace) => void; days: Record<Pace, number> }) {
  const name = useId();
  const items: { v: Pace; l: string }[] = [
    { v: "slow", l: "Slow" },
    { v: "usual", l: "Usual" },
    { v: "busy", l: "Busy" },
  ];
  return (
    <div role="radiogroup" aria-label="Sales pace" className="dj-pace">
      {items.map((it) => (
        <label key={it.v}>
          <input type="radio" name={name} value={it.v} checked={value === it.v} onChange={() => onChange(it.v)} />
          <span className="dj-label">{it.l}</span>
          <strong>~{days[it.v]}d</strong>
          <span className="sr-only-dj"> about {days[it.v]} days</span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- ProgressBar */

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="dj-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      {/* transform, not width: composite-only */}
      <span style={{ transform: `scaleX(${v / 100})` }} />
    </div>
  );
}

/* ---------------------------------------------------------------- SplitBar */

/** 9:1, 3px gap. The lime band is the 10% that goes to the jar. */
export function SplitBar() {
  return (
    <div className="dj-split" aria-hidden>
      <span className="dj-split__you" />
      <span className="dj-split__jar" />
    </div>
  );
}

export function SplitLegend({ you, jar }: { you: string; jar: string }) {
  return (
    <p className="dj-legend" style={{ margin: 0 }}>
      <span>
        <i style={{ background: "var(--split-you)" }} />
        {you} yours
      </span>
      <span>
        <i style={{ background: "var(--accent)" }} />
        {jar} to your jar
      </span>
    </p>
  );
}

/* ------------------------------------------------------------ RepaymentRing */

export function RepaymentRing({ paid, total, children }: { paid: number; total: number; children?: ReactNode }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, paid / total));
  return (
    <div style={{ position: "relative", width: 132, height: 132, flex: "none" }}>
      <svg className="dj-ring" width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${Math.round(pct * 100)}% repaid`}>
        <circle className="dj-ring__track" cx="66" cy="66" r={r} fill="none" strokeWidth="12" />
        <circle
          className="dj-ring__arc"
          cx="66"
          cy="66"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- StepsList */

export function StepsList({ steps }: { steps: { label: string; detail?: string; state: "done" | "current" | "next" }[] }) {
  const words = { done: "done", current: "in progress", next: "not started" } as const;
  return (
    <ol className="dj-steps">
      {steps.map((s, i) => (
        <li key={i} data-s={s.state} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="dj-steps__dot">
            <span>{s.state === "done" ? <Icon.check size={14} /> : null}</span>
          </span>
          <span className="dj-stack" style={{ gap: 0 }}>
            <span style={{ fontWeight: s.state === "next" ? 400 : 600 }}>
              {s.label}
              <span className="sr-only-dj"> ({words[s.state]})</span>
            </span>
            {s.detail ? <span className="dj-small">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
