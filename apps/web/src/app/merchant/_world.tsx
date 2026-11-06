"use client";

import { useEffect, useState } from "react";
import type { RecoveryStep } from "@repo/sdk";
import { Card, Ledger, Label, QRCode, Text, buttonVariants } from "@/final";
import { cn } from "@/lib/cn";
import type { WorldPrompt } from "@/lib/world-prompt";

/** Whole seconds until `expiresAt` (unix seconds), ticking once a second. Never below 0. */
export function useSecondsLeft(expiresAt: number | undefined): number | undefined {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (expiresAt === undefined) return;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  return expiresAt === undefined ? undefined : Math.max(0, expiresAt - now);
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function OpenInWorld({ href, children }: { href: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this World request link", href);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={href} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary" }))}>
          {children}
        </a>
        <button type="button" onClick={() => void copy()} className={cn(buttonVariants({ variant: "ghost" }))}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <Text size="note" tone="muted">
        On a laptop? Copy the link and paste it into World App or the World ID Simulator (&ldquo;Paste code&rdquo;).
      </Text>
    </div>
  );
}

/** World Agent Pass (device flow): QR + user code + countdown, while `agent.setup` waits on `awaiting_agent_pass`. */
export function AgentPassWait({ prompt }: { prompt: Extract<WorldPrompt, { kind: "agent-pass" }> }) {
  const left = useSecondsLeft(prompt.expiresAt) ?? 0;
  return (
    <Card tone="tint" padding="lg" gap="md" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <QRCode value={prompt.verificationUriComplete} size={184} label="QR code to approve your agent in World App" className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 text-center md:text-left">
          <Label className="text-hunter">Scan with World App</Label>
          {prompt.userCode ? (
            <div className="flex flex-col gap-1">
              <Text size="note">Or enter this code in World App</Text>
              <strong className="font-display text-hero-sm tracking-[0.08em] text-charcoal [overflow-wrap:anywhere] md:text-h1">
                {prompt.userCode}
              </strong>
            </div>
          ) : null}
          <Ledger className={left > 0 ? "text-charcoal-soft" : "text-risk"}>
            {left > 0 ? `Expires in ${clock(left)}` : "Expired. Checking with World…"}
          </Ledger>
          <OpenInWorld href={prompt.verificationUri}>Open in World App</OpenInWorld>
        </div>
      </div>
    </Card>
  );
}

/** World ID (IDKit) for backup / restore: QR of the connector URL, or open it on this phone. */
export function IdkitWait({ prompt }: { prompt: Extract<WorldPrompt, { kind: "idkit" }> }) {
  return (
    <Card tone="tint" padding="lg" gap="md" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <QRCode value={prompt.connectorURI} size={184} label="QR code to verify with World ID" className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 text-center md:text-left">
          <Label className="text-hunter">Scan with World App</Label>
          <Text>Confirm it&rsquo;s you in World App. This page moves on by itself.</Text>
          <OpenInWorld href={prompt.connectorURI}>Open in World App</OpenInWorld>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- recovery */

export const RECOVERY_STEP: Record<RecoveryStep, string> = {
  verifying_human: "Confirming it’s you with World ID",
  backing_up: "Locking and saving your backup",
  backed_up: "Backed up",
  fetching_backup: "Finding your backup",
  decrypting: "Opening it with your passphrase",
  restored: "Restored",
};

export const MIN_PASSPHRASE = 8;

/** Plain words for the SDK's recovery error codes. `live` = only works on the live network. */
export function recoveryError(code: string): { text: string; live?: boolean } {
  switch (code) {
    case "vault_locked":
      return { text: "That passphrase doesn’t open this backup. Check it and try again." };
    case "vault_corrupt":
      return { text: "The backup is damaged and can’t be opened." };
    case "verification_failed":
      return { text: "World couldn’t confirm it’s you. Try again in World App." };
    case "token_expired":
      return { text: "The World check timed out. Try again." };
    case "not_supported":
    case "adapter_not_configured":
      return { text: "World ID recovery is available on the live network.", live: true };
    default:
      return { text: `Something went wrong (${code}). Nothing was changed.` };
  }
}
