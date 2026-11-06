"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Accent,
  ActionBar,
  AlertIcon,
  AppHeader,
  Banner,
  BrandPanel,
  Button,
  Card,
  Chips,
  Heading,
  JarMark,
  KeyValue,
  LangToggle,
  Label,
  Ledger,
  ListRow,
  QRCode,
  RowList,
  Sheet,
  SplitPage,
  StepDots,
  Steps,
  Text,
  TextField,
  TextLink,
  WorldMark,
} from "@/final";
import type { BusinessPassView, ProveStep } from "@repo/sdk";
import { appUrl } from "@/lib/brand";
import { PanelBlocks, litTiles } from "./panel-blocks";
import { copy, stepEyebrow, type Lang } from "@/lib/copy";
import { explorerTxUrl, isMock, withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { failedHref, isFailReason, routes, verifyingHref, type FailReason } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { useWorldView } from "@/lib/world-view";

/* ---------------------------------------------------------- Shared bits */

/** Onboarding header: logo goes to the /home hub, ES/EN at the end. Step progress sits in the form column. */
export function OnboardingHeader({ lang }: { lang: Lang }) {
  return <AppHeader home={routes.home} end={<LangToggle lang={lang} />} />;
}

/** Step progress at the top of the form column: four bars and "Step 1 of 4". */
export function StepProgress({ lang, at }: { lang: Lang; at: number }) {
  const c = copy[lang];
  return (
    <div className="flex items-center gap-3">
      <StepDots at={at} of={4} label={c.steps(at)} />
      <Ledger className="text-charcoal-muted">{c.steps(at)}</Ledger>
    </div>
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
 * The proof runs through `onboarding.proveBusiness({ onStep })`; the SDK's steps drive the list and the result
 * routes: a pass → M04, `ok: false` → M05 with its reason. Cancel is always there (it aborts the proof).
 * Real modes: the issuer checks the portal facts, then this device's burner wallet sends BusinessPassRegistry.issue
 * (gas from the demo faucet). Steps are paced so each one is seen (mock resolves at once).
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
  const [failed, setFailed] = useState<string | undefined>();
  const done = Math.min(reached, tick);
  // One proof per visit. React's dev double-mount must not start a second one: past the portal step a proof can't be
  // cancelled (the issuer signs, the wallet sends BusinessPassRegistry.issue), so both would land onchain.
  const proof = useRef<{ fail: FailReason | undefined; run: Promise<{ dest: string; at: number } | { error: string }> } | null>(null);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    const at = (ms: number) => new Promise((r) => window.setTimeout(r, Math.max(0, t0 + ms - performance.now())));
    const timers = TIMING.slice(0, 3).map((ms, i) => window.setTimeout(() => setTick(i + 1), ms));
    router.prefetch(routes.pass);

    if (!proof.current || proof.current.fail !== fail) {
      // Real modes: gas for BusinessPassRegistry.issue from the demo faucet while the proof runs (once per device;
      // the SDK asks again before the transaction if this hasn't finished). Mock: a no-op.
      void withMRA((m) => m.wallet.ensureFunded()).catch(() => undefined);
      const run = withMRA((m) =>
        m.onboarding.proveBusiness({
          ...(fail ? { account: OUTCOME_ACCOUNT[fail] } : {}),
          onStep: (st) => setReached((n) => Math.max(n, STEP_DONE[st])),
        }),
      ).then(
        (r) => (r.ok ? { dest: routes.pass as string, at: TIMING[3]! } : { dest: r.reason === "error" ? routes.failed : failedHref(r.reason), at: TIMING[1]! }),
        // A network / chain error is not a verdict on the shop: say so and offer a retry instead of M05.
        (e: unknown) => ({ error: e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "error" }),
      );
      proof.current = { fail, run };
    }

    void proof.current.run.then(async (r) => {
      if ("error" in r) {
        if (alive) setFailed(r.error);
        return;
      }
      if (r.dest === routes.pass) setReached(3);
      await at(r.at);
      if (alive) router.replace(r.dest);
    });

    return () => {
      alive = false;
      timers.forEach(window.clearTimeout);
    };
  }, [fail, router]);

  const steps = t.steps.map((label, i) => ({
    label,
    state: (i < done ? "done" : i === done ? "current" : "next") as "done" | "current" | "next",
  }));

  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            /* Two more tiles light as each of the three checks completes. */
            top={<PanelBlocks seed={17} lit={litTiles(done * 2)} />}
            eyebrow={stepEyebrow(lang, 2)}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <StepProgress lang={lang} at={2} />
        <div className="flex items-center gap-4">
          <JarMark loading size={64} label={`${t.title} ${t.accent}`} />
          <div className="flex min-w-0 flex-col gap-1">
            <Heading level={2} size="h1">
              {t.heading}
            </Heading>
            <Text>{t.body}</Text>
          </div>
        </div>
        <World kind="priv">
          <Card>
            <Steps items={steps} />
          </Card>
        </World>
        <WorldNote>{t.world}</WorldNote>
        {failed ? (
          <Banner tone="caution">
            {lang === "es" ? `No pudimos terminar el chequeo (${failed}). No se guardó nada.` : `The check couldn't finish (${failed}). Nothing was saved.`}
          </Banner>
        ) : null}
        <p role="status" className="sr-only">
          {steps.find((s) => s.state === "current")?.label ?? t.steps[t.steps.length - 1]}
        </p>
        <ActionBar>
          <Button href={routes.prove} variant="ghost">
            {t.cancel}
          </Button>
        </ActionBar>
      </SplitPage>
    </>
  );
}

