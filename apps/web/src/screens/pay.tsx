"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionBar,
  AppHeader,
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
  Page,
  Segmented,
  Text,
  TextLink,
  typedUsd,
  WaveBand,
  WorldMark,
} from "@/final";
import { formatMoney } from "@/lib/format";
import { payCopy, type Lang } from "@/lib/copy";
import { routes } from "@/lib/routes";
import { shop, toLocal, WALLET } from "@/lib/mock/shop";
import { useWorldView } from "@/lib/world-view";

type Token = "USDT" | "USDC" | "DAI";
const TOKENS: Token[] = ["USDT", "USDC", "DAI"];

function PayHeader({ lang }: { lang: Lang }) {
  return <AppHeader home={routes.home} end={<LangToggle lang={lang} />} />;
}

/*
 * C01 Scan & pay. The customer's phone: the shop, the amount, the token. Nothing about an advance,
 * a fee or a balance. A keypad, not the system keyboard, so the amount and the button stay in view.
 */
export function PayScreen({ lang }: { lang: Lang }) {
  const t = payCopy[lang];
  const router = useRouter();
  const wv = useWorldView();
  const [value, setValue] = useState("10");
  const [token, setToken] = useState<Token>("USDT");
  const [paying, setPaying] = useState(false);
  const amount = Number(value || 0);

  useEffect(() => {
    router.prefetch(routes.paid);
  }, [router]);

  const pay = () => {
    setPaying(true);
    // Demo: shown as received the moment it is sent.
    window.setTimeout(() => router.push(`${routes.paid}?amt=${amount.toFixed(2)}&tok=${token}`), 900);
  };

  return (
    <>
      <PayHeader lang={lang} />
      <Page width="narrow">
        <WorldMark kind="pub" show={wv}>
          <WaveBand>
            <Label className="text-honeydew/80">{t.verified}</Label>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-lime font-display text-read font-bold text-charcoal">
                {shop.initials}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-h2 [overflow-wrap:anywhere]">{shop.name}</span>
                <Ledger className="text-honeydew/85">{shop.id}</Ledger>
              </span>
            </div>
          </WaveBand>
        </WorldMark>
        <WorldMark kind="pub" show={wv}>
          <div className="flex flex-col items-center gap-1 py-1 text-center">
            <span
              aria-live="polite"
              aria-atomic
              className={`font-display text-hero-sm tabular-nums md:text-hero ${amount === 0 ? "text-charcoal-muted" : "text-charcoal"}`}
            >
              {typedUsd(value)}
            </span>
            <Ledger className="text-charcoal-muted">{amount > 0 ? `${formatMoney(Math.round(toLocal(amount)), "ARS")} · example rate` : t.enter}</Ledger>
          </div>
        </WorldMark>
        <div className="flex flex-col gap-2">
          <Label>{t.youPay}</Label>
          <Segmented label={t.youPay} value={token} onChange={setToken} options={TOKENS.map((k) => ({ value: k, label: k }))} />
          <Text size="note" tone="muted">
            {t.swap(token)}
          </Text>
        </div>
        <Keypad value={value} onChange={setValue} />
        <ActionBar>
          <Button onClick={pay} loading={paying} disabled={amount <= 0 || paying}>
            {amount > 0 ? t.pay(formatMoney(amount)) : t.enter}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}

/* C02 Payment success. */
export function PaidScreen({ lang, amount, token }: { lang: Lang; amount: number; token: string }) {
  const t = payCopy[lang];
  const wv = useWorldView();
  const [time] = useState(() => new Date().toLocaleTimeString(lang === "es" ? "es-AR" : "en-GB", { hour: "2-digit", minute: "2-digit" }));
  const usd = formatMoney(Number(amount.toFixed(2)));
  return (
    <>
      <PayHeader lang={lang} />
      <Page width="narrow">
        <div className="flex flex-col items-center gap-2.5 pt-4 text-center">
          <span className="grid size-22 place-items-center rounded-full bg-hunter text-lime">
            <CheckIcon size={44} strokeWidth={3} />
          </span>
          <Heading level={1} size="hero">
            {t.paidTitle(usd)}
          </Heading>
          <Text>
            {t.paidTo(shop.name)} · <span suppressHydrationWarning>{time}</span>
          </Text>
        </div>
        <Card as="section" aria-label={t.receipt}>
          <KeyValue
            rows={[
              [t.sent, `${amount.toFixed(2)} ${token}`],
              [
                t.received,
                <WorldMark key="r" kind="pub" show={wv}>
                  {usd}
                </WorldMark>,
              ],
              [t.fee, t.covered],
              [
                t.ref,
                <WorldMark key="f" kind="pub" show={wv}>
                  <CopyHash value={WALLET} short />
                </WorldMark>,
              ],
            ]}
          />
        </Card>
        <ActionBar>
          <Button href={routes.pay}>{t.done}</Button>
          <TextLink href={routes.merchant}>{t.shopPhone}</TextLink>
        </ActionBar>
      </Page>
    </>
  );
}
