"use client";

import type { RepaidView } from "@repo/sdk";
import { LimitsLadder, PassCard } from "@/components/domain";
import { TwoColumn } from "@/components/layout";
import { Accent, Card, Heading, Label, StatusIcon } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";

/** M16 Repaid: `merchant.repaid()` (Standing Pass + limits ladder). */
export function RepaidScreen({ initial }: { initial: RepaidView | null }) {
  const { data, error } = useMRA(q.repaid, { initial });
  if (!data) return <MRAState error={error} />;
  const { currentTier, limitsLadder } = data;
  const cap = limitsLadder[currentTier]?.cap ?? limitsLadder.at(-1)?.cap ?? 0;
  return (
    <TwoColumn
      main={
        <>
          <StatusIcon kind="ok" />
          <Heading level={1} size="md">
            Repaid. From today, 100% of each sale is <Accent>yours</Accent>.
          </Heading>
          <PassCard
            kind="standing"
            title="Standing Pass"
            privateTag="private"
            headline={`You’ve repaid ${currentTier} ${currentTier === 1 ? "advance" : "advances"}`}
            limitLabel="Your limit now"
            limit={formatMoney(cap)}
            footer="Nobody can see your history. Not even us."
          />
        </>
      }
      side={
        <Card>
          <Label>How your limit grows</Label>
          <LimitsLadder
            currentIndex={currentTier}
            tiers={limitsLadder.map((t, i) => ({
              label: i === currentTier ? `${t.label} · now` : t.label,
              cap: formatMoney(t.cap),
            }))}
          />
        </Card>
      }
    />
  );
}
