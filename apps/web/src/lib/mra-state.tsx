"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/final/button";
import { Spinner } from "@/final/status";
import { MRA_ENV } from "./mra";
import { routes } from "./routes";

const MESSAGES: Record<string, { text: string; href: string; link: string }> = {
  not_found: { text: "Nothing here yet: this shop has no advance.", href: routes.merchant, link: "Back to home" },
};

/** What we say while the first read is in flight. Private (Nox mixnet) reads are slow, so say so. */
export const LOADING_TEXT = MRA_ENV.anonRpc
  ? "Reading the chain privately over the Nox mixnet… this can take up to a minute."
  : "Reading the chain…";

/** A fresh device: no shop keys here yet. Start an advance, or restore the passes from a World ID backup. */
function NoShopHere() {
  return (
    <div role="alert" className="flex max-w-xl flex-col gap-3 p-6">
      <h1 className="m-0 font-display text-h2 font-bold text-charcoal">No shop on this device yet</h1>
      <p className="m-0 font-body text-read text-charcoal-muted">
        Your shop lives on the device you signed up with. Start a new one here, or bring yours back with your World ID backup.
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button href={routes.welcome}>Get an advance</Button>
        <Button href={routes.restore} variant="secondary">
          Restore with World ID
        </Button>
      </div>
    </div>
  );
}

/** A grey placeholder block. Pulses, unless the person asked for reduced motion. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-well motion-reduce:animate-none ${className ?? ""}`} />;
}

/**
 * Stand-in for a screen while its data loads: a heading, a hero card, two tiles and a few rows. It keeps the page's
 * rough shape, so the layout doesn't jump when the real content lands. Live reads can take many seconds.
 */
export function ScreenSkeleton({ message = "Loading" }: { message?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto flex w-full max-w-280 flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <p className="m-0 font-body text-note text-charcoal-muted">{message}</p>
      <SkeletonBlock className="h-8 w-2/3 max-w-96" />
      <SkeletonBlock className="h-44 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-24 rounded-lg" />
        <SkeletonBlock className="h-24 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-4/5" />
      </div>
    </div>
  );
}

/** One shimmering placeholder block. The shimmer stops for users who ask for reduced motion. */
function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`rounded-md bg-well motion-safe:animate-pulse ${className}`} />;
}

const STEPS = MRA_ENV.anonRpc
  ? ["Connecting privately", "Reading the chain over the Nox mixnet", "Almost there"]
  : ["Connecting", "Reading the chain", "Almost there"];

/** A real loading screen: the page's shape in skeleton, plus a small card saying what is happening and why. */
function LoadingScreen() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const step = secs < 4 ? 0 : secs < 15 ? 1 : 2;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex w-full flex-col gap-5 p-6">
      <span className="sr-only">{LOADING_TEXT}</span>
      <div className="flex flex-col gap-2">
        <Bone className="h-3 w-28" />
        <Bone className="h-8 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Bone className="h-36 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Bone className="h-20" />
            <Bone className="h-20" />
            <Bone className="h-20 max-md:hidden" />
          </div>
          <div className="flex flex-col gap-2">
            <Bone className="h-11 w-full" />
            <Bone className="h-11 w-full" />
            <Bone className="h-11 w-5/6" />
          </div>
        </div>
        <div aria-hidden className="flex w-full flex-col gap-3 rounded-lg border border-honeydew-line bg-honeydew p-5 lg:w-80">
          <div className="flex items-center gap-3">
            <Spinner size={18} label="Loading" />
            <p className="m-0 font-body text-note font-semibold text-hunter">{STEPS[step]}…</p>
          </div>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-2 font-body text-tag ${i <= step ? "text-hunter" : "text-charcoal-muted"}`}>
                <span className={`inline-block size-1.5 rounded-full ${i < step ? "bg-hunter" : i === step ? "bg-hunter motion-safe:animate-pulse" : "bg-hairline"}`} />
                {label}
              </li>
            ))}
          </ol>
          <p className="m-0 font-body text-tag text-charcoal-muted">
            {MRA_ENV.anonRpc
              ? "Reads go through a mixnet so no RPC provider can tie this device to your shop. Private reads are slower; the next visit is instant."
              : "Loading live data from Sepolia."}
          </p>
          <p className="m-0 font-ledger text-ledger text-charcoal-muted">{secs}s</p>
        </div>
      </div>
    </div>
  );
}

/**
 * What a screen shows while the SDK loads, or when it fails, in local / sepolia mode. Mock mode never renders
 * this: its data is on the server.
 */
export function MRAState({ error }: { error?: string | undefined }) {
  if (!error) return <LoadingScreen />;
  if (error === "session_missing") return <NoShopHere />;
  const m = MESSAGES[error] ?? { text: `Couldn't load this screen (${error}).`, href: routes.home, link: "Back to start" };
  return (
    <div role="alert" className="flex flex-col gap-2 p-6 font-body text-note text-charcoal-muted">
      <p className="m-0">{m.text}</p>
      <p className="m-0">
        <Link className="underline" href={m.href}>
          {m.link}
        </Link>
      </p>
    </div>
  );
}
