import { ActionBar, LangToggle, LinkButton, Main, Note, Screen, TopBar, DoneMark } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Coin } from "@/jar/app-data";
import { Lockup, JarMark } from "@/jar/mark";
import { Pill } from "@/jar/controls";
import type { BusinessPassView } from "@repo/sdk";
import { copy, type Lang } from "@/lib/copy";
import { isFailReason, routes } from "@/lib/routes";
import { DemoMenu, FailSheet, PassFacts } from "./onboarding-client";

/* M01 Welcome. One promise, one action. The gradient sits in its own block; text sits on solid ground. */
export function WelcomeScreen({ lang }: { lang: Lang }) {
  const t = copy[lang].welcome;
  return (
    <Screen lang={lang}>
      <TopBar
        brand
        world={false}
        start={<Lockup size={26} />}
        end={
          <>
            <LangToggle lang={lang} />
            <DemoMenu lang={lang} />
          </>
        }
      />
      <Main>
        <div className="app-hero">
          <Coin size={120} intro label="dollarjar" />
        </div>
        <div className="dj-stack" style={{ gap: 10 }}>
          <span className="dj-label">{t.eyebrow}</span>
          <h1 className="dj-display-xl">{t.title}</h1>
          <p className="dj-body">{t.body}</p>
        </div>
        <ul className="app-facts">
          <li>
            <I.lock />
            <span>{t.promise1}</span>
          </li>
          <li>
            <I.shield />
            <span>{t.promise2}</span>
          </li>
          <li>
            <I.check />
            <span>{t.promise3}</span>
          </li>
        </ul>
      </Main>
      <ActionBar>
        <LinkButton href={routes.prove}>{t.cta}</LinkButton>
        <LinkButton href={routes.earn} variant="ghost">
          {t.lend}
        </LinkButton>
      </ActionBar>
    </Screen>
  );
}

/* M02 Prove your business. The real path goes through the seller portal; the demo shop skips it. */
export function ProveScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const t = c.prove;
  return (
    <Screen lang={lang}>
      <TopBar back={routes.welcome} steps={{ at: 1, of: 3, label: c.steps(1) }} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main>
        <div className="dj-stack" style={{ gap: 8 }}>
          <h1 className="app-display">{t.title}</h1>
          <p className="dj-body">{t.body}</p>
        </div>
        <section className="dj-card" aria-label={t.weCheck} style={{ gap: 14 }}>
          <span className="dj-label">{t.weCheck}</span>
          <ul className="app-facts">
            {t.facts.map((f) => (
              <li key={f}>
                <I.check />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <hr className="dj-divider" />
          <p className="dj-row dj-small" style={{ alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: "var(--text-3)", display: "inline-flex", marginTop: 1 }}>
              <I.lock />
            </span>
            {t.neverSee}
          </p>
        </section>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FailSheet lang={lang} />
        </div>
      </Main>
      <ActionBar hint={t.time}>
        <LinkButton href={routes.portalLogin}>{t.cta}</LinkButton>
        <LinkButton href={routes.verifying} variant="ghost">
          {t.demoShop}
        </LinkButton>
      </ActionBar>
    </Screen>
  );
}

/* M04 Business Pass: `onboarding.pass()`. A rare, first-time moment: the check draws itself, then the pass. */
export function PassScreen({ lang, pass }: { lang: Lang; pass: BusinessPassView | null }) {
  const c = copy[lang];
  const t = c.pass;
  return (
    <Screen lang={lang}>
      <TopBar back={routes.prove} steps={{ at: 2, of: 3, label: c.steps(2) }} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main>
        <div className="dj-stack" style={{ alignItems: "center", textAlign: "center", gap: 12, paddingTop: 8 }}>
          <DoneMark size={72} />
          <h1 className="app-display">{t.title}</h1>
          <p className="dj-body">{t.body}</p>
        </div>
        <section className="dj-card" aria-label="Business Pass">
          <div className="dj-between" style={{ alignItems: "center" }}>
            <span className="dj-row" style={{ gap: 8 }}>
              <JarMark size={20} />
              <span className="dj-label">Business Pass</span>
            </span>
            <Pill kind="locked">{lang === "es" ? "En este teléfono" : "On this phone"}</Pill>
          </div>
          <PassFacts lang={lang} initial={pass} />
          <p className="dj-body" style={{ color: "var(--text)", fontWeight: 700 }}>
            {t.learned}
          </p>
        </section>
        <Note>{t.next}</Note>
      </Main>
      <ActionBar>
        <LinkButton href={routes.shop}>{t.cta}</LinkButton>
      </ActionBar>
    </Screen>
  );
}

/* M05 Verification failed. Calm, specific, and a way forward. Nothing was saved. */
export function FailedScreen({ lang, reason }: { lang: Lang; reason?: string }) {
  const t = copy[lang].failed;
  const f = isFailReason(reason) ? t[reason] : t.generic;
  return (
    <Screen lang={lang}>
      <TopBar back={routes.prove} end={<LangToggle lang={lang} />} worldNote={t.world} />
      <Main>
        <div className="dj-stack" style={{ gap: 14, paddingTop: 16 }}>
          <JarMark lit={0} variant="meter" size={64} label={lang === "es" ? "Sin verificar" : "Not verified"} />
          <Pill kind="risk">{f.tag}</Pill>
          <h1 className="app-display">{f.title}</h1>
          <p className="dj-body">{f.body}</p>
        </div>
        <Note tone="warn">{f.next}</Note>
      </Main>
      <ActionBar>
        <LinkButton href={routes.portalLogin}>{t.retry}</LinkButton>
        <LinkButton href={routes.welcome} variant="ghost">
          {t.start}
        </LinkButton>
      </ActionBar>
    </Screen>
  );
}
