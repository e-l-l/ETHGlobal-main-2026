"use client";

import type { MyQrView } from "@repo/sdk";
import { Card, Columns, Ledger, Page, PageHead, Pill, QRCode, Stack } from "@/final";
import { CardTitle, HunterPanel, NumberedList, PlainWords } from "../../_ui";
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
    <Page tabs dense>
      <PageHead
        label="Your checkout"
        title="My QR"
        actions={
          <Pill tone="saving" dot>
            accepting payments
          </Pill>
        }
      />

      <Columns ratio="3:2">
        <Stack>
          <HunterPanel bodyClassName="items-center gap-0 px-5 py-8 md:px-6 lg:py-5">
            <div className="flex w-full max-w-85 flex-col items-center gap-4 rounded-lg bg-surface p-5 text-center">
              <QRCode value={payLink} size={208} label={`QR code to pay ${shop.name}`} className="border-0 p-0" />
              <div className="flex min-w-0 max-w-full flex-col gap-0.5">
                <strong className="font-display text-h1-sm text-charcoal">{shop.name}</strong>
                <span className="font-body text-note text-charcoal-muted">Scan to pay in dollars (USDC)</span>
              </div>
            </div>
          </HunterPanel>
          <QrActions payLink={payLink} />
          <Ledger className="rounded-md bg-well px-3.5 py-3 [overflow-wrap:anywhere]" title={payLink}>
            {shop.pseudonym} · {shortLink(payLink)}
          </Ledger>
        </Stack>

        <Stack gap="md">
          <Card padding="md">
            <CardTitle>How customers pay</CardTitle>
            <NumberedList label="How customers pay" items={howToPay} />
          </Card>
          <PlainWords label="Private">
            Checkout shows customers only your shop name. Payments and the advance are public onchain under your pseudonymous shop ID, never your name. {today.salesCount}{" "}
            {today.salesCount === 1 ? "payment" : "payments"} today.
          </PlainWords>
        </Stack>
      </Columns>
    </Page>
  );
}
