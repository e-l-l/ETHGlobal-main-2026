"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BlockGrid, fromTuples, type TileTuple } from "@/blocks";
import { CheckIcon, JarMark } from "@/final";
import { cn } from "@/lib/cn";
import { advance, agentLimits, shop } from "@/lib/mock/shop";
import { PixelBar, Waffle } from "./blocky";
import { useLive } from "./use-live";

/*
 * How it works, as a geometric mosaic in brand greens around a dark panel.
 * Blocks only, no curves. Each step remixes the tiles: steps and triangles turn a quarter, the step's cluster lights lime.
 * Steps advance on their own while in view; picking one stops that. Hover a tile to turn it.
 */

/* Hand-set so neighbours contrast. [bg, shape, fg, base rotation] */
const TILES = fromTuples([
  ["leaf", "none", "leaf", 0],
  ["hunter", "steps", "lime", 0],
  ["fern", "stripes", "leaf", 0],
  ["lime", "none", "lime", 0],
  ["leaf", "half", "lime", 90],
  ["forest", "pixels", "lime", 0],
  ["hunter", "diamond", "lime", 0],
  ["lime", "drop", "hunter", 0],
  ["fern", "tri", "hunter", 0],
  ["sage", "check", "leaf", 0],
  ["hunter", "tri", "lime", 0],
  ["lime", "plus", "fern", 0],
  ["forest", "steps", "leaf", 180],
  ["leaf", "stripes", "forest", 90],
  ["hunter", "half", "fern", 0],
  ["lime", "steps", "hunter", 90],
  ["fern", "check", "leaf", 0],
  ["deep", "pixels", "fern", 0],
  ["leaf", "tri", "lime", 180],
  ["forest", "diamond", "lime", 0],
  ["honeydew", "plus", "leaf", 0],
  ["hunter", "stripes", "fern", 90],
  ["lime", "pixels", "fern", 0],
  ["fern", "steps", "lime", 270],
  ["leaf", "pixels", "forest", 0],
  ["forest", "check", "leaf", 0],
  ["hunter", "plus", "lime", 0],
  ["lime", "half", "leaf", 270],
] satisfies TileTuple[]);

const STEPS: { key: string; title: string; body: string; lit: number[]; frag: ReactNode }[] = [
  {
    key: "Prove",
    title: "Prove your shop, privately",
    body: "Log into the seller dashboard you already use. We check your months of sales and keep nothing else.",
    lit: [0, 1, 8, 9],
    frag: (
      <div className="flex flex-col gap-1.5 rounded-md border border-honeydew-line bg-honeydew p-3 text-charcoal">
        <span className="inline-flex items-center gap-1.5 font-ledger text-tag font-semibold text-hunter">
          <CheckIcon size={13} strokeWidth={3} /> WE LEARNED NOTHING ELSE
        </span>
        <span className="font-body text-note font-semibold">
          {shop.country} · band {shop.band} · {shop.months}
        </span>
      </div>
    ),
  },
  {
    key: "Limits",
    title: "Set your agent’s limits",
    body: "Choose the most per advance, the most per month and what it’s for. Approve once with World. Nothing is drawn until you do.",
    lit: [5, 6, 13, 14],
    frag: (
      <div className="flex flex-col gap-2 rounded-md bg-surface p-3 text-charcoal">
        {[
          ["Most per advance", `$${agentLimits.perAdvance}`],
          ["Most per month", `$${agentLimits.perMonth}`],
          ["For", "Stock"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 font-body text-note">
            <span className="text-charcoal-soft">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
        <span className="w-fit rounded-[4px] bg-honeydew px-2 py-0.5 font-ledger text-[11px] text-hunter uppercase">Pause or revoke anytime</span>
      </div>
    ),
  },
  {
    key: "Sell",
    title: "Sell like you always do",
    body: "Customers scan your QR and pay in the dollars they hold. A tenth of every sale drips back on its own.",
    lit: [16, 17, 20, 21],
    frag: (
      <div className="flex flex-col gap-2.5 rounded-md bg-surface p-3 text-charcoal">
        <div className="flex items-baseline justify-between">
          <span className="font-body text-note font-semibold">Sale · 4:20 pm</span>
          <span className="font-display text-h2">$10.00</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <PixelBar value={0.9} cells={10} on="bg-unlit" off="bg-hunter" className="h-2.5" />
          <span className="flex justify-between font-ledger text-[11px] text-charcoal-muted">
            <span>$9.00 yours</span>
            <span className="text-hunter">$1.00 drips back</span>
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "Pay back",
    title: "Pay back, unlock more",
    body: "Every advance you repay raises your next limit, from $50 up to $500. Your Standing Pass proves it without showing your history.",
    lit: [22, 23, 26, 27],
    frag: (
      <div className="flex items-center gap-4 rounded-md bg-surface p-3 text-charcoal">
        <Waffle value={advance.pct / 100} cols={10} rows={4} label={`${advance.pct}% repaid`} className="w-28 shrink-0" />
        <span className="font-body text-note">
          ${advance.repaid} of ${advance.total} repaid
          <br />
          <span className="text-charcoal-muted">About {advance.etaDays} days to go</span>
        </span>
      </div>
    ),
  },
];

export function Mosaic() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    if (!live.running) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 4800);
    return () => window.clearInterval(t);
  }, [live.running]);

  const current = STEPS[step]!;

  return (
    <div ref={ref} className="relative">
      <BlockGrid
        tiles={TILES}
        lit={current.lit}
        step={step}
        interactive
        grain
        tileClassName={(i) => i >= 12 && "max-md:hidden"}
        className="rounded-[20px] bg-deep"
      >
        {/* The panel is placed first so the tiles flow around it. */}
        <div className="relative col-span-4 row-start-2 flex flex-col gap-5 bg-deep p-6 text-canvas md:col-span-3 md:col-start-3 md:row-span-4 md:row-start-2 md:p-8">
          <div className="flex items-center gap-3">
            <JarMark size={36} on="dark" lit={step + 1 > 4 ? 4 : ((step + 1) as 1 | 2 | 3 | 4)} />
            <span className="font-ledger text-tag font-medium text-honeydew/70 uppercase">How it works</span>
          </div>
          <div role="group" aria-label="Steps" className="grid grid-cols-4 gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={i === step}
                onClick={() => {
                  setStep(i);
                  live.setPaused(true);
                }}
                className={cn(
                  "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-md border px-2 text-left font-ledger text-[11px] uppercase transition-[background-color,border-color,color,transform] duration-200 ease-snappy active:scale-[0.97]",
                  i === step ? "border-lime bg-lime text-charcoal" : "border-honeydew/15 text-honeydew/70 hover:border-honeydew/40 hover:text-canvas",
                )}
              >
                <span className="font-semibold">0{i + 1}</span>
                <span className="truncate">{s.key}</span>
              </button>
            ))}
          </div>
          <div key={step} className="flex flex-col gap-3 transition-[opacity,filter,transform] duration-300 ease-snappy starting:translate-y-1 starting:opacity-0 starting:blur-[2px]">
            <h3 className="m-0 font-display text-h1-sm text-balance text-canvas md:text-h1">{current.title}</h3>
            <p className="m-0 font-body text-read text-honeydew/80">{current.body}</p>
            <div className="pt-1">{current.frag}</div>
          </div>
        </div>

      </BlockGrid>
    </div>
  );
}
