"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accent,
  ActionBar,
  AlertIcon,
  Banner,
  BrandPanel,
  Button,
  Card,
  Chips,
  Heading,
  JarMark,
  KeyValue,
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
} from "@/final";
import type { BusinessPassView, HumanCheckStep, ProveStep, ShopHumanBinding } from "@repo/sdk";
import { appUrl } from "@/lib/brand";
import { PanelBlocks } from "./panel-blocks";
import { litTiles } from "./lit-tiles";
import { copy, stepEyebrow } from "@/lib/copy";
import { explorerTxUrl, isMock, withMRA } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { failedHref, isFailReason, redlineHref, routes, verifyingHref, worldIdHref, worldIdStoppedHref, type FailReason } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { useWorldPrompt } from "@/lib/world-prompt";
import { IdkitWait } from "@/app/merchant/_world";

/* ---------------------------------------------------------- Shared bits */

/** Step progress at the top of the form column: five bars and "Step 1 of 5" (1 World ID, 2 prove, 3 verifying, 4 pass, 5 shop). */
export function StepProgress({ at }: { at: number }) {
  const c = copy;
  return (
    <div className="flex items-center gap-3">
      <StepDots at={at} of={5} label={c.steps(at)} />
      <Ledger className="text-charcoal-muted">{c.steps(at)}</Ledger>
    </div>
  );
}

/* ------------------------------------------------------------ Fail sheet */

