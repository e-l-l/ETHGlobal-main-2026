"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { iconButtonClass } from "@/components/ui/button";

export type CopyButtonProps = {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
};

/** Small client leaf: copies `value`, shows a check for 1.5s. */
export function CopyButton({ value, label, copiedLabel, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return; // clipboard unavailable
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" onClick={copy} aria-label={copied ? copiedLabel : label} className={cn(iconButtonClass, "-my-3", className)}>
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
    </button>
  );
}
