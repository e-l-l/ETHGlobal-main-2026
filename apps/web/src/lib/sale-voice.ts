/**
 * The demo's voice line: on a new sale the merchant's phone says
 * "You received {X} dollars, {Y} went to your advance", in the app language (lib/lang.ts cookie).
 * Browser speechSynthesis only: nothing is sent anywhere.
 */
import type { Lang } from "./copy";

/** Same-browser channel: the customer pay screen posts here so a merchant tab can speak in mock mode. */
export const SALES_CHANNEL = "mra-sales";
export type SaleMessage = { amountUsd: number; toAdvanceUsd: number };

export const VOICE_STORAGE_KEY = "mra-voice";

function spoken(n: number, lang: Lang) {
  return (Math.round(n * 100) / 100).toLocaleString(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 2 });
}

export function saleLine(lang: Lang, amountUsd: number, toAdvanceUsd: number): string {
  const x = spoken(amountUsd, lang);
  const y = spoken(toAdvanceUsd, lang);
  if (lang === "es") {
    if (!(toAdvanceUsd > 0)) return `Recibiste ${x} dólares.`;
    return `Recibiste ${x} dólares, ${y} ${toAdvanceUsd === 1 ? "fue" : "fueron"} a tu adelanto.`;
  }
  if (!(toAdvanceUsd > 0)) return `You received ${x} dollars.`;
  return `You received ${x} dollars, ${y} went to your advance.`;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak one line. The newest sale wins: never queue a backlog. */
export function speak(line: string, lang: Lang) {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(line);
  u.lang = lang === "es" ? "es-AR" : "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** iOS / Chrome only allow speech after a tap. Call from the toggle's tap so later announcements play. */
export function unlockSpeech() {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance("");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export const voiceCopy: Record<Lang, { title: string; description: string; test: string; unsupported: string }> = {
  en: {
    title: "Read each sale out loud",
    description: "Like a soundbox at the till",
    test: "Test voice",
    unsupported: "This browser can't speak",
  },
  es: {
    title: "Leer cada venta en voz alta",
    description: "Como una caja parlante en el mostrador",
    test: "Probar voz",
    unsupported: "Este navegador no puede hablar",
  },
};
