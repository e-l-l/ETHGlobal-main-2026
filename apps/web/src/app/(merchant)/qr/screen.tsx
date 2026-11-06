"use client";

import type { MyQrView } from "@repo/sdk";
import { KeyValueList } from "@/components/data";
import { QRCard } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Card, CheckItem, CheckList, Eyebrow, Heading, Label, Pill } from "@/components/ui";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";
import { QrActions } from "./qr-actions";

/** M21 My QR: `merchant.qr()`. */
export function MyQrScreen({ initial }: { initial: MyQrView | null }) {
  const { data, error } = useMRA(q.myQr, { initial });
  if (!data) return <MRAState error={error} />;
  const { shop, today, payLink, howToPay } = data;
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
            value={payLink}
            qrLabel={`QR code to pay ${shop.name}`}
            shopName={shop.name}
            pseudonym={`${shop.pseudonym} · ${payLink}`}
            actions={<QrActions />}
          />
        }
        side={
          <>
            <Card>
              <Eyebrow>How customers pay</Eyebrow>
              <CheckList>
                {howToPay.map((line) => (
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
