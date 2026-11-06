"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CashOutView } from "@repo/sdk";
import { ActionBar, Button, Card, Columns, KeyValue, Label, Ledger, Stack, Text, TextField } from "@/final";
import { cn } from "@/lib/cn";
import { formatLocal, formatMoney } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

/** M18: `merchant.cashOutView()`. The transfer itself is simulated in every mode (`merchant.cashOut`). */
export function CashOutForm({ initial }: { initial: CashOutView | null }) {
  const { data, error } = useMRA(q.cashOut, { initial });
  if (!data) return <MRAState error={error} />;
  return <CashOutFields view={data} />;
}

function CashOutFields({ view }: { view: CashOutView }) {
  const router = useRouter();
  const { shop, available, destinations, defaultDestination } = view;
  const [amount, setAmount] = useState(String(available));
  const [dest, setDest] = useState<string>(defaultDestination);
  const send = useMRAAction((m, n: number, d: string) => m.merchant.cashOut(n, d));
  const value = Number(amount) || 0;
  const over = value > available;

  return (
    <>
      <Columns ratio="2:3">
        <Card>
          <TextField
            label="Amount"
            prefix="$"
            inputMode="decimal"
            value={amount}
            error={over ? `You have ${formatMoney(available)} available` : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
          <div>
            <Button type="button" variant="tonal" size="sm" onClick={() => setAmount(String(available))}>
              Max
            </Button>
          </div>
          <Ledger>{formatLocal(value * shop.usdToLocal, shop.localCurrency)} at today&rsquo;s rate</Ledger>
          <KeyValue
            rows={[
              ["Available", formatMoney(available)],
              ["Fee", "None"],
            ]}
          />
        </Card>

        <Stack gap="sm">
          <Label id="send-to">Send to</Label>
          <div role="radiogroup" aria-labelledby="send-to" className="flex flex-col gap-3">
            {destinations.map((d) => {
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
        {isMock ? (
          <Button href={routes.merchant} disabled={over || value <= 0}>
            Send {formatMoney(value)}
          </Button>
        ) : (
          <Button
            loading={send.pending}
            disabled={over || value <= 0}
            onClick={() => {
              send.run(value, dest).then(
                () => router.push(routes.merchant),
                () => undefined,
              );
            }}
          >
            Send {formatMoney(value)}
          </Button>
        )}
      </ActionBar>
    </>
  );
}
