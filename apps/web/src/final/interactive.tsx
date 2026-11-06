"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/cn";
import { CheckIcon, CopyIcon } from "./icons";
import { Ledger } from "./text";

/* ----------------------------------------------------------------- QRCode */

export function QRCode({ value, size = 176, label, className }: { value: string; size?: number; label: string; className?: string }) {
  return (
    <div className={cn("inline-grid place-items-center rounded-lg border border-hairline bg-surface p-4 text-charcoal", className)}>
      <QRCodeSVG value={value} size={size} level="M" fgColor="currentColor" bgColor="transparent" role="img" aria-label={label} />
    </div>
  );
}

/* --------------------------------------------------------------- CopyHash */

export function CopyHash({ value, short }: { value: string; short?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = short ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <span className="inline-flex items-center gap-1">
      <Ledger className="[overflow-wrap:anywhere]">{text}</Ledger>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-charcoal-muted hover:bg-well hover:text-charcoal"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            },
            () => undefined,
          )
        }
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </button>
    </span>
  );
}

/* ----------------------------------------------------------------- Keypad
 * For money on phones: keeps the amount and the button in view (a native keyboard hides them).
 */
export function pressKey(value: string, key: string, { decimals = 2, maxInt = 6 } = {}) {
  if (key === "del") return value.slice(0, -1);
  if (key === ".") {
    if (decimals === 0 || value.includes(".")) return value;
    return value === "" ? "0." : `${value}.`;
  }
  const [int = "", dec] = value.split(".");
  if (dec !== undefined) return dec.length >= decimals ? value : value + key;
  if (int === "0") return key;
  if (int.length >= maxInt) return value;
  return value + key;
}

/** "$1,234.5" while typing: keeps what was typed, groups the whole part. */
export function typedUsd(v: string) {
  if (!v) return "$0";
  const [int = "0", dec] = v.split(".");
  return `$${Number(int).toLocaleString("en-US")}${dec !== undefined ? `.${dec}` : ""}`;
}

export function Keypad({ value, onChange, decimals = 2, label = "Amount keypad" }: { value: string; onChange: (v: string) => void; decimals?: number; label?: string }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimals > 0 ? "." : "", "0", "del"];
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} aria-hidden />
        ) : (
          <button
            key={k}
            type="button"
            aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
            onClick={() => onChange(pressKey(value, k, { decimals }))}
            className="min-h-14 cursor-pointer rounded-md bg-surface font-display text-h2 text-charcoal transition-[transform,background-color] duration-200 ease-snappy select-none hover:-translate-y-px hover:bg-honeydew active:scale-[0.92] active:bg-lime/40 motion-reduce:transform-none"
          >
            {k === "del" ? "⌫" : k}
          </button>
        ),
      )}
    </div>
  );
}
