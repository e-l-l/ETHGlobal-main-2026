import type { DayTotal } from "@/lib/ledger";
import { money, shortDate, type Dict, type Lang } from "@/lib/i18n";

// Single-series bar chart: one hue, no legend (the title names it), 4px rounded tops anchored to
// the baseline, a gap between bars, a recessive grid, a per-bar hover tooltip (CSS + <title>),
// and a table fallback.
export function SalesChart({ weeks, lang, d }: { weeks: DayTotal[]; lang: Lang; d: Dict }) {
  const W = 640;
  const H = 220;
  const padL = 56;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const max = Math.max(1, ...weeks.map((w) => w.cents));
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / Math.max(1, weeks.length);
  const barW = Math.max(4, slot * 0.7 - 2);
  const y = (c: number) => padT + plotH - (c / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const compact = new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${d.chartTitle}. ${d.chartSub}`}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} className="grid" />
            <text x={padL - 8} y={y(tv) + 4} textAnchor="end" className="axis">
              ${compact.format(tv / 100)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(w.cents));
          const r = Math.min(4, h, barW / 2);
          const yTop = y(w.cents);
          // rounded top corners only; flat on the baseline
          const path =
            h <= 0
              ? ""
              : `M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y(0)} Z`;
          return (
            <g key={w.date} className="bar">
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} className="hit" />
              {path && <path d={path} className="mark" />}
              <title>{`${d.weekOf} ${shortDate(w.date, lang)}: ${money(w.cents, lang)}`}</title>
              {i % 3 === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="axis">
                  {shortDate(w.date, lang)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      <details className="table-view">
        <summary>{d.showTable}</summary>
        <table>
          <thead>
            <tr>
              <th>{d.weekOf}</th>
              <th className="num">{d.amount}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.date}>
                <td>{shortDate(w.date, lang)}</td>
                <td className="num">{money(w.cents, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
