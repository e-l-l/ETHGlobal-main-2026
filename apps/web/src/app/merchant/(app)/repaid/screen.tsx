"use client";

import type { RepaidView } from "@repo/sdk";
import { Button, Card, Columns, KeyValue, Label, Page, PageHead, Pill, Stack, Text, TierMeter } from "@/final";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";

/** M16 Repaid: `merchant.repaid()` (Standing Pass count → tier, and the limits ladder). */
export function RepaidScreen({ initial }: { initial: RepaidView | null }) {
  const { data, error } = useMRA(q.repaid, { initial });
  if (!data) return <MRAState error={error} />;
  const { currentTier, limitsLadder } = data;
  const cap = limitsLadder[currentTier]?.cap ?? 0;

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
            <TierMeter tier={Math.min(3, Math.max(0, currentTier)) as 0 | 1 | 2 | 3} />
            <div className="flex flex-col gap-1">
              <strong className="font-display text-h2 text-charcoal">
                You&rsquo;ve repaid {currentTier} {currentTier === 1 ? "advance" : "advances"}
              </strong>
              <Text size="note">
                Your limit now: <strong className="text-charcoal">{formatMoney(cap)}</strong>
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
