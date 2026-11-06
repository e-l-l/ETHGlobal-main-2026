"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ActionBar, LangToggle, LinkButton, Main, Row, Screen, Sheet, TopBar } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Coin } from "@/jar/app-data";
import { Button, StepsList } from "@/jar/controls";
import { copy, type Lang } from "@/lib/copy";
import { isFailReason, routes, verifyingHref, type FailReason } from "@/lib/routes";
import { SHOP, SHOP_NAME_IDEAS } from "@/lib/mock/shop";

/* ------------------------------------------------------------ Demo menu
 * Judges jump between roles from the Welcome screen without a page of links in the way.
 */
const ROLES = [
  { href: routes.welcome, title: "Merchant onboarding", sub: "Prove, pass, name the shop", icon: <I.store /> },
  { href: routes.pay, title: "Customer pays", sub: "Scan the shop's QR", icon: <I.phone /> },
  { href: routes.portalLogin, title: "Demo seller portal", sub: "What the private check reads", icon: <I.person /> },
  { href: routes.earn, title: "Lender", sub: "Senior vault, earn and deposit", icon: <I.earn size={20} /> },
  { href: routes.junior, title: "Risk taker", sub: "Junior token, mint and trade", icon: <I.layers size={20} /> },
  { href: routes.protocol, title: "Public dashboard", sub: "Protocol, risk, explorer", icon: <I.grid size={20} /> },
  { href: routes.home, title: "Merchant app", sub: "Home, agent, advance", icon: <I.sparkle /> },
  { href: routes.screens, title: "All screens", sub: "Every route with its canvas ID", icon: <I.search /> },
];

export function DemoMenu({ lang }: { lang: Lang }) {
  const t = copy[lang].welcome;
  return (
    <Sheet
      title={t.demoTitle}
      description={t.demoBody}
      trigger={
        <button type="button" className="app-chip">
          <I.sparkle size={14} />
          {t.demo}
        </button>
      }
    >
      <ul className="app-rows">
        {ROLES.map((r) => (
          <li key={r.title}>
            <Row href={r.href} lead={r.icon} title={r.title} sub={r.sub} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ------------------------------------------------------------ Fail sheet */

export function FailSheet({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const reasons: FailReason[] = ["too-new", "suspended", "revenue-low"];
  return (
    <Sheet
      title={c.prove.failTitle}
      description={c.prove.failBody}
      trigger={
        <button type="button" className="app-text-btn">
          {c.prove.showFail}
        </button>
      }
    >
      <ul className="app-rows">
        {reasons.map((r) => (
          <li key={r}>
            <Row href={verifyingHref(r)} lead={<I.alert />} title={c.failed[r].tag} sub={c.failed[r].title} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ---------------------------------------------------------- M03 Verifying
 * The proof runs; the screen moves on by itself. Cancel is always there.
 * A failing outcome stops on the second step, the way a real check would.
 */
const TIMING = [900, 2100, 3000, 3600]; // ms: read done, check done, saved, leave

export function VerifyingScreen({ lang, outcome }: { lang: Lang; outcome?: string }) {
  const c = copy[lang];
  const t = c.verifying;
  const router = useRouter();
  const fail = isFailReason(outcome) ? outcome : undefined;
  const [done, setDone] = useState(0);

  useEffect(() => {
    const dest = fail ? `${routes.failed}?reason=${fail}` : routes.pass;
    router.prefetch(dest);
    const timers = fail
      ? [window.setTimeout(() => setDone(1), TIMING[0]), window.setTimeout(() => router.replace(dest), TIMING[1])]
      : [
          window.setTimeout(() => setDone(1), TIMING[0]),
          window.setTimeout(() => setDone(2), TIMING[1]),
          window.setTimeout(() => setDone(3), TIMING[2]),
          window.setTimeout(() => router.replace(dest), TIMING[3]),
        ];
    return () => timers.forEach(window.clearTimeout);
  }, [fail, router]);

  const steps = t.steps.map((label, i) => ({
    label,
    state: (i < done ? "done" : i === done ? "current" : "next") as "done" | "current" | "next",
  }));

  return (
    <Screen lang={lang}>
      <TopBar back={routes.prove} backLabel={t.cancel} steps={{ at: 1, of: 3, label: c.steps(1) }} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main center>
        <div className="dj-stack" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
          <Coin size={112} loading label={t.title} />
          <h1 className="app-display">{t.title}</h1>
          <p className="dj-body">{t.body}</p>
        </div>
        <div className="dj-card priv">
          <StepsList steps={steps} />
        </div>
        <p role="status" className="sr-only-dj">
          {steps.find((s) => s.state === "current")?.label ?? t.steps[t.steps.length - 1]}
        </p>
      </Main>
      <ActionBar>
        <LinkButton href={routes.prove} variant="ghost">
          {t.cancel}
        </LinkButton>
      </ActionBar>
    </Screen>
  );
}

/* --------------------------------------------------------- M06 Create shop
 * The QR updates as you type, so the name and what customers will see are one thing.
 */
export function ShopScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const t = c.shop;
  const [name, setName] = useState<string>(SHOP.name);
  const id = useId();
  const hintId = useId();
  const clean = name.trim();
  const payUrl = `https://dollarjar.app${routes.pay}`;

  return (
    <Screen lang={lang}>
      <TopBar back={routes.pass} steps={{ at: 3, of: 3, label: c.steps(3) }} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main>
        <div className="dj-stack" style={{ gap: 8 }}>
          <h1 className="app-display">{t.title}</h1>
          <p className="dj-body">{t.body}</p>
        </div>
        <div className="dj-stack" style={{ gap: 8 }}>
          <label className="dj-label" htmlFor={id}>
            {t.label}
          </label>
          <input
            id={id}
            className="dj-input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-describedby={hintId}
          />
          <span id={hintId} className="dj-small">
            {t.hint}
          </span>
          <div className="dj-chips" role="group" aria-label={t.ideas}>
            {SHOP_NAME_IDEAS.filter((n) => n !== clean).slice(0, 3).map((n) => (
              <button key={n} type="button" className="dj-chip" style={{ minHeight: 40 }} onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <section className="dj-card" aria-label={t.qr} style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 14 }}>
          <div className="dj-qr pub" style={{ padding: 10 }}>
            <QRCodeSVG value={payUrl} size={104} level="M" fgColor="currentColor" bgColor="transparent" role="img" aria-label={`${t.qr}: ${clean || SHOP.name}`} />
          </div>
          <div className="dj-stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="dj-label">{t.qr}</span>
            <span className="dj-h2 dj-wrap pub">{clean || "—"}</span>
            <span className="dj-mono pub">{SHOP.id}</span>
          </div>
        </section>
      </Main>
      <ActionBar>
        {clean.length >= 2 ? (
          <LinkButton href={routes.agentSetup}>{t.cta}</LinkButton>
        ) : (
          <Button block disabled>
            {t.empty}
          </Button>
        )}
        <Link href={routes.pay} className="app-text-btn">
          {t.preview}
        </Link>
      </ActionBar>
    </Screen>
  );
}
