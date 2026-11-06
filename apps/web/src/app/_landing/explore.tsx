import type { ReactNode } from "react";
import { BlockWall, type Theme } from "@/blocks";
import { CheckIcon, JarMark } from "@/final";
import { cn } from "@/lib/cn";
import { advance, agentLimits, shop } from "@/lib/mock/shop";
import { BLOCKY, PixelBar } from "./blocky";

/*
 * Product overview: three parts of the app, each a text card beside a block-pattern panel
 * with a tilted product card on it. Rows alternate sides. Hovering a row levels its card.
 */

type Part = {
  id: string;
  label: string;
  title: string;
  body: string;
  points: string[];
  theme: Theme;
  seed: number;
  card: ReactNode;
};

/* ------------------------------------------------------------ The cards */

function CardShell({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-hairline bg-surface p-5 text-charcoal shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-h2">{title}</span>
        <span className="rounded-[4px] bg-well px-2 py-1 font-ledger text-[11px] text-charcoal-muted uppercase">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function PassCard() {
  const rows: [string, string, boolean][] = [
    ["Seller dashboard", "Connected", true],
    ["Country", shop.country, true],
    ["Sales band", `Band ${shop.band}`, true],
    ["Months active", shop.months, true],
    ["Name, phone, books", "Not shared", false],
  ];
  return (
    <CardShell title="Business Pass" meta="4 of 4 checks">
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map(([k, v, ok]) => (
          <li key={k} className="flex items-center justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0">
            <span className="font-body text-note font-semibold">{k}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-ledger text-[11px] uppercase", ok ? "bg-honeydew text-hunter" : "bg-well text-charcoal-muted")}>
              {ok ? <CheckIcon size={11} strokeWidth={3} /> : null}
              {v}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function SalesCard() {
  const week = [31, 29, 12, 9, 27, 34, 30];
  const max = Math.max(...week);
  const total = week.reduce((a, b) => a + b, 0);
  return (
    <CardShell title="Sales" meta="This week">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Sales", `$${total}`],
          ["Drips back", `$${(total / 10).toFixed(2)}`],
          ["Repaid", `${advance.pct}%`],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-md bg-well p-2.5">
            <span className="font-ledger text-[10px] text-charcoal-muted uppercase">{k}</span>
            <span className="font-display text-h2 tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      {/* Pixel columns: one per day, 4px blocks. */}
      <div className="flex h-28 items-end gap-2" aria-hidden>
        {week.map((d, i) => {
          const blocks = Math.max(1, Math.round((d / max) * 10));
          return (
            <div key={i} className="flex flex-1 flex-col-reverse gap-[3px]">
              {Array.from({ length: blocks }, (_, b) => (
                <span key={b} className={cn("h-2 rounded-[1px]", b === blocks - 1 ? "bg-lime" : i === 6 ? "bg-hunter" : "bg-leaf")} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex justify-between font-ledger text-[11px] text-charcoal-muted uppercase">
          <span>Advance repaid</span>
          <span>
            ${advance.repaid} / ${advance.total}
          </span>
        </span>
        <PixelBar value={advance.pct / 100} cells={24} className="h-2.5" />
      </div>
    </CardShell>
  );
}

function AgentCard() {
  const steps = [
    ["Cash is low before Thursday's restock", "Agent"],
    [`Offer of $${advance.drawn}, checked for fake sales`, "Critic"],
    [`Inside your $${agentLimits.perAdvance} limit`, "Contract"],
    ["Supplier paid, reason sent to you", "Done"],
  ];
  return (
    <CardShell title="Your agent" meta="Runs daily">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map(([t, who], i) => (
          <li key={t} className="flex items-center gap-3 rounded-md border border-hairline bg-canvas px-3 py-2.5">
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-[4px] font-ledger text-[11px] font-semibold", i === 3 ? "bg-lime text-charcoal" : "bg-hunter text-canvas")}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 font-body text-note font-semibold">{t}</span>
            <span className="font-ledger text-[10px] text-charcoal-muted uppercase">{who}</span>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

const PARTS: Part[] = [
  {
    id: "pass",
    label: "01 · Get in",
    title: "Prove the business, not the person",
    body: "Log into the seller dashboard you already use. We check your months of sales and keep nothing else, and your first limit is ready.",
    points: ["Country, sales band and 6+ months", "We never ask for your name, phone or contacts", "We learned nothing else"],
    theme: "night",
    seed: 11,
    card: <PassCard />,
  },
  {
    id: "sales",
    label: "02 · Get paid",
    title: "Watch every sale split",
    body: "Customers scan your QR and pay in the dollars they hold. Nine parts land with you, one part drips back until the advance is paid off.",
    points: ["Any token in, dollars out", "Customers never see your advance", "Every sale read out loud"],
    theme: "brand",
    seed: 23,
    card: <SalesCard />,
  },
  {
    id: "agent",
    label: "03 · Restock",
    title: "Let your agent buy the stock",
    body: "Your agent draws a small advance for stock inside the limits you set. Approve once with World. Nothing is drawn until you do.",
    points: ["Why it drew this, every time", "Your agent, your limits", "Pause or revoke anytime"],
    theme: "night",
    seed: 37,
    card: <AgentCard />,
  },
];

export function Explore() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {PARTS.map((p, i) => {
        const flip = i % 2 === 1;
        return (
          <article key={p.id} className="group grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <div className={cn("flex flex-col justify-between gap-12 rounded-[20px] border border-hairline bg-surface p-7 md:p-10", flip && "md:order-2")}>
              <div className="flex flex-col gap-4">
                <span className="font-ledger text-tag font-medium text-hunter uppercase">{p.label}</span>
                <h3 className="m-0 max-w-[18ch] font-display text-[30px] leading-[1.08] font-bold tracking-[-0.03em] text-charcoal md:text-[36px]">{p.title}</h3>
                <p className="m-0 max-w-[44ch] font-body text-read text-charcoal-soft">{p.body}</p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-center gap-3 font-body text-read text-charcoal">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-hairline bg-well text-hunter">
                      <CheckIcon size={14} strokeWidth={3} />
                    </span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn("relative min-h-[380px] overflow-hidden rounded-[20px] bg-deep md:min-h-[460px]", flip && "md:order-1")}>
              <div aria-hidden className="absolute inset-0 opacity-45">
                <BlockWall cols={8} rows={8} fade="none" theme={p.theme} shapes={BLOCKY} seed={p.seed} density={0.6} grain />
              </div>
              <span aria-hidden className="absolute top-5 left-5 grid size-11 place-items-center rounded-md bg-deep">
                <JarMark size={24} on="dark" lit={(i + 2) as 2 | 3 | 4} />
              </span>
              <div
                className={cn(
                  "absolute top-[18%] w-[min(440px,82%)] transition-transform duration-500 ease-snappy",
                  "[transform:perspective(1400px)_rotateX(22deg)_rotateZ(-9deg)] group-hover:[transform:perspective(1400px)_rotateX(8deg)_rotateZ(-3deg)_translateY(-6px)]",
                  "motion-reduce:transition-none",
                  flip ? "left-[8%]" : "right-[-4%] md:right-[-2%]",
                )}
              >
                {p.card}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
