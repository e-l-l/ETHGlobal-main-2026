import type { AdvanceVM, UnlockStepVM } from "@repo/sdk";
import { AlertIcon, CheckIcon, Label, LockIcon } from "@/final";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/*
 * Gradual unlock and the late-fee caution, shared by merchant home, advance details and the agent approve screen.
 * Copy follows docs/FRONTEND-HANDOFF.md ("Screen states" 3 and the late-fee section).
 */

/** "13 Nov" from unix seconds. */
export function unlockDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export type UnlockMeterProps = {
  availableNow: number;
  limit: number;
  unlockSteps: UnlockStepVM[];
  nextUnlockAt: number | null;
  /** Unlock paused because the weekly minimum was missed (`unlock.frozen`, or the advance is behind). */
  frozen?: boolean;
  tone?: "light" | "dark";
  className?: string;
};

/** "Available now $50 of $100", a step bar (50 / 75 / 100%) and the next-unlock or paused line. */
export function UnlockMeter({ availableNow, limit, unlockSteps, nextUnlockAt, frozen, tone = "light", className }: UnlockMeterProps) {
  const dark = tone === "dark";
  const steps = unlockSteps.length ? unlockSteps : [{ pct: 100, amount: limit, unlocked: availableNow >= limit }];
  const muted = dark ? "text-honeydew" : "text-charcoal-muted";
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label className={dark ? "text-lime" : "text-charcoal-muted"}>Gradual unlock</Label>
        <span className={cn("font-body text-read", muted)}>
          <span className={cn("font-display text-h2 font-bold tabular-nums", dark ? "text-canvas" : "text-charcoal")}>{formatMoney(availableNow, "USD").replace(/\.00$/, "")}</span>{" "}
          of your {formatMoney(limit, "USD").replace(/\.00$/, "")} limit available now
        </span>
      </div>
      <ol aria-label={`Unlocked ${formatMoney(availableNow)} of ${formatMoney(limit)}`} className="m-0 grid list-none gap-1.5 p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s) => (
          <li key={s.pct} className="flex min-w-0 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn(
                "h-2 rounded-chip",
                s.unlocked ? (dark ? "bg-lime" : "bg-hunter") : frozen ? (dark ? "bg-caution-tint/40" : "bg-caution-tint") : dark ? "bg-honeydew/20" : "bg-unlit",
              )}
            />
            <span className={cn("flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] uppercase", s.unlocked ? (dark ? "text-lime" : "text-hunter") : muted)}>
              {s.unlocked ? <CheckIcon size={12} strokeWidth={3} /> : <LockIcon size={12} />}
              {s.pct}% · {formatMoney(s.amount, "USD").replace(/\.00$/, "")}
            </span>
          </li>
        ))}
      </ol>
      <p className={cn("m-0 font-body text-note", frozen ? (dark ? "text-caution-tint" : "text-caution") : muted)}>
        {frozen
          ? "Unlock paused: the weekly minimum was missed. Catch up and each on-time week unlocks +25% again."
          : nextUnlockAt
            ? `Next +25% on ${unlockDate(nextUnlockAt)} if you keep up the weekly minimum (1% plus fee every 7 days). Falling behind pauses it.`
            : availableNow >= limit
              ? "Your whole limit is unlocked."
              : "Each on-time week unlocks +25%; falling behind pauses it."}
      </p>
    </div>
  );
}

/** Amber caution while the advance is behind the weekly minimum. Gentle: what happened, what it costs, how to catch up. */
export function BehindNotice({ advance, className }: { advance: AdvanceVM; className?: string }) {
  return (
    <section role="status" className={cn("flex flex-col gap-3 rounded-lg bg-caution-tint p-5 text-caution md:p-6", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface text-caution">
          <AlertIcon size={18} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <Label className="text-caution">Behind the weekly minimum</Label>
          <p className="m-0 font-display text-h2 font-bold text-charcoal">
            {advance.lateFeeHint ?? "You're behind this week's minimum. Sales will catch you up."}
          </p>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 font-body text-note">
        <div className="flex flex-col gap-0.5 rounded-md bg-surface/70 px-3 py-2.5">
          <dt>Late fee so far</dt>
          <dd className="m-0 font-display text-h2 font-bold text-charcoal tabular-nums">{formatMoney(advance.lateFee)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-md bg-surface/70 px-3 py-2.5">
          <dt>Fee while behind</dt>
          <dd className="m-0 font-display text-h2 font-bold text-charcoal tabular-nums">1% a week</dd>
        </div>
      </dl>
      <p className="m-0 font-body text-note text-charcoal">
        <strong className="font-semibold">How to catch up:</strong> keep taking payments. {advance.holdback}% of each one pays the advance, and the
        fee drops back to 0.5% a week as soon as you&apos;re above the minimum. The extra goes to the safety reserve.
      </p>
    </section>
  );
}