/* --------------------------------------------------------- M06 Create shop
 * The QR updates as you type, so the name and what customers will see are one thing.
 * Name ideas come from `onboarding.nameIdeas()`. Live modes: the CTA is `onboarding.createShop(name)` (a fresh
 * pseudonymous shop id registered onchain from this device's wallet), then M07. Mock keeps the plain link.
 */
type ShopDraft = { nameIdeas: string[]; pseudonym: string };

export function ShopScreen({ lang, initial }: { lang: Lang; initial: ShopDraft | null }) {
  const { data, error } = useMRA(q.shopDraft, { initial });
  if (!data) return <MRAState error={error} />;
  return <ShopForm lang={lang} draft={data} />;
}

function ShopForm({ lang, draft }: { lang: Lang; draft: ShopDraft }) {
  const c = copy[lang];
  const t = c.shop;
  const router = useRouter();
  const create = useMRAAction((m, shopName: string) => m.onboarding.createShop(shopName));
  const fallbackName = draft.nameIdeas[0] ?? "";
  const [name, setName] = useState<string>(fallbackName);
  const clean = name.trim();
  const payUrl = appUrl(routes.pay);
  // Live: the pseudonym is minted on create (random id), so there is none to show before.
  const pseudonym = isMock ? draft.pseudonym : (create.pending ? "shop_…" : "shop_····");

  return (
    <>
      <OnboardingHeader lang={lang} />
      <SplitPage
        panel={
          <BrandPanel
            top={<PanelBlocks seed={29} lit={litTiles(6)} />}
            eyebrow={stepEyebrow(lang, 4)}
            title={
              <>
                {t.panelTitle} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <StepProgress lang={lang} at={4} />
        <div className="flex flex-col gap-2">
          <Heading level={2} size="h1">
            {t.title}
          </Heading>
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
          <Chips label={t.ideas} value={clean} onChange={setName} options={draft.nameIdeas.map((n) => ({ value: n, label: n }))} />
        </div>
        <World kind="pub">
          <Card aria-label={t.qr} className="flex-row items-center gap-5" padding="lg">
            <QRCode value={payUrl} size={128} label={`${t.qr}: ${clean || fallbackName}`} className="p-3" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>{t.qr}</Label>
              <span className="font-display text-h2 [overflow-wrap:anywhere] text-charcoal">{clean || "—"}</span>
              <Ledger>{pseudonym}</Ledger>
            </div>
          </Card>
        </World>
        <WorldNote>{t.world}</WorldNote>
        {create.error ? (
          <Banner tone="caution">
            {lang === "es" ? `No se pudo crear el kiosco (${create.error}).` : `Couldn't create the shop (${create.error}).`}
          </Banner>
        ) : null}
        <ActionBar>
          {clean.length < 2 ? (
            <Button disabled>{t.empty}</Button>
          ) : isMock ? (
            <Button href={routes.agent.setup}>{t.cta}</Button>
          ) : (
            <Button
              loading={create.pending}
              onClick={() => {
                create.run(clean).then(
                  () => router.push(routes.agent.setup),
                  () => undefined,
                );
              }}
            >
              {t.cta}
            </Button>
          )}
          <TextLink href={routes.pay}>{t.preview}</TextLink>
        </ActionBar>
      </SplitPage>
    </>
  );
}

/* ---------------------------------------------------------- M04 pass facts
 * The facts on the Business Pass, from `onboarding.pass()` (this device's vault in real modes). Labels stay in the
 * app language; values come from the SDK. Live: the issue transaction links to Etherscan.
 */
export function PassFacts({ lang, initial }: { lang: Lang; initial: BusinessPassView | null }) {
  const labels = copy[lang].pass.facts;
  const { data, error } = useMRA(q.pass, { initial });
  if (data === undefined) return <MRAState error={error} />;
  if (data === null) {
    return <Text size="note">{lang === "es" ? "Todavía no hay un pase en este teléfono." : "No pass on this phone yet."}</Text>;
  }
  const values = [data.country, `${lang === "es" ? "Banda" : "Band"} ${data.band}`, lang === "es" ? data.months.replace("months", "meses") : data.months];
  const tx = explorerTxUrl(data.txHash);
  return (
    <>
      <KeyValue rows={labels.map((f, i) => [f.k, values[i] ?? f.v])} />
      {tx ? (
        <TextLink href={tx} target="_blank" rel="noreferrer" arrow>
          {lang === "es" ? "Ver el registro en Etherscan" : "See the record on Etherscan"}
        </TextLink>
      ) : null}
    </>
  );
}
