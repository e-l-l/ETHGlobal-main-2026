"use client";

import {
  ActivityList,
  Banner,
  Button,
  Card,
  Columns,
  Heading,
  KeyValue,
  Label,
  LineChart,
  LossWaterfall,
  PageHead,
  LenderDisclosure,
  Pill,
  RowList,
  ListRow,
  Stack,
  StatGrid,
  Text,
  TextLink,
  TokenBadge,
  type LossLayerAmount,
} from "@/final";
import type { EarnView, JuniorView, KV, PositionView, ProtocolView, RiskPanelView, RiskView, WaterfallView } from "@repo/sdk";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { DarkCard, LendHero, LendShell } from "./shell";
import { DepositPanel, PositionCard } from "./client";
import { LiveWaterfall, MarketView, RiskInPublic, RiskLoading } from "./risk";
import { reasonLines, vaultNumbers } from "./vault";

const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const price = (v: number) => `$${v.toFixed(3)}`;
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

type SplitPart = { name: string; pct: number; className: string };

/** The contract's split, used until the SDK's `feeSplit` rows arrive. */
const FEE_SPLIT_DEFAULT: KV[] = [
  { k: "Senior", v: "40%" },
  { k: "Junior", v: "30%" },
  { k: "Reserve", v: "20%" },
  { k: "Protocol", v: "10%" },
];

/** SDK row keys are contract names ("Senior", "Junior" or "Junior / DRIP", ...). Map them to what people read. */
const FEE_SPLIT_LOOK: Record<string, { name: string; long: string; row: string; className: string }> = {
  senior: { name: "Vault", long: "vault", row: "To the vault", className: "bg-hunter text-canvas" },
  junior: { name: "DRIP", long: "DripCoin", row: "To DripCoin", className: "bg-charcoal text-lime" },
  reserve: { name: "Reserve", long: "reserve", row: "To the reserve", className: "bg-honeydew text-hunter" },
  protocol: { name: "Protocol", long: "protocol", row: "To the protocol", className: "bg-unlit text-charcoal" },
};

/** `mra.lender.earn().feeSplit` (4 rows of {k, v}) → stacked-bar parts plus a one-line label. */
function feeSplitParts(rows: KV[] | undefined): { parts: (SplitPart & { row: string })[]; label: string } {
  const src = rows?.length ? rows : FEE_SPLIT_DEFAULT;
  const parts = src.map((r) => {
    const key = r.k.trim().split(/[\s/]/)[0]?.toLowerCase() ?? "";
    const look = FEE_SPLIT_LOOK[key] ?? { name: r.k, long: r.k, row: `To ${r.k}`, className: "bg-unlit text-charcoal" };
    return { name: look.name, long: look.long, row: look.row, pct: Number.parseFloat(r.v) || 0, className: look.className };
  });
  return { parts, label: `Fee split: ${parts.map((p) => `${p.pct}% ${p.long}`).join(", ")}` };
}

/** Every advance sits on top of this much DripCoin cover. */
const COVER_LINE = "Every advance has 20% DripCoin cover underneath it.";

