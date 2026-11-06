/**
 * Web Worker entry for the browser prover. Speaks the SDK's `ProverRequest` / `ProverResponse` protocol
 * (adapters/prover.ts), so it also works with the core `workerProver(worker)`, plus two additions used by
 * `createWorkerProver`:
 *   - `{ id, op: "warmup", circuits }` preloads circuits + the bb.js backend;
 *   - when a request carries `progress: true`, the worker posts `{ id, progress: { stage } }` messages before
 *     the final response (never sent otherwise, so plain `workerProver` is unaffected).
 * Errors carry a short code plus the circuit's assertion message (e.g. "revenue band below minimum"), never inputs.
 */
import { handleProverMessage } from "./prover-worker-handler.js";

const scope = globalThis as unknown as {
  postMessage(msg: unknown): void;
  addEventListener(type: "message", fn: (ev: { data: unknown }) => void): void;
};
scope.addEventListener("message", (ev) => void handleProverMessage(ev.data, (m) => scope.postMessage(m)));
