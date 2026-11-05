import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { CheckIcon, CrossIcon, ExclaimIcon, LockIcon } from "@/components/icons";

/* ------------------------------------------------------------------- Pill */

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-chip whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-card text-ink-soft",
        accent: "border-transparent bg-accent text-ink",
        tint: "border-accent-line bg-accent-tint text-accent-ink",
        down: "border-transparent bg-down-tint text-down",
        warn: "border-transparent bg-warn-tint text-warn",
        ink: "border-transparent bg-ink text-on-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type PillTone = NonNullable<VariantProps<typeof pillVariants>["tone"]>;

export type PillProps = ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof pillVariants> & {
    /** Live dot "●" before the text. */
    dot?: boolean;
  };

export function Pill({ tone, dot, className, children, ...props }: PillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)} {...props}>
      {dot ? (
        <span aria-hidden className="text-[0.8em] leading-none">
          ●
        </span>
      ) : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ CheckCircle */

export type CheckCircleProps = ComponentPropsWithoutRef<"span"> & {
  /** true = accent check, false = red cross. */
  ok?: boolean;
  /** Diameter in px. */
  size?: number;
};

/** Filled check (or cross) circle used by CheckItem, ProgressSteps and StepRail. */
export function CheckCircle({ ok = true, size = 20, className, style, children, ...props }: CheckCircleProps) {
  const icon = Math.round(size * 0.62);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill",
        ok ? "bg-accent text-ink" : "bg-down-tint text-down",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {ok ? <CheckIcon size={icon} strokeWidth={3} /> : <CrossIcon size={icon - 1} strokeWidth={3} />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- CheckItem */

export type CheckItemProps = ComponentPropsWithoutRef<"li"> & {
  /** true = green check, false = red cross. Default true. */
  ok?: boolean;
  /** Screen-reader prefix for the icon, e.g. "Yes" / "No". */
  srLabel?: string;
};

export function CheckItem({ ok = true, srLabel, className, children, ...props }: CheckItemProps) {
  return (
    <li className={cn("flex items-start gap-2.5 text-body text-fg-soft", className)} {...props}>
      <CheckCircle ok={ok} size={20} className="mt-[3px]">
        {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      </CheckCircle>
      <span>{children}</span>
    </li>
  );
}

export function CheckList({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul className={cn("flex flex-col gap-2.5", className)} {...props} />;
}

/* ------------------------------------------------------------- StatusIcon */

const statusIconKinds = {
  ok: { cls: "bg-accent text-ink", icon: <CheckIcon size={30} strokeWidth={2.5} /> },
  bad: { cls: "bg-down-tint text-down", icon: <ExclaimIcon size={32} strokeWidth={2.75} /> },
  lock: { cls: "bg-ink text-on-ink", icon: <LockIcon size={26} /> },
} as const;

export type StatusIconProps = ComponentPropsWithoutRef<"div"> & {
  kind: keyof typeof statusIconKinds;
  /** Accessible label; omit when adjacent heading already says it. */
  label?: string;
};

export function StatusIcon({ kind, label, className, ...props }: StatusIconProps) {
  const k = statusIconKinds[kind];
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex size-16 shrink-0 items-center justify-center rounded-pill", k.cls, className)}
      {...props}
    >
      {k.icon}
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner */

export type SpinnerProps = ComponentPropsWithoutRef<"span"> & {
  size?: 18 | 64;
  /** Screen-reader text. */
  label?: string;
};

/** Colors follow the surface (role tokens), so it works on ink cards and ink buttons. */
export function Spinner({ size = 18, label = "Loading", className, ...props }: SpinnerProps) {
  const stroke = size === 64 ? 5 : 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span role="status" className={cn("inline-flex shrink-0", className)} {...props}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="animate-spin motion-reduce:animate-none"
        style={{ animationDuration: "0.9s" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-rule"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.28} ${c}`}
          className="stroke-fg"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------ ProgressBar */

export type ProgressBarProps = ComponentPropsWithoutRef<"div"> & {
  /** 0–100 */
  value: number;
  tone?: "ink" | "accent";
  /** `ink-soft` for use on ink cards. */
  track?: "line" | "ink-soft";
  height?: 4 | 6;
  /** Accessible name. */
  label?: string;
};

export function ProgressBar({
  value,
  tone = "ink",
  track = "line",
  height = 6,
  label,
  className,
  ...props
}: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("w-full overflow-hidden", track === "line" ? "bg-line" : "bg-ink-soft", height === 4 ? "h-1" : "h-1.5", className)}
      {...props}
    >
      <div className={cn("h-full", tone === "ink" ? "bg-ink" : "bg-accent")} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------ PrivacyNote */

export function PrivacyNote({ className, children, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p className={cn("flex items-start gap-2 text-small text-fg-muted", className)} {...props}>
      <LockIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ---------------------------------------------------------- ProgressSteps */

export type ProgressStep = {
  label: ReactNode;
  status: "done" | "active" | "todo";
  /** Optional muted line under the label. */
  detail?: ReactNode;
};

export type ProgressStepsProps = ComponentPropsWithoutRef<"ol"> & {
  steps: ProgressStep[];
  /** Screen-reader words for each state. */
  statusLabels?: Record<ProgressStep["status"], string>;
};

export function ProgressSteps({
  steps,
  statusLabels = { done: "done", active: "in progress", todo: "not started" },
  className,
  ...props
}: ProgressStepsProps) {
  return (
    <ol className={cn("flex flex-col gap-4", className)} {...props}>
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3" aria-current={s.status === "active" ? "step" : undefined}>
          <span className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center">
            {s.status === "done" ? (
              <CheckCircle size={22} />
            ) : s.status === "active" ? (
              <Spinner size={18} label={statusLabels.active} />
            ) : (
              <span className="size-2 rounded-pill bg-faint" />
            )}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className={cn("text-body", s.status === "todo" ? "text-fg-muted" : "font-semibold text-fg")}>
              {s.label}
              {s.status !== "active" ? <span className="sr-only"> ({statusLabels[s.status]})</span> : null}
            </span>
            {s.detail ? <span className="text-small text-fg-muted">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
