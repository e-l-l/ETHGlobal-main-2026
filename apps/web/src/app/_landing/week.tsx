"use client";

import { CheckIcon } from "@/final";
import { cn } from "@/lib/cn";
import { useCountTo, useInView } from "./use-in-view";

/*
 * A slow week, in two dark cards. The chart shows what goes back each day (8% of that day's sales) over the
 * flat amount a fixed instalment would take; the breakdown lists the same five days with the sales behind them.
 * Both land on the same total. Brand greens only.
 */

const WEEK: [string, number][] = [
  ["Mon", 120],
  ["Wed", 30],
  ["Thu", 45],
  ["Fri", 160],
  ["Sat", 200],
];
/** Share of each sale that repays the advance. */
const HOLD = 0.08;
const TOTAL = WEEK.reduce((a, [, s]) => a + s, 0) * HOLD;
const FIXED = TOTAL / WEEK.length;
/** Top of the chart's axis, in dollars. */
const AXIS_MAX = 20;
const TICKS = [0, 4, 8, 12, 16, 20];
const MAX_SALES = Math.max(...WEEK.map(([, s]) => s));
const money = (n: number) => `$${n.toFixed(2)}`;

const CARD = "rounded-[20px] border border-honeydew/25 bg-deep/60 text-canvas shadow-[0_20px_50px_-24px_rgb(0_0_0/0.6)]";
const HEAD = "font-ledger text-[13px] font-medium tracking-[0.1em] text-honeydew uppercase";

const SUMMARY = `Paid back each day. ${WEEK.map(([d, s]) => `${d}: sold $${s}, DripMoney ${money(s * HOLD)}, fixed ${money(FIXED)}`).join(". ")}. Both total ${money(TOTAL)}.`;

