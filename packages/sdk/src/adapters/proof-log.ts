/**
 * Device proof log for the Proof center screen: every `prover.prove()` call made through the SDK is timed and
 * recorded (circuit, ms, proof size, public input count, ok / error code). Nothing about the inputs is kept.
 *
 * `withProofLog(prover, log)` wraps whatever prover was configured (worker, mock, custom) in context.ts, so the
 * onboarding, draw, mandate and self-check prove paths are all logged without touching them. Entries live in memory
 * and are mirrored best-effort to the CredentialVault (`proof_log`), so a proof made before a reload still shows.
 */
import type { CircuitName, ProofResult, Prover } from "./prover.js";
import type { CredentialVault, ProofLogEntry } from "./vault.js";

export type { ProofLogEntry };

export interface ProofLog {
  /** Newest first. */
  list(): Promise<ProofLogEntry[]>;
  record(entry: ProofLogEntry): Promise<void>;
  /** Re-persist after an entry was updated in place (background local verify). */
  touch(): Promise<void>;
}

export function createProofLog(vault?: CredentialVault, max = 20): ProofLog {
  let mem: ProofLogEntry[] | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const load = async () => {
    if (mem) return mem;
    let stored: ProofLogEntry[] | undefined;
    try {
      stored = await vault?.get("proof_log");
    } catch {
      /* a locked / missing vault only loses history */
    }
    mem ??= Array.isArray(stored) ? stored.slice(0, max) : [];
    return mem;
  };
  const persist = () =>
    (chain = chain.then(async () => {
      try {
        if (vault && mem) await vault.put("proof_log", mem.slice(0, max));
      } catch {
        /* best effort */
      }
    }));
  return {
    async list() {
      return (await load()).map((e) => ({ ...e }));
    },
    async record(entry) {
      const m = await load();
      m.unshift(entry);
      if (m.length > max) m.length = max;
      await persist();
    },
    async touch() {
      await persist();
    },
  };
}

type Verifying = { verify?: (circuit: CircuitName, result: ProofResult) => Promise<boolean> };

const proofBytesOf = (proof: string) => (typeof proof === "string" && proof.startsWith("0x") ? (proof.length - 2) / 2 : 0);

/**
 * The same prover, with `prove` timed and logged. Every other property (kind, poseidon2, warmup, onProgress,
 * terminate…) passes through untouched. If the prover can verify (prover-core in Node / tests), the proof is
 * verified in the background, off the critical path, and `verifiedLocally` is filled in afterwards.
 */
export function withProofLog<P extends Prover>(prover: P, log: ProofLog, now: () => number = () => Math.floor(Date.now() / 1000)): P {
  if ((prover as { __proofLogged?: boolean }).__proofLogged) return prover;
  const prove = async (circuit: CircuitName, inputs: Parameters<Prover["prove"]>[1]): Promise<ProofResult> => {
    const t0 = Date.now();
    try {
      const res = await prover.prove(circuit, inputs);
      const entry: ProofLogEntry = {
        circuit,
        ms: Date.now() - t0,
        proofBytes: proofBytesOf(res.proof),
        publicInputCount: Array.isArray(res.publicInputs) ? res.publicInputs.length : 0,
        at: now(),
        verifiedLocally: null,
        ok: true,
        prover: String(prover.kind),
      };
      await log.record(entry).catch(() => undefined);
      const v = (prover as Verifying).verify;
      if (typeof v === "function") {
        v.call(prover, circuit, res)
          .then((ok) => {
            entry.verifiedLocally = !!ok;
            return log.touch();
          })
          .catch(() => undefined);
      }
      return res;
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "prove_failed";
      await log
        .record({ circuit, ms: Date.now() - t0, proofBytes: 0, publicInputCount: 0, at: now(), verifiedLocally: null, ok: false, error: code, prover: String(prover.kind) })
        .catch(() => undefined);
      throw e;
    }
  };
  return new Proxy(prover, {
    get(target, key) {
      if (key === "prove") return prove;
      if (key === "__proofLogged") return true;
      const v = Reflect.get(target, key, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
