"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionBar,
  Banner,
  BrandPanel,
  Button,
  Card,
  CheckIcon,
  CopyHash,
  Heading,
  Keypad,
  KeyValue,
  Label,
  Ledger,
  LockIcon,
  SplitPage,
  Text,
  TextLink,
  typedUsd,
} from "@/final";
import { APP_NAME } from "@/lib/brand";
import type { PayShopView } from "@repo/sdk";
import { formatMoney } from "@/lib/format";
import { payCopy } from "@/lib/copy";
import { errorCode, explorerTxUrl, isMock, withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useCurrency } from "@/lib/currency";
import { useMRA } from "@/lib/use-mra";
import { litTiles } from "./lit-tiles";

/** Checkout pays in USDC only; no token swap exists. */
const TOKEN = "USDC";

/**
 * The seeded Sepolia demo shop: `keccak256(toBytes("chai-stall"))`, the id `agents/scripts/seed_sepolia.py` registers
 * (`registerShop(keccak(label), payout)`). Checked with `cast keccak "chai-stall"`.
 */
const DEMO_SHOP_ID = "0xd2ad3e1920c292f23975ba7355ac9c6e2cfa409b3e12ff1537d187e9fd77ffa4";
const DEMO_SHOP_HREF = `${routes.pay}?shop=${DEMO_SHOP_ID}&name=Hash+House+Chai`;

/** Live mode, opened without a QR: no shop id to pay. Point at the demo shop instead of an error. */
function ScanToPay() {
  return (
    <div role="alert" className="flex max-w-xl flex-col gap-3 p-6">
      <h1 className="m-0 font-display text-h2 font-bold text-charcoal">Scan a shop&apos;s QR code to pay</h1>
      <p className="m-0 font-body text-read text-charcoal-muted">
        This page opens from the QR code at the counter, which tells it which shop you are paying.
      </p>
      <Button href={DEMO_SHOP_HREF}>Try the demo shop</Button>
    </div>
  );
}

/** Which shop the QR points at. Live modes need the bytes32 shop id (`?shop=0x…&name=…`); mock uses the demo shop. */
export type PayTarget = { shopId?: string; name?: string };

function targetQuery(target: PayTarget) {
  const sp = new URLSearchParams();
  if (target.shopId) sp.set("shop", target.shopId);
  if (target.name) sp.set("name", target.name);
  return sp;
}

/** Hosted-checkout trust line at the top of the brand panel. */
function Secured() {
  return (
    <span className="inline-flex w-fit items-center gap-2 font-body text-note font-semibold text-honeydew">
      <LockIcon size={16} />
      {payCopy.secured(APP_NAME)}
    </span>
  );
}

/** The same trust line under the receipt, on the light column. */
function SecuredLine() {
  return (
    <p className="m-0 inline-flex items-center justify-center gap-2 font-body text-note text-charcoal-muted md:justify-start">
      <LockIcon size={16} />
      {payCopy.secured(APP_NAME)}
    </p>
  );
}

/** The shop's initials badge, lime on the Hunter panel. */
function ShopBadge({ initials }: { initials: string }) {
  return (
    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-lg bg-lime font-display text-[20px] font-bold text-charcoal md:size-16 md:text-[26px]">
      {initials}
    </span>
  );
}

/*
 * C01 Scan & pay: `pay.shop(shopId)`, then `pay.pay(shopId, amount)` (live: faucet on first use, approve USDC once,
 * pay; the contract splits the sale). The customer's phone: the shop, the amount, the token. Nothing about an advance,
 * a fee or a balance. A keypad, not the system keyboard, so the amount and the button stay in view.
 */
