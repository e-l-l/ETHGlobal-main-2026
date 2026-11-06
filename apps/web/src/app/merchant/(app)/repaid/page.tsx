import { Button, Card, Columns, KeyValue, Label, Page, PageHead, Pill, Stack, Text, TierMeter } from "@/final";
import { formatMoney } from "@/lib/format";
import { currentTier, limitsLadder } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";

export default function RepaidPage() {
  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Advance repaid" title="Repaid. From today, 100% of each sale is yours." />

      <Columns>
        <Stack>
          <Card tone="tint">
            <div className="flex items-center justify-between gap-3">
              <Label>Standing Pass</Label>
              <Pill tone="locked">private</Pill>
            </div>
            <TierMeter tier={currentTier as 0 | 1 | 2 | 3} />
            <div className="flex flex-col gap-1">
              <strong className="font-display text-h2 text-charcoal">
                You&rsquo;ve repaid {currentTier} {currentTier === 1 ? "advance" : "advances"}
              </strong>
              <Text size="note">
                Your limit now: <strong className="text-charcoal">{formatMoney(limitsLadder[currentTier].cap)}</strong>
              </Text>
            </div>
            <Text size="note" tone="muted">
              Nobody can see your history. Not even us.
            </Text>
          </Card>
          <Button href={routes.merchant}>Back to home</Button>
        </Stack>

        <Card>
          <Label>How your limit grows</Label>
          <KeyValue
            rows={limitsLadder.map((t, i) => [
              i === currentTier ? <strong key={t.label}>{t.label} · now</strong> : t.label,
              formatMoney(t.cap),
            ])}
          />
        </Card>
      </Columns>
    </Page>
  );
}
