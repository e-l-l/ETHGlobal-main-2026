"use client";

import { useMemo, useState } from "react";
import {
  ActionBar,
  Banner,
  Button,
  Card,
  Chips,
  Columns,
  CopyHash,
  DataTable,
  Heading,
  Keypad,
  Label,
  LineChart,
  PageHead,
  Pill,
  Segmented,
  Stack,
  StatGrid,
  Steps,
  Text,
  TextField,
  TextLink,
  typedUsd,
  CheckIcon,
} from "@/final";
import type { DepositView, ExplorerEventVM, ExplorerView, TradeView, TxResult, TxStep } from "@repo/sdk";
import { errorCode, explorerTxUrl, isMock, withMRA, type MRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { LendShell, Pub } from "./shell";
import { vaultNumbers } from "./vault";

/** The demo faucet sends a fresh burner this much test USDC on its first write (agents DEMO_FAUCET_USDC). */
const FAUCET_USDC = 50;

const usdText = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const price = (v: number) => `$${v.toFixed(3)}`;

/* ------------------------------------------------------------ VaultAction
 * L02 Deposit / withdraw and J02 Mint / redeem: one shape. Amount on a keypad, the quote under it,
 * the wallet steps on the button. The demo wallet confirms by itself; nothing leaves the browser.
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
  /** Live modes: the SDK write for this side (approve + deposit, or one withdraw), reporting each wallet step. */
  live?: (mra: MRA, n: number, onStep: (s: TxStep) => void) => Promise<TxResult>;
};

type Phase = "idle" | "wallet" | "pending";

function VaultAction({
  title,
  label,
  back,
  backLabel,
  sides,
  initial,
  after,
  worldNote,
}: {
  title: string;
  label: string;
  back: string;
  backLabel: string;
  sides: [Side, Side];
  initial?: string;
  after: { href: string; label: string };
  worldNote: string;
}) {
  const [sideKey, setSideKey] = useState(sides.some((s) => s.key === initial) ? initial! : sides[0].key);
  const side = sides.find((s) => s.key === sideKey) ?? sides[0];
  const [value, setValue] = useState("");
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);
  const [hash, setHash] = useState<string | undefined>();
  const [failed, setFailed] = useState<string | undefined>();
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
    if (!isMock && side.live) {
      // Live: one tap runs every wallet step of this side (the burner wallet signs; the faucet tops it up first).
      const live = side.live;
      setPhase("wallet");
      setFailed(undefined);
      void withMRA((m) =>
        live(m, n, (st) => {
          setPhase("pending");
          if (st.status !== "pending") setStep((i) => Math.min(i + 1, side.steps.length - 1));
        }),
      ).then(
        (r) => {
          setHash(r.hash);
          setPhase("idle");
          setDone(true);
        },
        (e) => {
          setFailed(errorCode(e));
          setPhase("idle");
          setStep(0);
        },
      );
      return;
    }
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
      <LendShell width="narrow" note={worldNote}>
        <PageHead back={back} backLabel={backLabel} label={label} title={title} />
        <Card padding="lg" className="items-center gap-4 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-hunter text-lime">
            <CheckIcon size={32} strokeWidth={3} />
          </span>
          <Heading level={2} size="h1">
            {side.done(n)}
          </Heading>
          <Text>{side.doneSub}</Text>
        </Card>
        {isMock ? (
          <Banner>Simulated. A demo wallet confirmed it; nothing left this browser.</Banner>
        ) : (
          <Card gap="sm">
            <Text size="note">Confirmed on Sepolia from the wallet on this device.</Text>
            {hash ? <CopyHash value={hash} short /> : null}
            {explorerTxUrl(hash) ? (
              <TextLink href={explorerTxUrl(hash)!} target="_blank" rel="noreferrer" arrow>
                See it on Etherscan
              </TextLink>
            ) : null}
          </Card>
        )}
        <ActionBar>
          <Button href={after.href}>{after.label}</Button>
        </ActionBar>
      </LendShell>
    );
  }

  const cta = n <= 0 ? "Enter an amount" : over ? `More than ${side.maxLabel}` : phase === "wallet" ? "Confirm in wallet" : phase === "pending" ? "Confirming" : side.steps[step]!;

  return (
    <LendShell width="narrow" note={worldNote}>
      <PageHead back={back} backLabel={backLabel} label={label} title={title} />
      <Segmented label={title} value={sideKey} onChange={reset} options={sides.map((s) => ({ value: s.key, label: s.label }))} />
      <Pub>
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <span
            className={n === 0 ? "font-display text-amount tabular-nums text-charcoal-muted" : "font-display text-amount tabular-nums text-charcoal"}
            aria-live="polite"
            aria-atomic
          >
            {typedUsd(value)}
          </span>
          <span className={over ? "font-ledger text-ledger text-risk" : "font-ledger text-ledger text-charcoal-muted"}>
            {n > 0 && !over ? side.quote(n) : side.maxLabel}
          </span>
        </div>
      </Pub>
      <div role="group" aria-label="Quick amounts" className="flex justify-center gap-2">
        {[0.25, 0.5, 1].map((f) => (
          <button
            key={f}
            type="button"
            disabled={busy}
            onClick={() => setValue(String(Math.floor(side.max * f * 100) / 100))}
            className="min-h-11 cursor-pointer rounded-chip border border-control bg-surface px-4 font-body text-note font-semibold text-charcoal hover:bg-well disabled:cursor-not-allowed disabled:opacity-55"
          >
            {f === 1 ? "Max" : `${f * 100}%`}
          </button>
        ))}
      </div>
      <Keypad value={value} onChange={(v) => !busy && setValue(v)} />
      {failed ? <Banner tone="caution">Didn&rsquo;t go through ({failed}). Nothing moved.</Banner> : null}
      <ActionBar>
        {side.steps.length > 1 ? (
          <div className="md:mr-auto">
            <Steps items={side.steps.map((s, i) => ({ label: s, state: i < step ? "done" : i === step ? "current" : "next" }))} />
          </div>
        ) : null}
        <Button width="full" onClick={run} loading={busy} disabled={n <= 0 || over || busy}>
          {cta}
        </Button>
      </ActionBar>
    </LendShell>
  );
}

