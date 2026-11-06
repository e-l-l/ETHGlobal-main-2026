"use client";

import type { AdvanceArrivedView } from "@repo/sdk";
import { Button, Card, Columns, KeyValue, Page, Stack, Text, TextLink } from "@/final";
import { etaKnown } from "@/lib/estimate";
import { formatDays, formatLocal, formatMoney, formatPercent } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { BackLink, BigFigure, CardTitle, CheckList, HeroBlock, HeroLabel } from "../../../_ui";

/** M11 Advance arrived: `merchant.arrived()` (the advance + the agent's reasons). */
export function AdvanceArrivedScreen({ initial }: { initial: AdvanceArrivedView | null }) {
  const { data, error } = useMRA(q.arrived, { initial });
  if (!data) return <MRAState error={error} />;
  const { shop, advance, drawReasons } = data;

  return (
    <Page tabs>
      <BackLink href={routes.advance.details}>Your advance</BackLink>

      <HeroBlock>
        <HeroLabel>Your agent drew an advance{advance.drawnAt ? ` · ${advance.drawnAt}` : ""}</HeroLabel>
        <BigFigure as="h1" className="text-balance">
          {formatMoney(advance.drawn)} <span className="text-lime">for {advance.purpose}</span>
        </BigFigure>
        <Text className="max-w-[60ch] text-honeydew md:text-[17px]">
          {formatLocal(advance.drawn * shop.usdToLocal, shop.localCurrency)}. You pay it back with{" "}
          {formatPercent(advance.holdback)} of each payment, and a fee of 0.5% a week while you owe, never more than {formatPercent(advance.maxFeeBps / 100)}.
        </Text>
      </HeroBlock>

      <Columns ratio="3:2">
        <Card padding="lg">
          <CardTitle>Why it drew this</CardTitle>
          {drawReasons.length > 0 ? (
            <CheckList label="Reasons" items={drawReasons.map((r) => ({ text: r }))} />
          ) : (
            <Text size="note">It stayed inside your limits. The full reasoning is in the activity log.</Text>
          )}
          <TextLink href={routes.agent.log} arrow className="w-fit">
            Full activity log
          </TextLink>
        </Card>

        <Stack>
          <Card padding="lg">
            <CardTitle>What you pay back</CardTitle>
            <KeyValue
              rows={[
                ["Owed now", formatMoney(advance.owedNow)],
                ["Fee so far, included", formatMoney(advance.feeSoFar)],
                ["Fee if repaid in 2 weeks", formatMoney(advance.feeIfRepaidIn2Weeks)],
                [`Max fee (${formatPercent(advance.maxFeeBps / 100)})`, formatMoney((advance.drawn * advance.maxFeeBps) / 10_000)],
                ["From each payment", formatPercent(advance.holdback)],
                ...(etaKnown(advance.etaDays) ? [["At your usual pace", formatDays(advance.etaDays)] as [string, string]] : []),
              ]}
            />
          </Card>
          <Button href={routes.advance.details} width="full">
            See your advance
          </Button>
          <Button href={routes.cashOut} variant="secondary" width="full">
            Send to my supplier
          </Button>
        </Stack>
      </Columns>
    </Page>
  );
}
