"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { shop } from "@/lib/mock/shop";
import { useLive } from "./use-live";

/*
 * Privacy as pixel fog: blocky value noise, posterised into four greens, thicker on the right
 * where the pins sit, thin on the left where the copy reads. It shifts a block at a time.
 * Pick a pin to read what happens to that piece of data.
 */

const PINS = [
  { k: "Shop name", tag: "Public", body: `A neutral name like ${shop.name} and a pseudonym, ${shop.id}. Nothing about you, nothing about the advance.` },
  { k: "Each sale", tag: "Public", body: "Sales and the 8% that drips back are onchain. Customers never see your advance." },
  { k: "Name and phone", tag: "Never asked", body: "No name or identity ever goes onchain. We never ask for your name, phone or contacts." },
  { k: "Your books", tag: "Stay on your phone", body: "Records stay on your phone, not our servers. A private check shares country, sales band and 6+ months. We learned nothing else." },
  { k: "Repaid advances", tag: "Proved, not shown", body: "Your Standing Pass proves how many you repaid. Not which, not where, not when." },
  { k: "Your old shop", tag: "Unlinked", body: "Start a fresh shop and keep your limit, with no public link between the two." },
] as const;

const LEVELS = ["text-canvas", "text-honeydew", "text-honeydew-line", "text-track", "text-leaf"] as const;
const CELL = 16;

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function PixelFog() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swatch = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useLive(wrapRef);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;
    const colours = swatch.current.map((s) => (s ? getComputedStyle(s).color : "transparent"));
    let cols = 0;
    let rows = 0;
    let t = 0;

    function size() {
      cols = Math.ceil(wrap!.clientWidth / CELL);
      rows = Math.ceil(wrap!.clientHeight / CELL);
      canvas!.width = cols;
      canvas!.height = rows;
      canvas!.style.width = `${cols * CELL}px`;
      canvas!.style.height = `${rows * CELL}px`;
    }

    function draw() {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const fx = x / Math.max(1, cols - 1);
          /* Two octaves, drifting at different speeds, weighted toward the right. */
          const n = noise(x / 9 + t, y / 7) * 0.65 + noise(x / 4 - t * 1.6, y / 4 + t * 0.5) * 0.35;
          const v = n * (0.35 + fx * 0.85);
          const lvl = v < 0.3 ? 0 : v < 0.45 ? 1 : v < 0.6 ? 2 : v < 0.74 ? 3 : 4;
          ctx!.fillStyle = colours[lvl]!;
          ctx!.fillRect(x, y, 1, 1);
        }
    }

    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(wrap);

    /* Steps, not glides: ~6 frames a second reads as pixels shifting. */
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += now - last;
      last = now;
      if (acc > 160) {
        t += 0.04;
        acc = 0;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    if (live.running) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [live.running]);

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block [image-rendering:pixelated]" />
      {LEVELS.map((c, i) => (
        <span
          key={c}
          ref={(el) => {
            swatch.current[i] = el;
          }}
          className={cn("hidden", c)}
        />
      ))}
    </div>
  );
}

export function Fog() {
  const [pin, setPin] = useState(3);
  const p = PINS[pin]!;

  return (
    <div className="relative overflow-hidden rounded-[20px] border-2 border-hunter/25 bg-canvas shadow-lift">
      <PixelFog />
      <div className="relative grid min-h-[600px] grid-cols-1 gap-12 p-7 md:grid-cols-[1.3fr_1fr] md:p-14">
        <div className="flex flex-col justify-between gap-10">
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 font-ledger text-tag font-medium text-hunter uppercase">
              <i aria-hidden className="size-1.5 rounded-[1px] bg-hunter" />
              Private by default
            </span>
            <h2 id="privacy-h" className="m-0 max-w-[14ch] font-display text-[44px] leading-[1.02] font-bold tracking-[-0.035em] text-charcoal md:text-[64px]">
              Your books stay closed. <span className="block text-hunter">Even onchain.</span>
            </h2>
            <p className="m-0 max-w-[44ch] font-body text-read text-charcoal-soft">
              Being seen with debt is risky. Your records live on your phone, and the chain only ever sees a nameless shop. Pick a pin and look for yourself.
            </p>
          </div>
          <div
            key={pin}
            aria-live="polite"
            className="flex max-w-[440px] flex-col gap-1.5 rounded-lg border border-hairline bg-surface p-5 shadow-lift transition-[opacity,transform,filter] duration-300 ease-snappy starting:translate-y-1 starting:opacity-0 starting:blur-[2px]"
          >
            <span className="font-ledger text-tag font-semibold text-hunter uppercase">
              {p.k} · {p.tag}
            </span>
            <span className="font-body text-read text-charcoal">{p.body}</span>
          </div>
        </div>
        <ul aria-label="Your data" className="m-0 flex list-none flex-col items-start justify-center gap-3 p-0 md:items-end">
          {PINS.map((it, i) => (
            <li key={it.k} className={cn(i % 2 === 1 && "md:mr-10", i % 3 === 2 && "md:mr-20")}>
              <button
                type="button"
                aria-pressed={i === pin}
                onClick={() => setPin(i)}
                className={cn(
                  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 font-ledger text-[14px] uppercase",
                  "transition-[background-color,border-color,color,transform] duration-200 ease-snappy hover:-translate-y-0.5 active:scale-[0.97]",
                  i === pin ? "border-charcoal bg-charcoal text-canvas" : "border-hairline bg-surface text-charcoal hover:border-hunter",
                )}
              >
                <span aria-hidden className={cn("size-2.5 rounded-[1px]", i === pin ? "bg-lime" : it.tag === "Public" ? "bg-hunter" : "bg-leaf")} />
                <span className="font-semibold">{it.k}</span>
                <span className={i === pin ? "text-honeydew/80" : "text-charcoal-muted"}>{it.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
