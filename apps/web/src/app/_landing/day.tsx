"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/lib/currency";
import { advance, shop } from "@/lib/mock/shop";
import { IconTile, PixelIcon, type PixelIconName } from "./pixel-icons";
import { useCountTo, useInView } from "./use-in-view";

/*
 * One day at the kiosk. Three numbers on a light card (they count up, the ring draws), sales by hour as stacked
 * columns (what you keep, with what drips back on top), and four moments along a line. It plays once when it
 * scrolls into view; reduced motion and no-JS show the finished page.
 */

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const SALES = [0, 3.6, 10, 5.4, 6.2, 4.8, 2.5, 3.1, 10, 7.3, 8.9, 9.8];
const TOTAL = SALES.reduce((a, b) => a + b, 0);
/** Share of each sale that repays the advance (8%). */
const HOLD = advance.holdback / 100;
const AXIS_MAX = 12;
const TICKS = [0, 2, 4, 6, 8, 10, 12];
/** Hours that carry a callout over their column. */
const CALLOUTS = new Set([2, 8]);

const MOMENTS: { time: string; icon: PixelIconName; title: string; body: string }[] = [
  { time: "9:12 am", icon: "agent", title: `Your agent drew $${advance.drawn} for stock`, body: "Why: cash was low before Thursday's restock." },
  { time: "10:14 am", icon: "coin", title: "A $10.00 sale", body: "$9.20 to you. $0.80 drips back to the advance." },
  { time: "4:20 pm", icon: "sound", title: "Read out loud", body: "“You got 10 dollars. 80 cents went to your advance.”" },
  { time: "7:45 pm", icon: "shop", title: "Shop closes", body: `$${TOTAL.toFixed(2)} sold. $${(TOTAL * HOLD).toFixed(2)} went back, automatically.` },
];

const hourLabel = (h: number) => (h === 12 ? "12" : h > 12 ? `${h - 12}` : `${h}`);
const ampm = (h: number) => (h === 9 ? "AM" : h === 12 ? "AM" : h === 15 ? "PM" : "");
const money = (n: number) => `$${n.toFixed(2)}`;

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

/** Entrance for a block: fades up, staggered by `delay` ms. */
const enter = (hidden: boolean, delay = 0): { className: string; style: CSSProperties } => ({
  className: hidden ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100 transition-[opacity,translate] duration-700 ease-snappy",
  style: { transitionDelay: hidden ? undefined : `${delay}ms` },
});

