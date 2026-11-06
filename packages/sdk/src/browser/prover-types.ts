/** Light types + labels shared by the main-thread prover client and the worker (no WASM imports here). */
import type { CircuitName } from "../adapters/prover.js";

/** Progress stages of one proof, in order. */
export type ProveStage = "init" | "witness" | "proving" | "done";
export type ProveProgress = { circuit: CircuitName; stage: ProveStage; label: string };

/** Default user-facing labels. Override per stage with `labels`. */
export const DEFAULT_PROVE_LABELS: Record<ProveStage, string> = {
  init: "Getting the private checker ready…",
  witness: "Checking your record privately…",
  proving: "Sealing the proof on this device…",
  done: "Proof ready. Nothing about you left this device.",
};
