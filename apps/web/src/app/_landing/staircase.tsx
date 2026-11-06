"use client";

import { useState } from "react";
import { JarMark } from "@/final";
import { cn } from "@/lib/cn";
import { currentTier, limitsLadder, shop } from "@/lib/mock/shop";
import { IconTile, PixelIcon, type PixelIconName } from "./pixel-icons";

/*
 * The limits ladder as a glowing pixel staircase: stepped columns that fade from Hunter to cream,
 * rising $50 → $300. Pick a step: its columns rise and light, the logo meter lights one band per step,
 * and the panel says what that step takes. The demo shop's own step is marked.
 */

const SLICES = ["bg-hunter", "bg-fern", "bg-leaf", "bg-lime/70", "bg-lime", "bg-honeydew", "bg-canvas"];
const HEIGHTS = [34, 54, 76, 100];

const HOW: [PixelIconName, string, string][] = [
  ["coin", "Repay an advance", "From sales, 8% at a time. No extra payment."],
  ["phone", "Your Standing Pass updates", "On your phone. Nothing about it goes onchain."],
  ["stairs", "Your next limit unlocks", "Prove the new step privately and draw again."],
];

const NEEDS = ["A Business Pass. No repayments yet.", "1 advance repaid in full.", "2 advances repaid in full.", "3 or more advances repaid."];

export function Staircase() {
  const [tier, setTier] = useState(currentTier);
  const lit = (tier + 1) as 1 | 2 | 3 | 4;
  const step = limitsLadder[tier]!;

  return (
    <div className="flex flex-col gap-14">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px] lg:items-end">
        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 font-ledger text-tag font-medium text-lime uppercase">
            <i aria-hidden className="size-1.5 rounded-[1px] bg-lime" />
            Standing Pass
          </span>
          <h2 id="limits-h" className="m-0 max-w-[16ch] font-display text-[40px] leading-[1.04] font-bold tracking-[-0.035em] text-canvas md:text-[64px]">
            Pay back, unlock more.
          </h2>
          <p className="m-0 max-w-[50ch] font-body text-read text-honeydew/80">
            Every advance you repay raises your next limit, from $50 up to $300. Your Standing Pass proves it without showing your history.
          </p>
        </div>

        {/* The picked step: meter, limit, what it takes, what lenders see. */}
        <div className="flex flex-col gap-4 rounded-2xl border border-honeydew/10 bg-deep/70 p-5">
          <div className="flex items-center gap-5">
            <JarMark size={88} on="dark" lit={lit} label={`Limit $${step.cap}: ${lit} of 4 bands lit`} />
            <div className="flex flex-col">
              <span key={tier} className="font-display text-[56px] leading-none font-bold tracking-[-0.03em] text-lime tabular-nums transition-[opacity,filter] duration-300 starting:opacity-0 starting:blur-[3px]">
                ${step.cap}
              </span>
              <span className="font-ledger text-[12px] text-honeydew uppercase">Limit · {step.label}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-honeydew/10 pt-4 font-body text-note">
            <span className="flex items-start gap-2.5 text-canvas">
              <PixelIcon name="stairs" size={16} className="mt-0.5 text-lime" accent="fill-honeydew" />
              <span>
                <span className="text-honeydew">Needs: </span>
                {NEEDS[tier]}
              </span>
            </span>
            <span className="flex items-start gap-2.5 text-canvas">
              <PixelIcon name="eye" size={16} className="mt-0.5 text-lime" accent="fill-honeydew" />
              <span>
                <span className="text-honeydew">Lenders see: </span>
                this step. Never which shops, when or how much.
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* How a step is earned. */}
      <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
        {HOW.map(([icon, t, d], i) => (
          <li key={t} className="flex items-start gap-4 rounded-xl border border-honeydew/10 bg-deep/40 p-5">
            <IconTile name={icon} tone="dark" size={44} />
            <span className="flex flex-col gap-1">
              <span className="font-ledger text-[11px] text-lime uppercase">Step 0{i + 1}</span>
              <span className="font-body text-read font-semibold text-canvas">{t}</span>
              <span className="font-body text-note text-honeydew/80">{d}</span>
            </span>
          </li>
        ))}
      </ol>

      <div role="radiogroup" aria-label="Repaid advances" className="grid h-[340px] grid-cols-4 items-end gap-2 md:h-[420px] md:gap-4">
        {limitsLadder.map((s, g) => {
          const on = g === tier;
          const reached = g <= tier;
          const here = g === currentTier;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTier(g)}
              className="group flex h-full cursor-pointer flex-col justify-end gap-3 text-left"
            >
              {here ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-[4px] bg-lime px-2 py-1 font-ledger text-[10px] font-semibold text-charcoal uppercase">
                  <PixelIcon name="shop" size={12} accent="fill-leaf" />
                  <span className="hidden sm:inline">{shop.name} is here</span>
                  <span className="sm:hidden">Here</span>
                </span>
              ) : null}
              <span className={cn("flex flex-col transition-colors duration-200", on ? "text-lime" : "text-honeydew/70 group-hover:text-honeydew")}>
                <span className="font-display text-h2 md:text-h1 tabular-nums">${s.cap}</span>
                <span className="font-ledger text-[11px] uppercase">{s.label}</span>
              </span>
              <span className="flex items-end gap-1 md:gap-1.5" style={{ height: `${HEIGHTS[g]! - 26}%` }}>
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