/** The chart card: bars over a $ axis, the legend, and the result beside it. */
export function WeekChart() {
  const { ref, hidden } = useInView<HTMLElement>();
  const go = !hidden;
  const total = useCountTo(TOTAL, go);
  return (
    <figure ref={ref} className={cn(CARD, "m-0 flex flex-col gap-6 p-5 md:p-7")} aria-label={SUMMARY}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className={HEAD}>Example week · Paid back each day</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 font-body text-read text-honeydew">
          <span className="inline-flex items-center gap-2">
            <i aria-hidden className="size-3 rounded-xs bg-lime" />
            DripMoney: 8% of the day&apos;s sales
          </span>
          <span className="inline-flex items-center gap-2">
            <i aria-hidden className="size-3 rounded-xs border border-honeydew/30 bg-forest" />
            Fixed instalment: {money(FIXED)} every day
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_17rem]">
        <div aria-hidden className="flex gap-3">
          {/* Y axis */}
          <div className="relative h-72 w-10 shrink-0 font-ledger text-[14px] text-honeydew">
            {TICKS.map((t) => (
              <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / AXIS_MAX) * 100}%` }}>
                ${t}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative h-72 border-b border-l border-honeydew/50">
              {TICKS.slice(1).map((t) => (
                <span key={t} className="absolute inset-x-0 border-t border-honeydew/25" style={{ bottom: `${(t / AXIS_MAX) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end justify-around gap-2 px-2 sm:gap-4 sm:px-4">
                {WEEK.map(([day, sales], i) => {
                  const back = sales * HOLD;
                  return (
                    <div key={day} className="relative flex h-full flex-1 items-end justify-center">
                      <div
                        className="relative w-full max-w-20 origin-bottom rounded-t-md bg-linear-to-t from-lime/70 to-lime transition-transform duration-700 ease-snappy"
                        style={{ height: `${(back / AXIS_MAX) * 100}%`, transform: `scaleY(${go ? 1 : 0})`, transitionDelay: go ? `${200 + i * 90}ms` : undefined }}
                      >
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-display text-[16px] font-bold whitespace-nowrap text-canvas tabular-nums md:text-[18px]">
                          {money(back)}
                        </span>
                        {/* The fixed instalment: the same base under every day. */}
                        <span className="absolute inset-x-0 bottom-0 rounded-t-xs bg-forest/85" style={{ height: `${(Math.min(back, FIXED) / back) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-around gap-2 px-2 pt-2 font-ledger text-[15px] text-canvas sm:gap-4 sm:px-4">
              {WEEK.map(([day]) => (
                <span key={day} className="flex-1 text-center">
                  {day}
                </span>
              ))}
            </div>
          </div>
        </div>

        <figcaption className="flex flex-col gap-3">
          <span className={HEAD}>The result</span>
          <div className="grid grid-cols-2 divide-x divide-honeydew/30 overflow-hidden rounded-xl border border-honeydew/30 bg-deep/50">
            <Total value={money(total)} label="Total paid back (with DripMoney)" lime />
            <Total value={money(total)} label="Total with fixed instalment" />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-honeydew/30 bg-deep/50 p-4">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-deep">
              <CheckIcon size={18} strokeWidth={3.5} />
            </span>
            <span className="flex flex-col gap-0.5 font-body text-read text-honeydew">
              <strong className="font-semibold text-canvas">Same week, same total.</strong>
              You pay back {money(TOTAL)} either way. Yours just follows the till.
            </span>
          </div>
        </figcaption>
      </div>
    </figure>
  );
}

function Total({ value, label, lime }: { value: string; label: string; lime?: boolean }) {
  return (
    <div className="flex flex-col gap-1 p-3">
      <span className={cn("font-display text-[32px] leading-none font-bold tabular-nums", lime ? "text-lime" : "text-canvas")}>{value}</span>
      <span className="font-body text-[14px] leading-snug text-honeydew">{label}</span>
    </div>
  );
}

/** The breakdown card: one row per day, with the sales as a bar. */
export function WeekBreakdown() {
  const { ref, hidden } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn(CARD, "flex flex-col gap-3 p-5 md:p-7")}>
      <div className="grid grid-cols-[3.5rem_1fr_4.5rem_4.5rem] items-end gap-x-3 sm:grid-cols-[4rem_1fr_6rem_5rem] md:gap-x-5">
        <span className={cn(HEAD, "col-span-2 text-canvas")}>Week breakdown</span>
        <span className="text-right font-ledger text-[12px] tracking-[0.08em] text-honeydew uppercase">DripMoney (8%)</span>
        <span className="text-right font-ledger text-[12px] tracking-[0.08em] text-honeydew uppercase">Fixed</span>
      </div>
      <ul className="m-0 flex list-none flex-col border-t border-honeydew/10 p-0">
        {WEEK.map(([day, sales], i) => (
          <li
            key={day}
            className="grid grid-cols-[3.5rem_1fr_4.5rem_4.5rem] items-center gap-x-3 border-b border-honeydew/25 py-3.5 last:border-b-0 sm:grid-cols-[4rem_1fr_6rem_5rem] md:gap-x-5"
          >
            <span className="grid h-8 place-items-center rounded-md bg-honeydew/20 font-ledger text-[13px] font-medium tracking-[0.08em] text-honeydew uppercase">{day}</span>
            <span className="flex items-center gap-3">
              <span className="w-12 shrink-0 font-body text-read text-canvas tabular-nums">${sales}</span>
              <span aria-hidden className="relative hidden h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-deep/60 sm:block">
                <span
                  className="absolute inset-y-0 left-0 origin-left rounded-full bg-lime transition-transform duration-900 ease-snappy"
                  style={{ width: `${(sales / MAX_SALES) * 100}%`, transform: `scaleX(${hidden ? 0 : 1})`, transitionDelay: hidden ? undefined : `${150 + i * 90}ms` }}
                />
              </span>
            </span>
            <span className="text-right font-display text-[19px] font-bold text-lime tabular-nums">{money(sales * HOLD)}</span>
            <span className="text-right font-body text-read text-honeydew tabular-nums">{money(FIXED)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
