"use client";

import type { EarnView, JuniorView, PositionView, ProtocolView, RiskView } from "@repo/sdk";
import { ActionBar, LinkButton, Main, Note, Row, Screen, Stat, TopBar } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { LossStrip, Sparkline } from "@/jar/app-data";
import { Pill } from "@/jar/controls";
import { usdText } from "@/jar/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { LendTabs, WalletChip, lendBrand } from "./shell";
import { reasonLines, vaultNumbers } from "./vault";

const usd2 = (n: number) => usdText(n, 2);
const pct = (a: number, b: number) => `${(((b - a) / b) * 100).toFixed(1)}%`;

/* ------------------------------------------------------------------ L01 Earn: `lender.overview()` */
export function EarnScreen({ initial }: { initial: EarnView | null }) {
  const { data, error } = useMRA(q.earn, { initial });
  if (!data) return <MRAState error={error} />;
  const VAULT = data.vault;
  const n = vaultNumbers(VAULT);
  return (
    <Screen mode="light">
      <TopBar brand start={lendBrand} end={<WalletChip />} worldNote="Vault totals and positions are onchain. Lenders never see a shop's books or who owns it." />
      <Main enter="fade">
        <div className="dj-stack" style={{ gap: 4 }}>
          <h1 className="app-display">Earn</h1>
          <p className="dj-small">Senior vault. Lend dollars to real shops.</p>
        </div>
        <section className="dj-jar pub" aria-label="Senior vault">
          <div className="dj-between">
            <span className="dj-label">Vault APY</span>
            <Pill kind="saving">Senior</Pill>
          </div>
          <div className="dj-stack" style={{ gap: 2 }}>
            <span className="dj-balance dj-jar__figure">{VAULT.apy}</span>
            <span className="dj-local">a year, from shop fees. Not promised.</span>
          </div>
          <div className="dj-between">
            <span className="dj-small">Lent out {VAULT.totalLent}</span>
            <span className="dj-small">Defaults {VAULT.defaultRate}</span>
          </div>
        </section>
        <Note>A shop stopped selling. Junior took the $100 loss. Senior was not touched.</Note>
        <div className="dj-stack" style={{ gap: 8 }}>
          <span className="dj-label">Who takes a loss first</span>
          <LossStrip viewer="senior" />
        </div>
        <ul className="app-rows">
          <li>
            <Row
              href={routes.position}
              lead={<I.wallet size={20} />}
              title="Your position"
              sub={`+${usd2(n.positionEarned)} earned`}
              end={<span className="pub">{usd2(n.positionValue)}</span>}
            />
          </li>
        </ul>
        <div className="app-actions__row">
          <LinkButton href={routes.deposit}>Deposit</LinkButton>
          <LinkButton href={`${routes.deposit}?side=withdraw`} variant="ghost">
            Withdraw
          </LinkButton>
        </div>
      </Main>
      <LendTabs active="earn" />
    </Screen>
  );
}

/* -------------------------------------------------------------- L03 Position: `lender.position()` */
export function PositionScreen({ initial }: { initial: PositionView | null }) {
  const { data, error } = useMRA(q.position, { initial });
  if (!data) return <MRAState error={error} />;
  const { positionActivity, seniorSeries } = data;
  const n = vaultNumbers(data.vault);
  return (
    <Screen mode="light">
      <TopBar back={routes.earn} title="My position" worldNote="Your shares are onchain under this wallet. Nothing ties the wallet to your name." />
      <Main>
        <div className="dj-stack pub" style={{ gap: 2 }}>
          <span className="dj-label">Value</span>
          <span className="dj-balance">{usd2(n.positionValue)}</span>
          <span className="dj-small">
            +{usd2(n.positionEarned)} earned · {n.positionShares.toLocaleString("en-US")} shares
          </span>
        </div>
        <section className="dj-card" style={{ gap: 10 }}>
          <div className="dj-between">
            <span className="dj-label">Share value, 12 weeks</span>
            <span className="dj-mono">${n.sharePrice.toFixed(3)}</span>
          </div>
          <Sparkline points={seniorSeries} label="Share value rising steadily over 12 weeks, flat through the write-off" />
        </section>
        <div className="app-stats">
          <Stat label="Withdraw now" value={usdText(n.availableToWithdraw)} sub="cash in the vault" />
          <Stat label="In advances" value={usd2(n.positionValue - n.availableToWithdraw)} sub="back as shops repay" />
        </div>
        <ul className="app-rows" aria-label="Activity">
          {positionActivity.map((a) => (
            <li key={a.what}>
              <Row title={a.what} sub={a.when} end={<span className="dj-mono">{a.amount}</span>} />
            </li>
          ))}
        </ul>
      </Main>
      <ActionBar>
        <div className="app-actions__row">
          <LinkButton href={routes.deposit}>Deposit more</LinkButton>
          <LinkButton href={`${routes.deposit}?side=withdraw`} variant="ghost">
            Withdraw
          </LinkButton>
        </div>
      </ActionBar>
    </Screen>
  );
}

