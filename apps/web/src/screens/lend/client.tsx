"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  Card,
  CheckIcon,
  Chips,
  Columns,
  CopyHash,
  DataTable,
  Heading,
  KeyValue,
  Keypad,
  Label,
  LineChart,
  PageHead,
  Pill,
  Segmented,
  Stack,
  Steps,
  Text,
  TextField,
  TextLink,
  TokenBadge,
  typedUsd,
} from "@/final";
import type { DepositView, ExplorerEventVM, ExplorerView, SwapResult, TradeView, TxResult, TxStep, VaultVM } from "@repo/sdk";
import { cn } from "@/lib/cn";
import { errorCode, explorerTxUrl, isMock, withMRA, type MRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { DarkCard, LendShell, PublicBand } from "./shell";
import { num, vaultNumbers } from "./vault";

/** The demo faucet sends a fresh burner this much test USDC on its first write (agents DEMO_FAUCET_USDC). */
const FAUCET_USDC = 50;

const usdText = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const price = (v: number) => `$${v.toFixed(3)}`;

/* ------------------------------------------------------------ AmountEntry
 * One amount field for every money form here. Desktop: a big text input. Phones: the typed figure over the keypad.
 */
type Unit = "usd" | "drip";

function AmountEntry({
  label,
  hint,
  over,
  unit,
  value,
  onChange,
  disabled,
  quick,
}: {
  label: string;
  hint: ReactNode;
  over?: boolean;
  unit: Unit;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  quick: { label: string; value: number }[];
}) {
  const id = useId();
  const n = Number(value || 0);
  const shown = unit === "usd" ? typedUsd(value) : `${value || "0"} DRIP`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-ledger text-tag font-medium uppercase text-charcoal-muted">
          {label}
        </label>
        <span className={cn("text-right font-body text-note", over ? "font-semibold text-risk" : "text-charcoal-muted")}>{hint}</span>
      </div>
      <div className="hidden h-16 items-center gap-2 rounded-md border border-control bg-surface px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-charcoal md:flex">
        {unit === "usd" ? <span className="font-display text-h1 text-charcoal-muted">$</span> : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            if (/^\d{0,7}(\.\d{0,2})?$/.test(v)) onChange(v.replace(/^0+(?=\d)/, ""));
          }}
          className="min-w-0 flex-1 bg-transparent font-display text-amount tabular-nums text-charcoal outline-none placeholder:text-charcoal-muted disabled:opacity-55"
        />
        {unit === "drip" ? <span className="font-ledger text-ledger font-semibold text-charcoal-muted">DRIP</span> : null}
      </div>
      <span
        className={cn("py-1 text-center font-display text-amount tabular-nums md:hidden", n === 0 ? "text-charcoal-muted" : "text-charcoal")}
        aria-live="polite"
        aria-atomic
      >
        {shown}
      </span>
      <div role="group" aria-label="Quick amounts" className="grid grid-cols-4 gap-2">
        {quick.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={disabled || c.value <= 0}
            onClick={() => onChange(String(Math.floor(c.value * 100) / 100))}
            className="min-h-11 cursor-pointer rounded-chip border border-control bg-surface px-2 font-body text-note font-semibold text-charcoal hover:bg-well disabled:cursor-not-allowed disabled:opacity-55"
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="md:hidden">
        <Keypad value={value} onChange={(v) => !disabled && onChange(v)} />
      </div>
    </div>
  );
}

