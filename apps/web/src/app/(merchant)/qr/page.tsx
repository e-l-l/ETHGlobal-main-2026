import { KeyValueList } from "@/components/data";
import { QRCard } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Card, CheckItem, CheckList, Eyebrow, Heading, Label, Pill } from "@/components/ui";
import { shop } from "@/lib/mock/shop";
import { myQr, today } from "@/lib/mock/merchant";
import { QrActions } from "./qr-actions";

export default function MyQrPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>My QR</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Customers scan this to <Accent>pay</Accent>.
          </Heading>
        }
        aside={
          <Pill tone="tint" dot>
            accepting payments
          </Pill>
        }
      />

      <TwoColumn
        ratio="2:3"
        main={
          <QRCard
            value={myQr.payLink}
            qrLabel={`QR code to pay ${shop.name}`}
            shopName={shop.name}
            pseudonym={`${shop.pseudonym} · ${myQr.payLink}`}
            actions={<QrActions />}
          />
        }
        side={
          <>
            <Card>
              <Eyebrow>How customers pay</Eyebrow>
              <CheckList>
                {myQr.howToPay.map((line) => (
                  <CheckItem key={line}>{line}</CheckItem>
                ))}
              </CheckList>
            </Card>
            <Card>
              <Label>Shop</Label>
              <KeyValueList
                items={[
                  { k: "Name customers see", v: shop.name },
                  { k: "Public ID", v: shop.pseudonym },
                  { k: "Sales today", v: today.salesCount },
                ]}
              />
            </Card>
          </>
        }
      />
    </>
  );
}
