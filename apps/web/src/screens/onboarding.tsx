import type { ReactNode } from "react";
import {
  Accent,
  ActionBar,
  Banner,
  BrandPanel,
  Button,
  Card,
  CheckIcon,
  CrossIcon,
  DemoBadge,
  Divider,
  Heading,
  JarMark,
  Label,
  LockIcon,
  Pill,
  ShieldIcon,
  SplitPage,
  Text,
  TextLink,
} from "@/final";
import { copy, stepEyebrow, type Lang } from "@/lib/copy";
import { isFailReason, routes, type FailReason } from "@/lib/routes";
import type { BusinessPassView } from "@repo/sdk";
import { PanelBlocks, litTiles } from "./panel-blocks";
import { FailSheet, OnboardingHeader, PassFacts, StepProgress, World, WorldNote } from "./onboarding-client";

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 font-body text-read text-charcoal">
      <span className="mt-0.5 shrink-0 text-hunter">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** Form column heading: h2 (the brand panel holds the page's h1) and one lead line. */
function FormHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Heading level={2} size="h1">
        {title}
      </Heading>
      {children ? <Text>{children}</Text> : null}
    </div>
  );
}

/* M01 Welcome. One promise, one action. */
export function WelcomeScreen({ lang }: { lang: Lang }) {
  const t = copy[lang].welcome;
  const icons = [<ShieldIcon key="s" size={22} />, <LockIcon key="l" size={22} />, <CheckIcon key="c" size={22} />];
  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<PanelBlocks seed={3} />}
            eyebrow={t.eyebrow}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.body}
          />
        }
      >
        <Text className="md:hidden">{t.body}</Text>
        <FormHead title={t.heading} />
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {t.promises.map((p, i) => (
            <li key={p.title}>
              <Card padding="sm" className="flex-row items-start gap-4">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-honeydew text-hunter">
                  {icons[i]}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-body text-read font-semibold text-charcoal">{p.title}</span>
                  <span className="font-body text-note text-charcoal-soft">{p.body}</span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
        <TextLink href={routes.restore} arrow className="self-start text-note">
          {t.restore}
        </TextLink>
        <ActionBar>
          <Button href={routes.prove}>{t.cta}</Button>
          <Button href={routes.home} variant="ghost">
            {t.back}
          </Button>
        </ActionBar>
      </SplitPage>
    </>
  );
}

/* M02 Prove your business. The real path goes through the seller portal; the demo shop skips it. */
export function ProveScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const t = c.prove;
  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<PanelBlocks seed={11} lit={litTiles(1)} />}
            eyebrow={stepEyebrow(lang, 1)}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <StepProgress lang={lang} at={1} />
        <DemoBadge>Demo attestor · demo seller portal</DemoBadge>
        <FormHead title={t.heading}>{t.body}</FormHead>
        <section aria-label={t.whereSell} className="flex flex-col gap-2">
          <Label>{t.whereSell}</Label>
          <div className="flex flex-col gap-2">
            {t.sources.map((s, i) => (
              <div
                key={s.name}
                className={
                  i === 0
                    ? "flex items-center gap-3 rounded-md border-2 border-hunter bg-surface px-4 py-3"
                    : "flex items-center gap-3 rounded-md border border-hairline bg-well px-4 py-3"
                }
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={i === 0 ? "font-body text-read font-semibold text-charcoal" : "font-body text-read font-semibold text-charcoal-soft"}>{s.name}</span>
                  <span className="font-body text-note text-charcoal-muted">{s.sub}</span>
                </span>
                {i === 0 ? <CheckIcon size={20} className="shrink-0 text-hunter" /> : null}
              </div>
            ))}
          </div>
        </section>
        <Card as="section" aria-label={t.weCheck}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Label>{t.weCheck}</Label>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {t.facts.map((f) => (
                  <Fact key={f.k} icon={<CheckIcon size={18} />}>
                    <span className="flex flex-col">
                      <span className="font-semibold">{f.k}</span>
                      <span className="text-note text-charcoal-muted">{f.v}</span>
                    </span>
                  </Fact>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Label>{t.neverTitle}</Label>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {t.never.map((f) => (
                  <li key={f} className="flex items-start gap-3 font-body text-read text-charcoal-soft">
                    <CrossIcon size={18} className="mt-0.5 shrink-0 text-charcoal-muted" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
      </SplitPage>
    </>
  );
}

/* M04 Business Pass. A rare, first-time moment. The facts come from `onboarding.pass()` (this device's vault). */
export function PassScreen({ lang, initial }: { lang: Lang; initial: BusinessPassView | null }) {
  const c = copy[lang];
  const t = c.pass;
  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            eyebrow={stepEyebrow(lang, 3)}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
            top={
              <>
                {/* Tier 1 pass: two bands lit on the mark, two tiles lit here. */}
                <PanelBlocks seed={23} lit={litTiles(2)} />
                <span aria-hidden className="hidden size-16 place-items-center rounded-full bg-lime text-hunter md:grid">
                  <CheckIcon size={32} strokeWidth={3} />
                </span>
              </>
            }
          />
        }
      >
        <StepProgress lang={lang} at={3} />
        <FormHead title={t.heading}>{t.body}</FormHead>
        <World kind="priv">
          <Card as="section" aria-label="Business Pass" tone="tint">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <JarMark size={24} lit={2} build />
                <Label>Business Pass</Label>
              </span>
              <Pill tone="locked">{t.onPhone}</Pill>
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
      </SplitPage>
    </>
  );
}

/* M05 Verification failed. Calm, specific, and a way forward. Nothing was saved. */
export function FailedScreen({ lang, reason }: { lang: Lang; reason?: string }) {
  const t = copy[lang].failed;
  const f = isFailReason(reason) ? t[reason] : t.generic;
  const others = (["too-new", "suspended", "revenue-low"] as FailReason[]).filter((r) => r !== reason);
  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<PanelBlocks seed={5} calm />}
            eyebrow={t.eyebrow}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <div className="flex flex-col items-start gap-3.5">
          <JarMark lit={0} on="meter" size={56} label={t.notVerified} />
          <Pill tone="risk">{f.tag}</Pill>
          <FormHead title={f.title}>{f.body}</FormHead>
        </div>
        <Banner tone="caution">{f.next}</Banner>
        <Card as="section" aria-label={t.others} tone="well">
          <Label>{t.others}</Label>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {others.map((r, i) => (
              <li key={r} className="flex flex-col gap-2">
                {i > 0 ? <Divider /> : null}
                <span className="font-body text-note text-charcoal-soft">{t[r].title}</span>
              </li>
            ))}
          </ul>
        </Card>
        <WorldNote>{t.world}</WorldNote>
        <ActionBar>
          <Button href={routes.portalLogin}>{t.retry}</Button>
          <Button href={routes.welcome} variant="ghost">
            {t.start}
          </Button>
        </ActionBar>
      </SplitPage>
    </>
  );
}