export function DayTimeline() {
  const [speaking, setSpeaking] = useState(false);
  const cur = useCurrency();
  const { ref, hidden } = useInView<HTMLDivElement>();
  const go = !hidden;

  const sold = useCountTo(TOTAL, go);
  const dripped = useCountTo(TOTAL * HOLD, go);
  const pct = useCountTo(advance.pct, go, 1400);

  function hear() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("You got 10 dollars. 80 cents went to your advance.");
    u.lang = "en-US";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  const e0 = enter(hidden, 0);
  const e1 = enter(hidden, 150);

  return (
    <div ref={ref} className="flex flex-col gap-5 md:gap-6">
      {/* The day in three numbers. */}
      <div className={cn("grid grid-cols-1 rounded-[20px] bg-canvas shadow-[0_18px_44px_-26px_rgb(0_0_0/0.55)] md:grid-cols-3", e0.className)} style={e0.style}>
        <Stat icon="shop" label="Sold today" value={money(sold)} sub={cur.dollarsOnly ? "in test dollars" : cur.approx(TOTAL)} />
        <Stat icon="coin" label="Dripped back" value={money(dripped)} sub={`${advance.holdback}% of every sale`} divider />
        <div className="flex items-center gap-5 border-t border-hairline p-6 md:border-t-0 md:border-l md:p-7">
          <div className="relative size-21 shrink-0" role="img" aria-label={`Advance ${advance.pct}% repaid`}>
            <svg viewBox="0 0 84 84" className="size-full -rotate-90">
              <circle cx="42" cy="42" r={RING_R} fill="none" strokeWidth="9" className="stroke-honeydew" />
              <circle
                cx="42"
                cy="42"
                r={RING_R}
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                className="stroke-hunter transition-[stroke-dashoffset] duration-[1400ms] ease-snappy"
                strokeDasharray={RING_C}
                strokeDashoffset={go ? RING_C * (1 - advance.pct / 100) : RING_C}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center font-display text-[20px] font-bold text-charcoal tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">Advance repaid</span>
            <span className="font-display text-[22px] leading-none font-bold text-charcoal tabular-nums">
              ${advance.repaid} of ${advance.owedNow}
            </span>
            <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-honeydew">
              <span
                className="block h-full origin-left rounded-full bg-hunter transition-transform duration-[1400ms] ease-snappy"
                style={{ transform: `scaleX(${go ? advance.pct / 100 : 0})` }}
              />
            </span>
          </div>
        </div>
      </div>

      {/* Sales by hour. */}
      <div className={cn("flex flex-col gap-5 rounded-[20px] border border-honeydew/20 bg-forest/30 p-5 md:p-7", e1.className)} style={e1.style}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-ledger text-tag font-medium tracking-[0.1em] text-canvas uppercase">Sales &amp; repayments by hour</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1 font-body text-[13px] text-honeydew">
            <span className="inline-flex items-center gap-2">
              <i aria-hidden className="size-3 rounded-xs bg-lime" />
              Sales (to you)
            </span>
            <span className="inline-flex items-center gap-2">
              <i aria-hidden className="size-3 rounded-xs bg-leaf" />
              Dripped back ({advance.holdback}%)
            </span>
          </span>
        </div>

        <div className="flex gap-3 pt-10" role="img" aria-label={`Sales by hour: ${HOURS.map((h, i) => `${hourLabel(h)}:00 $${SALES[i]}`).join(", ")}.`}>
          <div className="relative h-56 w-8 shrink-0 font-ledger text-[12px] text-honeydew" aria-hidden>
            {TICKS.map((t) => (
              <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / AXIS_MAX) * 100}%` }}>
                ${t}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col" aria-hidden>
            <div className="relative h-56 border-b border-l border-honeydew/30">
              {TICKS.slice(1).map((t) => (
                <span key={t} className="absolute inset-x-0 border-t border-dashed border-honeydew/15" style={{ bottom: `${(t / AXIS_MAX) * 100}%` }} />
              ))}
              <div className="absolute inset-0 grid grid-cols-12 items-end gap-1 px-1 md:gap-2.5 md:px-2">
                {HOURS.map((h, i) => {
                  const sale = SALES[i]!;
                  const drip = sale * HOLD;
                  const top = (sale / AXIS_MAX) * 100;
                  return (
                    <div key={h} className="relative flex h-full items-end justify-center">
                      <div
                        className="flex w-full origin-bottom flex-col justify-end transition-transform duration-700 ease-snappy"
                        style={{ height: `${top}%`, transform: `scaleY(${go ? 1 : 0})`, transitionDelay: go ? `${350 + i * 60}ms` : undefined }}
                      >
                        <span className="block rounded-t-xs bg-leaf" style={{ height: `${(drip / sale) * 100 || 0}%`, minHeight: sale ? 4 : 0 }} />
                        <span className="block bg-lime" style={{ height: `${(1 - HOLD) * 100}%` }} />
                      </div>
                      {CALLOUTS.has(i) ? (
                        <span
                          className={cn(
                            "absolute left-1/2 z-10 w-max -translate-x-1/2 rounded-lg bg-lime px-2.5 py-1.5 text-center font-body text-[12px] leading-tight font-semibold text-deep shadow-md after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-x-[6px] after:border-t-[6px] after:border-x-transparent after:border-t-lime",
                            go ? "animate-[tick-pop_450ms_var(--ease-snappy)_both]" : "opacity-0",
                          )}
                          style={{ bottom: `calc(${top}% + 12px)`, animationDelay: go ? `${1100 + i * 40}ms` : undefined }}
                        >
                          {money(sale)} sale
                          <br />→ {money(drip)} back
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-12 gap-1 px-1 pt-2 md:gap-2.5 md:px-2">
              {HOURS.map((h) => (
                <span key={h} className="flex flex-col items-center font-ledger text-[12px] leading-tight text-canvas">
                  {hourLabel(h)}
                  <span className="text-[10px] text-honeydew">{ampm(h)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The four moments, along a line. */}
      <ol className="relative m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        <span aria-hidden className="absolute inset-x-10 top-1/2 hidden h-px bg-honeydew/40 lg:block" />
        {MOMENTS.map((m, i) => {
          const e = enter(hidden, 500 + i * 130);
          return (
            <li key={m.time} className={cn("relative", e.className)} style={e.style}>
              <div className="flex h-full flex-col gap-3 rounded-2xl bg-canvas p-5 shadow-[0_14px_34px_-22px_rgb(0_0_0/0.55)] transition-[translate,box-shadow] duration-200 ease-snappy hover:-translate-y-1 hover:shadow-[0_22px_40px_-20px_rgb(0_0_0/0.6)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-lime font-ledger text-[12px] font-semibold text-deep">{i + 1}</span>
                    <span className="font-ledger text-[13px] text-charcoal-muted uppercase">{m.time}</span>
                  </span>
                  <PixelIcon name={m.icon} size={24} className="text-hunter" />
                </div>
                <span className="font-display text-[20px] leading-tight font-bold text-charcoal">{m.title}</span>
                <span className="font-body text-note text-charcoal-soft">{m.body}</span>
                {m.icon === "sound" ? (
                  <button
                    type="button"
                    onClick={hear}
                    className="mt-auto inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-md bg-hunter px-4 font-body text-note font-semibold text-canvas transition-transform duration-150 ease-snappy hover:scale-[1.03] active:scale-[0.97]"
                  >
                    <PixelIcon name="sound" size={14} accent="fill-lime" />
                    {speaking ? "Playing…" : "Hear it"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">{shop.name}</span>
    </div>
  );
}

function Stat({ icon, label, value, sub, divider }: { icon: PixelIconName; label: string; value: string; sub: string; divider?: boolean }) {
  return (
    <div className={cn("flex items-center gap-5 p-6 md:p-7", divider && "border-t border-hairline md:border-t-0 md:border-l")}>
      <IconTile name={icon} size={60} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">{label}</span>
        <span className="font-display text-[38px] leading-none font-bold tracking-[-0.03em] text-charcoal tabular-nums md:text-[42px]">{value}</span>
        <span className="font-ledger text-ledger text-charcoal-muted">{sub}</span>
      </div>
    </div>
  );
}