/** One stacked bar: who gets what. Widths from the numbers; labels inside when they fit. */
function SplitStrip({ label, parts }: { label: string; parts: SplitPart[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={label} className="flex h-12 gap-1 overflow-hidden rounded-md">
        {parts.map((p) => (
          <span key={p.name} className={`flex min-w-0 items-center px-3 font-body text-note font-semibold whitespace-nowrap ${p.className}`} style={{ flexGrow: p.pct, flexBasis: 0 }}>
            {p.pct >= 15 ? `${p.name} ${p.pct}%` : `${p.pct}%`}
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 font-ledger text-ledger text-charcoal-soft">
        {parts.map((p) => (
          <li key={p.name} className="inline-flex items-center gap-1.5">
            <i aria-hidden className={`size-2.5 rounded-[3px] ${p.className}`} />
            {p.name} {p.pct}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ L01 Vault */
const HOW = [
  { title: "You deposit USDC", body: "It joins the vault with other lenders." },
  { title: "Shops draw advances for stock", body: "Small amounts, inside limits that grow with good repayment." },
  { title: "Customers pay through the QR", body: "The contract splits every payment: 8% repays the advance." },
  { title: "Fees come back to you", body: "A small weekly fee on every advance (max 3%). Most of it goes to the vault." },
];

export function EarnScreen({ initial, initialRisk }: { initial: EarnView | null; initialRisk?: { panel: RiskPanelView; waterfall: WaterfallView } | null }) {
  const { data, error } = useMRA(q.earn, { initial });
  const risk = useMRA(q.earnRisk, { initial: initialRisk ?? null });
  if (!data) return <MRAState error={error} />;
  const VAULT = data.vault;
  const wroteOff = VAULT.writtenOff !== "$0" && VAULT.writtenOff !== "—";
  const series = data.seniorSeries;
  const last = series.at(-1) ?? 100;
  return (
    <LendShell>
      <div>
        <LendHero
          sweep
          label="DripMoni vault · USDC"
          title={
            <>
              Lend to small shops. <span className="text-lime">Get paid from every sale.</span>
            </>
          }
          aside={
            <>
              <Label className="text-canvas">Current APY</Label>
              <span className="font-display text-[64px] leading-none font-extrabold tracking-[-0.04em] tabular-nums text-canvas md:text-[80px]">{VAULT.apy}</span>
              <span className="font-body text-note text-canvas">From advance fees, after losses. Not promised.</span>
            </>
          }
        >
          Your deposit funds small advances for shop stock. Each advance is paid back automatically from the shop&rsquo;s customer payments, and its fee
          comes back to the vault: 0.5% a week while the shop owes, never more than 3%.
        </LendHero>
      </div>
      <LenderDisclosure />
      <Text tone="strong">{COVER_LINE}</Text>

      <ol aria-label="How it works" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {HOW.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3.5 rounded-lg border border-hairline bg-surface p-4 md:p-5">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-honeydew font-display text-read font-bold text-hunter">
              {i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-body text-read font-semibold text-charcoal">{s.title}</span>
              <span className="font-body text-note text-charcoal-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <Columns ratio="3:2">
        <Stack gap="lg">
          <div>
            <StatGrid
              className="md:grid-cols-3"
              items={[
                { label: "Total lent", value: VAULT.totalLent },
                { label: "Out in advances", value: VAULT.outstanding },
                { label: "Repaid, 30 days", value: VAULT.repaid30d },
                { label: "Advances made", value: VAULT.advancesOut },
                { label: "Shops active", value: VAULT.shopsActive },
                { label: "Loss rate", value: VAULT.defaultRate },
              ]}
            />
          </div>
          <div>
            <Card padding="lg">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Heading level={2} size="h2">
                  Value of $100 deposited, 12 weeks
                </Heading>
                <span className="font-display text-h2 tabular-nums text-fern">{usd2(last)}</span>
              </div>
              <LineChart
                points={series}
                height={220}
                label={isMock ? "Value of $100 rising steadily over 12 weeks, flat through the write-off" : "Value of $100 deposited over time"}
                xLabels={["12 weeks ago", "Now"]}
                format={usd2}
              />
            </Card>
          </div>
          {isMock ? (
            <Banner>A shop stopped selling. DripCoin took the $100 loss. The vault was not touched.</Banner>
          ) : wroteOff ? (
            <Banner>Written off so far: {VAULT.writtenOff}. DripCoin and the reserve absorb a loss before the vault does.</Banner>
          ) : null}
          {risk.data ? (
            <LiveWaterfall waterfall={risk.data.waterfall} you="vault" />
          ) : (
            <Card>
              <Label>Who takes a loss first</Label>
              <LossWaterfall you="vault" />
            </Card>
          )}
        </Stack>
        <Stack gap="lg">
          <div className="hidden md:block">
            <DepositPanel vault={VAULT} />
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            <Button href={routes.deposit}>Deposit</Button>
            <Button href={`${routes.deposit}?side=withdraw`} variant="secondary">
              Withdraw
            </Button>
          </div>
          <PositionCard vault={VAULT} />
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
  const V = vaultNumbers(vault);
  const principal = V.positionValue - V.positionEarned;
  return (
    <LendShell>
      <PageHead back={routes.earn} backLabel="Vault" label="The vault · USDC" title="My position" />
      <Columns ratio="3:2">
        <Stack gap="lg">
          <div>
            <DarkCard label="Vault position" className="gap-5 md:p-8">
              <Label className="text-lime">Vault position</Label>
              <div className="flex flex-col gap-2">
                <span className="font-display text-hero-sm tabular-nums text-canvas md:text-hero">{vault.positionValue}</span>
                <span className="font-body text-read text-honeydew">
                  <span className="font-semibold text-lime">{vault.positionEarned}</span> earned
                  {principal > 0 ? ` since you deposited ${usd2(principal)}` : ""}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button href={routes.deposit} variant="lime" className="sm:flex-1">
                  Deposit more
                </Button>
                <Button href={`${routes.deposit}?side=withdraw`} variant="ghost" className="border-honeydew/50 text-canvas hover:bg-canvas/10 sm:flex-1">
                  Withdraw
                </Button>
              </div>
            </DarkCard>
          </div>
          <div>
            <Card padding="lg">
              <div className="flex items-center justify-between gap-3">
                <Heading level={2} size="h2">
                  Share value over time
                </Heading>
                <Label>12 weeks</Label>
              </div>
              <LineChart
                points={seniorSeries}
                height={200}
                label={isMock ? "Share value rising steadily over 12 weeks, flat through the write-off" : "Share value over time"}
                xLabels={["12 weeks ago", "Now"]}
                format={(v) => `$${(v / 100).toFixed(3)}`}
              />
            </Card>
          </div>
        </Stack>
        <Stack gap="lg">
          <div>
            <Card>
              <Heading level={2} size="h2">
                Details
              </Heading>
              <KeyValue
                rows={[
                  ["Vault shares", vault.positionShares],
                  ["Value per share", vault.sharePrice],
                  ["Available to withdraw now", vault.availableToWithdraw],
                  ["Out in advances", usd2(Math.max(0, V.positionValue - V.availableToWithdraw))],
                ]}
              />
            </Card>
          </div>
          <Text size="note" tone="muted">
            Money out in advances comes back as shops&rsquo; customers pay. It can be withdrawn once it&rsquo;s back.
          </Text>
          <Card>
            <Heading level={2} size="h2">
              Activity
            </Heading>
            {positionActivity.length ? (
              <ul aria-label="Position activity" className="m-0 flex list-none flex-col p-0">
                {positionActivity.map((a, i) => (
                  <li key={`${a.what}-${i}`} className="flex justify-between gap-4 border-t border-hairline py-3 first:border-t-0 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-body text-read text-charcoal">{a.what}</span>
                      <span className="font-ledger text-ledger text-charcoal-muted">{a.when}</span>
                    </span>
                    <span className="shrink-0 text-right font-body text-read font-semibold tabular-nums text-charcoal">{a.amount}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="note" tone="muted">
                Nothing yet. Deposits, fees and withdrawals show up here.
              </Text>
            )}
          </Card>
        </Stack>
      </Columns>
    </LendShell>
  );
}

/* -------------------------------------------------------------- J01 DripCoin */
export function DripCoinScreen({
  initial,
  initialPanel,
  initialEarn,
}: {
  initial: JuniorView | null;
  initialPanel?: RiskPanelView | null;
  initialEarn?: EarnView | null;
}) {
  const { data, error } = useMRA(q.junior, { initial });
  const panel = useMRA(q.riskPanel, { initial: initialPanel ?? null });
  /* JuniorView has no fee split; the vault view carries the 4 rows. */
  const earn = useMRA(q.earn, { initial: initialEarn ?? null });
  if (!data) return <MRAState error={error} />;
  const { vault, juniorSeries, writeOffIndex, waterfall } = data;
  const V = vaultNumbers(vault);
  const split = feeSplitParts(earn.data?.feeSplit);
  const gap = V.juniorBook > 0 ? ((V.juniorPrice - V.juniorBook) / V.juniorBook) * 100 : 0;
  const vsBook = Math.abs(gap) < 0.05 ? "at book" : `${Math.abs(gap).toFixed(1)}% ${gap < 0 ? "under" : "over"} book`;
  /* The SDK's three tiers (first loss, reserve, vault) with live amounts, drawn in the same order. */
  const layers: LossLayerAmount[] = [
    { key: "junior", amount: waterfall[0].amount },
    { key: "reserve", amount: waterfall[1].amount },
    { key: "senior", amount: waterfall[2].amount },
  ];
  return (
    <LendShell>
      <div>
        <LendHero
          label="DripCoin · DRIP"
          title={
            <>
              Earn more. <span className="text-lime">Take losses first.</span>
            </>
          }
          actions={
            <>
              <Button href={routes.mint} variant="lime">
                Mint DRIP
              </Button>
              <Button href={routes.trade} variant="ghost" className="border-honeydew/50 text-canvas hover:bg-canvas/10">
                Trade on Uniswap
              </Button>
            </>
          }
          aside={
            <>
              <span className="mb-2 hidden md:block">
                <TokenBadge size={56} label="DripCoin (DRIP)" />
              </span>
              <Label className="text-canvas">DRIP price</Label>
              <span className="font-display text-[56px] leading-none font-extrabold tracking-[-0.04em] tabular-nums text-canvas md:text-[72px]">{vault.juniorPrice}</span>
              <span className="font-body text-note text-canvas">
                {vsBook} · TWAP {vault.juniorTwap}
              </span>
            </>
          }
        >
          DRIP is the first-loss layer under the vault. It earns {vault.feeShareJunior} of every advance fee and covers write-offs before vault lenders lose
          anything.
        </LendHero>
      </div>
      <LenderDisclosure />
      <Text tone="strong">{COVER_LINE}</Text>

      <div>
        <StatGrid
          items={[
            { label: "Price", value: vault.juniorPrice, sub: "Uniswap v4" },
            { label: "Book value", value: price(V.juniorBook), sub: "Mint and redeem here" },
            { label: "DRIP outstanding", value: vault.junior },
            { label: "Coverage", value: vault.coverage, sub: "DRIP cover vs advances out · 20% rule" },
          ]}
        />
      </div>

      <Columns ratio="3:2">
        <Stack gap="lg">
          <div>
            <Card padding="lg" gap="lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Heading level={2} size="h2">
                  DRIP price, 12 weeks
                </Heading>
                <Pill tone={gap < -0.05 ? "slow" : "saving"}>{vsBook}</Pill>
              </div>
              <LineChart
                points={juniorSeries}
                height={220}
                label={isMock ? "DRIP price over 12 weeks. It dips at the write-off, then recovers to 0.982." : "DRIP price over time"}
                markers={writeOffIndex >= 0 ? [{ index: writeOffIndex, label: isMock ? "The $100 write-off" : "Latest write-off" }] : []}
                xLabels={["12 weeks ago", "Now"]}
                format={price}
              />
            </Card>
          </div>
          <Card padding="lg">
            <Heading level={2} size="h2">
              Where each advance fee goes
            </Heading>
            <SplitStrip label={split.label} parts={split.parts} />
            <Text size="note" tone="muted">
              Fees are 0.5% a week while a shop owes, never more than 3%. A $100 advance repaid in 4 weeks pays $2: $0.80 to the vault, $0.60 to DRIP, $0.40
              to the reserve, $0.20 to the protocol.
            </Text>
            <Text size="note" tone="muted">
              The reserve slice builds the reserve, together with a small fee from every DRIP trade on Uniswap.
            </Text>
          </Card>
          <div>
            <Card padding="lg">
              <Heading level={2} size="h2">
                Who covers a loss, in order
              </Heading>
              <LossWaterfall you="dripcoin" layers={layers} />
            </Card>
          </div>
        </Stack>
        <Stack gap="lg">
          <section aria-label="Know the risk" className="flex flex-col gap-2 rounded-lg bg-caution-tint p-5">
            <Label className="text-caution">Know the risk</Label>
            <Text tone="strong">
              If shops stop paying, DRIP&rsquo;s book value falls. Its market price can also move on its own. The Risk agent watches that price and lowers advance
              limits when it drops.
            </Text>
            <TextLink href={routes.risk} arrow>
              See risk status
            </TextLink>
          </section>
          <div>
            <Card>
              <Label>You hold</Label>
              <div className="flex items-center gap-3">
                <TokenBadge size={40} />
                <span className="font-display text-h1 tabular-nums text-charcoal">{fmt(V.walletJarJ)} DRIP</span>
              </div>
              <Text size="note" tone="muted">
                ≈ {usd2(V.walletJarJ * V.juniorPrice)} at market price
              </Text>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button href={routes.mint} size="sm" className="sm:flex-1">
                  Mint or redeem
                </Button>
                <Button href={routes.trade} size="sm" variant="secondary" className="sm:flex-1">
                  Trade
                </Button>
              </div>
            </Card>
          </div>
          {panel.data ? <MarketView panel={panel.data} /> : <RiskLoading what="What the market thinks" error={panel.error} />}
        </Stack>
      </Columns>
    </LendShell>
  );
}

/* -------------------------------------------------------------- P02 Protocol */
const TIER_NAMES = ["First advance", "After 1 repaid", "After 2 repaid", "After 3 or more"];

export function ProtocolScreen({ initial }: { initial: ProtocolView | null }) {
  const { data, error } = useMRA(q.protocol, { initial });
  if (!data) return <MRAState error={error} />;
  const { vault: VAULT, tierCaps: TIER_CAPS } = data;
  const lowered = TIER_CAPS.some((t) => t.was);
  const split = feeSplitParts(data.feeSplit);
  return (
    <LendShell>
      <PageHead label="Public dashboard · anyone can check" title="DripMoni, in real numbers.">
        Read straight from the contracts. No shop is named anywhere.
      </PageHead>
      <div>
        <StatGrid
          items={[
            { label: "Out in advances", value: VAULT.outstanding, sub: `${VAULT.advancesOut} advances made` },
            { label: "Repaid, 30 days", value: VAULT.repaid30d },
            { label: "Written off", value: VAULT.writtenOff, sub: "all time" },
            { label: "Shops active", value: VAULT.shopsActive, sub: "pseudonyms" },
            { label: "Vault APY", value: VAULT.apy },
            { label: "Loss rate", value: VAULT.defaultRate },
            { label: "DRIP price (TWAP)", value: VAULT.juniorTwap },
            { label: "Coverage", value: VAULT.coverage, sub: "DRIP cover · 20% rule" },
          ]}
        />
      </div>
      <Columns ratio="3:2">
        <Stack gap="lg">
          <Card padding="lg">
            <Heading level={2} size="h2">
              Every payment, split by the contract
            </Heading>
            <SplitStrip
              label="92% to the shop, 8% to repaying its advance"
              parts={[
                { name: "To the shop", pct: 92, className: "bg-unlit text-charcoal" },
                { name: "Advance", pct: 8, className: "bg-hunter text-canvas" },
              ]}
            />
            <Text size="note" tone="muted">
              Shops with an open advance send 8% of each payment to pay it back: the fee first, then the advance. Shops without one keep 100%.
            </Text>
          </Card>
          <div>
            <Card padding="lg" as="section" aria-label="Current advance limits">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Heading level={2} size="h2">
                  Current advance limits
                </Heading>
                {lowered ? (
                  <TextLink href={routes.risk} arrow>
                    Why lowered
                  </TextLink>
                ) : null}
              </div>
              <KeyValue
                rows={TIER_CAPS.map((t) => [
                  TIER_NAMES[t.tier] ?? `Tier ${t.tier}`,
                  <span key={t.tier} className="inline-flex items-baseline gap-2">
                    {t.was ? <s className="font-ledger text-ledger font-normal text-charcoal-muted">was {t.was}</s> : null}
                    {t.cap}
                  </span>,
                ])}
              />
            </Card>
          </div>
        </Stack>
        <Stack gap="lg">
          <div>
            <Card>
              <Heading level={2} size="h2">
                Capital
              </Heading>
              <KeyValue
                rows={[
                  ["Vault", VAULT.tvl],
                  ["DripCoin (first loss)", VAULT.junior],
                  ["Reserve", VAULT.reserve],
                  ["Coverage", VAULT.coverage],
                ]}
              />
            </Card>
          </div>
          <Card>
            <Heading level={2} size="h2">
              Each advance fee
            </Heading>
            <KeyValue rows={split.parts.map((p) => [p.row, `${p.pct}%`])} />
            <Text size="note" tone="muted">
              0.5% a week while the shop owes, never more than 3%.
            </Text>
          </Card>
          <RowList>
            <ListRow
              href={routes.risk}
              title="Risk status"
              sub={isMock ? "Tier 3 limit lowered today" : lowered ? "A limit was lowered" : "Signals and every limit change"}
            />
            <ListRow href={routes.explorer} title="Explorer" sub="Every payment, advance and pass. No names" />
          </RowList>
        </Stack>
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
  const { signals, riskLog, tierCaps } = data;
  const latestDown = riskLog[0] ? logKind(riskLog[0].kind) === "down" : false;
  const watching = signals.some((s) => s.state === "watch");
  return (
    <LendShell>
      <PageHead
        label="Watched by the Risk agent"
        title="Risk status"
        actions={latestDown ? <Pill tone="slow">Limits lowered</Pill> : watching ? <Pill tone="slow">Watching</Pill> : <Pill tone="saving">All calm</Pill>}
      >
        Signals and every limit change, with the reasons. Limits only move down on their own.
      </PageHead>
      <Columns ratio="3:2">
        <Stack gap="lg">
          <div>
            <Card padding="lg" as="section" aria-label="Signals">
              <Heading level={2} size="h2">
                Signals
              </Heading>
              <ul className="m-0 flex list-none flex-col p-0">
                {signals.map((s) => (
                  <li key={s.name} className="flex items-start justify-between gap-4 border-t border-hairline py-3.5 first:border-t-0 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-body text-read font-semibold text-charcoal">{s.name}</span>
                      <span className="font-body text-note text-charcoal-muted">{s.note}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-display text-h2 tabular-nums text-charcoal">{s.value}</span>
                      <Pill tone={signalPill[s.state].tone}>{signalPill[s.state].text}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div>
            <Card padding="lg" as="section" aria-label="What the Risk agent did">
              <Heading level={2} size="h2">
                What the Risk agent did
              </Heading>
              {riskLog.length ? (
                <ActivityList
                  label="Risk decisions, newest first"
                  items={riskLog.map((l, i) => ({
                    id: `${l.title}-${i}`,
                    title: l.title,
                    when: isMock && i === 0 ? `Today ${l.time}` : l.time,
                    tag: <Pill tone={logPill[logKind(l.kind)].tone}>{logPill[logKind(l.kind)].text}</Pill>,
                    detail: (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {linesOf(l).map((r) => (
                          <li key={r} className="flex gap-2">
                            <span aria-hidden className="text-hunter">
                              →
                            </span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    ),
                  }))}
                />
              ) : (
                <Text size="note" tone="muted">
                  No decisions yet.
                </Text>
              )}
            </Card>
          </div>
        </Stack>
        <Stack gap="lg">
          <section aria-label="The rule" className="flex flex-col gap-2 rounded-lg border border-honeydew-line bg-honeydew p-5">
            <Label className="text-hunter">The rule</Label>
            <Text tone="strong">The agent can only lower limits, inside a preset band. Raising them back always needs a person.</Text>
          </section>
          <div>
            <Card as="section" aria-label="Limit per advance">
              <Heading level={2} size="h2">
                Limit per advance
              </Heading>
              <KeyValue
                rows={tierCaps.map((t) => [
                  TIER_NAMES[t.tier] ?? `Tier ${t.tier}`,
                  <span key={t.tier} className="inline-flex items-baseline gap-2">
                    {t.was ? <s className="font-ledger text-ledger font-normal text-charcoal-muted">was {t.was}</s> : null}
                    {t.cap}
                  </span>,
                ])}
              />
            </Card>
          </div>
          <RowList>
            <ListRow href={routes.dripcoin} title="DripCoin" sub="The price the agent watches" />
            <ListRow href={routes.protocol} title="Protocol" sub="Public totals" />
          </RowList>
        </Stack>
      </Columns>
    </LendShell>
  );
}
