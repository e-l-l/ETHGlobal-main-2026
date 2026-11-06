"use client";

import { useEffect, useRef, useState } from "react";
import type { SaleVM } from "@repo/sdk";
import { Ledger, SplitBar, Text, WorldMark } from "@/final";
import { cn } from "@/lib/cn";
import { IconTile } from "@/app/_landing/pixel-icons";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { useWorldView } from "@/lib/world-view";

/**
 * Today's payments (`merchant.home().sales`, local currency, newest first), shown in dollars with each one's split
 * between the shop and the advance. Amounts are public onchain.
 */
export function SalesFeed({
  sales,
  usdToLocal,
  holdback,
  className,
}: {
  sales: SaleVM[];
  /** The SDK's rate for `sales[].total`, used to get back to dollars. */
  usdToLocal: number;
  /** Percent of each payment that goes to the advance; 0 when there's no open advance. */
  holdback: number;
  className?: string;
}) {
  const wv = useWorldView();
  const cur = useCurrency();
  /* Payments that arrive after the first render get the landing moment; the ones already there stay still. */
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = sales.map((s) => String(s.id));
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    if (added.length === 0) return;
    for (const id of added) seen.current.add(id);
    setFresh(new Set(added));
  }, [sales]);
  if (sales.length === 0) {
    return (
      <div className={cn("flex items-center gap-4 px-5 py-6 md:px-7", className)}>
        <IconTile name="shop" size={48} />
        <Text size="note" tone="muted">
          No payments yet today. Show your QR to take the first one.
        </Text>
      </div>
    );
  }
  return (
    <WorldMark kind="pub" show={wv} className={className}>
      <ul aria-label="Today's payments" className="m-0 flex list-none flex-col p-0">
        {sales.map((s) => {
          const usd = s.total / usdToLocal;
          const repay = (usd * holdback) / 100;
          const isNew = fresh.has(String(s.id));
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-2.5 border-t border-hairline px-5 py-4 first:border-t-0 md:px-7",
                isNew && "motion-safe:animate-[sale-in_1400ms_var(--ease-snappy)_both]",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span className="font-display text-h2 text-charcoal tabular-nums">{formatMoney(usd)}</span>
                  {cur.dollarsOnly ? null : <Ledger className="truncate text-charcoal-muted">{cur.format(usd)}</Ledger>}
                </span>
                <Ledger className="shrink-0 text-charcoal-muted">{s.time}</Ledger>
              </div>
              {holdback > 0 ? (
                <>
                  <SplitBar legend={false} holdback={holdback} flash={isNew} />
                  <div className="flex items-center justify-between gap-3 font-body text-note text-charcoal-soft">
                    <span>{formatMoney(usd - repay)} to you</span>
                    <span className="font-semibold text-hunter">{formatMoney(repay)} to advance</span>
                  </div>
                </>
              ) : (
                <span className="font-body text-note text-charcoal-soft">All of it to you</span>
              )}
            </li>
          );
        })}
      </ul>
    </WorldMark>
  );
}
