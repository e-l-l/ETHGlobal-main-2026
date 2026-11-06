"use client";

import { Ledger, SplitBar, WorldMark } from "@/final";
import { formatMoney, formatNumber } from "@/lib/format";
import { sales, splitSale } from "@/lib/mock/merchant";
import { shop } from "@/lib/mock/shop";
import { useWorldView } from "@/lib/world-view";

/** Today's sales, each split between the shop and repayment. Amounts are public onchain. */
export function SalesFeed() {
  const wv = useWorldView();
  return (
    <WorldMark kind="pub" show={wv}>
      <ul aria-label="Today's sales" className="m-0 flex list-none flex-col p-0">
        {sales.map((s) => {
          const split = splitSale(s.total);
          return (
            <li key={s.id} className="flex flex-col gap-2 border-t border-hairline py-3.5 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-h2 text-charcoal tabular-nums">{formatMoney(s.total, shop.localCurrency)}</span>
                <Ledger className="text-charcoal-muted">{s.time}</Ledger>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Ledger>{formatNumber(split.you)} to you</Ledger>
                <Ledger className="text-hunter">{formatNumber(split.repay)} to repayment</Ledger>
              </div>
              <SplitBar legend={false} />
            </li>
          );
        })}
      </ul>
    </WorldMark>
  );
}
