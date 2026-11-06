/**
 * `@repo/sdk/browser/prover`: the real in-browser prover for createMRA.
 *
 *   const prover = createWorkerProver({ circuit: "standing_pass", onProgress: (p) => setLine(p.label) });
 *   const mra = createMRA({ mode: "sepolia", prover, ... });
 *
 * Noir (noir_js 1.0.0-rc.3) + bb.js 6.0.0 UltraHonk with `{ verifierTarget: "evm" }` run in a Web Worker
 * (prover.worker.ts → prover-core.ts), so the page never freezes. Proofs verify against the deployed bb 6.0.0
 * HonkVerifier / BusinessPassVerifier. Poseidon2 (tree paths, commitments, nullifiers) runs in the same worker.
 *
 * The worker is created lazily on first use (or by `warmup()`), so creating the prover during render is cheap.
 */
import { MRAError } from "../errors.js";
import type { CircuitInputs, CircuitName, ProofResult, Prover, WorkerLike } from "../adapters/prover.js";
import { DEFAULT_PROVE_LABELS, type ProveProgress, type ProveStage } from "./prover-types.js";

export type { CircuitName, ProofResult, ProveProgress, ProveStage };
export { DEFAULT_PROVE_LABELS };

export type WorkerProverOptions = {
  /** Circuit(s) to preload on `warmup()`. Every circuit can still be proved; this only decides what is warmed. */
  circuit?: CircuitName | CircuitName[];
  /** Progress for every proof: "Checking your record privately…" etc. Also available per call via `onProgress()`. */
  onProgress?: (p: ProveProgress) => void;
  /** Override the labels per stage. */
  labels?: Partial<Record<ProveStage, string>>;
  /** Start the worker + load circuits immediately instead of on first use. Default false. */
  eager?: boolean;
  /** bb.js threads. >1 needs a cross-origin-isolated page (COOP/COEP headers). Default 1. */
  threads?: number;
  /** Per-call timeout. Default 180 s (first proof includes downloading the ~1 MB CRS). */
  timeoutMs?: number;
  /**
   * Provide the worker yourself if your bundler can't resolve the built-in one, e.g.
   * `() => new Worker(new URL("@repo/sdk/browser/prover.worker", import.meta.url), { type: "module" })`.
   */
  worker?: WorkerLike | (() => WorkerLike);
};

export interface WorkerProver extends Prover {
  readonly kind: "worker";
  /** Spin up the worker, bb.js and the circuits now (e.g. while the user reads the offer). */
  warmup(): Promise<void>;
  /** Subscribe to proof progress. Returns unsubscribe. */
  onProgress(fn: (p: ProveProgress) => void): () => void;
  /** Stop the worker. The next call starts a fresh one. */
  terminate(): void;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout>; circuit?: CircuitName };

function serialise(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serialise);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialise(x)]));
  return v;
}

function defaultWorker(): WorkerLike {
  if (typeof Worker === "undefined") throw new MRAError("prover_not_configured", "Web Workers are not available here (browser only)");
  // Bundlers (Next/Turbopack, webpack 5, Vite) recognise this exact pattern and emit the worker chunk.
  return new Worker(new URL("./prover.worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

export function createWorkerProver(opts: WorkerProverOptions = {}): WorkerProver {
  const labels = { ...DEFAULT_PROVE_LABELS, ...opts.labels };
  const warmCircuits: CircuitName[] = opts.circuit ? (Array.isArray(opts.circuit) ? opts.circuit : [opts.circuit]) : [];
  const subs = new Set<(p: ProveProgress) => void>();
  if (opts.onProgress) subs.add(opts.onProgress);
  const pending = new Map<number, Pending>();
  let seq = 0;
  let worker: WorkerLike | undefined;
  let initP: Promise<unknown> | undefined;

  const emit = (circuit: CircuitName, stage: ProveStage) => {
    const p = { circuit, stage, label: labels[stage] };
    for (const fn of subs) fn(p);
  };

  const onMessage = (ev: { data: unknown }) => {
    const d = ev.data as { id?: number; ok?: boolean; result?: unknown; error?: string; progress?: { stage: ProveStage; circuit: CircuitName } };
    if (!d || typeof d.id !== "number") return;
    const p = pending.get(d.id);
    if (!p) return;
    if (d.progress) {
      // "init" was already emitted by prove() before the worker started; don't repeat it.
      if (d.progress.stage !== "init") emit(d.progress.circuit, d.progress.stage);
      return;
    }
    clearTimeout(p.timer);
    pending.delete(d.id);
    if (d.ok) p.resolve(d.result);
    else p.reject(new MRAError("prover_failed", `prover: ${d.error ?? "unknown"}`));
  };

  function getWorker(): WorkerLike {
    if (worker) return worker;
    worker = typeof opts.worker === "function" ? opts.worker() : (opts.worker ?? defaultWorker());
    worker.addEventListener("message", onMessage);
    (worker as unknown as { addEventListener(t: "error", fn: (e: unknown) => void): void }).addEventListener?.("error", (e: unknown) => {
      if (e && typeof e === "object" && "data" in e) return; // a message event from a loosely-typed WorkerLike
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new MRAError("prover_failed", "prover: worker crashed"));
        pending.delete(id);
      }
    });
    return worker;
  }

  function call<T>(msg: Record<string, unknown>, timeoutMs = opts.timeoutMs ?? 180_000): Promise<T> {
    const w = getWorker();
    return new Promise<T>((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new MRAError("timeout", "prover timed out"));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      w.postMessage({ ...msg, id });
    });
  }

  const init = () => (initP ??= call({ op: "init", ...(opts.threads ? { threads: opts.threads } : {}) }).catch((e) => {
    initP = undefined;
    throw e;
  }));

  const prover: WorkerProver = {
    kind: "worker",
    async warmup() {
      await init();
      if (warmCircuits.length) await call({ op: "warmup", circuits: warmCircuits });
    },
    async poseidon2(inputs: bigint[]) {
      await init();
      return BigInt(await call<string>({ op: "poseidon2", inputs: inputs.map(String) }));
    },
    async prove(circuit: CircuitName, inputs: CircuitInputs): Promise<ProofResult> {
      emit(circuit, "init");
      await init();
      return call<ProofResult>({ op: "prove", circuit, inputs: serialise(inputs), progress: true });
    },
    onProgress(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    terminate() {
      (worker as unknown as { terminate?: () => void } | undefined)?.terminate?.();
      worker?.removeEventListener("message", onMessage);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new MRAError("aborted", "prover terminated"));
      }
      pending.clear();
      worker = undefined;
      initP = undefined;
    },
  };
  if (opts.eager) prover.warmup().catch(() => undefined);
  return prover;
}
