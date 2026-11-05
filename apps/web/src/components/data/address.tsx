import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { truncateAddress } from "@/lib/format";
import { CopyButton } from "./copy-button";

export type AddressProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  /** Full address or pseudonym (e.g. "shop_7f3a"). */
  value: string;
  /** Skip truncation. */
  full?: boolean;
  copyable?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
};

/** Truncated mono address `0x7a3e…91c2` with a copy button. Server-rendered; only the button is client. */
export function Address({
  value,
  full,
  copyable = true,
  copyLabel = "Copy address",
  copiedLabel = "Copied",
  className,
  ...props
}: AddressProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-mono text-fg", className)} {...props}>
      <span title={value}>{full ? value : truncateAddress(value)}</span>
      {copyable ? <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} /> : null}
    </span>
  );
}
