import type { ReactNode } from "react";
import { BlockWall, type Theme } from "@/blocks";
import { JarMark } from "@/final";
import { cn } from "@/lib/cn";
import { advance, agentLimits, limitsLadder, shop } from "@/lib/mock/shop";
import { BLOCKY, PixelBar } from "./blocky";
import { IconTile, PixelIcon, type PixelIconName } from "./pixel-icons";

/*
 * Product overview: three parts of the app, each a text card beside a block-pattern panel
 * (dimmed under a dark overlay) with a gently tilted product card on it. Each card shows the
 * one outcome of its step. Rows alternate sides. Hovering a row levels its card.
 */

type Part = {
  id: string;
  n: string;
  icon: PixelIconName;
  label: string;
  title: string;
  body: string;
  points: [PixelIconName, string][];
  theme: Theme;
  seed: number;
  card: ReactNode;
};

/* ------------------------------------------------------------ The cards */

function CardShell({ icon, title, meta, children }: { icon: PixelIconName; title: string; meta: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-5 rounded-2xl border border-hairline bg-surface p-5 text-charcoal shadow-lift md:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2.5">
          <IconTile name={icon} size={32} />
          <span className="font-display text-h2">{title}</span>
        </span>
        <span className="rounded-[4px] bg-well px-2 py-1 font-ledger text-[13px] text-charcoal-muted uppercase">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-ledger text-[12px] text-charcoal-muted uppercase">{children}</span>;
}

/* 01: what was proved, what stayed private, and the limit it unlocked. */
function PassCard() {
  const proved: [string, string][] = [
    ["Selling for", shop.months],
    ["Sales band", shop.bandRange],
    ["Country", shop.country],
  ];
  return (
    <CardShell icon="shield" title="Business Pass" meta="Verified">
      <div className="flex flex-col gap-1.5">
        <Label>Proved</Label>
        <ul className="m-0 flex list-none flex-col p-0">
          {proved.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-3 border-t border-hairline py-2 first:border-t-0">
              <span className="inline-flex items-center gap-2 font-body text-note text-charcoal-soft">
                <PixelIcon name="check" size={12} className="text-hunter" />
                {k}
              </span>
              <span className="font-body text-note font-semibold">{v}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Never leaves your phone</Label>
        <span className="flex flex-wrap gap-1.5">
          {["Name", "Phone", "Books"].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-[4px] bg-well px-2 py-1 font-ledger text-[13px] text-charcoal-muted uppercase">
              <PixelIcon name="lock" size={11} />
              {k}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-hunter p-3 text-canvas">
        <JarMark size={32} on="dark" lit={1} />
        <span className="flex flex-col">
          <span className="font-ledger text-[12px] text-honeydew uppercase">Unlocked</span>
          <span className="font-body text-note font-semibold">First advance up to ${limitsLadder[0].cap}</span>
        </span>
      </div>
    </CardShell>
  );
}

/* 02: one sale, split as it lands, and what it does to the advance. */
function SaleCard() {
  return (
    <CardShell icon="qr" title="Sale received" meta="10:14 · USDT">
      <div className="flex items-end justify-between gap-3">
        <span className="font-display text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums">$10.00</span>
        <span className="pb-1 font-ledger text-[13px] text-charcoal-muted">≈ ARS {(10 * shop.usdToLocal).toLocaleString("es-AR")}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div aria-hidden className="flex h-7 gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={cn("flex-1 rounded-[2px]", i < 9 ? "bg-leaf" : "bg-hunter")} />
          ))}
        </div>
        <div className="flex justify-between gap-3 font-body text-note">
          <span>
            <strong className="font-semibold">$9.00</strong> <span className="text-charcoal-soft">to you, now</span>
          </span>
          <span>
            <strong className="font-semibold">$1.00</strong> <span className="text-charcoal-soft">to the advance</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <span className="flex justify-between">
          <Label>Advance repaid</Label>
          <span className="font-ledger text-[13px] text-charcoal tabular-nums">
            ${advance.repaid} of ${advance.total}
          </span>
        </span>
        <PixelBar value={advance.pct / 100} cells={24} className="h-2.5" />
        <span className="font-body text-note text-charcoal-soft">About {advance.etaDays} days to go at this pace. No due date.</span>
      </div>
    </CardShell>
  );
}

