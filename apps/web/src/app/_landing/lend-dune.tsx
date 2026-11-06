"use client";

import { useRef } from "react";
import { DripField } from "./drip-field";
import { useLive } from "./use-live";

/** The lenders' view of the pool: fees dripping into a dune of pooled dollars. */
export function LendDune({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  return (
    <div ref={ref} className={className}>
      <DripField running={live.running} center={0.7} spread={0.2} fill={0.55} className="size-full" />
    </div>
  );
}
