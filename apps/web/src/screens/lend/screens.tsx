"use client";

import {
  ActionBar,
  ActivityList,
  Banner,
  Button,
  Card,
  Columns,
  DataTable,
  Heading,
  Label,
  LedgerGrid,
  LineChart,
  ListRow,
  LossWaterfall,
  Money,
  PageHead,
  LenderDisclosure,
  Pill,
  RowList,
  Stack,
  StatGrid,
  Text,
  TokenBadge,
} from "@/final";
import type { EarnView, JuniorView, PositionView, ProtocolView, RiskPanelView, RiskView, WaterfallView } from "@repo/sdk";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { LendShell, Pub } from "./shell";
import { LiveWaterfall, MarketView, RiskInPublic, RiskLoading } from "./risk";
import { reasonLines, vaultNumbers } from "./vault";

const pct = (a: number, b: number) => `${(((b - a) / b) * 100).toFixed(1)}%`;
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const price = (v: number) => `$${v.toFixed(3)}`;

/* ------------------------------------------------------------------ L01 Earn */
export function EarnScreen({ initial, initialRisk }: { initial: EarnView | null; initialRisk?: { panel: RiskPanelView; waterfall: WaterfallView } | null }) {
  const { data, error } = useMRA(q.earn, { initial });
  const risk = useMRA(q.earnRisk, { initial: initialRisk ?? null });
  if (!data) return <MRAState error={error} />;
  const VAULT = data.vault;
  const wroteOff = VAULT.writtenOff !== "$0" && VAULT.writtenOff !== "—";
  return (
    <LendShell note="Vault totals and positions are onchain. Lenders never see a shop's books or who owns it.">
      <LenderDisclosure />
      <PageHead label="Senior vault" title="Earn">
        Lend dollars to real shops.
      </PageHead>
      <Columns ratio="3:2">
        <Stack gap="lg">
          <Pub>
            <LedgerGrid>
              <div className="flex items-center justify-between gap-3">
                <span className="font-ledger text-tag font-medium uppercase text-honeydew/80">Vault APY</span>
                <Pill tone="saving" className="bg-lime text-charcoal">
                  Senior
                </Pill>
              </div>
              <span className="font-display text-hero-sm tabular-nums text-lime md:text-hero">{VAULT.apy}</span>
              <span className="font-ledger text-ledger text-honeydew/85">a year, from shop fees. Not promised.</span>
              <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 font-body text-note text-honeydew">
                <span>Lent out {VAULT.totalLent}</span>
                <span>Defaults {VAULT.defaultRate}</span>
              </div>
            </LedgerGrid>
          </Pub>
          <Stack>
            <RowList>
              <ListRow
                href={routes.position}
                title="Your position"
                sub={`${VAULT.positionEarned} earned`}
                end={VAULT.positionValue}
              />
            </RowList>
            <div className="flex flex-col gap-2 md:flex-row">
              <Button href={routes.deposit}>Deposit</Button>
              <Button href={`${routes.deposit}?side=withdraw`} variant="secondary">
                Withdraw
              </Button>
            </div>
          </Stack>
        </Stack>
        <Stack gap="lg">
          {isMock ? (
            <Banner>A shop stopped selling. Junior took the $100 loss. Senior was not touched.</Banner>
          ) : wroteOff ? (
            <Banner>Written off so far: {VAULT.writtenOff}. Junior and the reserve absorb a loss before senior does.</Banner>
          ) : null}
          {risk.data ? (
            <LiveWaterfall waterfall={risk.data.waterfall} you="senior" />
          ) : (
            <Card>
              <Label>Who takes a loss first</Label>
              <LossWaterfall you="senior" />
            </Card>
          )}
        </Stack>
      </Columns>
      {risk.data ? <RiskInPublic panel={risk.data.panel} /> : <RiskLoading what="Risk, in public" error={risk.error} />}
    </LendShell>
  );
}

