/**
 * The real prover: Noir witness generation (@noir-lang/noir_js 1.0.0-rc.3, matching nargo 1.0.0-rc.3) and
 * UltraHonk proving (@aztec-foundation/bb.js 6.0.0, `{ verifierTarget: "evm" }`, matching the deployed bb 6.0.0
 * HonkVerifier / BusinessPassVerifier).
 *
 * Environment-neutral on purpose: the Web Worker (prover.worker.ts) runs exactly this code, and so does the Node
 * test that proves with the circuits' Prover.toml fixtures and checks the result against the verifier. Importing
 * it pulls in ~15 MB of WASM, so it is only reachable from the `@repo/sdk/browser/prover-core` subpath and from
 * the worker, never from the SDK core.
 */
import { Noir, type CompiledCircuit, type InputMap } from "@noir-lang/noir_js";
import { Barretenberg, BackendType, UltraHonkBackend } from "@aztec-foundation/bb.js";
import type { CircuitInputs, CircuitName, ProofResult } from "../adapters/prover.js";

export type { CircuitInputs, CircuitName, ProofResult };

import { DEFAULT_PROVE_LABELS, type ProveProgress, type ProveStage } from "./prover-types.js";

export { DEFAULT_PROVE_LABELS, type ProveProgress, type ProveStage };

export type ProverCoreOptions = {
  /** bb.js threads. Browser: >1 only works when the page is cross-origin isolated (COOP/COEP). Default 1. */
  threads?: number;
  /**
   * bb.js backend. Default: Wasm (in-thread) everywhere. We already run inside our own Web Worker, so bb.js's
   * default browser backend (WasmWorker, which spawns a nested worker from its own package URL) adds nothing but
   * a second bundling problem; and in Node it keeps tests on the browser's code path instead of the native bb.
   */
  backend?: BackendType;
  /** Override the bundled artifacts (tests, or a freshly compiled circuit). */
  circuits?: Partial<Record<CircuitName, CompiledCircuit>>;
  labels?: Partial<Record<ProveStage, string>>;
  logger?: (msg: string) => void;
};

export interface ProverCore {
  poseidon2(inputs: bigint[]): Promise<bigint>;
  prove(circuit: CircuitName, inputs: CircuitInputs, onProgress?: (p: ProveProgress) => void): Promise<ProofResult>;
  /** Off-chain check with the same bb.js backend (proof made with verifierTarget "evm"). */
  verify(circuit: CircuitName, result: ProofResult): Promise<boolean>;
  /** The circuit's UltraHonk verification key (evm target), e.g. to compare with `bb write_vk -t evm`. */
  verificationKey(circuit: CircuitName): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

const EVM = { verifierTarget: "evm" } as const;

async function loadCircuit(name: CircuitName): Promise<CompiledCircuit> {
  // Lazy JSON imports: each artifact (~80 KB) is fetched only when that circuit is first used.
  const mod =
    name === "standing_pass"
      ? await import("./circuits/standing_pass.json", { with: { type: "json" } })
      : await import("./circuits/business_pass.json", { with: { type: "json" } });
  return (mod.default ?? mod) as unknown as CompiledCircuit;
}

/** Field element → 0x + 64 hex. */
export function fieldHex(v: bigint): `0x${string}` {
  return `0x${v.toString(16).padStart(64, "0")}`;
}

function toBytes32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function fromBytes(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

function bytesHex(b: Uint8Array): `0x${string}` {
  let s = "0x";
  for (const byte of b) s += byte.toString(16).padStart(2, "0");
  return s as `0x${string}`;
}

/** bigint → 0x hex; numbers → decimal strings; booleans kept (noirc_abi takes JSON bools); arrays/objects recursed. */
export function toInputMap(v: CircuitInputs): InputMap {
  const conv = (x: unknown): unknown => {
    if (typeof x === "bigint") return fieldHex(x);
    if (typeof x === "number") return String(x);
    if (Array.isArray(x)) return x.map(conv);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, conv(y)]));
    return x;
  };
  return conv(v) as InputMap;
}

export async function createProverCore(opts: ProverCoreOptions = {}): Promise<ProverCore> {
  const labels = { ...DEFAULT_PROVE_LABELS, ...opts.labels };
  const backendType = opts.backend ?? BackendType.Wasm;
  let apiP: Promise<Barretenberg> | undefined;
  const api = () =>
    (apiP ??= Barretenberg.new({
      threads: opts.threads ?? 1,
      backend: backendType,
      ...(opts.logger ? { logger: opts.logger } : {}),
    }));
  const programs = new Map<CircuitName, Promise<{ noir: Noir; honk: UltraHonkBackend }>>();
  const program = (name: CircuitName) => {
    let p = programs.get(name);
    if (!p) {
      p = (async () => {
        const circuit = opts.circuits?.[name] ?? (await loadCircuit(name));
        return { noir: new Noir(circuit), honk: new UltraHonkBackend(circuit.bytecode, await api()) };
      })();
      programs.set(name, p);
    }
    return p;
  };

  return {
    async poseidon2(inputs) {
      const { hash } = await (await api()).poseidon2Hash({ inputs: inputs.map(toBytes32) });
      return fromBytes(hash);
    },

    async prove(circuit, inputs, onProgress) {
      const tell = (stage: ProveStage) => onProgress?.({ circuit, stage, label: labels[stage] });
      tell("init");
      const { noir, honk } = await program(circuit);
      tell("witness");
      const { witness } = await noir.execute(toInputMap(inputs));
      tell("proving");
      const { proof, publicInputs } = await honk.generateProof(witness, EVM);
      tell("done");
      return { proof: bytesHex(proof), publicInputs: publicInputs.map((x) => fieldHex(BigInt(x))) };
    },

    async verify(circuit, result) {
      const { honk } = await program(circuit);
      const proof = Uint8Array.from((result.proof.slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)));
      return honk.verifyProof({ proof, publicInputs: result.publicInputs.map(String) }, EVM);
    },

    async verificationKey(circuit) {
      const { honk } = await program(circuit);
      return honk.getVerificationKey(EVM);
    },

    async destroy() {
      if (apiP) await (await apiP).destroy();
      apiP = undefined;
      programs.clear();
    },
  };
}
