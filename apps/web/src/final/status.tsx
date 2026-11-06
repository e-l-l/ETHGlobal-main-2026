import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

/* ------------------------------------------------------------------- Pill */

/* Mono 11 uppercase on a tint of its colour (dev2). Text darkened so 11px clears 4.5:1. */
const pillVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-chip px-2.5 py-1 font-ledger text-tag font-semibold uppercase whitespace-nowrap",
  {
    variants: {
      tone: {
        saving: "bg-honeydew text-hunter",
        locked: "bg-well text-charcoal-soft ring-1 ring-inset ring-control/50",
        repaying: "bg-hunter text-canvas",
        slow: "bg-caution-tint text-caution",
        risk: "bg-risk-tint text-risk",
        onchain: "bg-surface text-hunter ring-1 ring-inset ring-hunter border-dashed",
      },
    },
    defaultVariants: { tone: "saving" },
  },
);

export function Pill({ tone, dot, className, children }: VariantProps<typeof pillVariants> & { dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn(pillVariants({ tone }), className)}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ size = 20, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-grid place-items-center", className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="animate-spin motion-reduce:animate-[spin_2s_linear_infinite]">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------ ProgressBar */

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("h-2 overflow-hidden rounded-chip bg-track", className)}
    >
      <span
        className="block h-full w-full origin-left rounded-chip bg-hunter transition-transform duration-300 ease-snappy"
        style={{ transform: `scaleX(${v})` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- Ring */

/** Repayment ring: r 54, stroke 12, round cap (dev2). */
export function Ring({ value, size = 140, children }: { value: number; size?: number; children?: ReactNode }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="12" className="stroke-track" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="stroke-hunter transition-[stroke-dashoffset] duration-300 ease-snappy"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Steps */

export type StepState = "done" | "current" | "next";

export function Steps({ items }: { items: { label: ReactNode; state: StepState }[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0 font-body text-read">
      {items.map((it, i) => (
        <li key={i} className={cn("flex items-start gap-3", it.state === "next" ? "text-charcoal-muted" : "text-charcoal")}>
          <span className="mt-0.5 grid size-5.5 shrink-0 place-items-center" aria-hidden>
            {it.state === "done" ? (
              <span className="grid size-5.5 place-items-center rounded-full bg-hunter text-canvas">
                <CheckIcon size={14} strokeWidth={3} />
              </span>
            ) : it.state === "current" ? (
              <span className="size-2.5 rounded-full bg-hunter ring-4 ring-hunter/20" />
            ) : (
              <span className="size-2 rounded-full bg-track" />
            )}
          </span>
          <span className="min-w-0">
            {it.label}
            <span className="sr-only"> ({it.state === "done" ? "done" : it.state === "current" ? "in progress" : "not started"})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
