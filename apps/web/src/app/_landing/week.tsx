import { cn } from "@/lib/cn";
import { PixelIcon } from "./pixel-icons";

/*
 * A slow week, as data. One example week of sales; each day shows what goes back:
 * DripMoney takes 8% of that day's sales, a fixed instalment takes the same amount every day.
 * Both repay the same total. One block is one dollar. Brand greens only.
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
const MAX = 20;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** A row of one-dollar blocks out of MAX; the last block can be a part dollar. */
function Row({ n, on, off }: { n: number; on: string; off: string }) {
  return (
    <span className="grid h-4 grid-cols-20 gap-0.75 md:h-5" aria-hidden>
      {Array.from({ length: MAX }, (_, i) => {
        const fill = Math.min(1, Math.max(0, n - i));
        return (
          <span key={i} className={cn("overflow-hidden rounded-[1px]", off)}>
            {fill > 0 && <span className={cn("block h-full", on)} style={{ width: `${fill * 100}%` }} />}
          </span>
        );
      })}
    </span>
  );
}

export function WeekChart() {
  return (
    <figure className="m-0 flex flex-col gap-6 rounded-[20px] border border-honeydew/10 bg-deep p-5 text-canvas md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <span className="font-ledger text-tag font-medium text-honeydew uppercase">Example week · paid back each day</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 font-body text-note text-honeydew">
          <span className="inline-flex items-center gap-2">
            <i aria-hidden className="size-3 rounded-xs bg-lime" />
            DripMoney: 8% of the day&apos;s sales
          </span>
          <span className="inline-flex items-center gap-2">
            <i aria-hidden className="size-3 rounded-xs bg-honeydew/35" />
            Fixed instalment: {money(FIXED)} every day
          </span>
        </span>
      </div>

      <ol
        className="m-0 flex list-none flex-col gap-2 p-0"
        aria-label={`Paid back each day. ${WEEK.map(([d, s]) => `${d}: sold $${s}, DripMoney ${money(s * HOLD)}, fixed ${money(FIXED)}`).join(". ")}.`}
      >
        {WEEK.map(([day, sales]) => {
          const slow = SLOW.has(day);
          return (
            <li
              key={day}
              className={cn(
                "grid grid-cols-[4rem_1fr_4rem] items-center gap-x-3 rounded-lg px-3 py-4 md:grid-cols-[5.5rem_1fr_5rem] md:gap-x-5",
                slow ? "bg-hunter ring-1 ring-lime/40" : "bg-deep/25",
              )}
            >
              <span className="flex flex-col">
                <span className="font-ledger text-[13px] font-semibold text-canvas uppercase">{day}</span>
                <span className="font-ledger text-[12px] text-honeydew">${sales} sold</span>
              </span>
              <span className="flex flex-col gap-0.75">
                <Row n={sales * HOLD} on="bg-lime" off="bg-honeydew/10" />
                <Row n={FIXED} on="bg-honeydew/45" off="bg-honeydew/10" />
              </span>
              <span className="flex flex-col items-end text-right">
                <span className="font-display text-note font-bold text-lime tabular-nums">{money(sales * HOLD)}</span>
                <span className="font-ledger text-[12px] text-honeydew tabular-nums">vs {money(FIXED)}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <figcaption className="grid grid-cols-1 gap-3 border-t border-honeydew/15 pt-5 md:grid-cols-2">
        <span className="flex items-start gap-3 font-body text-note text-honeydew">
          <PixelIcon name="calendar" size={22} className="mt-0.5 text-lime" accent="fill-honeydew" />
          <span>
            <strong className="text-canvas">Wednesday, $30 sold:</strong> you pay back {money(30 * HOLD)}. A fixed instalment would still take {money(FIXED)}, almost a
            third of the day.
          </span>
        </span>
        <span className="flex items-start gap-3 font-body text-note text-honeydew">
          <PixelIcon name="check" size={22} className="mt-0.5 text-lime" />
          <span>
            <strong className="text-canvas">Same week, same total:</strong> both pay back {money(TOTAL)}. Yours just follows the till.
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
