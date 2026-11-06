"use client";

import { useState } from "react";
import { JarMark } from "@/final";
import { cn } from "@/lib/cn";
import { limitsLadder } from "@/lib/mock/shop";

/*
 * The limits ladder as a glowing pixel staircase: stepped columns that fade from Hunter to cream,
 * rising $50 → $500. Pick a step: its columns rise and light, and the logo meter lights one band per step.
 */

const SLICES = ["bg-hunter", "bg-fern", "bg-leaf", "bg-lime/70", "bg-lime", "bg-honeydew", "bg-canvas"];
const HEIGHTS = [34, 54, 76, 100];

export function Staircase() {
  const [tier, setTier] = useState(1);
  const lit = (tier + 1) as 1 | 2 | 3 | 4;
  const step = limitsLadder[tier]!;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-4">
          <span className="font-ledger text-tag font-medium text-lime uppercase">Standing Pass</span>
          <h2 id="limits-h" className="m-0 max-w-[16ch] font-display text-[40px] leading-[1.04] font-bold tracking-[-0.035em] text-canvas md:text-[64px]">
            Pay back, unlock more.
          </h2>
          <p className="m-0 max-w-[50ch] font-body text-read text-honeydew/80">
            Every advance you repay raises your next limit, from $50 up to $500. Your Standing Pass proves it without showing your history.
          </p>
        </div>
        <div className="flex items-center gap-5 rounded-2xl border border-honeydew/10 bg-deep/60 p-5">
          <JarMark size={96} on="dark" lit={lit} label={`Limit $${step.cap}: ${lit} of 4 bands lit`} />
          <div className="flex flex-col">
            <span key={tier} className="font-display text-[56px] leading-none font-bold tracking-[-0.03em] text-lime tabular-nums transition-[opacity,filter] duration-300 starting:opacity-0 starting:blur-[3px]">
              ${step.cap}
            </span>
            <span className="font-ledger text-[12px] text-honeydew/70 uppercase">Your limit · {step.label}</span>
          </div>
        </div>
      </div>

      <div role="radiogroup" aria-label="Repaid advances" className="grid h-[300px] grid-cols-4 items-end gap-2 md:h-[380px] md:gap-4">
        {limitsLadder.map((s, g) => {
          const on = g === tier;
          const reached = g <= tier;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTier(g)}
              className="group flex h-full cursor-pointer flex-col justify-end gap-3 text-left"
            >
              <span className={cn("flex flex-col transition-colors duration-200", on ? "text-lime" : "text-honeydew/60 group-hover:text-honeydew")}>
                <span className="font-display text-h2 md:text-h1 tabular-nums">${s.cap}</span>
                <span className="font-ledger text-[11px] uppercase">{s.label}</span>
              </span>
              <span className="flex items-end gap-1 md:gap-1.5" style={{ height: `${HEIGHTS[g]! - 22}%` }}>
                {[0.8, 0.88, 0.94, 1].map((f, b) => (
                  <span
                    key={b}
                    className={cn(
                      "flex flex-1 origin-bottom flex-col overflow-hidden rounded-t-[3px] transition-[transform,opacity] duration-500 ease-swap",
                      on ? "scale-y-100 opacity-100" : reached ? "scale-y-[0.97] opacity-75" : "scale-y-[0.9] opacity-30 group-hover:opacity-50",
                    )}
                    style={{ height: `${f * 100}%`, transitionDelay: on ? `${b * 40}ms` : "0ms" }}
                  >
                    {SLICES.map((c) => (
                      <span key={c} className={cn("block flex-1", c)} />
                    ))}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
