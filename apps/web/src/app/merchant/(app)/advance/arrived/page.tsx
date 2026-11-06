import { Button, Card, CheckIcon, Columns, KeyValue, Label, Ledger, Page, PageHead, Stack, TextLink } from "@/final";
import { formatLocal, formatMoney, formatPercent } from "@/lib/format";
import { drawReasons } from "@/lib/mock/merchant";
import { advance, shop, toLocal } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";

export default function AdvanceArrivedPage() {
  return (
    <Page tabs>
      <PageHead
        back={routes.advance.details}
        backLabel="Advance"
        label="Advance arrived"
        title={`Your agent drew ${formatMoney(advance.drawn)} for ${advance.purpose}.`}
      >
        <Ledger>
          {formatLocal(toLocal(advance.drawn), shop.localCurrency)} · {advance.drawnAt}
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
          <TextLink href={routes.agent.log} arrow>
            full activity log
          </TextLink>
        </Card>
      </Columns>
    </Page>
  );
}
