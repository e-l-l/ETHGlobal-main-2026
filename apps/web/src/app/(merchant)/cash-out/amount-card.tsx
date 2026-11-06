"use client";

import { useState } from "react";
import { KeyValueList } from "@/components/data";
import { AmountInput, Button, Card, Mono } from "@/components/ui";
import { formatLocal, formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { shop, toLocal } from "@/lib/mock/shop";
import { cashOut } from "@/lib/mock/merchant";

/** Local-only amount state; nothing is sent yet. */
export function AmountCard() {
  const [amount, setAmount] = useState(String(cashOut.available));
  const value = Number(amount) || 0;
  return (
    <>
      <Card>
        <AmountInput
          label="Amount"
          unit="USD"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          onMax={() => setAmount(String(cashOut.available))}
        />
        <Mono>{formatLocal(toLocal(value), shop.localCurrency)} at today&rsquo;s rate</Mono>
        <KeyValueList
          items={[
            { k: "Available", v: formatMoney(cashOut.available) },
            { k: "Fee", v: "None" },
          ]}
        />
      </Card>
      <div>
        <Button href={routes.home}>Send {formatMoney(value)}</Button>
      </div>
    </>
  );
}
