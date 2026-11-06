"use client";

import { useState } from "react";
import { ActionBar, Button, Card, Columns, KeyValue, Label, Ledger, Stack, Text, TextField } from "@/final";
import { cn } from "@/lib/cn";
import { formatLocal, formatMoney } from "@/lib/format";
import { cashOut } from "@/lib/mock/merchant";
import { shop, toLocal } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";

/** Local-only state; nothing is sent yet. */
export function CashOutForm() {
  const [amount, setAmount] = useState(String(cashOut.available));
  const [dest, setDest] = useState<string>(cashOut.defaultDestination);
  const value = Number(amount) || 0;
  const over = value > cashOut.available;

  return (
    <>
      <Columns ratio="2:3">
        <Card>
          <TextField
            label="Amount"
            prefix="$"
            inputMode="decimal"
            value={amount}
            error={over ? `You have ${formatMoney(cashOut.available)} available` : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
          <div>
            <Button type="button" variant="tonal" size="sm" onClick={() => setAmount(String(cashOut.available))}>
              Max
            </Button>
          </div>
          <Ledger>{formatLocal(toLocal(value), shop.localCurrency)} at today&rsquo;s rate</Ledger>
          <KeyValue
            rows={[
              ["Available", formatMoney(cashOut.available)],
              ["Fee", "None"],
            ]}
          />
        </Card>

        <Stack gap="sm">
          <Label id="send-to">Send to</Label>
          <div role="radiogroup" aria-labelledby="send-to" className="flex flex-col gap-3">
            {cashOut.destinations.map((d) => {
              const on = dest === d.value;
              return (
                <label
                  key={d.value}
                  className={cn(
                    "flex min-h-16 cursor-pointer flex-col justify-center gap-0.5 rounded-lg border p-4 transition-colors duration-150",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-charcoal",
                    on ? "border-hunter bg-honeydew" : "border-hairline bg-surface hover:border-control",
                  )}
                >
                  <input type="radio" name="dest" value={d.value} checked={on} onChange={() => setDest(d.value)} className="sr-only" />
                  <span className="font-body text-read font-semibold text-charcoal">{d.title}</span>
                  <span className="font-body text-note text-charcoal-muted">{d.description}</span>
                </label>
              );
            })}
          </div>
          <Text size="note" tone="muted">
            demo: transfers are simulated
          </Text>
        </Stack>
      </Columns>

      <ActionBar>
        <Button href={routes.merchant} disabled={over || value <= 0}>
          Send {formatMoney(value)}
        </Button>
      </ActionBar>
    </>
  );
}
