"use client";

/**
 * "Risk, in public" (L01) and the market's view of DRIP (J01): the lender's "why should I trust this with my
 * dollars?" answered with numbers anyone can check onchain. Aggregate only: no shop is named anywhere.
 * Data: `lender.riskPanel()` / `lender.waterfall()` (live: public chain reads; mock: the SDK's RISK_PANEL / WATERFALL).
 */
import { BarChart, Card, Divider, KeyValue, Label, LossWaterfall, Pill, Spinner, StatGrid, Text, TextLink } from "@/final";
import type { RiskPanelView, RiskTone, WaterfallView } from "@repo/sdk";
import { routes } from "@/lib/routes";
import { Pub } from "./shell";

const tonePill: Record<RiskTone, "saving" | "slow" | "risk" | "locked"> = { ok: "saving", watch: "slow", risk: "risk", none: "locked" };
const triggerPill = {
  armed: { tone: "saving" as const, text: "Armed" },
  fired: { tone: "risk" as const, text: "Fired" },
  not_armed: { tone: "locked" as const, text: "Not armed" },
};

/** Loading / error line inside a card, so the rest of the screen never waits for the log scan. */
export function RiskLoading({ error, what }: { error?: string | undefined; what: string }) {
  return (
    <Card>
      <Label>{what}</Label>
      {error ? (
        <Text size="note" tone="muted" role="alert">
          Couldn&apos;t read the chain just now ({error}). The numbers above are still live.
        </Text>
      ) : (
        <div role="status" className="flex items-center gap-2.5">
          <Spinner size={18} label="Reading public chain data" />
          <Text size="note" tone="muted">
            Reading public chain data…
          </Text>
        </div>
      )}
    </Card>
  );
}

/** Where every number comes from, with links anyone can follow. */
function Provenance({ panel }: { panel: RiskPanelView }) {
  const scan = panel.contracts.filter((c) => c.href);
  return (
    <div className="flex flex-col gap-1">
      <Text size="note" tone="muted">
        Every number here is computed from public chain data: vault balances, the reserve, and AdvanceBook events. No shop is named, and
        nothing comes from a private database.
      </Text>
      <div className="flex flex-wrap gap-x-4">
        <TextLink href={routes.explorer} arrow>
          Explorer
        </TextLink>
        {scan.map((c) => (
          <TextLink key={c.address} href={c.href!} target="_blank" rel="noreferrer">
            {c.label} on Etherscan
          </TextLink>
        ))}
      </div>
    </div>
  );
}

/** The loss waterfall with live amounts, and the one-line headline. */
export function LiveWaterfall({ waterfall, you }: { waterfall: WaterfallView; you: "senior" | "junior" }) {
  return (
    <Card>
      <Label>Who takes a loss first</Label>
      <div className="flex flex-col gap-1">
        <strong className="font-display text-h2 text-charcoal tabular-nums">{waterfall.headline}</strong>
        <Text size="note" tone="muted">
          {waterfall.sub}
        </Text>
      </div>
      <LossWaterfall you={you} layers={waterfall.layers} />
    </Card>
  );
}