/* -------------------------------------------------------------- L03 Position */
export function PositionScreen({ initial }: { initial: PositionView | null }) {
  const { data, error } = useMRA(q.position, { initial });
  if (!data) return <MRAState error={error} />;
  const { vault, seniorSeries, positionActivity } = data;
  const VAULT = vaultNumbers(vault);
  return (
    <LendShell note="Your shares are onchain under this wallet. Nothing ties the wallet to your name.">
      <PageHead back={routes.earn} backLabel="Earn" label="Senior vault" title="My position" />
      <Columns ratio="2:3">
        <Stack gap="lg">
          <Pub>
            <Card>
              <Label>Value</Label>
              <Money usd={VAULT.positionValue} />
              <Text size="note" tone="muted">
                {vault.positionEarned} earned · {vault.positionShares} shares
              </Text>
            </Card>
          </Pub>
          <StatGrid
            items={[
              { label: "Withdraw now", value: vault.availableToWithdraw, sub: "cash in the vault" },
              { label: "In advances", value: usd2(Math.max(0, VAULT.positionValue - VAULT.availableToWithdraw)), sub: "back as shops repay" },
            ]}
          />
        </Stack>
        <Stack gap="lg">
          <Pub>
            <Card>
              <div className="flex items-center justify-between gap-3">
                <Label>Share value, 12 weeks</Label>
                <span className="font-ledger text-ledger text-charcoal">{vault.sharePrice}</span>
              </div>
              <LineChart
                points={seniorSeries}
                height={160}
                label={isMock ? "Share value rising steadily over 12 weeks, flat through the write-off" : "Share value over time"}
                xLabels={["12 weeks ago", "Now"]}
                format={(v) => `$${(v / 100).toFixed(3)}`}
              />
            </Card>
          </Pub>
          <Heading level={2} size="h2">
            Activity
          </Heading>
          <DataTable
            caption="Position activity"
            rows={[...positionActivity]}
            rowKey={(a, i) => `${a.what}-${i}`}
            columns={[
              { key: "what", label: "What", render: (a) => a.what },
              { key: "when", label: "When", render: (a) => a.when },
              { key: "amount", label: "Amount", align: "right", render: (a) => a.amount },
            ]}
          />
        </Stack>
      </Columns>
      <ActionBar>
        <Button href={routes.deposit}>Deposit more</Button>
        <Button href={`${routes.deposit}?side=withdraw`} variant="secondary">
          Withdraw
        </Button>
      </ActionBar>
    </LendShell>
  );
}

/* ---------------------------------------------------------------- J01 Junior */
export function JuniorScreen({ initial, initialPanel }: { initial: JuniorView | null; initialPanel?: RiskPanelView | null }) {
  const { data, error } = useMRA(q.junior, { initial });
  const panel = useMRA(q.riskPanel, { initial: initialPanel ?? null });
  if (!data) return <MRAState error={error} />;
  const { vault, juniorSeries, writeOffIndex } = data;
  const VAULT = vaultNumbers(vault);
  return (
    <LendShell note="The DRIP price, pool and coverage are public. So is every mint and trade.">
      <LenderDisclosure />
      <PageHead
        label="First loss"
        title={
          <span className="inline-flex items-center gap-3">
            <TokenBadge size={44} label="DRIP" />
            Junior
          </span>
        }
        actions={
          <>
            <Button href={routes.mint}>Mint or redeem</Button>
            <Button href={routes.trade} variant="secondary">
              Trade
            </Button>
          </>
        }
      >
        DRIP takes losses before anyone else, and earns {vault.feeShareJunior} of every fee for it.
      </PageHead>
      <Columns ratio="3:2">
        <Stack gap="lg">
          <Pub>
            <Card gap="lg">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Label>DRIP price</Label>
                  <span className="font-display text-amount tabular-nums text-charcoal">{vault.juniorPrice}</span>
                </div>
                <span className="text-right font-ledger text-ledger text-charcoal-soft">
                  {pct(VAULT.juniorPrice, VAULT.juniorBook)} under book
                  <br />
                  TWAP {vault.juniorTwap}
                </span>
              </div>
              <LineChart
                points={juniorSeries}
                height={180}
                label={isMock ? "DRIP price over 12 weeks. It dips at the write-off, then recovers to 0.982." : "DRIP price over time"}
                markers={writeOffIndex >= 0 ? [{ index: writeOffIndex, label: isMock ? "The $100 write-off" : "Latest write-off" }] : []}
                xLabels={["12 weeks ago", "Now"]}
                format={price}
              />
            </Card>
          </Pub>
          <StatGrid
            items={[
              { label: "Coverage", value: vault.coverage },
              { label: "Fee share", value: vault.feeShareJunior },
              { label: "Pool", value: isMock ? "$42k" : vault.junior },
            ]}
          />
          {panel.data ? <MarketView panel={panel.data} /> : <RiskLoading what="What the market thinks" error={panel.error} />}
        </Stack>
        <Card>
          <Label>Who takes a loss first</Label>
          <LossWaterfall you="junior" />
        </Card>
      </Columns>
    </LendShell>
  );
}

