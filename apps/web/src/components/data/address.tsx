"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { truncateAddress } from "@/lib/format";
import { CheckIcon, CopyIcon } from "@/components/icons";

export type AddressProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  /** Full address or pseudonym (e.g. "shop_7f3a"). */
  value: string;
  /** Skip truncation. */
  full?: boolean;
  copyable?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  onInk?: boolean;
};

/** Truncated mono address `0x7a3e…91c2` with a copy button. */
export function Address({
  value,
  full,
  copyable = true,
  copyLabel = "Copy address",
  copiedLabel = "Copied",
  onInk,
  className,
  ...props
}: AddressProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: ignore */
    }
  };
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 font-mono text-mono", onInk ? "text-on-ink" : "text-ink", className)}
      {...props}
    >
      <span title={value}>{full ? value : truncateAddress(value)}</span>
      {copyable ? (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? copiedLabel : copyLabel}
          className={cn(
            "-my-3 inline-flex size-11 items-center justify-center rounded-md",
            onInk ? "text-on-ink/70 hover:text-on-ink" : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        </button>
      ) : null}
    </span>
  );
}