/** L01: the full panel. */
export function RiskInPublic({ panel }: { panel: RiskPanelView }) {
  const { defaultRate, repayment, cohort, coverage, market, agent } = panel;
  return (
    <Pub>
      <Card as="section" aria-label="Risk, in public" gap="lg">
        <div className="flex flex-col gap-2">
          <Label>Risk, in public</Label>
          <Provenance panel={panel} />
        </div>

        <StatGrid
          items={[
            { label: "Default rate", value: defaultRate.value, sub: defaultRate.note },
            { label: "Coverage", value: coverage.value, sub: coverage.note },
            { label: "DRIP price", value: market.twap1h !== "—" ? market.twap1h : market.spot, sub: `1h TWAP · ${market.vsBook}` },
            { label: "Risk agent", value: agent.recentlyLowered ? "Lowered" : "Steady", sub: agent.lastChange },
          ]}
        />

        <Divider />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Open advances, by last repaying sale</Label>
            <span className="font-ledger text-ledger text-charcoal-soft">{repayment.open} open</span>
          </div>
          <KeyValue
            rows={repayment.buckets.map((b) => [
              <span key={b.key} className="flex flex-col gap-1">
                <Pill tone={tonePill[b.tone]}>{b.label}</Pill>
                <span className="font-body text-note text-charcoal-muted">{b.rule}</span>
              </span>,
              <span key={`${b.key}-v`} className="flex flex-col items-end">
                <span>{b.count}</span>
                <span className="font-ledger text-ledger font-normal text-charcoal-soft">{b.principal}</span>
              </span>,
            ])}
          />
          <Text size="note" tone="muted">
            {repayment.note}
          </Text>
        </div>

        <Divider />
        <div className="flex flex-col gap-3">
          <Label>Principal repaid, by days since draw</Label>
          {cohort.enough ? (
            <BarChart
              values={cohort.points.map((p) => p.pct ?? 0)}
              labels={cohort.points.map((p) => `Day ${p.day}`)}
              label="Share of principal repaid by day 7, 14 and 30 since draw"
              highlight={[0, 1, 2]}
              height={96}
              format={(v) => `${Math.round(v)}%`}
            />
          ) : null}
          <KeyValue rows={cohort.points.map((p) => [`By day ${p.day}`, p.value])} />
          <Text size="note" tone="muted">
            {cohort.note}
          </Text>
        </div>

        <Divider />
        <MarketView panel={panel} bare />

        <Divider />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Risk agent: limit per tier</Label>
            {agent.recentlyLowered ? <Pill tone="slow">Lowered recently</Pill> : <Pill tone="saving">No recent cut</Pill>}
          </div>
          <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
            {agent.tierCaps.map((t) => (
              <li key={t.tier} className="flex flex-col gap-1 rounded-md bg-well p-3">
                <Label>Tier {t.tier}</Label>
                <strong className="font-display text-h2 tabular-nums text-charcoal">{t.cap}</strong>
                <span className="font-ledger text-ledger text-charcoal-muted">
                  {t.was ? (
                    <>
                      <s>{t.was}</s>{" "}
                    </>
                  ) : null}
                  floor {t.floor}
                </span>
              </li>
            ))}
          </ol>
          <KeyValue
            rows={[
              ["Last limit change", agent.lastChange],
              ["Last risk check", agent.lastCheck],
            ]}
          />
          <Text size="note" tone="muted">
            The agent can only lower caps, never under their floors. A person raises them back.
          </Text>
        </div>

        {panel.approximations.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {panel.approximations.map((a) => (
              <li key={a} className="font-body text-note text-charcoal-muted">
                {a}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </Pub>
  );
}

/** J01 (and inside L01): what the market thinks. `bare` drops the card when nested. */
export function MarketView({ panel, bare }: { panel: RiskPanelView; bare?: boolean }) {
  const { market } = panel;
  const trig = triggerPill[market.trigger.state];
  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>What the market thinks</Label>
        <Pill tone={tonePill[market.tone]}>{market.vsBook}</Pill>
      </div>
      <Text size="read" tone="strong">
        {market.read}
      </Text>
      <KeyValue
        rows={[
          ["Spot price", market.spot],
          ["TWAP, 1 hour", market.twap1h],
          ["TWAP, 24 hours", market.twap24h],
          ["Book value", market.book],
          ["1h vs 24h", market.change1hVs24h],
          [
            `Risk trigger (under ${market.trigger.threshold.toFixed(2)}×)`,
            <Pill key="t" tone={trig.tone}>
              {trig.text}
            </Pill>,
          ],
        ]}
      />
      <Text size="note" tone="muted">
        A price under book means traders expect losses beyond what is already written off. {market.trigger.note}
      </Text>
    </div>
  );
  if (bare) return body;
  return (
    <Pub>
      <Card as="section" aria-label="What the market thinks">
        {body}
      </Card>
    </Pub>
  );
}
