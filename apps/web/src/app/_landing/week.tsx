import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { PixelIcon } from "./pixel-icons";

/*
 * A slow week, as one wide chart. Each day is a tower of one-dollar blocks: the height is what
 * goes back that day. A dashed line marks the fixed instalment, which takes the same amount every
 * day. Towers under the line are the days DripMoney asks for less; the week still totals the same.
 * 8% of the day's sales. Brand greens only.
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
const SLOW = new Set(["Wed", "Thu"]);
/** Tallest tower, in dollars. */
const MAX = 16;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** `n` dollar blocks stacked from the bottom; the top block can be a part dollar. */
const blocks = (color: string): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 3px, ${color} 3px var(--u)) `,
  backgroundPosition: "bottom",
});

export function WeekChart() {
  return (
    <figure
      className="m-0 overflow-hidden rounded-[24px] border border-honeydew/10 bg-deep text-canvas [--u:12px] sm:[--u:16px] lg:[--u:20px]"
      aria-label={`Paid back each day. ${WEEK.map(([d, s]) => `${d}: sold $${s}, DripMoney ${money(s * HOLD)}, fixed ${money(FIXED)}`).join(". ")}.`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem]">
        {/* The chart */}
        <div className="flex flex-col gap-8 p-5 md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <span className="font-ledger text-tag font-medium text-honeydew uppercase">Example week · one block is one dollar</span>
            <span className="flex flex-wrap gap-x-5 gap-y-1 font-body text-note text-honeydew">
              <span className="inline-flex items-center gap-2">
                <i aria-hidden className="size-3 rounded-xs bg-lime" />
                DripMoney: 8% of the day&apos;s sales
              </span>
              <span className="inline-flex items-center gap-2">
                <i aria-hidden className="h-0 w-5 border-t-2 border-dashed border-honeydew/70" />
                Fixed instalment: {money(FIXED)}
              </span>
            </span>
          </div>

          <div className="relative" aria-hidden>
            {/* Plot: towers sit on the baseline, the dashed line is the fixed instalment. */}
            <div className="relative flex items-end gap-2 sm:gap-4 lg:gap-6" style={{ height: `calc(${MAX} * var(--u) + 2.5rem)` }}>
              <div
                className="pointer-events-none absolute inset-x-0 z-0 flex items-center"
                style={{ bottom: `calc(${FIXED} * var(--u))` }}
              >
                <span className="w-full border-t-2 border-dashed border-honeydew/60" />
                <span className="absolute right-0 -translate-y-[130%] rounded-md bg-deep px-2 py-0.5 font-ledger text-[12px] text-honeydew">
                  fixed {money(FIXED)}
                </span>
              </div>

              {WEEK.map(([day, sales]) => {
                const back = sales * HOLD;
                const slow = SLOW.has(day);
                return (
                  <div key={day} className="relative z-10 flex flex-1 flex-col items-center justify-end gap-2">
                    <span className={cn("font-display text-[15px] font-bold tabular-nums sm:text-[20px] lg:text-[26px]", slow ? "text-lime" : "text-canvas")}>
                      {money(back)}
                    </span>
                    <span
                      className={cn("block w-full rounded-t-[6px]", slow && "drop-shadow-[0_0_14px_rgb(190_245_120/0.45)]")}
                      style={{
                        height: `calc(${back} * var(--u))`,
                        ...blocks(slow ? "var(--color-lime)" : "color-mix(in srgb, var(--color-lime) 70%, var(--color-deep))"),
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Baseline and day labels */}
            <div className="mt-0 flex gap-2 border-t border-honeydew/30 pt-3 sm:gap-4 lg:gap-6">
              {WEEK.map(([day, sales]) => (
                <span key={day} className="flex flex-1 flex-col items-center">
                  <span className="font-ledger text-[13px] font-semibold text-canvas uppercase">{day}</span>
                  <span className="font-ledger text-[12px] text-honeydew">${sales} sold</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* The point */}
        <figcaption className="flex flex-col justify-center gap-8 border-t border-honeydew/15 bg-hunter/60 p-6 md:p-10 lg:border-t-0 lg:border-l">
          <span className="flex flex-col gap-2 font-body text-note text-honeydew">
            <PixelIcon name="calendar" size={26} className="text-lime" accent="fill-honeydew" />
            <span className="font-display text-[44px] leading-none font-extrabold text-lime tabular-nums">{money(30 * HOLD)}</span>
            <span>
              <strong className="text-canvas">Wednesday, $30 sold.</strong> A fixed instalment would still take {money(FIXED)}, almost a third of the day.
            </span>
          </span>
          <span aria-hidden className="h-px bg-honeydew/15" />
          <span className="flex flex-col gap-2 font-body text-note text-honeydew">
            <PixelIcon name="check" size={26} className="text-lime" />
            <span className="font-display text-[44px] leading-none font-extrabold text-canvas tabular-nums">{money(TOTAL)}</span>
            <span>
              <strong className="text-canvas">Same week, same total.</strong> Both pay back {money(TOTAL)}. Yours just follows the till.
            </span>
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
