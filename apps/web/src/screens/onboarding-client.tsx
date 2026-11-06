"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ActionBar,
  AlertIcon,
  AppHeader,
  Banner,
  Button,
  Card,
  Chips,
  Heading,
  JarMark,
  LangToggle,
  Label,
  Ledger,
  ListRow,
  Page,
  QRCode,
  RowList,
  Sheet,
  StepDots,
  Steps,
  Text,
  TextField,
  TextLink,
  WorldMark,
} from "@/final";
import { appUrl } from "@/lib/brand";
import { copy, type Lang } from "@/lib/copy";
import { isFailReason, routes, verifyingHref, type FailReason } from "@/lib/routes";
import { shop, SHOP_NAME_IDEAS } from "@/lib/mock/shop";
import { useWorldView } from "@/lib/world-view";

/* ---------------------------------------------------------- Shared bits */

/** Onboarding header: logo goes to the /home hub, step dots in the middle, ES/EN at the end. */
export function OnboardingHeader({ lang, step }: { lang: Lang; step?: number }) {
  return (
    <AppHeader
      home={routes.home}
      center={step ? <StepDots at={step} of={3} label={copy[lang].steps(step)} /> : undefined}
      end={<LangToggle lang={lang} />}
    />
  );
}

/** Marks its children as public (onchain) or private (on device) when World view is on. */
export function World({ kind, className, children }: { kind: "pub" | "priv"; className?: string; children: ReactNode }) {
  const wv = useWorldView();
  return (
    <WorldMark kind={kind} show={wv} className={className}>
      {children}
    </WorldMark>
  );
}

/** What the world sees on this screen, shown only while World view is on. */
export function WorldNote({ children }: { children: ReactNode }) {
  const wv = useWorldView();
  return wv ? <Banner>{children}</Banner> : null;
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
        <Button variant="ghost" size="sm" width="auto">
          {c.prove.showFail}
        </Button>
      }
    >
      <RowList>
        {reasons.map((r) => (
          <ListRow key={r} href={verifyingHref(r)} lead={<AlertIcon size={20} />} title={c.failed[r].tag} sub={c.failed[r].title} />
        ))}
      </RowList>
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
    <>
      <OnboardingHeader lang={lang} step={1} />
      <Page width="narrow">
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          <JarMark loading size={96} label={t.title} />
          <Heading level={1}>{t.title}</Heading>
          <Text>{t.body}</Text>
        </div>
        <World kind="priv">
          <Card>
            <Steps items={steps} />
          </Card>
        </World>
        <WorldNote>{t.world}</WorldNote>
        <p role="status" className="sr-only">
          {steps.find((s) => s.state === "current")?.label ?? t.steps[t.steps.length - 1]}
        </p>
        <ActionBar>
          <Button href={routes.prove} variant="ghost">
            {t.cancel}
          </Button>
        </ActionBar>
      </Page>
    </>
  );
}

/* --------------------------------------------------------- M06 Create shop
 * The QR updates as you type, so the name and what customers will see are one thing.
 */
export function ShopScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const t = c.shop;
  const [name, setName] = useState<string>(shop.name);
  const clean = name.trim();
  const payUrl = appUrl(routes.pay);

  return (
    <>
      <OnboardingHeader lang={lang} step={3} />
      <Page width="narrow">
        <div className="flex flex-col gap-2">
          <Heading level={1}>{t.title}</Heading>
          <Text>{t.body}</Text>
        </div>
        <div className="flex flex-col gap-3">
          <TextField
            label={t.label}
            hint={t.hint}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
          />
          <Chips label={t.ideas} value={clean} onChange={setName} options={SHOP_NAME_IDEAS.map((n) => ({ value: n, label: n }))} />
        </div>
        <World kind="pub">
          <Card aria-label={t.qr} className="flex-row items-center gap-4" padding="sm">
            <QRCode value={payUrl} size={104} label={`${t.qr}: ${clean || shop.name}`} className="p-2.5" />
            <div className="flex min-w-0 flex-col gap-1">
              <Label>{t.qr}</Label>
              <span className="font-display text-h2 [overflow-wrap:anywhere] text-charcoal">{clean || "—"}</span>
              <Ledger>{shop.id}</Ledger>
            </div>
          </Card>
        </World>
        <WorldNote>{t.world}</WorldNote>
        <ActionBar>
          {clean.length >= 2 ? (
            <Button href={routes.agent.setup}>{t.cta}</Button>
          ) : (
            <Button disabled>
              {t.empty}
            </Button>
          )}
          <TextLink href={routes.pay}>{t.preview}</TextLink>
        </ActionBar>
      </Page>
    </>
  );
}