/* ---------------------------------------------------------------- J01 Junior: `lender.junior.overview()` */
export function JuniorScreen({ initial }: { initial: JuniorView | null }) {
  const { data, error } = useMRA(q.junior, { initial });
  if (!data) return <MRAState error={error} />;
  const VAULT = data.vault;
  const n = vaultNumbers(VAULT);
  return (
    <Screen mode="light">
      <TopBar brand start={lendBrand} end={<WalletChip />} worldNote="The JAR-J price, pool and coverage are public. So is every mint and trade." />
      <Main enter="fade">
        <div className="dj-stack" style={{ gap: 6 }}>
          <div className="dj-between" style={{ alignItems: "center" }}>
            <h1 className="app-display">Junior</h1>
            <Pill kind="risk">First loss</Pill>
          </div>
          <p className="dj-small">JAR-J takes losses before anyone else, and earns {VAULT.feeShareJunior} of every fee for it.</p>
        </div>
        <section className="dj-card pub" style={{ gap: 10 }}>
          <div className="dj-between" style={{ alignItems: "flex-end" }}>
            <div className="dj-stack" style={{ gap: 2 }}>
              <span className="dj-label">JAR-J price</span>
              <span className="dj-balance" style={{ fontSize: 34 }}>
                ${n.juniorPrice.toFixed(3)}
              </span>
            </div>
            <span className="dj-mono" style={{ textAlign: "right" }}>
              {pct(n.juniorPrice, n.juniorBook)} under book
              <br />
              TWAP ${n.juniorTwap.toFixed(3)}
            </span>
          </div>
          <Sparkline points={data.juniorSeries} mark={data.writeOffIndex} height={64} label="JAR-J price over 12 weeks. It dips at the write-off, then recovers to 0.982." />
          <span className="dj-small">The dot is the $100 write-off.</span>
        </section>
        <div className="app-stats app-stats--3">
          <Stat label="Coverage" value={VAULT.coverage} />
          <Stat label="Fee share" value={VAULT.feeShareJunior} />
          <Stat label="Pool" value={`$${Math.round(n.junior / 1000)}k`} />
        </div>
        <LossStrip viewer="junior" />
        <div className="app-actions__row">
          <LinkButton href={routes.mint}>Mint or redeem</LinkButton>
          <LinkButton href={routes.trade} variant="ghost">
            Trade
          </LinkButton>
        </div>
      </Main>
      <LendTabs active="junior" />
    </Screen>
  );
}

