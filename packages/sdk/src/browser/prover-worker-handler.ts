/** Message handler of the prover Web Worker (see prover.worker.ts for the protocol). */
import { createProverCore, type ProverCore, type ProverCoreOptions } from "./prover-core.js";
import type { CircuitInputs, CircuitName } from "../adapters/prover.js";

export type ProverWorkerRequest =
  | { id: number; op: "init"; threads?: number }
  | { id: number; op: "warmup"; circuits: CircuitName[] }
  | { id: number; op: "poseidon2"; inputs: string[] }
  | { id: number; op: "prove"; circuit: CircuitName; inputs: CircuitInputs; progress?: boolean };

let coreOpts: ProverCoreOptions = {};
let coreP: Promise<ProverCore> | undefined;
const core = () => (coreP ??= createProverCore(coreOpts));

function short(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Noir assertion failures: "Circuit execution failed: <assert message>". Keep only that message.
  const m = /Circuit execution failed:\s*(.{1,120})/.exec(msg);
  if (m) return `witness_failed: ${m[1]!.trim()}`;
  if (/witness|execute|Cannot satisfy|constraint/i.test(msg)) return "witness_failed";
  return fallback;
}

/** Handle one worker message; `post` sends a reply back to the page. Exported so tests can drive it in Node. */
export function handleProverMessage(data: unknown, post: (msg: unknown) => void): Promise<void> {
  const req = data as ProverWorkerRequest;
  if (!req || typeof req.id !== "number") return Promise.resolve();
  const reply = (body: object) => post({ id: req.id, ...body });
  return (async () => {
    try {
      switch (req.op) {
        case "init": {
          if (!coreP) coreOpts = { ...(req.threads ? { threads: req.threads } : {}) };
          await core();
          return reply({ ok: true, result: "ready" });
        }
        case "warmup": {
          const c = await core();
          await c.poseidon2([0n]);
          await Promise.all(req.circuits.map((name) => c.verificationKey(name)));
          return reply({ ok: true, result: "warm" });
        }
        case "poseidon2": {
          const h = await (await core()).poseidon2(req.inputs.map((x) => BigInt(x)));
          return reply({ ok: true, result: h.toString() });
        }
        case "prove": {
          const res = await (await core()).prove(req.circuit, req.inputs, req.progress ? (p) => reply({ progress: { stage: p.stage, circuit: p.circuit } }) : undefined);
          return reply({ ok: true, result: res });
        }
        default:
          return reply({ ok: false, error: "unknown_op" });
      }
    } catch (e) {
      reply({ ok: false, error: short(e, req.op === "prove" ? "prove_failed" : `${req.op}_failed`) });
    }
  })();
}
