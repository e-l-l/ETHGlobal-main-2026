"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionBar, CopyHash, DoneMark, Keypad, LangToggle, LinkButton, Main, Screen, TopBar, typedUsd } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Button, Segmented } from "@/jar/controls";
import { WaveHeader } from "@/jar/domain";
import { arsText, usdText } from "@/jar/format";
import { payCopy, type Lang } from "@/lib/copy";
import { routes } from "@/lib/routes";
import { SHOP, WALLET } from "@/lib/mock/shop";

type Token = "USDT" | "USDC" | "DAI";
const TOKENS: Token[] = ["USDT", "USDC", "DAI"];

/*
 * C01 Scan & pay. The customer's phone: the shop, the amount, the token. Nothing about an advance,
 * a fee or a balance. A keypad, not the system keyboard, so the amount and the button stay in view.
 */
export function PayScreen({ lang }: { lang: Lang }) {
  const t = payCopy[lang];
  const router = useRouter();
  const [value, setValue] = useState("10");
  const [token, setToken] = useState<Token>("USDT");
  const [paying, setPaying] = useState(false);
  const amount = Number(value || 0);

  useEffect(() => {
    router.prefetch(routes.paid);
  }, [router]);

  const pay = () => {
    setPaying(true);
    // Demo: shown as received the moment it is sent (anay-docs/ux.md, judge-ready payment).
    window.setTimeout(() => router.push(`${routes.paid}?amt=${amount.toFixed(2)}&tok=${token}`), 900);
  };

  return (
    <Screen mode="light" lang={lang}>
      <TopBar title={t.verified} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main tight enter="fade">
        <WaveHeader>
          <div className="dj-row" style={{ gap: 12 }}>
            <span className="app-avatar" aria-hidden>
              {SHOP.initials}
            </span>
            <span className="dj-stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="dj-h2 dj-wrap pub">{SHOP.name}</span>
              <span className="dj-mono pub" style={{ color: "inherit", opacity: 0.85 }}>
                {SHOP.id}
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
      </Main>
      <ActionBar>
        <Button block onClick={pay} loading={paying} loadingLabel={t.paying} disabled={amount <= 0 || paying}>
          {amount > 0 ? t.pay(usdText(amount, 2)) : t.enter}
        </Button>
      </ActionBar>
    </Screen>
  );
}

/* C02 Payment success. A rare moment: the check draws itself once. */
export function PaidScreen({ lang, amount, token }: { lang: Lang; amount: number; token: string }) {
  const t = payCopy[lang];
  const [time] = useState(() => new Date().toLocaleTimeString(lang === "es" ? "es-AR" : "en-GB", { hour: "2-digit", minute: "2-digit" }));
  const usd = usdText(amount, 2);
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
            {t.paidTo(SHOP.name)} · <span suppressHydrationWarning>{time}</span>
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
                <CopyHash value={WALLET} short />
              </dd>
            </div>
          </dl>
        </section>
      </Main>
      <ActionBar>
        <LinkButton href={routes.pay}>{t.done}</LinkButton>
        <Link href={routes.home} className="app-text-btn">
          {t.shopPhone}
        </Link>
      </ActionBar>
    </Screen>
  );
}