/* -------------------------------------------------------------- P02 Protocol */
export function ProtocolScreen({ initial }: { initial: ProtocolView | null }) {
  const { data, error } = useMRA(q.protocol, { initial });
  if (!data) return <MRAState error={error} />;
  const { vault: VAULT, tierCaps: TIER_CAPS } = data;
  const lowered = TIER_CAPS.find((t) => t.was);
  return (
    <LendShell note="Everything on this screen is public. None of it names a person.">
      <PageHead label="Public dashboard" title="Protocol">
        Public numbers. Anyone can check them.
      </PageHead>
      <Pub>
        <StatGrid
          className="md:grid-cols-3"
          items={[
            { label: "Outstanding", value: VAULT.outstanding, sub: `${VAULT.advancesOut} advances` },
            { label: "Repaid, 30 days", value: VAULT.repaid30d },
            { label: "Written off", value: VAULT.writtenOff, sub: "all time" },
            { label: "Reserve", value: VAULT.reserve },
            { label: "Junior TWAP", value: VAULT.juniorTwap },
            { label: "Shops", value: VAULT.shopsActive, sub: "pseudonyms" },
          ]}
        />
      </Pub>
      <Columns ratio="3:2">
        <Pub>
          <Card aria-label="Limit per tier" as="section">
            <Label>Limit per tier</Label>
            <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
              {TIER_CAPS.map((t) => (
                <li key={t.tier} className="flex flex-col gap-1 rounded-md bg-well p-3">
                  <Label>Tier {t.tier}</Label>
                  <strong className="font-display text-h2 tabular-nums text-charcoal">{t.cap}</strong>
                  <span className="min-h-5 font-ledger text-ledger text-charcoal-muted">{t.was ? <s>{t.was}</s> : null}</span>
                </li>
              ))}
            </ol>
          </Card>
        </Pub>
        <RowList>
          <ListRow
            href={routes.risk}
            title="Risk status"
            sub={isMock ? "Tier 3 limit lowered today" : lowered ? `Tier ${lowered.tier} limit lowered` : "Signals and every limit change"}
          />
          <ListRow href={routes.explorer} title="Explorer" sub="Every sale, draw and pass. No names" />
        </RowList>
      </Columns>
    </LendShell>
  );
}

/* ------------------------------------------------------------------ P03 Risk */
const signalPill = { watch: { tone: "slow" as const, text: "Watch" }, ok: { tone: "saving" as const, text: "OK" } };
const logPill = { down: { tone: "risk" as const, text: "Lowered" }, watch: { tone: "slow" as const, text: "Watch" }, ok: { tone: "saving" as const, text: "Info" } };

const logKind = (k: string): keyof typeof logPill => (k === "down" ? "down" : k === "warn" || k === "watch" ? "watch" : "ok");
const linesOf = (l: { reason: string; reasons?: string[] | undefined }) => l.reasons ?? reasonLines(l.reason);

export function RiskScreen({ initial }: { initial: RiskView | null }) {
  const { data, error } = useMRA(q.risk, { initial });
  if (!data) return <MRAState error={error} />;
  const { signals, riskLog } = data;
  const [latest, ...rest] = riskLog;
  const latestKind = latest ? logKind(latest.kind) : "ok";
  return (
    <LendShell note="Signals and every limit change are public, with the Risk agent's reasons.">
      <PageHead label="Risk agent" title="Risk">
        Signals and every limit change, with the reasons. Limits only move down on their own.
      </PageHead>
      <Columns ratio="3:2">
        <Stack gap="lg">
          {latest ? (
            <Pub>
              <Card className={latestKind === "down" ? "border-caution/50" : undefined}>
                <div className="flex items-center justify-between gap-3">
                  {latestKind === "down" ? <Pill tone="slow">Limits lowered</Pill> : <Pill tone={logPill[latestKind].tone}>{logPill[latestKind].text}</Pill>}
                  <span className="font-ledger text-ledger text-charcoal-soft">{isMock ? `Today ${latest.time}` : latest.time}</span>
                </div>
                <Heading level={2} size="h2">
                  {latest.title}
                </Heading>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {linesOf(latest).map((r) => (
                    <li key={r} className="flex gap-2 font-body text-note text-charcoal-soft">
                      <span aria-hidden className="text-hunter">
                        →
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </Card>
            </Pub>
          ) : null}
          <Stack>
            <Label>Earlier</Label>
            <Pub>
              <Card>
                <ActivityList
                  label="Earlier risk decisions, newest first"
                  items={rest.map((l, i) => ({
                    id: `${l.title}-${i}`,
                    title: l.title,
                    when: l.time,
                    tag: <Pill tone={logPill[logKind(l.kind)].tone}>{logPill[logKind(l.kind)].text}</Pill>,
                    detail: (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {linesOf(l).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ),
                  }))}
                />
              </Card>
            </Pub>
          </Stack>
        </Stack>
        <Stack>
          <Label>Signals</Label>
          <Pub>
            <RowList label="Signals">
              {signals.map((s) => (
                <ListRow
                  key={s.name}
                  title={s.name}
                  sub={s.note}
                  end={
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-ledger text-ledger">{s.value}</span>
                      <Pill tone={signalPill[s.state].tone}>{signalPill[s.state].text}</Pill>
                    </span>
                  }
                />
              ))}
            </RowList>
          </Pub>
        </Stack>
      </Columns>
    </LendShell>
  );
}
