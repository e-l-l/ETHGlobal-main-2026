"use client";

import type { ReactNode } from "react";
import { WorldMark } from "@/final";
import { useWorldView } from "@/lib/world-view";

/** Agent limits and the mandate are private, on-device. */
export function PrivateMark({ children, className }: { children: ReactNode; className?: string }) {
  const wv = useWorldView();
  return (
    <WorldMark kind="priv" show={wv} className={className}>
      {children}
    </WorldMark>
  );
}
