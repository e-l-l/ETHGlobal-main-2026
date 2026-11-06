import { Card, CheckIcon, Columns, KeyValue, Label, Ledger, Page, PageHead, Pill, QRCode, Stack } from "@/final";
import { myQr, today } from "@/lib/mock/merchant";
import { shop } from "@/lib/mock/shop";
import { QrActions } from "./qr-actions";

export default function MyQrPage() {
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
          <QRCode value={myQr.payLink} size={208} label={`QR code to pay ${shop.name}`} />
          <div className="flex flex-col gap-1">
            <strong className="font-display text-h2 text-charcoal">{shop.name}</strong>
            <Ledger className="[overflow-wrap:anywhere]">
              {shop.id} · {myQr.payLink}
            </Ledger>
          </div>
          <QrActions />
        </Card>

        <Stack>
          <Card>
            <Label>How customers pay</Label>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {myQr.howToPay.map((line) => (
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
                ["Public ID", shop.id],
                ["Sales today", today.salesCount],
              ]}
            />
          </Card>
        </Stack>
      </Columns>
    </Page>
  );
}
