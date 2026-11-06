"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, JarMark, Switch } from "@/final";
import { cn } from "@/lib/cn";
import { advance, agentLimits, limitsLadder, shop, toLocal } from "@/lib/mock/shop";
import { PixelBar, Waffle } from "./blocky";

/*
 * A day at Block Bodega, as a wall of widgets: the whole merchant app at a glance.
 * Two widgets answer the pointer: the announcement plays the sale out loud, and the agent switch pauses it.
 */

const ars = (usd: number) => Math.round(toLocal(usd)).toLocaleString("es-AR");

function Widget({ label, span, dark, className, children }: { label: string; span?: boolean; dark?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex min-h-48 flex-col gap-3 overflow-hidden rounded-[24px] p-4 md:p-5",
        "transition-transform duration-200 ease-snappy hover:-translate-y-0.5",
        dark ? "bg-charcoal text-canvas" : "border border-hairline bg-surface text-charcoal shadow-lift",
        span && "col-span-2",
        className,
      )}
    >
      <span className={cn("inline-flex items-center gap-1.5 font-ledger text-[11px] uppercase", dark ? "text-honeydew/70" : "text-charcoal-muted")}>
        <i aria-hidden className={cn("size-1.5 rounded-[1px]", dark ? "bg-lime" : "bg-hunter")} />
        {label}
      </span>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- Widgets */

function SalesToday() {
  const today = 71.6;
  const usual = 100;
  return (
    <Widget label="Sales today">
      <div className="flex flex-col">
        <span className="font-display text-amount tabular-nums">${today.toFixed(2)}</span>
        <span className="font-ledger text-[12px] text-charcoal-muted">≈ ARS {ars(today)}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <PixelBar value={today / usual} cells={14} className="h-6" />
        <span className="flex justify-between font-ledger text-[11px] text-charcoal-muted">
          <span>$0</span>
          <span>usual day ${usual}</span>
        </span>
      </div>
    </Widget>
  );
}

function Announcement() {
  const [playing, setPlaying] = useState(false);
  const line = "Recibiste 10 dólares, 1 fue a tu adelanto";
  function play() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.lang = "es-AR";
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }
  return (
    <Widget label="Now announcing" span>
      <div className="flex flex-1 items-center gap-4">
        <div className="relative grid size-24 shrink-0 place-items-center rounded-2xl bg-hunter md:size-28">
          <JarMark size={52} on="dark" lit={1} loading={playing} />
          <span aria-hidden className="absolute right-2.5 bottom-2.5 size-3.5 rounded-[3px] bg-lime" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span lang="es-AR" className="font-display text-h2 text-balance">&ldquo;Recibiste 10 dólares, 1 fue a tu adelanto&rdquo;</span>
          <span className="font-body text-note text-charcoal-muted">{shop.name} · every sale, read out loud</span>
          <div className="mt-2 h-1.5 overflow-hidden bg-well" aria-hidden>
            <span
              className={cn("block h-full origin-left bg-hunter", playing ? "scale-x-100 transition-transform duration-[3000ms] ease-linear" : "scale-x-[0.12] transition-transform duration-200")}
            />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={play}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-charcoal px-4 font-body text-note font-semibold text-canvas transition-transform duration-150 ease-snappy hover:scale-[1.02] active:scale-[0.97]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 4.5v15l13-7.5z" />
              </svg>
              {playing ? "Playing" : "Hear a sale"}
            </button>
          </div>
        </div>
      </div>
    </Widget>
  );
}

function RepaidDial() {
  return (
    <Widget label="Advance">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-h1 tabular-nums">{advance.pct}%</span>
        <span className="font-ledger text-[11px] text-charcoal-muted">repaid</span>
      </div>
      <Waffle value={advance.pct / 100} cols={10} rows={6} label={`${advance.pct}% of the advance repaid`} className="mt-auto" />
      <span className="font-body text-note text-charcoal-soft">
        ${advance.repaid} of ${advance.total} · ${advance.fee} flat fee
      </span>
    </Widget>
  );
}

