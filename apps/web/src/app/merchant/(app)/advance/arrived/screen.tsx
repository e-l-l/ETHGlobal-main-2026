"use client";

import type { AdvanceArrivedView } from "@repo/sdk";
import { Button, Card, CheckIcon, Columns, KeyValue, Label, Ledger, Page, PageHead, Stack, Text, TextLink } from "@/final";
import { formatLocal, formatMoney, formatPercent } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";

/** M11 Advance arrived: `merchant.arrived()` (the advance + the agent's reasons). */
export function AdvanceArrivedScreen({ initial }: { initial: AdvanceArrivedView | null }) {
  const { data, error } = useMRA(q.arrived, { initial });
  if (!data) return <MRAState error={error} />;
  const { shop, advance, drawReasons } = data;

  return (
    <Page tabs>
      <PageHead
        back={routes.advance.details}
        backLabel="Advance"
        label="Advance arrived"
        title={`Your agent drew ${formatMoney(advance.drawn)} for ${advance.purpose}.`}
      >
        <Ledger>
          {formatLocal(advance.drawn * shop.usdToLocal, shop.localCurrency)}
          {advance.drawnAt ? ` · ${advance.drawnAt}` : ""}
        </Ledger>
      </PageHead>

      <Columns>
        <Stack>
          <Card>
            <KeyValue
              rows={[
                ["You pay back", formatMoney(advance.total)],
                [`${advance.feeLabel} · fixed`, formatMoney(advance.fee)],
                ["From each sale", formatPercent(advance.holdback)],
              ]}
            />
          </Card>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button href={routes.cashOut}>Send to my supplier</Button>
            <Button href={routes.advance.details} variant="secondary">
              See advance details
            </Button>
          </div>
        </Stack>
        <Card>
          <Label>Why it drew this</Label>
          {drawReasons.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {drawReasons.map((r) => (
                <li key={r} className="flex items-start gap-2.5 font-body text-read text-charcoal">
                  <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-honeydew text-hunter">
                    <CheckIcon size={12} />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <Text size="note">It stayed inside your limits. The full reasoning is in the activity log.</Text>
          )}
          <TextLink href={routes.agent.log} arrow>
            full activity log
          </TextLink>
        </Card>
      </Columns>
    </Page>
  );
}
