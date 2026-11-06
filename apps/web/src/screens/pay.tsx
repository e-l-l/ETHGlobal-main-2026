"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionBar,
  AppHeader,
  Banner,
  BrandPanel,
  Button,
  Card,
  CheckIcon,
  CopyHash,
  Heading,
  Keypad,
  KeyValue,
  LangToggle,
  Label,
  Ledger,
  LockIcon,
  Segmented,
  SplitPage,
  Text,
  TextLink,
  typedUsd,
  WorldMark,
} from "@/final";
import { APP_NAME } from "@/lib/brand";
import type { PayShopView } from "@repo/sdk";
import { formatMoney } from "@/lib/format";
import { payCopy, type Lang } from "@/lib/copy";
import { errorCode, explorerTxUrl, isMock, withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { toLocal } from "@/lib/mock/shop";
import { useMRA } from "@/lib/use-mra";
import { useWorldView } from "@/lib/world-view";

type Token = "USDT" | "USDC" | "DAI";
/**
 * Mock: the designed picker (any token, swapped through Uniswap). Live: test USDC only, because the swap isn't built,
 * so nothing on screen promises one.
 */
const TOKENS: Token[] = isMock ? ["USDT", "USDC", "DAI"] : ["USDC"];
const DEFAULT_TOKEN: Token = isMock ? "USDT" : "USDC";

/** Which shop the QR points at. Live modes need the bytes32 shop id (`?shop=0x…&name=…`); mock uses the demo shop. */
export type PayTarget = { shopId?: string; name?: string };

function targetQuery(target: PayTarget) {
  const sp = new URLSearchParams();
  if (target.shopId) sp.set("shop", target.shopId);
  if (target.name) sp.set("name", target.name);
  return sp;
}

function PayHeader({ lang }: { lang: Lang }) {
  return <AppHeader home={routes.home} end={<LangToggle lang={lang} />} />;
}

/** Hosted-checkout trust line at the top of the brand panel. */
function Secured({ lang }: { lang: Lang }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 font-body text-note font-semibold text-honeydew">
      <LockIcon size={16} />
      {payCopy[lang].secured(APP_NAME)}
    </span>
  );
}

/** The same trust line under the receipt, on the light column. */
function SecuredLine({ lang }: { lang: Lang }) {
  return (
    <p className="m-0 inline-flex items-center justify-center gap-2 font-body text-note text-charcoal-muted md:justify-start">
      <LockIcon size={16} />
      {payCopy[lang].secured(APP_NAME)}
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
export function PayScreen({ lang, initial, target }: { lang: Lang; initial: PayShopView | null; target: PayTarget }) {
  const t = payCopy[lang];
  const router = useRouter();
  const wv = useWorldView();
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [value, setValue] = useState("10");
  const [token, setToken] = useState<Token>(DEFAULT_TOKEN);
  const [paying, setPaying] = useState(false);
  const [funding, setFunding] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  const amount = Number(value || 0);

  useEffect(() => {
    router.prefetch(routes.paid);
  }, [router]);

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
      const sp = new URLSearchParams({ amt: receipt.amount.toFixed(2), tok: token });
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
      <PayHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<Secured lang={lang} />}
            eyebrow={t.verified}
            title={
              <span className="flex items-center gap-4">
                <ShopBadge initials={shop.initials} />
                <span className="min-w-0 [overflow-wrap:anywhere]">{shop.name}</span>
              </span>
            }
            body={t.panel}
          >
            <WorldMark kind="pub" show={wv} className="w-fit">
              <Ledger className="text-honeydew">{shop.id}</Ledger>
            </WorldMark>
            <div className="hidden flex-col gap-2 md:flex">
              <span className="font-ledger text-tag tracking-[0.1em] text-honeydew uppercase">{t.accepted}</span>
              <div className="flex flex-wrap gap-2">
                {TOKENS.map((k) => (
                  <span key={k} className="rounded-chip border border-honeydew/40 px-3 py-1 font-ledger text-ledger font-semibold text-canvas">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </BrandPanel>
        }
      >
        <WorldMark kind="pub" show={wv}>
          <div className="flex flex-col items-center gap-1 py-1 text-center md:items-start md:text-left">
            <Label>{t.amount}</Label>
            <span
              aria-live="polite"
              aria-atomic
              className={`font-display text-hero-sm tabular-nums md:text-hero ${amount === 0 ? "text-charcoal-muted" : "text-charcoal"}`}
            >
              {typedUsd(value)}
            </span>
            <Ledger className="text-charcoal-muted">{amount > 0 ? `≈ ${formatMoney(Math.round(toLocal(amount)), "ARS")} · ${t.exampleRate}` : t.enter}</Ledger>
          </div>
        </WorldMark>
        <div className="flex flex-col gap-2">
          <Label>{t.youPay}</Label>
          <Segmented label={t.youPay} value={token} onChange={setToken} options={TOKENS.map((k) => ({ value: k, label: k }))} />
        </div>
        <Keypad value={value} onChange={setValue} />
        {failed ? <Banner tone="caution">{t.failed(failed)}</Banner> : null}
        {paying && funding ? <Ledger role="status">{t.funding}</Ledger> : null}
        <ActionBar hint={isMock ? t.swap(token) : t.testUsdc}>
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
  lang,
  amount,
  token,
  initial,
  target,
  tx,
}: {
  lang: Lang;
  amount: number;
  token: string;
  initial: PayShopView | null;
  target: PayTarget;
  tx?: string | undefined;
}) {
  const t = payCopy[lang];
  const wv = useWorldView();
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [time] = useState(() => new Date().toLocaleTimeString(lang === "es" ? "es-AR" : "en-GB", { hour: "2-digit", minute: "2-digit" }));
  const usd = formatMoney(Number(amount.toFixed(2)));
  if (!shop) return <MRAState error={error} />;
  const again = targetQuery(target).toString();
  const txUrl = explorerTxUrl(tx);
  return (
    <>
      <PayHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<Secured lang={lang} />}
            eyebrow={t.paidEyebrow}
            title={
              <span className="flex items-center gap-4">
                <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-lime text-hunter md:size-18">
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
        <Card as="section" aria-labelledby="receipt-title" padding="lg">
          <Heading level={2} size="h2" id="receipt-title">
            {t.receipt}
          </Heading>
          <KeyValue
            rows={[
              [t.sent, `${amount.toFixed(2)} ${token}`],
              [
                t.received(shop.name),
                <WorldMark key="r" kind="pub" show={wv}>
                  {usd}
                </WorldMark>,
              ],
              [t.fee, t.covered],
              [
                t.ref,
                <WorldMark key="f" kind="pub" show={wv}>
                  <CopyHash value={tx ?? shop.wallet} short />
                </WorldMark>,
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
        <SecuredLine lang={lang} />
      </SplitPage>
    </>
  );
}
