import type { ReactNode } from "react";
import {
  ActionBar,
  Banner,
  Button,
  Card,
  CheckIcon,
  Divider,
  GradientHero,
  Heading,
  JarMark,
  Label,
  LockIcon,
  PageHead,
  DemoBadge,
  Pill,
  ShieldIcon,
  Text,
  Page,
} from "@/final";
import { copy, type Lang } from "@/lib/copy";
import { isFailReason, routes } from "@/lib/routes";
import type { BusinessPassView } from "@repo/sdk";
import { FailSheet, OnboardingHeader, PassFacts, World, WorldNote } from "./onboarding-client";

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 font-body text-read text-charcoal">
      <span className="mt-0.5 shrink-0 text-hunter">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/* M01 Welcome. One promise, one action. The gradient sits in its own block; text sits on solid ground. */
export function WelcomeScreen({ lang }: { lang: Lang }) {
  const t = copy[lang].welcome;
  return (
    <>
      <OnboardingHeader lang={lang} />
      <Page width="narrow">
        <GradientHero />
        <div className="flex flex-col gap-2.5">
          <Label>{t.eyebrow}</Label>
          <Heading level={1} size="hero">
            {t.title}
          </Heading>
          <Text>{t.body}</Text>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <Fact icon={<LockIcon size={20} />}>{t.promise1}</Fact>
          <Fact icon={<ShieldIcon size={20} />}>{t.promise2}</Fact>
          <Fact icon={<CheckIcon size={20} />}>{t.promise3}</Fact>
        </ul>
        <ActionBar>
          <Button href={routes.prove}>{t.cta}</Button>
          <Button href={routes.home} variant="ghost">
            {t.back}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}

/* M02 Prove your business. The real path goes through the seller portal; the demo shop skips it. */
export function ProveScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const t = c.prove;
  return (
    <>
      <OnboardingHeader lang={lang} step={1} />
      <Page width="narrow">
        <DemoBadge>Demo attestor · demo seller portal</DemoBadge>
        <PageHead back={routes.welcome} backLabel={c.welcome.back} title={t.title}>
          {t.body}
        </PageHead>
        <Card as="section" aria-label={t.weCheck}>
          <Label>{t.weCheck}</Label>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {t.facts.map((f) => (
              <Fact key={f} icon={<CheckIcon size={20} />}>
                {f}
              </Fact>
            ))}
          </ul>
          <Divider />
          <p className="m-0 flex items-start gap-2.5 font-body text-note text-charcoal-soft">
            <LockIcon size={18} className="mt-px shrink-0 text-charcoal-muted" />
            {t.neverSee}
          </p>
        </Card>
        <WorldNote>{t.world}</WorldNote>
        <div className="flex justify-center">
          <FailSheet lang={lang} />
        </div>
        <ActionBar hint={t.time}>
          <Button href={routes.portalLogin}>{t.cta}</Button>
          <Button href={routes.verifying} variant="ghost">
            {t.demoShop}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}

/* M04 Business Pass. A rare, first-time moment. The facts come from `onboarding.pass()` (this device's vault). */
export function PassScreen({ lang, initial }: { lang: Lang; initial: BusinessPassView | null }) {
  const c = copy[lang];
  const t = c.pass;
  return (
    <>
      <OnboardingHeader lang={lang} step={2} />
      <Page width="narrow">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <span className="grid size-18 place-items-center rounded-full bg-hunter text-lime">
            <CheckIcon size={36} strokeWidth={3} />
          </span>
          <Heading level={1}>{t.title}</Heading>
          <Text>{t.body}</Text>
        </div>
        <World kind="priv">
          <Card as="section" aria-label="Business Pass" tone="tint">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <JarMark size={24} lit={2} />
                <Label>Business Pass</Label>
              </span>
              <Pill tone="locked">{lang === "es" ? "En este teléfono" : "On this phone"}</Pill>
            </div>
            <PassFacts lang={lang} initial={initial} />
            <p className="m-0 font-body text-read font-bold text-charcoal">{t.learned}</p>
          </Card>
        </World>
        <WorldNote>{t.world}</WorldNote>
        <Banner>{t.next}</Banner>
        <ActionBar>
          <Button href={routes.shop}>{t.cta}</Button>
        </ActionBar>
      </Page>
    </>
  );
}

/* M05 Verification failed. Calm, specific, and a way forward. Nothing was saved. */
export function FailedScreen({ lang, reason }: { lang: Lang; reason?: string }) {
  const t = copy[lang].failed;
  const f = isFailReason(reason) ? t[reason] : t.generic;
  return (
    <>
      <OnboardingHeader lang={lang} />
      <Page width="narrow">
        <div className="flex flex-col items-start gap-3.5 pt-2">
          <JarMark lit={0} on="meter" size={64} label={lang === "es" ? "Sin verificar" : "Not verified"} />
          <Pill tone="risk">{f.tag}</Pill>
          <Heading level={1}>{f.title}</Heading>
          <Text>{f.body}</Text>
        </div>
        <Banner tone="caution">{f.next}</Banner>
        <WorldNote>{t.world}</WorldNote>
        <ActionBar>
          <Button href={routes.portalLogin}>{t.retry}</Button>
          <Button href={routes.welcome} variant="ghost">
            {t.start}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}