export function PayScreen({ initial, target }: { initial: PayShopView | null; target: PayTarget }) {
  const t = payCopy;
  const router = useRouter();
  const cur = useCurrency();
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [value, setValue] = useState("10");
  const [paying, setPaying] = useState(false);
  const [funding, setFunding] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  const amount = Number(value || 0);

  useEffect(() => {
    router.prefetch(routes.paid);
  }, [router]);

  if (!isMock && !target.shopId) return <ScanToPay />;
  if (!shop) return <MRAState error={error} />;

  const pay = async () => {
    setPaying(true);
    setFailed(undefined);
    // Demo: shown as received the moment it is sent. Keep the beat.
    const beat = new Promise((r) => window.setTimeout(r, 900));
    try {
      const receipt = await withMRA((m) =>
        m.pay.pay(target.shopId ?? shop.id, amount, {
          onFunding: () => setFunding(true),
          onStep: () => setFunding(false),
          ...(target.name ? { name: target.name } : {}),
        }),
      );
      await beat;
      const sp = new URLSearchParams({ amt: receipt.amount.toFixed(2), tok: TOKEN });
      targetQuery(target).forEach((v, k) => sp.set(k, v));
      if (receipt.source !== "mock") sp.set("tx", receipt.txHash);
      router.push(`${routes.paid}?${sp}`);
    } catch (e) {
      setFailed(errorCode(e));
      setPaying(false);
      setFunding(false);
    }
  };

  return (
    <>
      <SplitPage
        panel={
          <BrandPanel
            blocks={{ seed: 31 }}
            top={<Secured />}
            eyebrow={t.verified}
            title={
              <span className="flex items-center gap-4">
                <ShopBadge initials={shop.initials} />
                <span className="min-w-0 [overflow-wrap:anywhere]">{shop.name}</span>
              </span>
            }
            body={t.panel}
          >
            <div className="w-fit">
              <Ledger className="text-honeydew">{shop.id}</Ledger>
            </div>
          </BrandPanel>
        }
      >
        <div>
          <div className="flex flex-col items-center gap-1 py-1 text-center md:items-start md:text-left">
            <Label>{t.amount}</Label>
            <span
              aria-live="polite"
              aria-atomic
              className={`font-display text-hero-sm tabular-nums md:text-hero ${amount === 0 ? "text-charcoal-muted" : "text-charcoal"}`}
            >
              {typedUsd(value)}
            </span>
            <Ledger className="text-charcoal-muted">{amount === 0 ? t.enter : cur.dollarsOnly ? "\u00a0" : `${cur.approx(amount)} · ${t.exampleRate}`}</Ledger>
          </div>
        </div>
        <Keypad value={value} onChange={setValue} />
        {failed ? <Banner tone="caution">{t.failed(failed)}</Banner> : null}
        {paying && funding ? <Ledger role="status">{t.funding}</Ledger> : null}
        <ActionBar hint={isMock ? t.hint : t.testUsdc}>
          <Button width="full" onClick={() => void pay()} loading={paying} disabled={amount <= 0 || paying}>
            {amount > 0 ? t.pay(formatMoney(amount)) : t.enter}
          </Button>
        </ActionBar>
      </SplitPage>
    </>
  );
}

/* C02 Payment success: the receipt of `pay.pay(...)` (amount, tx in the URL) plus `pay.shop()` for the name. */
export function PaidScreen({
  amount,
  token,
  initial,
  target,
  tx,
}: {
  amount: number;
  token: string;
  initial: PayShopView | null;
  target: PayTarget;
  tx?: string | undefined;
}) {
  const t = payCopy;
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [time] = useState(() => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const usd = formatMoney(Number(amount.toFixed(2)));
  if (!shop) return <MRAState error={error} />;
  const again = targetQuery(target).toString();
  const txUrl = explorerTxUrl(tx);
  return (
    <>
      <SplitPage
        panel={
          <BrandPanel
            blocks={{ seed: 37, lit: litTiles(6) }}
            top={<Secured />}
            eyebrow={t.paidEyebrow}
            title={
              <span className="flex items-center gap-4">
                <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-lime text-hunter motion-safe:animate-[page-in_600ms_var(--ease-snappy)_both] md:size-18">
                  <CheckIcon size={32} strokeWidth={3} />
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{t.paidTitle(usd)}</span>
              </span>
            }
            body={
              <>
                {t.paidTo(shop.name)} · <span suppressHydrationWarning>{time}</span>
              </>
            }
          />
        }
      >
        <Text className="md:hidden">
          {t.paidTo(shop.name)} · <span suppressHydrationWarning>{time}</span>
        </Text>
        <Card as="section" aria-labelledby="receipt-title" padding="lg" className="motion-safe:animate-[page-in_500ms_var(--ease-snappy)_250ms_both]">
          <Heading level={2} size="h2" id="receipt-title">
            {t.receipt}
          </Heading>
          <KeyValue
            rows={[
              [t.sent, `${amount.toFixed(2)} ${token}`],
              [
                t.received(shop.name),
                <div key="r">
                  {usd}
                </div>,
              ],
              [t.fee, t.covered],
              [
                t.ref,
                <div key="f">
                  <CopyHash value={tx ?? shop.wallet} short />
                </div>,
              ],
            ]}
          />
          {txUrl ? (
            <TextLink href={txUrl} target="_blank" rel="noreferrer" arrow>
              {t.etherscan}
            </TextLink>
          ) : null}
        </Card>
        <ActionBar>
          <Button href={again ? `${routes.pay}?${again}` : routes.pay}>{t.done}</Button>
          <TextLink href={routes.merchant}>{t.shopPhone}</TextLink>
        </ActionBar>
        <SecuredLine />
      </SplitPage>
    </>
  );
}
