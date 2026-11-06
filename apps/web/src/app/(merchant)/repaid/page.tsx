import { LimitsLadder, PassCard } from "@/components/domain";
import { TwoColumn } from "@/components/layout";
import { Accent, Card, Heading, Label, StatusIcon } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { currentTier, limitsLadder } from "@/lib/mock/shop";

export default function RepaidPage() {
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
            limit={formatMoney(limitsLadder[currentTier].cap)}
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
