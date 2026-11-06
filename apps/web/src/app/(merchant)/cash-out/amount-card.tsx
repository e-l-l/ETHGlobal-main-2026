"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CashOutView } from "@repo/sdk";
import { KeyValueList } from "@/components/data";
import { AmountInput, Button, Card, Mono } from "@/components/ui";
import { formatLocal, formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMRAAction } from "@/lib/use-mra";

/** Amount + send. Sending is `merchant.cashOut(amount, destination)` (simulated in every mode). */
export function AmountCard({ view, destination }: { view: CashOutView; destination: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(view.available));
  const send = useMRAAction((m, usd: number, dest: string) => m.merchant.cashOut(usd, dest));
  const value = Number(amount) || 0;
  const { shop } = view;
  return (
    <>
      <Card>
        <AmountInput
          label="Amount"
          unit="USD"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          onMax={() => setAmount(String(view.available))}
        />
        <Mono>{formatLocal(value * shop.usdToLocal, shop.localCurrency)} at today&rsquo;s rate</Mono>
        <KeyValueList
          items={[
            { k: "Available", v: formatMoney(view.available) },
            { k: "Fee", v: "None" },
          ]}
        />
      </Card>
      <div>
        <Button
          loading={send.pending}
          disabled={!(value > 0)}
          onClick={() => {
            send.run(value, destination).then(
              () => router.push(routes.home),
              () => undefined,
            );
          }}
        >
          Send {formatMoney(value)}
        </Button>
      </div>
      {send.error ? <Mono>Not sent ({send.error})</Mono> : null}
    </>
  );
}