/** After a write: simulated in mock, a Sepolia hash and Etherscan link live. */
function TxReceipt({ hash }: { hash?: string | undefined }) {
  if (isMock) return <Banner>Simulated. A demo wallet confirmed it; nothing left this browser.</Banner>;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-well p-4">
      <Text size="note">Confirmed on Sepolia from the wallet on this device.</Text>
      {hash ? <CopyHash value={hash} short /> : null}
      {explorerTxUrl(hash) ? (
        <TextLink href={explorerTxUrl(hash)!} target="_blank" rel="noreferrer" arrow>
          See it on Etherscan
        </TextLink>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ ActionForm
 * Deposit / withdraw and mint / redeem: one shape. Amount, what you get, the wallet steps on the button.
 * The demo wallet confirms by itself; live modes run every wallet step of the side on one tap.
 */
type Side = {
  key: string;
  label: string;
  unit: Unit;
  amountLabel: string;
  max: number;
  maxLabel: string;
  quick: { label: string; value: number }[];
  details: (n: number) => [ReactNode, ReactNode][];
  cta: (n: number) => string;
  steps: string[];
  done: (n: number) => string;
  doneSub: string;
  /** Live modes: the SDK write for this side (approve + deposit, or one withdraw), reporting each wallet step. */
  live?: (mra: MRA, n: number, onStep: (s: TxStep) => void) => Promise<TxResult>;
};

type Phase = "idle" | "wallet" | "pending";

function ActionForm({ label, sides, initial, after, note }: { label: string; sides: [Side, Side]; initial?: string | undefined; after: { href: string; label: string }; note?: ReactNode }) {
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
    setDone(false);
    setFailed(undefined);
  };

  const run = () => {
    if (!isMock && side.live) {
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
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-hunter text-lime">
          <CheckIcon size={32} strokeWidth={3} />
        </span>
        <Heading level={2} size="h1">
          {side.done(n)}
        </Heading>
        <Text>{side.doneSub}</Text>
        <div className="w-full text-left">
          <TxReceipt hash={hash} />
        </div>
        <div className="flex w-full flex-col gap-2 md:flex-row">
          <Button href={after.href}>{after.label}</Button>
          <Button variant="secondary" onClick={() => reset(side.key)}>
            Another {side.label.toLowerCase()}
          </Button>
        </div>
      </div>
    );
  }

  const last = step >= side.steps.length - 1;
  const cta =
    n <= 0
      ? "Enter an amount"
      : over
        ? `More than ${side.maxLabel.toLowerCase()}`
        : phase === "wallet"
          ? "Confirm in wallet"
          : phase === "pending"
            ? "Confirming"
            : last
              ? side.cta(n)
              : side.steps[step]!;

  return (
    <div className="flex flex-col gap-5">
      <Segmented label={label} value={sideKey} onChange={reset} options={sides.map((s) => ({ value: s.key, label: s.label }))} />
      <div>
        <AmountEntry
          label={side.amountLabel}
          hint={side.maxLabel}
          over={over}
          unit={side.unit}
          value={value}
          onChange={(v) => !busy && setValue(v)}
          disabled={busy}
          quick={side.quick}
        />
      </div>
      <KeyValue className="rounded-md bg-well p-4 text-note" rows={side.details(n)} />
      {failed ? <Banner tone="caution">Didn&rsquo;t go through ({failed}). Nothing moved.</Banner> : null}
      {side.steps.length > 1 ? <Steps items={side.steps.map((s, i) => ({ label: s, state: i < step ? "done" : i === step ? "current" : "next" }))} /> : null}
      <Button width="full" onClick={run} loading={busy} disabled={n <= 0 || over || busy}>
        {cta}
      </Button>
      {note ? <Text size="note" tone="muted">{note}</Text> : null}
    </div>
  );
}

/** Deposit max in live modes: the wallet's USDC, or what the faucet sends an empty burner on the first write. */
const fundable = (walletUsdc: number) => (isMock || walletUsdc > 0 ? walletUsdc : FAUCET_USDC);
const walletLabel = (walletMax: number, walletUsdc: number) => (walletMax === walletUsdc ? `Wallet: ${usdText(walletUsdc)}` : `Test USDC: up to ${usdText(walletMax)}`);
const usdQuick = (max: number) => [
  { label: "25%", value: max * 0.25 },
  { label: "50%", value: max * 0.5 },
  { label: "75%", value: max * 0.75 },
  { label: "Max", value: max },
];

function vaultSides(vault: VaultVM): [Side, Side] {
  const V = vaultNumbers(vault);
  const apy = num(vault.apy);
  const walletMax = fundable(V.walletUsdc);
  const sp = V.sharePrice || 1;
  return [
    {
      key: "deposit",
      label: "Deposit",
      unit: "usd",
      amountLabel: "Amount (USDC)",
      max: walletMax,
      maxLabel: walletLabel(walletMax, V.walletUsdc),
      quick: usdQuick(walletMax),
      details: (n) => [
        ["You get", `≈ ${fmt(n / sp)} vault shares`],
        ["Share price", price(V.sharePrice)],
        ["Estimated per year", n > 0 && apy > 0 ? `+${usdText((n * apy) / 100, 2)}` : "—"],
      ],
      cta: (n) => `Deposit ${usdText(n, n % 1 ? 2 : 0)}`,
      live: (m, n, onStep) => m.lender.deposit(n, { onStep }),
      steps: ["Approve USDC", "Deposit"],
      done: (n) => `Deposited ${usdText(n, 2)}`,
      doneSub: "You earn from every advance fee. DripCoin and the reserve take a loss before the vault does.",
    },
    {
      key: "withdraw",
      label: "Withdraw",
      unit: "usd",
      amountLabel: "Amount (USDC)",
      max: V.availableToWithdraw,
      maxLabel: `Available now: ${usdText(V.availableToWithdraw)}`,
      quick: usdQuick(V.availableToWithdraw),
      details: (n) => [
        ["Shares redeemed", `${fmt(n / sp)}`],
        ["You get", `${usdText(n, 2)} USDC`],
        ["Comes from", "Cash not lent out"],
      ],
      cta: (n) => `Withdraw ${usdText(n, n % 1 ? 2 : 0)}`,
      live: (m, n, onStep) => m.lender.withdraw(n, { onStep }),
      steps: ["Withdraw"],
      done: (n) => `Withdrew ${usdText(n, 2)}`,
      doneSub: "The rest stays in advances until shops' customers pay them back.",
    },
  ];
}

const VAULT_NOTE = "Returns aren't guaranteed. If a shop stops paying, DripCoin (DRIP) holders and the reserve take the loss before the vault does.";

/** The deposit panel on the Vault page (desktop). Phones get buttons to L02 instead. */
export function DepositPanel({ vault }: { vault: VaultVM }) {
  return (
    <Card padding="lg" gap="lg" className="shadow-lift">
      <ActionForm label="Deposit or withdraw" sides={vaultSides(vault)} after={{ href: routes.position, label: "See my position" }} note={VAULT_NOTE} />
    </Card>
  );
}

/** The dark position card (Vault page and L02). */
export function PositionCard({ vault, link = true }: { vault: VaultVM; link?: boolean }) {
  return (
    <div>
      <DarkCard label="Your position">
        <Label className="text-lime">Your position</Label>
        <span className="font-display text-amount tabular-nums text-canvas">{vault.positionValue}</span>
        <div className="flex justify-between gap-3 font-body text-note text-honeydew">
          <span>Earned so far</span>
          <span className="font-semibold text-lime">{vault.positionEarned}</span>
        </div>
        {link ? (
          <TextLink href={routes.position} arrow className="text-lime hover:text-honeydew">
            See activity
          </TextLink>
        ) : null}
      </DarkCard>
    </div>
  );
}

/** L02: `lender.depositView()`, then `lender.deposit(n)` / `lender.withdraw(n)` in live modes. */
export function DepositScreen({ side, initial }: { side?: string; initial: DepositView | null }) {
  const { data, error } = useMRA(q.deposit, { initial });
  if (!data) return <MRAState error={error} />;
  return (
    <LendShell>
      <PageHead back={routes.earn} backLabel="Vault" label="The vault · USDC" title="Deposit or withdraw">
        Your USDC funds small stock advances. It comes back, with fees, as shops&rsquo; customers pay.
      </PageHead>
      <Columns ratio="3:2">
        <Card padding="lg" gap="lg">
          <ActionForm label="Deposit or withdraw" sides={vaultSides(data.vault)} initial={side} after={{ href: routes.position, label: "See my position" }} note={VAULT_NOTE} />
        </Card>
        <Stack gap="lg">
          <PositionCard vault={data.vault} />
          <Card>
            <Label>Vault right now</Label>
            <KeyValue
              rows={[
                ["APY", data.vault.apy],
                ["Share price", data.vault.sharePrice],
                ["Out in advances", data.vault.outstanding],
                ["Available to withdraw", data.vault.availableToWithdraw],
              ]}
            />
          </Card>
        </Stack>
      </Columns>
    </LendShell>
  );
}

/** J02: `lender.junior.mintView()`, then `lender.junior.deposit(n)` / `withdraw(n)` in live modes. */
export function MintScreen({ initial }: { initial: DepositView | null }) {
  const { data, error } = useMRA(q.mint, { initial });
  if (!data) return <MRAState error={error} />;
  const V = vaultNumbers(data.vault);
  const walletMax = fundable(V.walletUsdc);
  const book = V.juniorBook || 1;
  const cheaperToMint = V.juniorPrice > book;
  const sides: [Side, Side] = [
    {
      key: "mint",
      label: "Mint",
      unit: "usd",
      amountLabel: "You pay (USDC)",
      max: walletMax,
      maxLabel: walletLabel(walletMax, V.walletUsdc),
      quick: usdQuick(walletMax),
      details: (n) => [
        ["You get", `${fmt(n / book, 2)} DRIP`],
        ["At book value", `${price(book)} per DRIP`],
      ],
      cta: (n) => `Mint ${fmt(n / book, 2)} DRIP`,
      live: (m, n, onStep) => m.lender.junior.deposit(n, { onStep }),
      steps: ["Approve USDC", "Mint"],
      done: (n) => `Minted ${fmt(n / book, 2)} DRIP`,
      doneSub: `First loss: you cover write-offs before the vault, for ${data.vault.feeShareJunior} of every advance fee.`,
    },
    {
      key: "redeem",
      label: "Redeem",
      unit: "drip",
      amountLabel: "You redeem (DRIP)",
      max: V.walletJarJ,
      maxLabel: `You hold ${fmt(V.walletJarJ, 2)} DRIP`,
      quick: [
        { label: "25%", value: V.walletJarJ * 0.25 },
        { label: "50%", value: V.walletJarJ * 0.5 },
        { label: "75%", value: V.walletJarJ * 0.75 },
        { label: "Max", value: V.walletJarJ },
      ],
      details: (n) => [
        ["You get", `${usdText(n * book, 2)} USDC`],
        ["At book value", `${price(book)} per DRIP`],
      ],
      cta: (n) => `Redeem ${fmt(n, 2)} DRIP`,
      live: (m, n, onStep) => m.lender.junior.withdraw(n * book, { onStep }),
      steps: ["Redeem"],
      done: (n) => `Redeemed ${fmt(n, 2)} DRIP`,
      doneSub: "USDC is back in your wallet.",
    },
  ];
  return (
    <LendShell>
      <PageHead back={routes.dripcoin} backLabel="DripCoin" label="DripCoin · DRIP" title="Mint or redeem DRIP">
        Mint at book value with USDC, or redeem DRIP back to USDC.
      </PageHead>
      <Columns ratio="3:2">
        <Card padding="lg" gap="lg">
          <ActionForm
            label="Mint or redeem"
            sides={sides}
            after={{ href: routes.dripcoin, label: "Back to DripCoin" }}
            note="DRIP takes losses first. If an advance is written off, book value falls before the vault loses anything."
          />
        </Card>
        <Stack gap="lg">
          <div>
            <Card>
              <Heading level={2} size="h2">
                Mint or trade?
              </Heading>
              <KeyValue
                rows={[
                  ["Mint here", `Book value · ${price(book)}`],
                  ["Buy on Uniswap", `Market · ${data.vault.juniorPrice}`],
                ]}
              />
              <Text size="note" tone="muted">
                {cheaperToMint ? "Minting is cheaper while the market price is above book." : "Buying on Uniswap is cheaper while the market price is under book."}{" "}
                <TextLink href={routes.trade}>Trade instead</TextLink>
              </Text>
            </Card>
          </div>
          <div>
            <Card>
              <Label>You hold</Label>
              <div className="flex items-center gap-3">
                <TokenBadge size={40} label="DripCoin (DRIP)" />
                <span className="font-display text-h1 tabular-nums text-charcoal">{fmt(V.walletJarJ, 2)} DRIP</span>
              </div>
              <Text size="note" tone="muted">
                ≈ {usdText(V.walletJarJ * V.juniorPrice, 2)} at market price
              </Text>
            </Card>
          </div>
        </Stack>
      </Columns>
    </LendShell>
  );
}

/* ------------------------------------------------------------- J03 Trade */
/**
 * J03: `lender.junior.trade()` for the price, TWAP, book and history. Live modes swap for real with
 * `lender.junior.swap()` (Uniswap v4 PoolSwapTest → the RiskHook pool, from the burner wallet); mock simulates.
 */
export function TradeScreen({ initial }: { initial: TradeView | null }) {
  const { data, error, reload } = useMRA(q.trade, { initial });
  if (!data) return <MRAState error={error} />;
  return <TradeForm view={data} reload={reload} />;
}

const SWAP_STEPS = (side: "buy" | "sell") => [side === "buy" ? "Approve USDC" : "Approve DRIP", "Swap on Uniswap v4"];
const swapFailText = (code: string) =>
  code === "insufficient_balance"
    ? "Not enough in this wallet for that amount."
    : code === "bad_state"
      ? "The pool can't fill that right now."
      : `Didn’t go through (${code}). Nothing moved.`;

function TradeForm({ view, reload }: { view: TradeView; reload?: () => void }) {
  const { juniorSeries, writeOffIndex } = view;
  const V = vaultNumbers(view.vault);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("100");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [failed, setFailed] = useState<string | undefined>();
  const n = Number(value || 0);
  const out = side === "buy" ? n / (V.juniorPrice || 1) : n * V.juniorPrice;
  const gap = V.juniorBook > 0 ? ((V.juniorPrice - V.juniorBook) / V.juniorBook) * 100 : 0;
  const vsBook = Math.abs(gap) < 0.05 ? "At book" : `${Math.abs(gap).toFixed(1)}% ${gap < 0 ? "under" : "over"} book`;
  const max = side === "buy" ? (isMock ? V.walletUsdc : 0) : V.walletJarJ;
  const clear = () => {
    setDone(null);
    setResult(null);
    setFailed(undefined);
    setSteps([]);
  };

  const trade = () => {
    if (isMock) {
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        setDone(side === "buy" ? `Bought ${fmt(out, 2)} DRIP (simulated).` : `Sold for ${usdText(out, 2)} (simulated).`);
      }, 1100);
      return;
    }
    // Live: approve (once) + swap from the burner wallet; the faucet tops it up first. Then refresh price and TWAP.
    clear();
    setBusy(true);
    void withMRA((m) =>
      m.lender.junior.swap({
        side,
        amount: n,
        slippageBps: 100,
        onStep: (st) => setSteps((prev) => [...prev.filter((x) => x.label !== st.label), st]),
      }),
    ).then(
      (r) => {
        setResult(r);
        setBusy(false);
        reload?.();
        window.setTimeout(() => reload?.(), 6_000); // a load-balanced RPC can lag the receipt by a block
      },
      (e) => {
        setFailed(errorCode(e));
        setBusy(false);
      },
    );
  };

  const stepItems = SWAP_STEPS(side).map((label, i) => {
    const st = steps.find((x) => x.label === label);
    const state: "done" | "current" | "next" = st && st.status !== "pending" ? "done" : st || (busy && i === 0 && steps.length === 0) ? "current" : "next";
    return { label: st?.status === "skipped" ? `${label} (already approved)` : label, state };
  });

  const quick =
    side === "buy"
      ? [
          { label: "$5", value: 5 },
          { label: "$10", value: 10 },
          { label: "$25", value: 25 },
          { label: "Max", value: max },
        ]
      : [
          { label: "5", value: Math.min(5, max) },
          { label: "10", value: Math.min(10, max) },
          { label: "25", value: Math.min(25, max) },
          { label: "Max", value: max },
        ];

  return (
    <LendShell>
      <PageHead
        back={routes.dripcoin}
        backLabel="DripCoin"
        label="Uniswap v4 · DRIP / USDC"
        title="Trade DripCoin"
        actions={
          <div>
            <dl className="m-0 grid grid-cols-3 gap-2">
              {[
                ["Price", view.vault.juniorPrice],
                ["TWAP 1h", view.vault.juniorTwap],
                ["Book value", price(V.juniorBook)],
              ].map(([k, v]) => (
                <div key={k} className="flex min-w-24 flex-col gap-0.5 rounded-md border border-hairline bg-surface px-3 py-2">
                  <dt className="font-ledger text-tag font-medium uppercase text-charcoal-muted">{k}</dt>
                  <dd className="m-0 font-display text-h2 tabular-nums text-charcoal">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />
      <Columns ratio="3:2">
        <Stack gap="lg">
          <div>
            <Card padding="lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Heading level={2} size="h2">
                  DRIP price, 12 weeks
                </Heading>
                <Pill tone={gap < -0.05 ? "slow" : "saving"}>{vsBook}</Pill>
              </div>
              <LineChart
                points={juniorSeries}
                height={220}
                label="DRIP price over 12 weeks"
                markers={writeOffIndex >= 0 ? [{ index: writeOffIndex, label: isMock ? "The $100 write-off" : "Latest write-off" }] : []}
                xLabels={["12 weeks ago", "Now"]}
                format={price}
              />
            </Card>
          </div>
          <Card padding="lg">
            <Heading level={2} size="h2">
              What you hold
            </Heading>
            <Text>
              DripCoin takes losses first. If a shop stops paying and its advance is written off, DRIP covers it before the vault loses a cent. In return DRIP
              earns {view.vault.feeShareJunior} of every advance fee, and its price is a live read on how healthy the advances are.
            </Text>
            <div role="img" aria-label="Who takes a loss: DripCoin first, then the reserve, then the vault" className="flex gap-1 overflow-hidden rounded-md font-body text-note font-semibold">
              <span className="flex-2 bg-hunter px-3 py-2.5 text-canvas">DRIP · first loss</span>
              <span className="flex-1 bg-honeydew px-3 py-2.5 text-hunter">Reserve</span>
              <span className="flex-2 bg-well px-3 py-2.5 text-charcoal-soft">Vault · protected</span>
            </div>
          </Card>
        </Stack>
        <div className="order-first md:order-none">
          <Card padding="lg" gap="lg" className="shadow-lift">
            <Segmented
              label="Buy or sell"
              value={side}
              onChange={(s) => {
                if (busy) return;
                setSide(s);
                setValue("");
                clear();
              }}
              options={[
                { value: "buy", label: "Buy" },
                { value: "sell", label: "Sell" },
              ]}
            />
            <div>
              <AmountEntry
                label={side === "buy" ? "You pay (USDC)" : "You sell (DRIP)"}
                hint={side === "buy" ? (isMock ? `Wallet: ${usdText(V.walletUsdc)}` : "From this device's wallet") : `You hold ${fmt(V.walletJarJ, 2)} DRIP`}
                unit={side === "buy" ? "usd" : "drip"}
                value={value}
                disabled={busy}
                onChange={(v) => {
                  if (busy) return;
                  clear();
                  setValue(v);
                }}
                quick={quick}
              />
            </div>
            <KeyValue
              className="rounded-md bg-well p-4 text-note"
              rows={[
                ["You get", n > 0 ? (side === "buy" ? `≈ ${fmt(out, 2)} DRIP` : `≈ ${usdText(out, 2)} USDC`) : "—"],
                ["Price", view.vault.juniorPrice],
                ["Hook fee", "To the reserve"],
              ]}
            />
            {!isMock ? <Steps items={stepItems} /> : null}
            <Button width="full" loading={busy} disabled={n <= 0 || busy} onClick={trade}>
              {n <= 0 ? "Enter an amount" : side === "buy" ? "Buy DRIP" : "Sell DRIP"}
            </Button>
            {done ? <Banner>{done}</Banner> : null}
            {result ? (
              <div className="flex flex-col gap-2 rounded-md bg-well p-4">
                <Text tone="strong">
                  {result.side === "buy"
                    ? `Bought ${fmt(result.amountOut, 2)} DRIP for ${usdText(result.amountIn, 2)}.`
                    : `Sold ${fmt(result.amountIn, 2)} DRIP for ${usdText(result.amountOut, 2)}.`}
                </Text>
                <Text size="note">
                  RiskHook fee to the reserve: ${result.hookFeeUsdc.toFixed(4)} USDC · price {price(result.priceBefore)} → {price(result.priceAfter)}
                  {result.observationCount !== undefined ? ` · TWAP observation #${result.observationCount}` : ""}
                </Text>
                <CopyHash value={result.txHash} short />
                {explorerTxUrl(result.txHash) ? (
                  <TextLink href={explorerTxUrl(result.txHash)!} target="_blank" rel="noreferrer" arrow>
                    See the swap on Etherscan
                  </TextLink>
                ) : null}
              </div>
            ) : null}
            {failed ? <Banner tone="caution">{swapFailText(failed)}</Banner> : null}
          </Card>
        </div>
      </Columns>
    </LendShell>
  );
}

/* ----------------------------------------------------------- P04 Explorer */
type Filter = "all" | "pay" | "adv" | "pass" | "shop";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pay", label: "Payments" },
  { value: "adv", label: "Advances" },
  { value: "pass", label: "Passes" },
  { value: "shop", label: "Shops" },
];
const inFilter: Record<Exclude<Filter, "all">, string[]> = {
  pay: ["Sale"],
  adv: ["Draw", "Write-off", "Limits"],
  pass: ["Pass", "Proof"],
  shop: ["Shop"],
};

/** The SDK's event kinds, in screen words. */
const kindLabel = (k: string) => (k === "Sale" ? "Payment" : k === "Draw" ? "Advance" : k);
const kindTone = (k: string) =>
  k === "Draw" ? ("repaying" as const) : k === "Sale" ? ("saving" as const) : k === "Write-off" ? ("risk" as const) : k === "Limits" ? ("slow" as const) : ("locked" as const);

type Ev = ExplorerEventVM;

/** P04: `protocol.explorer()`, the recent public events. Search and filters run on this device. */
export function ExplorerScreen({ initial }: { initial: ExplorerView | null }) {
  const { data, error } = useMRA(q.explorer, { initial });
  if (!data) return <MRAState error={error} />;
  return <ExplorerList explorerEvents={data.events} />;
}

function ExplorerList({ explorerEvents }: { explorerEvents: Ev[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return explorerEvents.filter((e) => (filter === "all" || inFilter[filter].includes(e.kind)) && (!s || `${e.title} ${e.detail} ${e.hash}`.toLowerCase().includes(s)));
  }, [search, filter, explorerEvents]);

  return (
    <LendShell>
      <PageHead label="Pseudonyms only · no names anywhere" title="Explorer">
        Every payment, advance and pass, newest first.
      </PageHead>
      <PublicBand seed={17}>No names. Pseudonyms only</PublicBand>
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="md:w-96">
          <TextField
            label="Search"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Shop, transaction or nullifier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Chips label="Filter" value={filter} onChange={setFilter} options={FILTERS} />
      </div>
      <div>
        {rows.length > 0 ? (
          <DataTable<Ev>
            caption="Public events, newest first"
            rows={rows}
            rowKey={(e) => e.hash}
            columns={[
              { key: "kind", label: "Type", render: (e) => <Pill tone={kindTone(e.kind)}>{kindLabel(e.kind)}</Pill> },
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
              { key: "hash", label: "Transaction", render: (e) => <CopyHash value={e.hash} short /> },
              { key: "when", label: "When", align: "right", render: (e) => e.when },
            ]}
          />
        ) : (
          <Card>
            <Text>Nothing matches. Try a shop id like shop_b19c.</Text>
          </Card>
        )}
      </div>
      <Banner>No names anywhere. shop_b19c has no onchain link to shop_7f3a, even though it is the same owner.</Banner>
    </LendShell>
  );
}
