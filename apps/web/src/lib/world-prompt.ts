/**
 * What World currently asks the merchant to do, published by the module-level SDK adapters in ./mra-browser and
 * read by the screens. Only set when NEXT_PUBLIC_WORLD_MODE=real; in mock mode it stays empty.
 *
 * - `agent-pass`: the OIDC device flow (approve screen). QR of `verificationUriComplete`, the `userCode`, a countdown.
 * - `idkit`: a World ID proof for backup / restore. QR of `connectorURI` (or open it on the phone).
 */
import { useSyncExternalStore } from "react";
import type { DevicePrompt } from "@repo/sdk";

/** NEXT_PUBLIC_WORLD_MODE=real: the real World adapters in ./mra-browser. Anything else (the default): mock payloads. */
export const WORLD_MODE: "real" | "mock" = process.env.NEXT_PUBLIC_WORLD_MODE === "real" ? "real" : "mock";

export type WorldPrompt = ({ kind: "agent-pass" } & DevicePrompt) | { kind: "idkit"; connectorURI: string };

let current: WorldPrompt | undefined;
const listeners = new Set<() => void>();

export function getWorldPrompt(): WorldPrompt | undefined {
  return current;
}

export function setWorldPrompt(next: WorldPrompt | undefined) {
  current = next;
  for (const fn of listeners) fn();
}

export function subscribeWorldPrompt(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const serverSnapshot = () => undefined;

/** The live World prompt, or undefined. Pass `kind` to only see that flow's prompt. */
export function useWorldPrompt(): WorldPrompt | undefined;
export function useWorldPrompt<K extends WorldPrompt["kind"]>(kind: K): Extract<WorldPrompt, { kind: K }> | undefined;
export function useWorldPrompt(kind?: WorldPrompt["kind"]): WorldPrompt | undefined {
  const p = useSyncExternalStore(subscribeWorldPrompt, getWorldPrompt, serverSnapshot);
  return p && (!kind || p.kind === kind) ? p : undefined;
}