/** Deposit max in live modes: the wallet's USDC, or what the faucet sends an empty burner on the first write. */
const fundable = (walletUsdc: number) => (isMock || walletUsdc > 0 ? walletUsdc : FAUCET_USDC);

/** L02: `lender.depositView()`, then `lender.deposit(n)` / `lender.withdraw(n)` in live modes. */
export function DepositScreen({ side, initial }: { side?: string; initial: DepositView | null }) {
  const { data, error } = useMRA(q.deposit, { initial });
  if (!data) return <MRAState error={error} />;
  const VAULT = vaultNumbers(data.vault);
  const walletMax = fundable(VAULT.walletUsdc);
  return (
    <VaultAction
      title="Senior vault"
      label="Earn"
      back={routes.earn}
      backLabel="Earn"
      initial={side}
      worldNote="Deposits and shares are onchain under this wallet. Your name is not."
      after={{ href: routes.position, label: "See my position" }}
      sides={[
        {
          key: "deposit",
          label: "Deposit",
          max: walletMax,
          maxLabel: walletMax === VAULT.walletUsdc ? `Wallet: ${usdText(VAULT.walletUsdc)} USDC` : `Test USDC: up to ${usdText(walletMax)}`,
          quote: (n) => `≈ ${fmt(n / (VAULT.sharePrice || 1))} shares at ${price(VAULT.sharePrice)}`,
          live: (m, n, onStep) => m.lender.deposit(n, { onStep }),
          steps: ["Approve USDC", "Deposit"],
          done: (n) => `Deposited ${usdText(n, 2)}`,
          doneSub: "You earn from shop fees. Senior is paid back before junior.",
        },
        {
          key: "withdraw",
          label: "Withdraw",
          max: VAULT.availableToWithdraw,
          maxLabel: `Available now: ${usdText(VAULT.availableToWithdraw)}`,
          quote: (n) => `${fmt(n / (VAULT.sharePrice || 1))} shares → ${usdText(n, 2)} USDC`,
          live: (m, n, onStep) => m.lender.withdraw(n, { onStep }),
          steps: ["Withdraw"],
          done: (n) => `Withdrew ${usdText(n, 2)}`,
          doneSub: "The rest stays in advances until shops repay.",
        },
      ]}
    />
  );
}

