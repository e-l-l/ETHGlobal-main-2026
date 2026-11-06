"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/lib/currency";
import { advance, shop } from "@/lib/mock/shop";
import { PixelIcon, type PixelIconName } from "./pixel-icons";

/*
 * One day at the kiosk, as a single timeline: three numbers, sales by hour as pixel columns
 * (one block per dollar, the top block is the share that drips back), and four moments pinned to their hours.
 */

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const SALES = [0, 3.6, 10, 5.4, 6.2, 4.8, 2.5, 3.1, 10, 7.3, 8.9, 9.8];
const TOTAL = SALES.reduce((a, b) => a + b, 0);
/** Share of each sale that repays the advance (8%). */
const HOLD = advance.holdback / 100;

const MOMENTS: { at: number; time: string; icon: PixelIconName; title: string; body: string }[] = [
  { at: 1, time: "9:12", icon: "agent", title: `Your agent drew $${advance.drawn} for stock`, body: "Why: cash was low before Thursday's restock." },
  { at: 2, time: "10:14", icon: "coin", title: "A $10.00 sale", body: "$9.20 to you. $0.80 drips back to the advance." },
  { at: 8, time: "4:20 pm", icon: "sound", title: "Read out loud", body: "“You got 10 dollars. 80 cents went to your advance.”" },
  { at: 11, time: "7:45 pm", icon: "shop", title: "Shop closes", body: `$${TOTAL.toFixed(2)} sold. $${(TOTAL * HOLD).toFixed(2)} went back, automatically.` },
];

const hourLabel = (h: number) => (h === 12 ? "12" : h > 12 ? `${h - 12}` : `${h}`);

export function DayTimeline() {
  const [speaking, setSpeaking] = useState(false);
  const cur = useCurrency();

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

  const stats = [
    { k: "Sold today", v: `$${TOTAL.toFixed(2)}`, sub: cur.dollarsOnly ? "in test dollars" : cur.approx(TOTAL) },
    { k: "Dripped back", v: `$${(TOTAL * HOLD).toFixed(2)}`, sub: `${advance.holdback}% of every sale` },
    { k: "Advance repaid", v: `${advance.pct}%`, sub: `$${advance.repaid} of $${advance.owedNow}` },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border border-hairline bg-surface">
      {/* The day in three numbers. */}
      <div className="grid grid-cols-1 border-b border-hairline sm:grid-cols-3">
        {stats.map((s, i) => (
          <div key={s.k} className={cn("flex flex-col gap-1 p-6 md:p-8", i > 0 && "border-t border-hairline sm:border-t-0 sm:border-l")}>
            <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">{s.k}</span>
            <span className="font-display text-[40px] leading-none font-bold tracking-[-0.03em] text-charcoal tabular-nums md:text-[48px]">{s.v}</span>
            <span className="font-ledger text-ledger text-charcoal-muted">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-8 p-6 md:p-8">
        {/* Sales by hour. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">Sales by hour · {shop.name}</span>
            <span className="flex flex-wrap gap-x-4 font-ledger text-[13px] text-charcoal-soft">
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="size-2.5 rounded-[1px] bg-unlit" />
                $1 to you
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="size-2.5 rounded-[1px] bg-hunter" />
                drips back
              </span>
            </span>
          </div>
          <div className="grid grid-cols-12 items-end gap-1 md:gap-2" role="img" aria-label={`Sales by hour: ${HOURS.map((h, i) => `${hourLabel(h)}:00 $${SALES[i]}`).join(", ")}.`}>
            {HOURS.map((h, i) => {
              const blocks = Math.round(SALES[i]!);
              const moment = MOMENTS.findIndex((m) => m.at === i);
              return (
                <div key={h} className="flex flex-col items-center gap-2">
                  <span className={cn("grid size-5 place-items-center rounded-[3px] font-ledger text-[12px] font-semibold", moment >= 0 ? "bg-lime text-charcoal" : "invisible")}>
                    {moment + 1}
                  </span>
                  <div className="flex h-34 w-full flex-col-reverse gap-0.75">
                    {Array.from({ length: blocks }, (_, b) => (
                      <span key={b} className={cn("h-2.5 w-full rounded-[1px]", b === blocks - 1 ? "bg-hunter" : moment >= 0 ? "bg-leaf" : "bg-unlit")} />
                    ))}
                  </div>
                  <span className="font-ledger text-[12px] text-charcoal-muted">{hourLabel(h)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* The four moments. */}
        <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {MOMENTS.map((m, i) => (
            <li key={m.time} className="flex flex-col gap-3 rounded-lg border border-hairline bg-canvas p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-[3px] bg-lime font-ledger text-[12px] font-semibold text-charcoal">{i + 1}</span>
                  <span className="font-ledger text-[13px] text-charcoal-muted uppercase">{m.time}</span>
                </span>
                <PixelIcon name={m.icon} size={22} className="text-hunter" />
              </div>
              <span className="font-body text-read font-semibold text-charcoal">{m.title}</span>
              <span className="font-body text-note text-charcoal-soft">{m.body}</span>
              {m.icon === "sound" ? (
                <button
                  type="button"
                  onClick={hear}
                  className="mt-auto inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-md bg-charcoal px-3.5 font-body text-note font-semibold text-canvas transition-transform duration-150 ease-snappy hover:scale-[1.02] active:scale-[0.97]"
                >
                  <PixelIcon name="sound" size={14} accent="fill-lime" />
                  {speaking ? "Playing" : "Hear it"}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
