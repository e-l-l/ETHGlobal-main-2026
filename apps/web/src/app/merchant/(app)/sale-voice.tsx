"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SaleVM } from "@repo/sdk";
import { Button, Card, Ledger, SettingRow, Switch } from "@/final";
import type { Lang } from "@/lib/copy";
import { isMock } from "@/lib/mra";
import {
  SALES_CHANNEL,
  VOICE_STORAGE_KEY,
  canSpeak,
  saleLine,
  speak,
  unlockSpeech,
  voiceCopy,
  type SaleMessage,
} from "@/lib/sale-voice";

/* The voice toggle, persisted in localStorage and shared across tabs. */
const voiceListeners = new Set<() => void>();
function subscribeVoice(cb: () => void) {
  voiceListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    voiceListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readVoice() {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeVoice(on: boolean) {
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: the toggle just won't persist */
  }
  voiceListeners.forEach((cb) => cb());
}
const noSubscribe = () => () => {};

/**
 * The voice moment on Home: "You received X dollars, Y went to your advance" (en / es, browser speechSynthesis,
 * nothing leaves the device). Sale events come from the SDK: Home polls `merchant.home()` in live modes and every
 * sale id it hasn't seen is announced. In mock mode the feed is static, so a customer paying in another tab of this
 * browser (C01, over a BroadcastChannel) triggers it instead. "Test voice" always works.
 */
export function SaleVoice({
  lang,
  sales,
  usdToLocal,
  holdback,
}: {
  lang: Lang;
  sales: SaleVM[];
  usdToLocal: number;
  /** Percent of each sale that goes to the advance; 0 when there's no open advance. */
  holdback: number;
}) {
  const t = voiceCopy[lang];
  // The toggle lives in localStorage (the browser still needs one tap before it will speak after a reload).
  const on = useSyncExternalStore(subscribeVoice, readVoice, () => false);
  const supported = useSyncExternalStore(noSubscribe, canSpeak, () => true);
  const [announce, setAnnounce] = useState("");
  const seen = useRef<Set<string> | null>(null);
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  const say = (amountUsd: number, toAdvanceUsd: number, force = false) => {
    const line = saleLine(lang, amountUsd, toAdvanceUsd);
    setAnnounce(line);
    if (force || onRef.current) speak(line, lang);
  };
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  });

  // New sale ids from the SDK feed → announce the newest one. The first load is the baseline, never announced.
  useEffect(() => {
    const ids = sales.map((s) => s.id);
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = sales.filter((s) => !seen.current!.has(s.id));
    ids.forEach((id) => seen.current!.add(id));
    const newest = fresh[0];
    if (!newest) return;
    const usd = newest.total / usdToLocal;
    sayRef.current(usd, (usd * holdback) / 100);
  }, [sales, usdToLocal, holdback]);

  // Mock mode: a customer paying in another tab of this browser.
  useEffect(() => {
    if (!isMock || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SALES_CHANNEL);
    ch.onmessage = (e: MessageEvent<SaleMessage>) => {
      if (typeof e.data?.amountUsd === "number") sayRef.current(e.data.amountUsd, e.data.toAdvanceUsd);
    };
    return () => ch.close();
  }, []);

  const toggle = (next: boolean) => {
    if (next) unlockSpeech();
    else if (canSpeak()) window.speechSynthesis.cancel();
    writeVoice(next);
  };

  const test = () => {
    const latest = sales[0];
    const usd = latest ? latest.total / usdToLocal : 10;
    say(usd, (usd * (holdback || 10)) / 100, true);
  };

  return (
    <Card padding="sm" gap="sm">
      <SettingRow title={t.title} hint={supported ? t.description : t.unsupported}>
        <Switch checked={on} onCheckedChange={toggle} disabled={!supported} aria-label={t.title} />
      </SettingRow>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" width="auto" onClick={test} disabled={!supported}>
          {t.test}
        </Button>
        {announce ? <Ledger aria-hidden>{announce}</Ledger> : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </Card>
  );
}