export function FailSheet() {
  const c = copy;
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
const OUTCOME_ACCOUNT: Record<FailReason, string> = {
  "too-new": "newshop",
  suspended: "suspended",
  "revenue-low": "lowrevenue",
};

export function VerifyingScreen({ outcome }: { outcome?: string }) {
  const c = copy;
  const t = c.verifying;
  const router = useRouter();
  const fail = isFailReason(outcome) ? outcome : undefined;
  const [reached, setReached] = useState(0); // furthest step the SDK reported
  const [tick, setTick] = useState(0); // pacing: one step per TIMING slot at most
  const [failed, setFailed] = useState<string | undefined>();
  const done = Math.min(reached, tick);
  // One proof per visit. React's dev double-mount must not start a second one: past the portal step a proof can't be
  // cancelled (the issuer signs, the wallet sends BusinessPassRegistry.issue), so both would land onchain.
  const proof = useRef<{
    fail: FailReason | undefined;
    run: Promise<{ dest: string; at: number } | { error: string }>;
  } | null>(null);

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
        (r) =>
          r.ok
            ? { dest: routes.pass as string, at: TIMING[3]! }
            : {
                dest: r.reason === "error" ? routes.failed : failedHref(r.reason),
                at: TIMING[1]!,
              },
        // A network / chain error is not a verdict on the shop: say so and offer a retry instead of M05.
        (e: unknown) => ({
          error: e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "error",
        }),
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
      <SplitPage
        panel={
          <BrandPanel
            /* Two more tiles light as each of the three checks completes. */
            top={<PanelBlocks seed={17} lit={litTiles(done * 2)} />}
            eyebrow={stepEyebrow(3)}
            title={
              <>
                {t.title} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <StepProgress at={3} />
        <div className="flex items-center gap-4">
          <JarMark loading size={64} label={`${t.title} ${t.accent}`} />
          <div className="flex min-w-0 flex-col gap-1">
            <Heading level={2} size="h1">
              {t.heading}
            </Heading>
            <Text>{t.body}</Text>
          </div>
        </div>
        <div>
          <Card>
            <Steps items={steps} />
          </Card>
        </div>
        {failed ? <Banner tone="caution">{`The check couldn't finish (${failed}). Nothing was saved.`}</Banner> : null}
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
 * Name ideas come from `onboarding.nameIdeas()`. The CTA is `onboarding.createShop(name)` (live: a fresh pseudonymous
 * shop id registered onchain from this device's wallet), which also binds the World ID from step 1 (`shop.human`):
 * verified → agent setup; `needsWorldId` (ticket expired / missing) → the World ID screen in bind mode; otherwise
 * retry `bindHumanTicket()` here. The shop is created once; retries never create a second one.
 */
type ShopDraft = { nameIdeas: string[]; pseudonym: string };

export function ShopScreen({ initial }: { initial: ShopDraft | null }) {
  const { data, error } = useMRA(q.shopDraft, { initial });
  if (!data) return <MRAState error={error} />;
  return <ShopForm draft={data} />;
}

function ShopForm({ draft }: { draft: ShopDraft }) {
  const c = copy;
  const t = c.shop;
  const router = useRouter();
  const create = useMRAAction((m, shopName: string) => m.onboarding.createShop(shopName));
  const bind = useMRAAction((m) => m.onboarding.bindHumanTicket());
  const [created, setCreated] = useState(false);
  const [bindReason, setBindReason] = useState<string | undefined>();
  const fallbackName = draft.nameIdeas[0] ?? "";
  const [name, setName] = useState<string>(fallbackName);
  const clean = name.trim();
  const payUrl = appUrl(routes.pay);
  // Live: the pseudonym is minted on create (random id), so there is none to show before.
  const pseudonym = isMock ? draft.pseudonym : create.pending ? "shop_…" : "shop_····";

  const onHuman = (h: ShopHumanBinding) => {
    if (h.verified) router.push(routes.agent.setup);
    else if (h.needsWorldId) router.push(worldIdHref({ bind: true }));
    else setBindReason(h.reason);
  };
  // Backstop: a World ID red line surfacing as an error code goes to its screen.
  const redline = redlineHref(create.error ?? bind.error);
  useEffect(() => {
    if (redline) router.replace(redline);
  }, [redline, router]);

  return (
    <>
      <SplitPage
        panel={
          <BrandPanel
            top={<PanelBlocks seed={29} lit={litTiles(6)} />}
            eyebrow={stepEyebrow(5)}
            title={
              <>
                {t.panelTitle} <Accent>{t.accent}</Accent>
              </>
            }
            body={t.panel}
          />
        }
      >
        <StepProgress at={5} />
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
        <div>
          <Card aria-label={t.qr} className="flex-row items-center gap-5" padding="lg">
            <QRCode value={payUrl} size={128} label={`${t.qr}: ${clean || fallbackName}`} className="p-3" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>{t.qr}</Label>
              <span className="font-display text-h2 [overflow-wrap:anywhere] text-charcoal">{clean || "—"}</span>
              <Ledger>{pseudonym}</Ledger>
            </div>
          </Card>
        </div>
        {create.error ? <Banner tone="caution">{`Couldn't create the shop (${create.error}).`}</Banner> : null}
        {bindReason || bind.error ? <Banner tone="caution">{c.worldId.bindFailed(bindReason ?? bind.error ?? "")}</Banner> : null}
        <ActionBar>
          {created ? (
            <Button
              loading={bind.pending}
              onClick={() => {
                setBindReason(undefined);
                bind.run().then(onHuman, () => undefined);
              }}
            >
              {c.worldId.bindRetry}
            </Button>
          ) : clean.length < 2 ? (
            <Button disabled>{t.empty}</Button>
          ) : (
            <Button
              loading={create.pending}
              onClick={() => {
                create.run(clean).then(
                  (shop) => {
                    setCreated(true);
                    onHuman(shop.human ?? { verified: true }); // no binding info: the offer signer is the backstop
                  },
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
export function PassFacts({ initial }: { initial: BusinessPassView | null }) {
  const labels = copy.pass.facts;
  const { data, error } = useMRA(q.pass, { initial });
  if (data === undefined) return <MRAState error={error} />;
  if (data === null) {
    return <Text size="note">{"No pass on this phone yet."}</Text>;
  }
  const values = [data.country, `${"Band"} ${data.band}`, data.months];
  const tx = explorerTxUrl(data.txHash);
  return (
    <>
      <KeyValue rows={labels.map((f, i) => [f.k, values[i] ?? f.v])} />
      {tx ? (
        <TextLink href={tx} target="_blank" rel="noreferrer" arrow>
          {"See the record on Etherscan"}
        </TextLink>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------- M01a World ID (step 1)
 * World ID FIRST, before any business step: `onboarding.checkHuman({ onStep })` (verifying_human → checking →
 * eligible | stopped). Eligible → prove business (the ticket waits on this device for `createShop()`). Banned / open
 * advance → the stop screen (no business steps, no retry). Anything else (verification_failed, ...) → retry here.
 * `bind`: the shop exists but isn't linked (ticket expired / missing, or an offer said `human_not_verified`):
 * `checkHuman()` again, then `bindHumanTicket()`. `needsWorldId` → scan again; otherwise retry the link only.
 * Real World mode shows the IDKit QR from ./world-prompt while it waits. Mock: `?mockWorld=banned|open_advance`.
 */
const STOP_REASONS = new Set(["human_banned", "human_has_open_advance"]);

type WorldPhase = HumanCheckStep | "binding";

/** Phase → how many of the three list items are done. */
const PHASE_DONE: Record<WorldPhase, number> = { verifying_human: 0, checking: 1, eligible: 2, binding: 2, stopped: 1 };

export function WorldIdScreen({ bind = false }: { bind?: boolean }) {
  const t = copy.worldId;
  const router = useRouter();
  const [phase, setPhase] = useState<WorldPhase | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  /** Bind mode: a fresh ticket is on the device, so a retry only re-runs `bindHumanTicket()`. */
  const [ticket, setTicket] = useState(false);
  const check = useMRAAction((m) => m.onboarding.checkHuman({ onStep: setPhase }));
  const link = useMRAAction((m) => m.onboarding.bindHumanTicket());
  const prompt = useWorldPrompt("idkit");
  const waiting = check.pending || link.pending;
  const shown = failure ?? check.error ?? link.error;

  const run = async () => {
    setFailure(undefined);
    setPhase(undefined);
    if (!(bind && ticket)) {
      const r = await check.run().catch(() => undefined);
      if (!r) return;
      if (!r.eligible) {
        if (STOP_REASONS.has(r.reason)) router.replace(worldIdStoppedHref(r.reason));
        else setFailure(r.reason);
        return;
      }
      if (!bind) {
        router.push(routes.prove);
        return;
      }
      setTicket(true);
    }
    setPhase("binding");
    const h = await link.run().catch(() => undefined);
    if (!h) return;
    if (h.verified) {
      router.push(routes.agent.setup);
      return;
    }
    if (h.needsWorldId) setTicket(false);
    setFailure(h.needsWorldId ? h.reason : `bind:${h.reason}`);
  };

  const done = phase ? PHASE_DONE[phase] : 0;
  const steps = (bind ? t.bindSteps : t.steps).map((label, i) => ({
    label,
    state: (i < done ? "done" : i === done ? "current" : "next") as "done" | "current" | "next",
  }));
  const bindFailure = shown?.startsWith("bind:") ? shown.slice(5) : undefined;

  return (
    <SplitPage
      panel={
        <BrandPanel
          top={<PanelBlocks seed={7} lit={litTiles(bind ? 6 : 0)} />}
          eyebrow={bind ? `World ID · ${copy.stepNames[4]}` : stepEyebrow(1)}
          title={
            <>
              {t.panelTitle} <Accent>{t.accent}</Accent>
            </>
          }
          body={t.panel}
        />
      }
    >
      {bind ? null : <StepProgress at={1} />}
      {waiting ? (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t.waitingTag}</Label>
            <Heading level={2} size="h1">
              {t.waitingTitle}
            </Heading>
          </div>
          {prompt ? <IdkitWait prompt={prompt} /> : null}
          <Card>
            <Steps items={steps} />
          </Card>
          <p role="status" className="sr-only">
            {steps.find((s) => s.state === "current")?.label ?? ""}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Heading level={2} size="h1">
              {shown && !bindFailure ? t.failedTitle : bind ? t.bindTitle : t.title}
            </Heading>
            <Text>{shown && !bindFailure ? t.failedBody : bind ? t.bindBody : t.body}</Text>
          </div>
          {shown ? (
            <Banner tone="caution">
              {bindFailure ? t.bindFailed(bindFailure) : shown === "verification_failed" ? t.failed : t.other(shown)}
            </Banner>
          ) : (
            <>
              <Card>
                <KeyValue rows={t.keep.map((r) => [r.k, r.v])} />
              </Card>
              <Card tone="tint" gap="sm">
                <Label className="text-hunter">In plain words</Label>
                <Text className="text-forest">{t.plain}</Text>
              </Card>
            </>
          )}
          <ActionBar>
            <Button onClick={() => void run()} loading={waiting}>
              {bindFailure ? t.bindRetry : shown ? t.retry : t.cta}
            </Button>
            {shown ? null : <Text size="note">{t.note}</Text>}
          </ActionBar>
        </>
      )}
    </SplitPage>
  );
}