/** J02: `lender.junior.mintView()`, then `lender.junior.deposit(n)` / `withdraw(n)` in live modes. */
export function MintScreen({ initial }: { initial: DepositView | null }) {
  const { data, error } = useMRA(q.mint, { initial });
  if (!data) return <MRAState error={error} />;
  const VAULT = vaultNumbers(data.vault);
  const walletMax = fundable(VAULT.walletUsdc);
  const book = VAULT.juniorBook || 1;
  return (
    <VaultAction
      title="JAR-J"
      label="Junior"
      back={routes.junior}
      backLabel="Junior"
      worldNote="Mints and redemptions are public, like every token transfer."
      after={{ href: routes.junior, label: "Back to junior" }}
      sides={[
        {
          key: "mint",
          label: "Mint",
          max: walletMax,
          maxLabel: walletMax === VAULT.walletUsdc ? `Wallet: ${usdText(VAULT.walletUsdc)} USDC` : `Test USDC: up to ${usdText(walletMax)}`,
          quote: (n) => `${fmt(n / book, 2)} JAR-J at book ${price(VAULT.juniorBook)}`,
          live: (m, n, onStep) => m.lender.junior.deposit(n, { onStep }),
          steps: ["Approve USDC", "Mint"],
          done: (n) => `Minted ${fmt(n / book, 2)} JAR-J`,
          doneSub: `First loss: you take losses before senior, for ${data.vault.feeShareJunior} of every fee.`,
        },
        {
          key: "redeem",
          label: "Redeem",
          max: VAULT.walletJarJ,
          maxLabel: `You hold ${VAULT.walletJarJ} JAR-J`,
          quote: (n) => `${usdText(n * VAULT.juniorBook, 2)} USDC at book`,
          live: (m, n, onStep) => m.lender.junior.withdraw(n * book, { onStep }),
          steps: ["Redeem"],
          done: (n) => `Redeemed ${fmt(n, 2)} JAR-J`,
          doneSub: "USDC is back in your wallet.",
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------- J03 Trade */
/** J03: `lender.junior.trade()` for the price, TWAP, book and history. The swap itself is simulated in every mode. */
export function TradeScreen({ initial }: { initial: TradeView | null }) {
  const { data, error } = useMRA(q.trade, { initial });
  if (!data) return <MRAState error={error} />;
  return <TradeForm view={data} />;
}

function TradeForm({ view }: { view: TradeView }) {
  const { juniorSeries, writeOffIndex } = view;
  const VAULT = vaultNumbers(view.vault);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("100");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const n = Number(value || 0);
  const out = side === "buy" ? n / (VAULT.juniorPrice || 1) : n * VAULT.juniorPrice;
  const discount = VAULT.juniorBook > 0 ? (((VAULT.juniorBook - VAULT.juniorPrice) / VAULT.juniorBook) * 100).toFixed(1) : "0.0";

  return (
    <LendShell note="The pool, its price and every swap are public.">
      <PageHead back={routes.junior} backLabel="Junior" label="Uniswap v4 · JAR-J / USDC" title="Trade JAR-J" />
      <Columns ratio="3:2">
        <Stack gap="lg">
          <Pub>
            <Card>
              <div className="flex items-center justify-between gap-3">
                <Label>JAR-J price, 12 weeks</Label>
                <Pill tone="slow">{discount}% under book</Pill>
              </div>
              <LineChart
                points={juniorSeries}
                height={180}
                label="JAR-J price over 12 weeks, dipping at the write-off"
                markers={writeOffIndex >= 0 ? [{ index: writeOffIndex, label: isMock ? "The $100 write-off" : "Latest write-off" }] : []}
                xLabels={["12 weeks ago", "Now"]}
                format={price}
              />
            </Card>
          </Pub>
          <Pub>
            <StatGrid
              items={[
                { label: "Price", value: view.vault.juniorPrice },
                { label: "TWAP", value: view.vault.juniorTwap },
                { label: "Book", value: price(VAULT.juniorBook) },
              ]}
            />
          </Pub>
        </Stack>
        <Stack gap="lg">
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
          <div className="flex flex-col items-center gap-1 text-center">
            <span className={n === 0 ? "font-display text-amount tabular-nums text-charcoal-muted" : "font-display text-amount tabular-nums text-charcoal"} aria-live="polite" aria-atomic>
              {side === "buy" ? typedUsd(value) : `${value || "0"} J`}
            </span>
            <span className="font-ledger text-ledger text-charcoal-muted">
              {n > 0 ? (side === "buy" ? `≈ ${fmt(out, 2)} JAR-J` : `≈ ${usdText(out, 2)} USDC`) : "Enter an amount"} · hook fee to reserve
            </span>
          </div>
          <Keypad
            value={value}
            onChange={(v) => {
              setDone(null);
              setValue(v);
            }}
          />
          {done ? <Banner>{done}</Banner> : null}
        </Stack>
      </Columns>
      <ActionBar>
        <Button
          loading={busy}
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
    </LendShell>
  );
}

/* ----------------------------------------------------------- P04 Explorer */
const FILTERS: { value: "all" | ExplorerKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Sale", label: "Sales" },
  { value: "Draw", label: "Draws" },
  { value: "Pass", label: "Passes" },
];

const kindTone = (k: ExplorerKind) => (k === "Draw" ? ("repaying" as const) : k === "Sale" ? ("saving" as const) : ("locked" as const));

type ExplorerKind = string;
type Ev = ExplorerEventVM;

/** P04: `protocol.explorer()`, the recent public events. Search and filters run on this device. */
export function ExplorerScreen({ initial }: { initial: ExplorerView | null }) {
  const { data, error } = useMRA(q.explorer, { initial });
  if (!data) return <MRAState error={error} />;
  return <ExplorerList explorerEvents={data.events} />;
}

function ExplorerList({ explorerEvents }: { explorerEvents: Ev[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | ExplorerKind>("all");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return explorerEvents.filter(
      (e) => (filter === "all" || e.kind === filter || (filter === "Pass" && e.kind === "Proof")) && (!s || `${e.title} ${e.detail} ${e.hash}`.toLowerCase().includes(s)),
    );
  }, [q, filter, explorerEvents]);

  return (
    <LendShell note="This is the whole public record. Look for a name: there isn't one.">
      <PageHead label="Public record" title="Explorer">
        Every sale, draw and pass, newest first.
      </PageHead>
      <Columns ratio="1:2">
        <Stack>
          <TextField
            label="Search"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="shop_7f3a, 0x…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Chips label="Filter" value={filter} onChange={setFilter} options={FILTERS} />
          <Banner>No names anywhere. shop_b19c has no onchain link to shop_7f3a, even though it is the same owner.</Banner>
        </Stack>
        <Pub>
          {rows.length > 0 ? (
            <DataTable<Ev>
              caption="Public events, newest first"
              rows={rows}
              rowKey={(e) => e.hash}
              columns={[
                { key: "kind", label: "Type", render: (e) => <Pill tone={kindTone(e.kind)}>{e.kind}</Pill> },
                {
                  key: "event",
                  label: "Event",
                  render: (e) => (
                    <span className="flex flex-col gap-0.5 md:text-left">
                      <span className="font-semibold">{e.title}</span>
                      <span className="font-normal text-charcoal-muted">{e.detail}</span>
                    </span>
                  ),
                },
                { key: "when", label: "When", render: (e) => e.when },
                { key: "hash", label: "Hash", render: (e) => <CopyHash value={e.hash} short /> },
              ]}
            />
          ) : (
            <Card>
              <Text>Nothing matches. Try a shop id like shop_b19c.</Text>
            </Card>
          )}
        </Pub>
      </Columns>
    </LendShell>
  );
}