function Week() {
  const days = [31, 29, 12, 9, 27, 34, 30];
  const max = Math.max(...days);
  return (
    <Widget label="This week">
      <div className="flex flex-col">
        <span className="font-display text-h1 tabular-nums">${days.reduce((a, b) => a + b, 0)}</span>
        <span className="font-ledger text-[11px] text-charcoal-muted">slow mid-week, no penalty</span>
      </div>
      <div className="mt-auto flex h-20 items-end gap-1.5" aria-label="Sales by day: a slow Wednesday and Thursday" role="img">
        {days.map((d, i) => (
          <span key={i} className="flex h-full flex-1 flex-col justify-end gap-0.5">
            <span className={cn("block rounded-[4px]", i === 6 ? "bg-hunter" : i === 2 || i === 3 ? "bg-unlit" : "bg-leaf")} style={{ height: `${(d / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <span aria-hidden className="flex justify-between font-ledger text-[10px] text-charcoal-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex-1 text-center">{d}</span>
        ))}
      </span>
    </Widget>
  );
}

function Timeline() {
  const items = [
    { t: "9:12", title: `Agent drew $${advance.drawn} for stock`, sub: "Cash was low before Thursday's restock", chip: "Agent" },
    { t: "10:14", title: "Sale, $10.00", sub: "$1.00 to the advance" },
    { t: "Thu", title: "Supplier paid directly", sub: "The advance pays for stock, never cash" },
  ];
  return (
    <Widget label="Repayment" span>
      <div className="flex flex-1 flex-col gap-5 sm:flex-row">
        <div className="flex shrink-0 flex-col justify-between sm:w-36">
          <span className="font-display text-[64px] leading-none font-bold tracking-[-0.04em] tabular-nums">{advance.etaDays}</span>
          <span className="flex flex-col">
            <span className="font-body text-read font-semibold">days to go</span>
            <span className="font-body text-note text-charcoal-muted">at your usual pace</span>
          </span>
        </div>
        <ol className="m-0 flex flex-1 list-none flex-col gap-3 p-0">
          {items.map((it) => (
            <li key={it.t} className="flex gap-3">
              <span className="w-10 shrink-0 pt-0.5 font-ledger text-[11px] text-charcoal-muted">{it.t}</span>
              <span className="flex min-w-0 flex-1 flex-col border-l-2 border-hunter pl-3">
                <span className="flex items-center justify-between gap-2 font-body text-note font-semibold">
                  {it.title}
                  {it.chip ? <span className="rounded-[4px] bg-hunter px-2 py-0.5 font-ledger text-[10px] text-canvas">{it.chip}</span> : null}
                </span>
                <span className="font-body text-[12px] text-charcoal-muted">{it.sub}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Widget>
  );
}

function AgentToggle() {
  const [on, setOn] = useState(true);
  return (
    <Widget label="Your agent" dark>
      <span aria-hidden className={cn("pointer-events-none absolute right-3 bottom-3 grid grid-cols-5 gap-[3px] transition-opacity duration-300", on ? "opacity-100" : "opacity-20")}>
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={cn("size-2.5 rounded-[1px]", (i % 5) + Math.floor(i / 5) >= 4 ? "bg-lime" : "bg-transparent")} />
        ))}
      </span>
      <span className="relative grid size-10 place-items-center rounded-md bg-deep">
        <JarMark size={22} on="dark" />
      </span>
      <span className="relative font-display text-h1">{on ? "On" : "Paused"}</span>
      <span className="relative font-body text-note text-honeydew/80">{on ? `Draws up to $${agentLimits.perAdvance} for stock` : "Nothing will be drawn"}</span>
      <Switch
        checked={on}
        onCheckedChange={setOn}
        aria-label="Agent on"
        className="relative mt-auto data-[state=checked]:bg-lime data-[state=unchecked]:bg-sage"
      />
    </Widget>
  );
}

function PassWidget() {
  return (
    <Widget label="Business Pass">
      <span className="grid size-9 place-items-center rounded-md bg-hunter text-lime">
        <CheckIcon size={18} strokeWidth={3} />
      </span>
      <span className="font-display text-h1">{shop.country}</span>
      <span className="font-ledger text-[12px] text-charcoal-soft uppercase">
        Band {shop.band} · {shop.months}
      </span>
      <span className="mt-auto font-body text-note text-charcoal-muted">We learned nothing else.</span>
    </Widget>
  );
}

function SwapWidget() {
  return (
    <Widget label="Customer pays">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-control px-3 py-1 font-ledger text-[12px] font-semibold">USDT</span>
        <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden className="text-hunter">
          <path d="M0 6h24M19 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="rounded-md bg-hunter px-3 py-1 font-ledger text-[12px] font-semibold text-canvas">USDC</span>
      </div>
      <span className="font-display text-h1 tabular-nums">$10.00</span>
      <span className="mt-auto font-body text-note text-charcoal-muted">Any token, swapped through Uniswap. Customers never see the advance.</span>
    </Widget>
  );
}

function Limits() {
  const rows = [
    { k: "Per advance", v: agentLimits.perAdvance, max: limitsLadder[3].cap },
    { k: "Per month", v: agentLimits.perMonth, max: limitsLadder[3].cap },
  ];
  return (
    <Widget label="Your limits" span>
      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center gap-3">
            <span className="w-24 shrink-0 font-body text-note font-semibold">{r.k}</span>
            <PixelBar value={r.v / r.max} cells={20} className="h-3 flex-1" />
            <span className="w-12 shrink-0 text-right font-display text-h2 tabular-nums">${r.v}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 font-body text-note font-semibold">Only for</span>
          {["Stock", "Rent", "Repairs"].map((p) => (
            <span key={p} className={cn("rounded-md px-3 py-1 font-body text-[13px] font-semibold", p === "Stock" ? "bg-hunter text-canvas" : "border border-hairline text-charcoal-muted")}>
              {p}
            </span>
          ))}
        </div>
      </div>
      <span className="mt-auto font-body text-note text-charcoal-muted">Approved once with World ID. Lower, pause or revoke any time.</span>
    </Widget>
  );
}

export function Bento() {
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <SalesToday />
      <Announcement />
      <RepaidDial />
      <PassWidget />
      <Timeline />
      <AgentToggle />
      <SwapWidget />
      <Week />
      <Limits />
    </div>
  );
}
