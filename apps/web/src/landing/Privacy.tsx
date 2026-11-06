"use client";

import { useState } from "react";
import { Label } from "@/final";
import { cn } from "@/lib/cn";
import { CounterGlyph, EyeOffGlyph, LockGlyph } from "./glyphs";
import { RING_ON_HUNTER, Section } from "./primitives";

type View = "phone" | "world";

/* `world` is what the chain shows; rows without it are hidden in world view. */
const ROWS: { label: string; phone: string; world?: string }[] = [
  { label: "Shop", phone: "Kiosco Doña Rosa", world: "shop_7f3a" },
  { label: "Owner", phone: "Rosa Medina" },
  {
    label: "Business record",
    phone: "Argentina · 6+ months of sales",
    world: "Verified, nothing else",
  },
  { label: "Advance", phone: "$100 for stock" },
  { label: "Past advances", phone: "1 paid back · limit $100" },
];

const PROMISES = [
  { icon: LockGlyph, text: "Records stay on your phone, not our servers" },
  { icon: EyeOffGlyph, text: "No name or identity ever goes onchain" },
  { icon: CounterGlyph, text: "Customers never see your advance" },
];

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  const options: { value: View; label: string }[] = [
    { value: "phone", label: "On your phone" },
    { value: "world", label: "What the world sees" },
  ];
  return (
    <div
      role="group"
      aria-label="View"
      className="flex gap-1 self-start rounded-[12px] bg-forest p-1"
    >
      {options.map((o) => {
        const on = view === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 cursor-pointer rounded-md border-0 px-4.5 font-body text-[14px] leading-[normal] font-semibold",
              "transition-colors duration-150 ease-snappy",
              on
                ? "bg-lime text-charcoal"
                : "bg-transparent text-honeydew hover:bg-hunter",
              RING_ON_HUNTER,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LedgerCard({ view }: { view: View }) {
  const world = view === "world";
  return (
    <div className="min-w-0 flex-[1_1_420px] overflow-hidden rounded-xl border border-honeydew/16 bg-forest">
      <div className="flex items-center justify-between gap-3 border-b border-honeydew/14 px-5 py-4.5">
        <span className="font-ledger text-ledger leading-[normal] text-canvas">
          {world ? "shop_7f3a" : "Kiosco Doña Rosa"}
        </span>
        {world ? (
          <Label className="rounded-chip border border-honeydew px-2 py-0.75 text-honeydew">
            Public onchain
          </Label>
        ) : (
          <Label className="rounded-chip bg-lime px-2 py-1 text-charcoal">
            Only you
          </Label>
        )}
      </div>
      <dl className="m-0">
        {ROWS.map((r) => {
          const hidden = world && !r.world;
          return (
            <div
              key={r.label}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-honeydew/10 px-5 py-4.5"
            >
              <Label as="dt" className="text-honeydew">
                {r.label}
              </Label>
              <dd className="m-0">
                {hidden ? (
                  <span className="inline-flex items-center gap-2">
                    {/* Redaction bar: the original text in lime on lime keeps its exact width. */}
                    <span
                      aria-hidden
                      className="rounded-chip bg-lime px-1 py-px text-read leading-[1.1] font-semibold text-lime select-none"
                    >
                      {r.phone}
                    </span>
                    <span className="font-ledger text-tag tracking-[0.1em] text-honeydew uppercase">
                      Hidden
                    </span>
                  </span>
                ) : (
                  <span className="text-right text-read leading-[normal] font-semibold text-canvas">
                    {world ? r.world : r.phone}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p
        aria-live="polite"
        className="m-0 px-5 pt-4 pb-5 text-note text-honeydew"
      >
        {world
          ? "That’s all anyone can read onchain. Nothing else leaves your phone."
          : "Only you see this, on your own phone."}
      </p>
    </div>
  );
}

export function Privacy() {
  const [view, setView] = useState<View>("phone");
  return (
    <Section id="privacy">
      <div className="flex flex-wrap items-start gap-10 rounded-xl bg-hunter p-[clamp(24px,4vw,56px)] text-canvas">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <Label as="p" className="m-0 text-lime">
            Private by default
          </Label>
          <h2 className="m-0 font-display text-[clamp(36px,4.6vw,56px)] leading-none font-bold tracking-[-0.03em]">
            Your books stay closed.{" "}
            <span className="block text-lime">Even onchain.</span>
          </h2>
          <p className="m-0 max-w-110 text-read text-honeydew">
            Being seen with debt is risky. Your records live on your phone, and
            the chain only ever sees a nameless shop. Flip the switch and look
            for yourself.
          </p>
          <ViewToggle view={view} onChange={setView} />
          <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0 text-note leading-[normal] text-honeydew">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5">
                <Icon size={18} className="flex-none text-lime" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <LedgerCard view={view} />
      </div>
    </Section>
  );
}
