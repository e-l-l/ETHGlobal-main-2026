"use client";

import { useMemo, useState } from "react";
import { ActionBar, CopyHash, DoneMark, Keypad, LinkButton, Main, Note, Screen, Stat, TopBar, typedUsd } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Sparkline } from "@/jar/app-data";
import { Button, Chips, Pill, Segmented } from "@/jar/controls";
import { usdText } from "@/jar/format";
import { routes } from "@/lib/routes";
import { JUNIOR_WRITE_OFF_INDEX, VAULT, explorerEvents, juniorSeries, type ExplorerKind } from "./data";

/* ------------------------------------------------------------ VaultAction
 * L02 Deposit / withdraw and J02 Mint / redeem: one shape. Amount on a keypad, the quote under it,
 * the wallet steps on the button. The demo wallet confirms by itself; nothing leaves the phone.
 */
type Side = {
  key: string;
  label: string;
  max: number;
  maxLabel: string;
  quote: (n: number) => string;
  steps: string[];
  done: (n: number) => string;
  doneSub: string;
};

type Phase = "idle" | "wallet" | "pending";

function VaultAction({ title, back, sides, initial, after, worldNote }: { title: string; back: string; sides: [Side, Side]; initial?: string; after: { href: string; label: string }; worldNote: string }) {
  const [sideKey, setSideKey] = useState(sides.some((s) => s.key === initial) ? initial! : sides[0].key);
  const side = sides.find((s) => s.key === sideKey) ?? sides[0];
  const [value, setValue] = useState("");
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);
  const n = Number(value || 0);
  const over = n > side.max;
  const busy = phase !== "idle";

  const reset = (k: string) => {
    setSideKey(k);
    setValue("");
    setStep(0);
    setPhase("idle");
  };

  const run = () => {
    setPhase("wallet");
    window.setTimeout(() => setPhase("pending"), 700);
    window.setTimeout(() => {
      setPhase("idle");
      if (step >= side.steps.length - 1) setDone(true);
      else setStep((s) => s + 1);
    }, 1500);
  };

  if (done) {
    return (
      <Screen mode="light">
        <TopBar back={back} title={title} worldNote={worldNote} />
        <Main center>
          <div className="dj-stack" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
            <DoneMark size={80} />
            <h1 className="app-display">{side.done(n)}</h1>
            <p className="dj-body">{side.doneSub}</p>
          </div>
          <Note>Simulated. A demo wallet confirmed it; nothing left this phone.</Note>
        </Main>
        <ActionBar>
          <LinkButton href={after.href}>{after.label}</LinkButton>
        </ActionBar>
      </Screen>
    );
  }

  const label = n <= 0 ? "Enter an amount" : over ? `More than ${side.maxLabel}` : phase === "wallet" ? "Confirm in wallet" : phase === "pending" ? "Confirming" : side.steps[step]!;

  return (
    <Screen mode="light">
      <TopBar back={back} title={title} worldNote={worldNote} />
      <Main tight enter="fade">
        <Segmented label={title} value={sideKey} onChange={reset} options={sides.map((s) => ({ value: s.key, label: s.label }))} />
        <div className="app-amount pub" style={{ paddingTop: 4 }}>
          <span className="app-amount__value app-amount__value--md" data-empty={n === 0} aria-live="polite" aria-atomic>
            {typedUsd(value)}
          </span>
          <span className="dj-local" style={over ? { color: "var(--risk)" } : undefined}>
            {n > 0 && !over ? side.quote(n) : side.maxLabel}
          </span>
        </div>
        <div className="app-quick" role="group" aria-label="Quick amounts">
          {[0.25, 0.5, 1].map((f) => (
            <button key={f} type="button" className="dj-chip" disabled={busy} onClick={() => setValue(String(Math.floor(side.max * f * 100) / 100))}>
              {f === 1 ? "Max" : `${f * 100}%`}
            </button>
          ))}
        </div>
        <Keypad value={value} onChange={(v) => !busy && setValue(v)} />
      </Main>
      <ActionBar>
        {side.steps.length > 1 ? (
          <ol className="app-txsteps" aria-label="Wallet steps">
            {side.steps.map((s, i) => (
              <li key={s} data-s={i < step ? "done" : i === step ? "current" : "next"}>
                <span>{i < step ? "✓" : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        ) : null}
        <Button block onClick={run} loading={busy} loadingLabel={label} disabled={n <= 0 || over || busy}>
          {label}
        </Button>
      </ActionBar>
    </Screen>
  );
}

const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function DepositScreen({ side }: { side?: string }) {
  return (
    <VaultAction
      title="Senior vault"
      back={routes.earn}
      initial={side}
      worldNote="Deposits and shares are onchain under this wallet. Your name is not."
      after={{ href: routes.position, label: "See my position" }}
      sides={[
        {
          key: "deposit",
          label: "Deposit",
          max: VAULT.walletUsdc,
          maxLabel: `Wallet: ${usdText(VAULT.walletUsdc)} USDC`,
          quote: (n) => `≈ ${fmt(n / VAULT.sharePrice)} shares at $${VAULT.sharePrice.toFixed(3)}`,
          steps: ["Approve USDC", "Deposit"],
          done: (n) => `Deposited ${usdText(n, 2)}`,
          doneSub: "You earn from shop fees. Senior is paid back before junior.",
        },
        {
          key: "withdraw",
          label: "Withdraw",
          max: VAULT.availableToWithdraw,
          maxLabel: `Available now: ${usdText(VAULT.availableToWithdraw)}`,
          quote: (n) => `${fmt(n / VAULT.sharePrice)} shares → ${usdText(n, 2)} USDC`,
          steps: ["Withdraw"],
          done: (n) => `Withdrew ${usdText(n, 2)}`,
          doneSub: "The rest stays in advances until shops repay.",
        },
      ]}
    />
  );
}

export function MintScreen() {
  return (
    <VaultAction
      title="JAR-J"
      back={routes.junior}
      worldNote="Mints and redemptions are public, like every token transfer."
      after={{ href: routes.junior, label: "Back to junior" }}
      sides={[
        {
          key: "mint",
          label: "Mint",
          max: VAULT.walletUsdc,
          maxLabel: `Wallet: ${usdText(VAULT.walletUsdc)} USDC`,
          quote: (n) => `${fmt(n / VAULT.juniorBook, 2)} JAR-J at book $${VAULT.juniorBook.toFixed(3)}`,
          steps: ["Approve USDC", "Mint"],
          done: (n) => `Minted ${fmt(n / VAULT.juniorBook, 2)} JAR-J`,
          doneSub: "First loss: you take losses before senior, for 30% of every fee.",
        },
        {
          key: "redeem",
          label: "Redeem",
          max: VAULT.walletJarJ,
          maxLabel: `You hold ${VAULT.walletJarJ} JAR-J`,
          quote: (n) => `${usdText(n * VAULT.juniorBook, 2)} USDC at book`,
          steps: ["Redeem"],
          done: (n) => `Redeemed ${fmt(n, 2)} JAR-J`,
          doneSub: "USDC is back in your wallet.",
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------- J03 Trade */
export function TradeScreen() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("100");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const n = Number(value || 0);
  const out = side === "buy" ? n / VAULT.juniorPrice : n * VAULT.juniorPrice;
  const discount = (((VAULT.juniorBook - VAULT.juniorPrice) / VAULT.juniorBook) * 100).toFixed(1);

  return (
    <Screen mode="light">
      <TopBar back={routes.junior} title="Trade JAR-J" worldNote="The pool, its price and every swap are public." />
      <Main tight enter="fade">
        <section className="dj-card pub" style={{ gap: 8, padding: 14 }}>
          <div className="dj-between">
            <span className="dj-label">Uniswap v4 · JAR-J / USDC</span>
            <Pill kind="slow">{discount}% under book</Pill>
          </div>
          <Sparkline points={juniorSeries} mark={JUNIOR_WRITE_OFF_INDEX} height={56} label="JAR-J price over 12 weeks, dipping at the write-off" />
        </section>
        <div className="app-stats app-stats--3 pub">
          <Stat label="Price" value={`$${VAULT.juniorPrice.toFixed(3)}`} />
          <Stat label="TWAP" value={`$${VAULT.juniorTwap.toFixed(3)}`} />
          <Stat label="Book" value={`$${VAULT.juniorBook.toFixed(3)}`} />
        </div>
        <Segmented
          label="Buy or sell"
          value={side}
          onChange={(s) => {
            setSide(s);
            setDone(null);
          }}
          options={[
            { value: "buy", label: "Buy JAR-J" },
            { value: "sell", label: "Sell JAR-J" },
          ]}
        />
        <div className="app-amount">
          <span className="app-amount__value app-amount__value--md" data-empty={n === 0} aria-live="polite" aria-atomic>
            {side === "buy" ? typedUsd(value) : `${value || "0"} J`}
          </span>
          <span className="dj-local">
            {n > 0 ? (side === "buy" ? `≈ ${fmt(out, 2)} JAR-J` : `≈ ${usdText(out, 2)} USDC`) : "Enter an amount"} · hook fee to reserve
          </span>
        </div>
        <Keypad value={value} onChange={(v) => { setDone(null); setValue(v); }} />
        {done ? <Note>{done}</Note> : null}
      </Main>
      <ActionBar>
        <Button
          block
          loading={busy}
          loadingLabel="Swapping"
          disabled={n <= 0 || busy}
          onClick={() => {
            setBusy(true);
            window.setTimeout(() => {
              setBusy(false);
              setDone(side === "buy" ? `Bought ${fmt(out, 2)} JAR-J (simulated).` : `Sold for ${usdText(out, 2)} (simulated).`);
            }, 1100);
          }}
        >
          {side === "buy" ? "Buy JAR-J" : "Sell JAR-J"}
        </Button>
      </ActionBar>
    </Screen>
  );
}

/* ----------------------------------------------------------- P04 Explorer */
const FILTERS: { value: "all" | ExplorerKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Sale", label: "Sales" },
  { value: "Draw", label: "Draws" },
  { value: "Pass", label: "Passes" },
];

export function ExplorerScreen() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | ExplorerKind>("all");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return explorerEvents.filter(
      (e) => (filter === "all" || e.kind === filter || (filter === "Pass" && e.kind === "Proof")) && (!s || `${e.title} ${e.detail} ${e.hash}`.toLowerCase().includes(s)),
    );
  }, [q, filter]);

  return (
    <Screen mode="light">
      <TopBar back={routes.protocol} title="Explorer" worldNote="This is the whole public record. Look for a name: there isn't one." />
      <Main tight enter="fade">
        <label className="dj-row" style={{ position: "relative" }}>
          <span className="sr-only-dj">Search shops, transactions and commitments</span>
          <span aria-hidden style={{ position: "absolute", left: 14, display: "inline-flex", color: "var(--text-3)" }}>
            <I.search />
          </span>
          <input className="dj-input" type="search" inputMode="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" placeholder="shop_7f3a, 0x…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 44, fontWeight: 400 }} />
        </label>
        <Chips label="Filter" value={filter} onChange={setFilter} options={FILTERS} />
        <ul className="app-rows pub" aria-label="Public events, newest first">
          {rows.map((e) => (
            <li key={e.hash}>
              <details className="app-details">
                <summary className="app-row">
                  <span className="app-row__body">
                    <span className="dj-row" style={{ gap: 8 }}>
                      <Pill kind={e.kind === "Draw" ? "repaying" : e.kind === "Sale" ? "saving" : "locked"}>{e.kind}</Pill>
                      <span className="dj-mono">{e.when}</span>
                    </span>
                    <span className="app-row__title">{e.title}</span>
                  </span>
                  <span className="app-row__end">
                    <I.next />
                  </span>
                </summary>
                <div className="dj-stack" style={{ padding: "0 16px 12px", gap: 4 }}>
                  <span className="dj-small">{e.detail}</span>
                  <CopyHash value={e.hash} />
                </div>
              </details>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="app-row" style={{ cursor: "default" }}>
              <span className="dj-small">Nothing matches. Try a shop id like shop_b19c.</span>
            </li>
          ) : null}
        </ul>
        <Note>No names anywhere. shop_b19c has no onchain link to shop_7f3a, even though it is the same owner.</Note>
      </Main>
    </Screen>
  );
}
