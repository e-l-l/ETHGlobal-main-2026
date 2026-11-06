"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/*
 * The drip: lime pixels fall and settle into a dune, the dollar jar filling one sale at a time.
 * Pixel grammar from the kit (4px squares on a 6px pitch). Colours come from tokens via hidden
 * swatches, so no hex lives here. Static (a settled dune) when `running` is false.
 */

const PITCH = 6;
const PX = 4;

type Sim = {
  cols: number;
  rows: number;
  env: number[];
  heights: number[];
  drops: { c: number; y: number; v: number }[];
  spawnAcc: number;
  erodeAcc: number;
};

/** Stable pseudo-random in [0,1) per cell, so the scatter never flickers. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

export function DripField({
  running,
  rain = true,
  center = 0.62,
  spread = 0.2,
  fill = 0.6,
  className,
}: {
  running: boolean;
  /** Falling drops. Off: just the dune. */
  rain?: boolean;
  /** Peak of the dune, 0 to 1 across. */
  center?: number;
  spread?: number;
  /** How full the dune starts, 0 to 1 of its envelope. */
  fill?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swatch = useRef<(HTMLSpanElement | null)[]>([]);
  const sim = useRef<Sim | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const [lime, leaf, hunter, faint] = swatch.current.map((s) => (s ? getComputedStyle(s).color : "currentColor"));
    let w = 0;
    let h = 0;

    function setup() {
      const r = wrap!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.floor(w / PITCH);
      const rows = Math.floor(h / PITCH);
      if (sim.current && sim.current.cols === cols && sim.current.rows === rows) return;
      const env = Array.from({ length: cols }, (_, c) => {
        const x = c / Math.max(1, cols - 1) - center;
        const bell = Math.exp(-(x * x) / (2 * spread * spread));
        return Math.max(1, rows * 0.95 * bell * (0.82 + 0.18 * hash(c, 7)));
      });
      sim.current = { cols, rows, env, heights: env.map((e) => Math.floor(e * fill)), drops: [], spawnAcc: 0, erodeAcc: 0 };
    }

    function draw() {
      const s = sim.current;
      if (!s) return;
      ctx!.clearRect(0, 0, w, h);
      for (let c = 0; c < s.cols; c++) {
        const top = s.heights[c]!;
        const env = s.env[c]!;
        const reach = Math.min(s.rows, env + 8);
        for (let r = 0; r < reach; r++) {
          let colour: string | null = null;
          if (r < top) {
            const depth = top - r;
            colour = depth <= 2 ? lime! : r < top * 0.45 ? hunter! : leaf!;
          } else {
            /* Scatter above the pile: sparse, thinning with height, like dust over the dune. */
            const t = (r - top) / Math.max(1, reach - top);
            if (hash(c, r) < 0.16 * (1 - t)) colour = t < 0.35 ? lime! : faint!;
          }
          if (colour) {
            ctx!.fillStyle = colour;
            ctx!.fillRect(c * PITCH, h - (r + 1) * PITCH + (PITCH - PX), PX, PX);
          }
        }
      }
      ctx!.fillStyle = lime!;
      for (const d of s.drops) ctx!.fillRect(d.c * PITCH, h - (d.y + 1) * PITCH + (PITCH - PX), PX, PX);
    }

    function step(dt: number) {
      const s = sim.current;
      if (!s) return;
      if (rain) {
        s.spawnAcc += dt;
        while (s.spawnAcc > 0.07) {
          s.spawnAcc -= 0.07;
          const c = Math.round((center + gauss() * spread * 0.9) * (s.cols - 1));
          if (c >= 0 && c < s.cols) s.drops.push({ c, y: s.rows + Math.random() * 4, v: 26 + Math.random() * 14 });
        }
      }
      s.drops = s.drops.filter((d) => {
        d.y -= d.v * dt;
        if (d.y <= s.heights[d.c]!) {
          s.heights[d.c] = Math.min(Math.floor(s.env[d.c]!), s.heights[d.c]! + 1);
          return false;
        }
        return true;
      });
      /* Spending: the jar drains as advances pay for stock, so the dune breathes instead of filling up. */
      s.erodeAcc += dt;
      while (s.erodeAcc > 0.06) {
        s.erodeAcc -= 0.06;
        const c = Math.floor(Math.random() * s.cols);
        if (s.heights[c]! > s.env[c]! * 0.35) s.heights[c]! -= 1;
      }
    }

    setup();
    draw();

    const ro = new ResizeObserver(() => {
      setup();
      draw();
    });
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      step(Math.min(0.05, (now - last) / 1000));
      last = now;
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (running) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running, rain, center, spread, fill]);

  return (
    <div ref={wrapRef} aria-hidden className={cn("relative overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {["text-lime", "text-leaf", "text-hunter", "text-honeydew/20"].map((cls, i) => (
        <span
          key={cls}
          ref={(el) => {
            swatch.current[i] = el;
          }}
          className={cn("hidden", cls)}
        />
      ))}
    </div>
  );
}