/* 03: the agent's proposal, the checks it passed, and the one tap left. */
function AgentCard() {
  const checks: [PixelIconName, string][] = [
    ["shield", "Sales look real, checked by a second agent"],
    ["lock", `Inside your $${agentLimits.perAdvance} limit`],
    ["coin", `$${advance.fee} fee, repaid from sales`],
  ];
  return (
    <CardShell icon="agent" title="Agent proposal" meta="Today 9:12">
      <div className="flex flex-col gap-1.5">
        <span className="font-display text-[30px] leading-none font-bold tracking-[-0.03em]">Draw ${advance.drawn} for stock</span>
        <span className="font-body text-note text-charcoal-soft">Why: cash runs low before Thursday&apos;s restock.</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {checks.map(([icon, t]) => (
          <li key={t} className="flex items-center gap-2.5 rounded-md bg-well px-3 py-2 font-body text-note">
            <PixelIcon name={icon} size={14} className="text-hunter" />
            {t}
          </li>
        ))}
      </ul>
      <div aria-hidden className="grid grid-cols-[1fr_auto] gap-2">
        <span className="grid min-h-10 place-items-center rounded-md bg-charcoal font-body text-note font-semibold text-canvas">Approve with World</span>
        <span className="grid min-h-10 place-items-center rounded-md border border-hairline px-4 font-body text-note font-semibold text-charcoal-soft">Not now</span>
      </div>
    </CardShell>
  );
}

const PARTS: Part[] = [
  {
    id: "pass",
    n: "01",
    icon: "shield",
    label: "Get in",
    title: "Prove your shop, privately",
    body: "Log into the seller dashboard you already use. We check your months of sales and keep nothing else, and your first limit is ready.",
    points: [
      ["calendar", "Country, sales band and 6+ months"],
      ["lock", "We never ask for your name, phone or contacts"],
      ["eye", "We learned nothing else"],
    ],
    theme: "night",
    seed: 11,
    card: <PassCard />,
  },
  {
    id: "sales",
    n: "02",
    icon: "qr",
    label: "Sell",
    title: "Sell like you always do",
    body: "Customers scan your QR and pay in the dollars they hold. Nine parts land with you, one part drips back until the advance is paid off.",
    points: [
      ["swap", "Any token in, dollars out"],
      ["eye", "Customers never see your advance"],
      ["sound", "Every sale read out loud"],
    ],
    theme: "brand",
    seed: 23,
    card: <SaleCard />,
  },
  {
    id: "agent",
    n: "03",
    icon: "agent",
    label: "Restock",
    title: "Let your agent buy the stock",
    body: "Your agent draws a small advance for stock inside the limits you set. Approve once with World. Nothing is drawn until you do.",
    points: [
      ["agent", "Why it drew this, every time"],
      ["shield", "Your agent, your limits"],
      ["pause", "Pause or revoke anytime"],
    ],
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
              <div className="flex flex-col gap-5">
                <span className="flex items-center gap-3">
                  <IconTile name={p.icon} tone="lime" size={44} />
                  <span className="font-ledger text-tag font-medium text-hunter uppercase">
                    {p.n} · {p.label}
                  </span>
                </span>
                <h3 className="m-0 max-w-[18ch] font-display text-[30px] leading-[1.08] font-bold tracking-[-0.03em] text-charcoal md:text-[36px]">{p.title}</h3>
                <p className="m-0 max-w-[44ch] font-body text-read text-charcoal-soft">{p.body}</p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {p.points.map(([icon, pt]) => (
                  <li key={pt} className="flex items-center gap-3 font-body text-read text-charcoal">
                    <IconTile name={icon} size={32} />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn("relative min-h-125 overflow-hidden rounded-[20px] bg-deep md:min-h-150", flip && "md:order-1")}>
              <div aria-hidden className="absolute inset-0">
                <BlockWall cols={8} rows={8} fade="none" theme={p.theme} shapes={BLOCKY} seed={p.seed} density={0.6} grain />
              </div>
              {/* Dark overlay: the pattern stays as texture and the card reads first. */}
              <div aria-hidden className="absolute inset-0 bg-deep/80" />
              <span aria-hidden className="absolute top-5 left-5 z-10">
                <IconTile name={p.icon} tone="dark" size={44} />
              </span>
              <div
                className={cn(
                  "absolute top-[13%] z-10 mx-auto max-w-[580px] transition-transform duration-500 ease-snappy",
                  "[transform:perspective(1400px)_rotateX(22deg)_rotateZ(-9deg)] group-hover:[transform:perspective(1400px)_rotateX(8deg)_rotateZ(-3deg)_translateY(-6px)]",
                  "motion-reduce:transition-none",
                  flip ? "inset-x-[6%] md:right-[9%] md:left-[5%]" : "inset-x-[6%] md:right-[5%] md:left-[9%]",
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
