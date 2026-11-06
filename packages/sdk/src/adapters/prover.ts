/**
 * Prover: Noir + bb.js proofs and Poseidon2 hashing. Injectable so the core never bundles ~10 MB of WASM.
 *
 * Browser: run `@noir-lang/noir_js` + `@aztec-foundation/bb.js@6.0.0` (UltraHonkBackend, `{ verifierTarget: "evm" }`)
 * inside a Web Worker and wrap it with `workerProver(worker)`. The worker protocol is below; README has a worker.
 */
import { keccak256, toHex, type Hex } from "viem";
import { MRAError } from "../errors.js";
import { P } from "../credentials.js";

export type CircuitName = "business_pass" | "standing_pass";

/** Noir `InputMap`: decimal strings / hex strings / arrays of them. bigint is converted for you. */
export type CircuitInputs = Record<string, unknown>;

export type ProofResult = {
  /** 0x-hex proof bytes, as AdvanceBook / the relay routes take them. */
  proof: Hex;
  /** Public inputs in circuit order (business_pass: root, nullifier, min_band, commitment_next, context, allowed[4]). */
  publicInputs: Hex[];
};

export interface Prover {
  readonly kind: "mock" | "worker" | (string & {});
  poseidon2(inputs: bigint[]): Promise<bigint>;
  prove(circuit: CircuitName, inputs: CircuitInputs): Promise<ProofResult>;
}

/**
 * Mock prover. Deterministic, instant, and NOT cryptographically valid: its "Poseidon2" is keccak mod P and
 * its proofs are zero bytes. Onchain verifiers reject them. Use in mock mode and tests only.
 */
export function mockProver(opts: { delayMs?: number } = {}): Prover {
  const wait = () => (opts.delayMs ? new Promise((r) => setTimeout(r, opts.delayMs)) : Promise.resolve());
  return {
    kind: "mock",
    async poseidon2(inputs) {
      return BigInt(keccak256(toHex(inputs.map((x) => x.toString(16)).join(",")))) % P;
    },
    async prove(circuit, inputs) {
      await wait();
      const pub = Object.values(inputs).filter((v) => typeof v === "bigint") as bigint[];
      return { proof: `0x${"00".repeat(64)}` as Hex, publicInputs: [toHex(circuit.length), ...pub.map((v) => toHex(v))] };
    },
  };
}

/* ------------------------------------------------------------ worker prover */

/** Messages posted TO the worker. */
export type ProverRequest =
  | { id: number; op: "poseidon2"; inputs: string[] }
  | { id: number; op: "prove"; circuit: CircuitName; inputs: CircuitInputs };
/** Messages posted BY the worker. Errors carry a short code only, never inputs. */
export type ProverResponse =
  | { id: number; ok: true; result: string | ProofResult }
  | { id: number; ok: false; error: string };

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Structural Web Worker type, so the core needs no DOM-worker typings at runtime. */
export type WorkerLike = {
  postMessage(msg: unknown): void;
  addEventListener(type: "message", fn: (ev: { data: unknown }) => void): void;
  removeEventListener(type: "message", fn: (ev: { data: unknown }) => void): void;
};

function serialise(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serialise);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialise(x)]));
  return v;
}

/** Wrap a Web Worker that speaks `ProverRequest`/`ProverResponse`. */
export function workerProver(worker: WorkerLike, opts: { timeoutMs?: number } = {}): Prover {
  let seq = 0;
  const call = <T>(msg: WithoutId<ProverRequest>): Promise<T> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        worker.removeEventListener("message", onMsg);
        reject(new MRAError("timeout", "prover timed out"));
      }, opts.timeoutMs ?? 120_000);
      const onMsg = (ev: { data: unknown }) => {
        const d = ev.data as ProverResponse;
        if (!d || d.id !== id) return;
        clearTimeout(timer);
        worker.removeEventListener("message", onMsg);
        if (d.ok) resolve(d.result as T);
        else reject(new MRAError("prover_failed", `prover: ${d.error}`));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ ...msg, id });
    });
  return {
    kind: "worker",
    async poseidon2(inputs) {
      return BigInt(await call<string>({ op: "poseidon2", inputs: inputs.map(String) }));
    },
    prove(circuit, inputs) {
      return call<ProofResult>({ op: "prove", circuit, inputs: serialise(inputs) as CircuitInputs });
    },
  };
}

/** Default in real modes when nothing was injected: fails with a clear code instead of a bogus proof. */
export function unconfiguredProver(): Prover {
  const fail = async (): Promise<never> => {
    throw new MRAError("prover_not_configured", "pass `prover: workerProver(new Worker(...))` to createMRA for real proofs");
  };
  return { kind: "unconfigured", poseidon2: fail, prove: fail };
}
