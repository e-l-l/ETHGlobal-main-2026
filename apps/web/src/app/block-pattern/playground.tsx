"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BlockGrid, cluster, generateTiles, type Theme } from "@/blocks";
import { Button, Segmented } from "@/final";
import { cn } from "@/lib/cn";
import { useLive } from "../_landing/use-live";

type ColsOpt = "6" | "8" | "12";
const COLS: Record<ColsOpt, string> = { "6": "grid-cols-6", "8": "grid-cols-8", "12": "grid-cols-12" };
type DensityOpt = "0.4" | "0.7" | "1";

/** Live controls over the generator. Everything here maps one-to-one to props. */
export function Playground() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [seed, setSeed] = useState(7);
  const [theme, setTheme] = useState<Theme>("brand");
  const [cols, setCols] = useState<ColsOpt>("8");
  const [density, setDensity] = useState<DensityOpt>("0.7");
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState(true);
  const [grain, setGrain] = useState(true);
  const [auto, setAuto] = useState(false);

  const n = Number(cols);
  const rows = n === 12 ? 4 : n === 8 ? 4 : 3;
  const tiles = useMemo(() => generateTiles(n * rows, { seed, cols: n, theme, density: Number(density) }), [seed, n, rows, theme, density]);
  const litIdx = useMemo(() => (lit ? cluster(seed + step, n, rows, 2) : []), [lit, seed, step, n, rows]);

  /* Remix loop: one quarter turn every 2.4s while on screen. Stops for reduced motion. */
  useEffect(() => {
    if (!auto || !live.running) return;
    const t = window.setInterval(() => setStep((s) => s + 1), 2400);
    return () => window.clearInterval(t);
  }, [auto, live.running]);

  const code = `<BlockWall
  seed={${seed}} theme="${theme}" cols={${n}} rows={${rows}}
  density={${density}} step={${step}}${lit ? `\n  lit={cluster(${seed + step}, ${n}, ${rows})}` : ""}${grain ? "\n  grain" : ""} interactive fade="none"
/>`;

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <BlockGrid tiles={tiles} cols={COLS[cols]} step={step} lit={litIdx} grain={grain} interactive className="self-start rounded-[20px] bg-deep" />

      <div className="flex flex-col gap-5 rounded-xl border border-hairline bg-surface p-5">
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "brand", label: "Brand" },
              { value: "night", label: "Night" },
              { value: "day", label: "Day" },
            ]}
          />
        </Field>
        <Field label="Columns">
          <Segmented
            label="Columns"
            value={cols}
            onChange={setCols}
            options={[
              { value: "6", label: "6" },
              { value: "8", label: "8" },
              { value: "12", label: "12" },
            ]}
          />
        </Field>
        <Field label="Density">
          <Segmented
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: "0.4", label: "Calm" },
              { value: "0.7", label: "Mixed" },
              { value: "1", label: "Busy" },
            ]}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Toggle on={lit} onClick={() => setLit((v) => !v)}>Lit cluster</Toggle>
          <Toggle on={grain} onClick={() => setGrain((v) => !v)}>Grain</Toggle>
          <Toggle on={auto} onClick={() => setAuto((v) => !v)}>Auto remix</Toggle>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" width="full" onClick={() => setStep((s) => s + 1)}>
            Turn step
          </Button>
          <Button size="sm" width="full" onClick={() => setSeed((s) => (s * 48271 + 11) % 2147483647)}>
            Shuffle
          </Button>
        </div>
        <pre className="m-0 overflow-x-auto rounded-md bg-deep p-3 font-ledger text-[12px] leading-relaxed text-honeydew">{code}</pre>
        {auto && live.reduced && live.paused ? (
          <p className="m-0 font-body text-note text-charcoal-muted">Auto remix is off because your device asks for reduced motion.</p>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 font-body text-note font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-snappy active:scale-[0.97]",
        on ? "border-hunter bg-hunter text-canvas" : "border-control bg-surface text-charcoal hover:bg-well",
      )}
    >
      <i aria-hidden className={cn("size-2 rounded-[1px] transition-colors", on ? "bg-lime" : "bg-track")} />
      {children}
    </button>
  );
}
