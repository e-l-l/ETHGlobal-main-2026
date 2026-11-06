"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ActionBar, LangToggle, LinkButton, Main, Row, Screen, Sheet, TopBar } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Coin } from "@/jar/app-data";
import { Button, StepsList } from "@/jar/controls";
import type { BusinessPassView, ProveStep } from "@repo/sdk";
import { copy, type Lang } from "@/lib/copy";
import { withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { failedHref, isFailReason, routes, verifyingHref, type FailReason } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

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
 * The proof runs through `onboarding.proveBusiness({ onStep })`; the SDK's steps drive the list and the result
 * routes: a pass → M04, `ok: false` → M05 with its reason. Cancel is always there (it aborts the proof).
 * Steps are paced so each one is seen (mock mode resolves at once): the timing matches the original demo.
 */
const TIMING = [900, 2100, 3000, 3600]; // ms: read done, check done, saved, leave

/** SDK step → how many of the three list items are done. */
const STEP_DONE: Record<ProveStep, number> = {
  starting: 0,
  waiting_for_portal: 0,
  proof_received: 1,
  issuing: 1,
  registering: 2,
  saved: 3,
};

/** The demo portal's outcome → the seeded account that produces it (the SDK mock and the issuer's ISSUER_MOCK). */
const OUTCOME_ACCOUNT: Record<FailReason, string> = { "too-new": "newshop", suspended: "suspended", "revenue-low": "lowrevenue" };

export function VerifyingScreen({ lang, outcome }: { lang: Lang; outcome?: string }) {
  const c = copy[lang];
  const t = c.verifying;
  const router = useRouter();
  const fail = isFailReason(outcome) ? outcome : undefined;
  const [reached, setReached] = useState(0); // furthest step the SDK reported
  const [tick, setTick] = useState(0); // pacing: one step per TIMING slot at most
  const done = Math.min(reached, tick);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const t0 = performance.now();
    const at = (ms: number) => new Promise((r) => window.setTimeout(r, Math.max(0, t0 + ms - performance.now())));
    const timers = TIMING.slice(0, 3).map((ms, i) => window.setTimeout(() => setTick(i + 1), ms));
    router.prefetch(routes.pass);

    // Real modes: fetch gas for BusinessPassRegistry.issue from the demo faucet while the proof runs (once per
    // device; the SDK does it again before the transaction if this hasn't finished). Mock: a no-op.
    void withMRA((m) => m.wallet.ensureFunded()).catch(() => undefined);

    void (async () => {
      let dest: string = routes.failed;
      try {
        const r = await withMRA((m) =>
          m.onboarding.proveBusiness({
            ...(fail ? { account: OUTCOME_ACCOUNT[fail] } : {}),
            signal: ctrl.signal,
            onStep: (s) => {
              if (alive) setReached((n) => Math.max(n, STEP_DONE[s]));
            },
          }),
        );
        if (r.ok) {
          await at(TIMING[3]!);
          dest = routes.pass;
        } else {
          await at(TIMING[1]!);
          dest = r.reason === "error" ? routes.failed : failedHref(r.reason);
        }
      } catch {
        await at(TIMING[1]!);
      }
      if (alive) router.replace(dest);
    })();

    return () => {
      alive = false;
      ctrl.abort();
      timers.forEach(window.clearTimeout);
    };
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
 * Name ideas come from `onboarding.nameIdeas()`; the CTA is `onboarding.createShop(name)`, then M07.
 */
type ShopDraft = { nameIdeas: string[]; pseudonym: string };

export function ShopScreen({ lang, initial }: { lang: Lang; initial: ShopDraft | null }) {
  const c = copy[lang];
  const t = c.shop;
  const router = useRouter();
  const { data, error } = useMRA(q.shopDraft, { initial });
  const create = useMRAAction((m, shopName: string) => m.onboarding.createShop(shopName));
  const [typed, setName] = useState<string | undefined>();
  const id = useId();
  const hintId = useId();
  if (!data) return <MRAState error={error} />;
  const fallbackName = data.nameIdeas[0] ?? "";
  const name = typed ?? fallbackName;
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
            {data.nameIdeas.filter((n) => n !== clean).slice(0, 3).map((n) => (
              <button key={n} type="button" className="dj-chip" style={{ minHeight: 40 }} onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <section className="dj-card" aria-label={t.qr} style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 14 }}>
          <div className="dj-qr pub" style={{ padding: 10 }}>
            <QRCodeSVG value={payUrl} size={104} level="M" fgColor="currentColor" bgColor="transparent" role="img" aria-label={`${t.qr}: ${clean || fallbackName}`} />
          </div>
          <div className="dj-stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="dj-label">{t.qr}</span>
            <span className="dj-h2 dj-wrap pub">{clean || "—"}</span>
            <span className="dj-mono pub">{data.pseudonym}</span>
          </div>
        </section>
        {create.error ? (
          <p role="alert" className="dj-small">
            {create.error}
          </p>
        ) : null}
      </Main>
      <ActionBar>
        {clean.length >= 2 ? (
          <Button
            block
            loading={create.pending}
            loadingLabel={t.cta}
            disabled={create.pending}
            onClick={() => {
              create.run(clean).then(
                () => router.push(routes.agent.setup),
                () => undefined,
              );
            }}
          >
            {t.cta}
          </Button>
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

/* ---------------------------------------------------------- M04 pass facts
 * The facts on the Business Pass, from `onboarding.pass()` (this device's vault in real modes). Labels stay in
 * the app language; values come from the SDK.
 */
export function PassFacts({ lang, initial }: { lang: Lang; initial: BusinessPassView | null }) {
  const labels = copy[lang].pass.facts;
  const { data, error } = useMRA(q.pass, { initial });
  if (data === undefined) return <MRAState error={error} />;
  if (data === null) {
    return <p className="dj-small">{lang === "es" ? "Todavía no hay un pase en este teléfono." : "No pass on this phone yet."}</p>;
  }
  const values = [
    data.country,
    `${lang === "es" ? "Banda" : "Band"} ${data.band}`,
    lang === "es" ? data.months.replace("months", "meses") : data.months,
  ];
  return (
    <dl className="dj-kv priv">
      {labels.map((f, i) => (
        <div key={f.k}>
          <dt>{f.k}</dt>
          <dd>{values[i]}</dd>
        </div>
      ))}
    </dl>
  );
}
