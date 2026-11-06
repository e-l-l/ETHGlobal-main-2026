"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { RecoveryStep } from "@repo/sdk";
import { Accent, ActionBar, Banner, BrandPanel, Button, Heading, Ledger, SplitPage, Text, TextField } from "@/final";
import { isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";
import { useMRAAction } from "@/lib/use-mra";
import { useWorldPrompt } from "@/lib/world-prompt";
import { IdkitWait, MIN_PASSPHRASE, RECOVERY_STEP, recoveryError } from "../../_world";

/** New device → Restore with World ID: `recovery.restore(passphrase)`, then merchant home. */
export function RestoreScreen() {
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<RecoveryStep | undefined>();
  const [noBackup, setNoBackup] = useState(false);
  const restore = useMRAAction((m, p: string) => m.recovery.restore(p, { onStep: setStep }));
  const prompt = useWorldPrompt("idkit");

  const tooShort = pass.length < MIN_PASSPHRASE;
  const passError = touched && tooShort ? `At least ${MIN_PASSPHRASE} characters.` : undefined;
  const err = restore.error ? recoveryError(restore.error) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort) return;
    setNoBackup(false);
    restore.run(pass).then(
      (r) => {
        if (!r.restored) return setNoBackup(true);
        // Live modes: reload so the SDK client starts again from the restored vault (passes, session, wallet).
        if (isMock) router.push(routes.merchant);
        else window.location.assign(routes.merchant);
      },
      () => undefined,
    );
  };

  return (
    <SplitPage
      panel={
        <BrandPanel
          eyebrow="New phone"
          title={
            <>
              Pick up where <Accent>you left off.</Accent>
            </>
          }
          body="Prove it’s you with World ID, then enter the passphrase you chose when you backed up."
        />
      }
    >
      <div className="flex flex-col gap-2">
        <Heading level={2} size="h1">
          Restore with World ID
        </Heading>
        <Text>Your passes come back to this phone. Your shop, QR and limits stay the same.</Text>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Backup passphrase"
          type="password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          error={passError}
          disabled={restore.pending}
        />
        {restore.pending && prompt ? <IdkitWait prompt={prompt} /> : null}
        {restore.pending && step ? <Ledger role="status">{RECOVERY_STEP[step]}…</Ledger> : null}
        {noBackup ? (
          <Banner tone="caution">
            No backup found for this World ID.{isMock ? " In test mode, back up first in this same tab." : " Set up your shop instead."}
          </Banner>
        ) : null}
        {err ? <Banner tone={err.live ? "tint" : "risk"}>{err.text}</Banner> : null}
        <ActionBar>
          <Button type="submit" loading={restore.pending}>
            Restore with World ID
          </Button>
          <Button href={routes.welcome} variant="ghost">
            Set up a new shop
          </Button>
        </ActionBar>
      </form>
    </SplitPage>
  );
}
