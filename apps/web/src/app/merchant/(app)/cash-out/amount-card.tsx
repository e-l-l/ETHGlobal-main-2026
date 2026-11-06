"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CashOutView } from "@repo/sdk";
import { ActionBar, Button, Card, Columns, KeyValue, Label, Ledger, Stack, Text, TextField } from "@/final";
import { CardTitle, DarkBlock, HeroLabel } from "../../_ui";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
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
  const { available, destinations, defaultDestination } = view;
  const cur = useCurrency();
  const [amount, setAmount] = useState(String(available));
  const [dest, setDest] = useState<string>(defaultDestination);
  const send = useMRAAction((m, n: number, d: string) => m.merchant.cashOut(n, d));
  const value = Number(amount) || 0;
  const over = value > available;

  const chosen = destinations.find((d) => d.value === dest);
  const local = cur.dollarsOnly ? formatMoney(value) : cur.approx(value);

  const sendButton = isMock ? (
    <Button href={routes.merchant} width="full" disabled={over || value <= 0}>
      Cash out {formatMoney(value)}
    </Button>
  ) : (
    <Button
      width="full"
      loading={send.pending}
      disabled={over || value <= 0}
      onClick={() => {
        send.run(value, dest).then(
          () => router.push(routes.merchant),
          () => undefined,
        );
      }}
    >
      Cash out {formatMoney(value)}
    </Button>
  );

  return (
    <Columns ratio="3:2">
      <Stack gap="lg">
        <DarkBlock>
          <HeroLabel>Ready to cash out</HeroLabel>
          <span className="font-display text-hero-sm tabular-nums md:text-[52px] md:leading-none">{formatMoney(available)}</span>
          {cur.dollarsOnly ? null : <Ledger className="text-honeydew">{cur.approx(available)} · example rate</Ledger>}
        </DarkBlock>

        <div className="flex flex-col gap-2">
          <TextField
            label="Amount"
            prefix="$"
            inputMode="decimal"
            value={amount}
            className="font-display text-h1"
            error={over ? `You have ${formatMoney(available)} available` : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {cur.dollarsOnly ? <span /> : <Ledger>{local} at today&rsquo;s rate</Ledger>}
            <Button type="button" variant="tonal" size="sm" width="auto" onClick={() => setAmount(String(available))}>
              Max
            </Button>
          </div>
        </div>

        <Stack gap="sm">
          <Label id="send-to">Send it to</Label>
          <div role="radiogroup" aria-labelledby="send-to" className="flex flex-col gap-3">
            {destinations.map((d) => {
              const on = dest === d.value;
              return (
                <label
                  key={d.value}
                  className={cn(
                    "flex min-h-16 cursor-pointer items-center gap-3.5 rounded-lg border p-4 transition-colors duration-150",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-charcoal",
                    on ? "border-hunter bg-honeydew" : "border-hairline bg-surface hover:border-control",
                  )}
                >
                  <input type="radio" name="dest" value={d.value} checked={on} onChange={() => setDest(d.value)} className="sr-only" />
                  <span
                    aria-hidden
                    className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-hunter" : "border-control")}
                  >
                    {on ? <span className="size-2.5 rounded-full bg-hunter" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-body text-read font-semibold text-charcoal">{d.title}</span>
                    <span className="font-body text-note text-charcoal-soft">{d.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Stack>
      </Stack>

      <Stack gap="lg">
        <Card padding="lg">
          <CardTitle>Summary</CardTitle>
          <KeyValue
            rows={[
              ["You send", formatMoney(value)],
              [`${chosen?.title.split(" · ").pop() ?? "They"} gets`, chosen?.value === "usd" ? formatMoney(value) : local],
              ["Fee", <span key="fee" className="text-fern">None</span>],
            ]}
          />
        </Card>
        <ActionBar hint="Demo: transfers are simulated.">{sendButton}</ActionBar>
        <Text size="note" tone="muted">
          Your advance isn&rsquo;t touched. Only the share of each payment that&rsquo;s already yours can be cashed out.
        </Text>
      </Stack>
    </Columns>
  );
}
