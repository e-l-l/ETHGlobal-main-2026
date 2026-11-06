"use client";

import type { MyQrView } from "@repo/sdk";
import { Card, CheckIcon, Columns, KeyValue, Label, Ledger, Page, PageHead, Pill, QRCode, Stack } from "@/final";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";
import { QrActions } from "./qr-actions";

/** The live pay link carries the bytes32 shop id (`…?shop=0x…&name=…`): show its start and end, copy the whole thing. */
function shortLink(link: string, max = 44) {
  if (link.length <= max) return link;
  return `${link.slice(0, max - 13)}…${link.slice(-12)}`;
}

/** M21 My QR: `merchant.qr()`. The QR encodes the full pay link (C01 for this shop). */
export function MyQrScreen({ initial }: { initial: MyQrView | null }) {
  const { data, error } = useMRA(q.myQr, { initial });
  if (!data) return <MRAState error={error} />;
  const { shop, today, payLink, howToPay } = data;

  return (
    <Page tabs>
      <PageHead
        label="My QR"
        title="Customers scan this to pay."
        actions={
          <Pill tone="saving" dot>
            accepting payments
          </Pill>
        }
      />

      <Columns ratio="2:3">
        <Card className="items-center text-center">
          <QRCode value={payLink} size={208} label={`QR code to pay ${shop.name}`} />
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <strong className="font-display text-h2 text-charcoal">{shop.name}</strong>
            <Ledger className="[overflow-wrap:anywhere]" title={payLink}>
              {shop.pseudonym} · {shortLink(payLink)}
            </Ledger>
          </div>
          <QrActions payLink={payLink} />
        </Card>

        <Stack>
          <Card>
            <Label>How customers pay</Label>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {howToPay.map((line) => (
                <li key={line} className="flex items-start gap-2.5 font-body text-read text-charcoal">
                  <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-honeydew text-hunter">
                    <CheckIcon size={12} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <Label>Shop</Label>
            <KeyValue
              rows={[
                ["Name customers see", shop.name],
                ["Public ID", shop.pseudonym],
                ["Sales today", today.salesCount],
              ]}
            />
          </Card>
        </Stack>
      </Columns>
    </Page>
  );
}
