"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionBar, CopyHash, DoneMark, Keypad, LangToggle, LinkButton, Main, Screen, TopBar, typedUsd } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Button, Segmented } from "@/jar/controls";
import { WaveHeader } from "@/jar/domain";
import { arsText, usdText } from "@/jar/format";
import type { PayShopView } from "@repo/sdk";
import { payCopy, type Lang } from "@/lib/copy";
import { errorCode, withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { SALES_CHANNEL, type SaleMessage } from "@/lib/sale-voice";
import { useMRA } from "@/lib/use-mra";

type Token = "USDT" | "USDC" | "DAI";
const TOKENS: Token[] = ["USDT", "USDC", "DAI"];

/** Which shop the QR points at. Real modes need the bytes32 shop id (`?shop=0x…&name=…`); mock uses the demo shop. */
export type PayTarget = { shopId?: string; name?: string };

function targetQuery(target: PayTarget) {
  const sp = new URLSearchParams();
  if (target.shopId) sp.set("shop", target.shopId);
  if (target.name) sp.set("name", target.name);
  return sp;
}

/*
 * C01 Scan & pay: `pay.shop(shopId)`, then `pay.pay(shopId, amount)`. The customer's phone: the shop, the amount,
 * the token. Nothing about an advance, a fee or a balance. A keypad, not the system keyboard, so the amount and
 * the button stay in view.
 */
export function PayScreen({ lang, initial, target }: { lang: Lang; initial: PayShopView | null; target: PayTarget }) {
  const t = payCopy[lang];
  const router = useRouter();
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [value, setValue] = useState("10");
  const [token, setToken] = useState<Token>("USDT");
  const [paying, setPaying] = useState(false);
  const [failed, setFailed] = useState<string | undefined>();
  const amount = Number(value || 0);

  useEffect(() => {
    router.prefetch(routes.paid);
  }, [router]);

  if (!shop) return <MRAState error={error} />;

  const pay = async () => {
    setPaying(true);
    setFailed(undefined);
    // Demo: shown as received the moment it is sent (anay-docs/ux.md, judge-ready payment). Keep the beat.
    const beat = new Promise((r) => window.setTimeout(r, 900));
    try {
      const [receipt] = await Promise.all([withMRA((m) => m.pay.pay(target.shopId ?? shop.id, amount)), beat]);
      // Same-browser merchant tab (mock demo): Home speaks the sale.
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(SALES_CHANNEL);
        ch.postMessage({ amountUsd: receipt.amount, toAdvanceUsd: receipt.toRepayment } satisfies SaleMessage);
        ch.close();
      }
      const sp = targetQuery(target);
      sp.set("amt", receipt.amount.toFixed(2));
      sp.set("tok", token);
      if (receipt.source !== "mock") sp.set("tx", receipt.txHash);
      router.push(`${routes.paid}?${sp}`);
    } catch (e) {
      setFailed(errorCode(e));
      setPaying(false);
    }
  };

  return (
    <Screen mode="light" lang={lang}>
      <TopBar title={t.verified} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main tight enter="fade">
        <WaveHeader>
          <div className="dj-row" style={{ gap: 12 }}>
            <span className="app-avatar" aria-hidden>
              {shop.initials}
            </span>
            <span className="dj-stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="dj-h2 dj-wrap pub">{shop.name}</span>
              <span className="dj-mono pub" style={{ color: "inherit", opacity: 0.85 }}>
                {shop.id}
              </span>
            </span>
          </div>
        </WaveHeader>
        <div className="app-amount pub" style={{ paddingBlock: 6 }}>
          <span className="app-amount__value" data-empty={amount === 0} aria-live="polite" aria-atomic>
            {typedUsd(value)}
          </span>
          <span className="dj-local">{amount > 0 ? `${arsText(amount)} · example rate` : t.enter}</span>
        </div>
        <div className="dj-stack" style={{ gap: 6 }}>
          <span className="dj-label">{t.youPay}</span>
          <Segmented label={t.youPay} value={token} onChange={setToken} options={TOKENS.map((k) => ({ value: k, label: k }))} />
          <p className="dj-row dj-small" style={{ gap: 8, alignItems: "flex-start" }}>
            <span style={{ display: "inline-flex", color: "var(--accent)", marginTop: 1 }}>
              <I.swap />
            </span>
            {t.swap(token)}
          </p>
        </div>
        <Keypad value={value} onChange={setValue} />
        {failed ? (
          <p role="alert" className="dj-small">
            {failed}
          </p>
        ) : null}
      </Main>
      <ActionBar>
        <Button block onClick={() => void pay()} loading={paying} loadingLabel={t.paying} disabled={amount <= 0 || paying}>
          {amount > 0 ? t.pay(usdText(amount, 2)) : t.enter}
        </Button>
      </ActionBar>
    </Screen>
  );
}

/* C02 Payment success: the receipt of `pay.pay(...)` (amount, tx) plus `pay.shop()`. The check draws itself once. */
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
  const { data: shop, error } = useMRA(q.payShop(target.shopId, target.name), { initial });
  const [time] = useState(() => new Date().toLocaleTimeString(lang === "es" ? "es-AR" : "en-GB", { hour: "2-digit", minute: "2-digit" }));
  const usd = usdText(amount, 2);
  if (!shop) return <MRAState error={error} />;
  const again = targetQuery(target).toString();
  return (
    <Screen mode="light" lang={lang}>
      <TopBar title={t.receipt} heading={false} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main center>
        <div className="dj-stack" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
          <DoneMark size={88} />
          <h1 className="app-display" style={{ fontSize: 40 }}>
            {t.paidTitle(usd)}
          </h1>
          <p className="dj-body">
            {t.paidTo(shop.name)} · <span suppressHydrationWarning>{time}</span>
          </p>
        </div>
        <section className="dj-card" aria-label={t.receipt}>
          <dl className="dj-kv">
            <div>
              <dt>{t.sent}</dt>
              <dd>
                {amount.toFixed(2)} {token}
              </dd>
            </div>
            <div className="pub">
              <dt>{t.received}</dt>
              <dd>{usd}</dd>
            </div>
            <div>
              <dt>{t.fee}</dt>
              <dd>{t.covered}</dd>
            </div>
            <div className="pub" style={{ alignItems: "center", paddingBlock: 2 }}>
              <dt>{t.ref}</dt>
              <dd>
                <CopyHash value={tx ?? shop.wallet} short />
              </dd>
            </div>
          </dl>
        </section>
      </Main>
      <ActionBar>
        <LinkButton href={again ? `${routes.pay}?${again}` : routes.pay}>{t.done}</LinkButton>
        <Link href={routes.home} className="app-text-btn">
          {t.shopPhone}
        </Link>
      </ActionBar>
    </Screen>
  );
}