/* -------------------------------------------------------------- P02 Protocol: `protocol.stats()` */
export function ProtocolScreen({ initial }: { initial: ProtocolView | null }) {
  const { data, error } = useMRA(q.protocol, { initial });
  if (!data) return <MRAState error={error} />;
  const VAULT = data.vault;
  const n = vaultNumbers(VAULT);
  return (
    <Screen mode="light">
      <TopBar brand start={lendBrand} end={<WalletChip />} worldNote="Everything on this screen is public. None of it names a person." />
      <Main enter="fade">
        <div className="dj-stack" style={{ gap: 4 }}>
          <h1 className="app-display">Protocol</h1>
          <p className="dj-small">Public numbers. Anyone can check them.</p>
        </div>
        <div className="app-stats pub">
          <Stat label="Outstanding" value={VAULT.outstanding} sub={`${VAULT.advancesOut} advances`} />
          <Stat label="Repaid, 30 days" value={VAULT.repaid30d} />
          <Stat label="Written off" value={VAULT.writtenOff} sub="all time" />
          <Stat label="Reserve" value={VAULT.reserve} />
          <Stat label="Junior TWAP" value={`$${n.juniorTwap.toFixed(3)}`} />
          <Stat label="Shops" value={VAULT.shopsActive} sub="pseudonyms" />
        </div>
        <section className="dj-stack" style={{ gap: 8 }} aria-label="Limit per tier">
          <span className="dj-label">Limit per tier</span>
          <ol className="app-loss pub">
            {data.tierCaps.map((t) => (
              <li key={t.tier}>
                <span className="dj-label">Tier {t.tier}</span>
                <strong>{t.cap}</strong>
                <span>{t.was ? <s>{t.was}</s> : " "}</span>
              </li>
            ))}
          </ol>
        </section>
        <ul className="app-rows">
          <li>
            <Row href={routes.risk} lead={<I.pulse size={20} />} title="Risk status" sub="Tier 3 limit lowered today" />
          </li>
          <li>
            <Row href={routes.explorer} lead={<I.search />} title="Explorer" sub="Every sale, draw and pass. No names" />
          </li>
        </ul>
      </Main>
      <LendTabs active="protocol" />
    </Screen>
  );
}

/* ------------------------------------------------------------------ P03 Risk: `protocol.risk()` */
const signalPill = { watch: { kind: "slow" as const, text: "Watch" }, ok: { kind: "saving" as const, text: "OK" } };
/** SDK ActivityKind → pill. */
const logPill = {
  down: { kind: "risk" as const, text: "Lowered" },
  warn: { kind: "slow" as const, text: "Watch" },
  accent: { kind: "saving" as const, text: "Info" },
  neutral: { kind: "saving" as const, text: "Info" },
};

export function RiskScreen({ initial }: { initial: RiskView | null }) {
  const { data, error } = useMRA(q.risk, { initial });
  if (!data) return <MRAState error={error} />;
  const { signals } = data;
  const [latest, ...rest] = data.riskLog;
  return (
    <Screen mode="light">
      <TopBar brand start={lendBrand} end={<WalletChip />} worldNote="Signals and every limit change are public, with the Risk agent's reasons." />
      <Main enter="fade">
        <h1 className="app-display">Risk</h1>
        {latest ? (
          <section className="dj-card pub" style={{ gap: 12, borderColor: "color-mix(in oklab, var(--warn) 50%, transparent)" }}>
            <div className="dj-between" style={{ alignItems: "center" }}>
              <Pill kind="slow">Limits lowered</Pill>
              <span className="dj-mono">Today {latest.time}</span>
            </div>
            <h2 className="dj-h2">{latest.title}</h2>
            <ul className="dj-list">
              {reasonLines(latest.reason).map((r) => (
                <li key={r} className="dj-small">
                  <span aria-hidden style={{ color: "var(--accent)" }}>
                    →
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="dj-stack" style={{ gap: 8 }}>
          <span className="dj-label">Signals</span>
          <ul className="app-rows pub">
            {signals.map((s) => (
              <li key={s.name}>
                <Row title={s.name} sub={s.note} end={<span className="dj-stack" style={{ alignItems: "flex-end", gap: 4 }}><span className="dj-mono" style={{ color: "var(--text)" }}>{s.value}</span><Pill kind={signalPill[s.state].kind}>{signalPill[s.state].text}</Pill></span>} />
              </li>
            ))}
          </ul>
        </div>
        <div className="dj-stack" style={{ gap: 8 }}>
          <span className="dj-label">Earlier</span>
          <ul className="app-rows">
            {rest.map((l) => (
              <li key={l.title}>
                <details className="app-details">
                  <summary className="app-row">
                    <span className="app-row__body">
                      <span className="app-row__title">{l.title}</span>
                      <span className="app-row__sub">{l.time}</span>
                    </span>
                    <span className="app-row__end">
                      <Pill kind={logPill[l.kind].kind}>{logPill[l.kind].text}</Pill>
                      <I.next />
                    </span>
                  </summary>
                  <ul className="dj-list" style={{ padding: "0 16px 14px" }}>
                    {reasonLines(l.reason).map((r) => (
                      <li key={r} className="dj-small">
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </Main>
      <LendTabs active="risk" />
    </Screen>
  );
}
