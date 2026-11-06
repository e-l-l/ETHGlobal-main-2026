import { JarMark } from "./mark";

/* Server-safe data pieces for the phone screens. Colours from role tokens via app.css. */

/** Area sparkline. Uniform scaling (no preserveAspectRatio="none"), so the marker stays round. */
export function Sparkline({ points, label, mark, height = 72 }: { points: readonly number[]; label: string; mark?: number; height?: number }) {
  const w = 300;
  const h = height;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / Math.max(1, points.length - 1)) * w, pad + (1 - (p - min) / span) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const m = mark !== undefined ? xy[mark] : undefined;
  return (
    <svg className="app-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path className="app-spark__area" d={area} />
      <path className="app-spark__line" d={line} />
      {m ? <circle className="app-spark__mark" cx={m[0]} cy={m[1]} r={5} /> : null}
    </svg>
  );
}

/** Weekly sales bars; this week is lit. Heights are transforms, not layout. */
export function Bars({ values, label }: { values: readonly number[]; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="app-bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span key={i} style={{ height: "100%", transform: `scaleY(${Math.max(0.04, v / max)})` }} />
      ))}
    </div>
  );
}

export type LossLayer = "jar" | "junior" | "reserve" | "senior";
const LAYERS: { id: LossLayer; title: string; size: string }[] = [
  { id: "jar", title: "Shop jar", size: "per shop" },
  { id: "junior", title: "Junior", size: "$42k" },
  { id: "reserve", title: "Reserve", size: "$8.4k" },
  { id: "senior", title: "Senior", size: "$310k" },
];

const ORDINAL = ["1st", "2nd", "3rd", "4th"] as const;

/** Loss waterfall, horizontal: the whole order fits in one row on a phone. */
export function LossStrip({ viewer }: { viewer: LossLayer }) {
  return (
    <ol className="app-loss pub" aria-label="Who takes a loss, first to last">
      {LAYERS.map((l, i) => (
        <li key={l.id} data-you={l.id === viewer}>
          <span className="dj-label">{l.id === viewer ? "You" : ORDINAL[i]}</span>
          <strong>{l.title}</strong>
          <span>{l.size}</span>
        </li>
      ))}
    </ol>
  );
}

/** The ribbon drop inside a Hunter coin: the token badge (anay-design.md section 5, #02). */
export function Coin({ size = 112, lit = 1, loading, label, intro }: { size?: number; lit?: 0 | 1 | 2 | 3 | 4; loading?: boolean; label?: string; intro?: boolean }) {
  return (
    <span className={`app-coin${intro ? " app-coin--intro" : ""}`} style={{ width: size, height: size }}>
      <JarMark size={Math.round(size * 0.62)} lit={lit} loading={loading} label={label} />
    </span>
  );
}
