"use client";

import type { SaleVM } from "@repo/sdk";
import { Ledger, SplitBar, Text, WorldMark } from "@/final";
import { formatMoney, formatNumber } from "@/lib/format";
import { useWorldView } from "@/lib/world-view";

/** Today's sales (`merchant.home().sales`), each split between the shop and repayment. Amounts are public onchain. */
export function SalesFeed({ sales, localCurrency, holdback }: { sales: SaleVM[]; localCurrency: string; holdback: number }) {
  const wv = useWorldView();
  if (sales.length === 0) {
    return (
      <Text size="note" tone="muted">
        No sales yet today. Share your QR to take the first one.
      </Text>
    );
  }
  return (
    <WorldMark kind="pub" show={wv}>
      <ul aria-label="Today's sales" className="m-0 flex list-none flex-col p-0">
        {sales.map((s) => {
          const repay = (s.total * holdback) / 100;
          return (
            <li key={s.id} className="flex flex-col gap-2 border-t border-hairline py-3.5 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-h2 text-charcoal tabular-nums">{formatMoney(s.total, localCurrency)}</span>
                <Ledger className="text-charcoal-muted">{s.time}</Ledger>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Ledger>{formatNumber(s.total - repay)} to you</Ledger>
                <Ledger className="text-hunter">{formatNumber(repay)} to repayment</Ledger>
              </div>
              <SplitBar legend={false} />
            </li>
          );
        })}
      </ul>
    </WorldMark>
  );
}
