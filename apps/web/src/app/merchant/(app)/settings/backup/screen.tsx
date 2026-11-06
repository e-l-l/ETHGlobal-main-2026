"use client";

import { useState, type FormEvent } from "react";
import type { BackupResult, RecoveryStep } from "@repo/sdk";
import { ActionBar, Banner, Button, Card, CheckIcon, Columns, KeyValue, Ledger, Page, PageHead, Stack, TextField } from "@/final";
import { isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";
import { useMRAAction } from "@/lib/use-mra";
import { useWorldPrompt } from "@/lib/world-prompt";
import { CardTitle, NumberedList, PlainWords } from "../../../_ui";
import { IdkitWait, MIN_PASSPHRASE, RECOVERY_STEP, recoveryError } from "../../../_world";

/** Settings → Back up with World ID: `recovery.backup(passphrase)`. Only ciphertext leaves this device. */
export function BackupScreen() {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<RecoveryStep | undefined>();
  const [done, setDone] = useState<BackupResult | undefined>();
  const backup = useMRAAction((m, p: string) => m.recovery.backup(p, { onStep: setStep }));
  const prompt = useWorldPrompt("idkit");

  const tooShort = pass.length < MIN_PASSPHRASE;
  const mismatch = confirm !== pass;
  const passError = touched && tooShort ? `At least ${MIN_PASSPHRASE} characters.` : undefined;
  const confirmError = touched && !tooShort && mismatch ? "The two passphrases don’t match." : undefined;
  const err = backup.error ? recoveryError(backup.error) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || mismatch) return;
    setDone(undefined);
    backup.run(pass).then(
      (r) => {
        setDone(r);
        setPass("");
        setConfirm("");
        setTouched(false);
      },
      () => undefined,
    );
  };

  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Settings" title="Back up with World ID">
        Keep your passes safe if you lose this phone. World ID proves it&rsquo;s you; your passphrase opens the backup.
      </PageHead>

      <Columns ratio="3:2">
        <Stack>
          {done ? (
            <Card tone="tint" padding="lg" role="status">
              <CardTitle
                end={
                  <span className="grid size-9 place-items-center rounded-full bg-hunter text-canvas" aria-hidden>
                    <CheckIcon size={18} />
                  </span>
                }
              >
                Backed up
              </CardTitle>
              <KeyValue
                rows={[
                  ["Saved", "Locked with your passphrase"],
                  ["Size", `${done.bytes.toLocaleString("en-US")} bytes`],
                  ["Who can open it", "Only you, with World ID and the passphrase"],
                ]}
              />
              <div>
                <Button href={routes.merchant}>Back to home</Button>
              </div>
            </Card>
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Card padding="lg">
                <CardTitle>Choose a passphrase</CardTitle>
                <TextField
                  label="Passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  hint={`At least ${MIN_PASSPHRASE} characters. A short sentence works well.`}
                  error={passError}
                  disabled={backup.pending}
                />
                <TextField
                  label="Type it again"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  error={confirmError}
                  disabled={backup.pending}
                />
              </Card>
              <Banner tone="caution">
                <strong>Write it down.</strong> Nobody can reset this passphrase, not even us. Without it, the backup can&rsquo;t be opened.
              </Banner>
              {backup.pending && prompt ? <IdkitWait prompt={prompt} /> : null}
              {backup.pending && step ? <Ledger role="status">{RECOVERY_STEP[step]}…</Ledger> : null}
              {err ? <Banner tone={err.live ? "tint" : "risk"}>{err.text}</Banner> : null}
              <ActionBar>
                <Button type="submit" loading={backup.pending}>
                  Back up with World ID
                </Button>
                <Button href={routes.merchant} variant="ghost">
                  Not now
                </Button>
              </ActionBar>
            </form>
          )}
        </Stack>

        <Stack gap="lg">
          <Card padding="lg">
            <CardTitle>What happens</CardTitle>
            <NumberedList
              label="What happens"
              items={["You confirm it’s you in World App", "This phone locks your passes with the passphrase", "Only the locked copy is saved"]}
            />
          </Card>
          <PlainWords label="Private">
            We never see your passphrase or your passes. The saved copy is unreadable without the passphrase.
            {isMock ? " In test mode the backup lives only in this tab." : null}
          </PlainWords>
        </Stack>
      </Columns>
    </Page>
  );
}
