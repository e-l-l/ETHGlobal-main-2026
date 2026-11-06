/**
 * createWorkerProver (@repo/sdk/browser/prover) message plumbing, with an in-memory worker. No WASM here: the
 * real proof through the same client + worker handler is in browser-prover.test.ts (MRA_PROVER_E2E=1).
 */
import { describe, expect, it } from "vitest";
import type { WorkerLike } from "../src/adapters/prover.js";
import { createWorkerProver, type ProveProgress } from "../src/browser/prover.js";
import { tree } from "./tree-helpers.js";

/** Fake worker speaking the protocol: progress for prove, poseidon2 = sum, a failing circuit. */
function fakeWorker() {
  const subs = new Set<(ev: { data: unknown }) => void>();
  const posted: any[] = [];
  const send = (data: unknown) => queueMicrotask(() => subs.forEach((f) => f({ data })));
  const w: WorkerLike & { terminate(): void; terminated: boolean } = {
    terminated: false,
    terminate() {
      this.terminated = true;
    },
    addEventListener: (t, fn) => void (t === "message" && subs.add(fn)),
    removeEventListener: (_t, fn) => void subs.delete(fn),
    postMessage(msg: any) {
      posted.push(msg);
      if (msg.op === "init" || msg.op === "warmup") return send({ id: msg.id, ok: true, result: "ready" });
      if (msg.op === "poseidon2") return send({ id: msg.id, ok: true, result: msg.inputs.reduce((a: bigint, x: string) => a + BigInt(x), 0n).toString() });
      if (msg.op === "prove") {
        if (msg.circuit === "business_pass") return send({ id: msg.id, ok: false, error: "witness_failed: revenue band below minimum" });
        for (const stage of ["init", "witness", "proving", "done"]) send({ id: msg.id, progress: { stage, circuit: msg.circuit } });
        return send({ id: msg.id, ok: true, result: { proof: "0xabcd", publicInputs: [msg.inputs.root] } });
      }
    },
  };
  return { w, posted };
}

describe("createWorkerProver", () => {
  it("implements Prover: poseidon2, prove with progress labels, bigint serialisation", async () => {
    const { w, posted } = fakeWorker();
    const seen: ProveProgress[] = [];
    const prover = createWorkerProver({ circuit: "standing_pass", worker: () => w, onProgress: (p) => seen.push(p) });
    expect(prover.kind).toBe("worker");
    expect(posted).toHaveLength(0); // lazy: no worker until first use
    expect(await prover.poseidon2([1n, 2n])).toBe(3n);
    const res = await prover.prove("standing_pass", { root: 5n, index_bits: [true, false] });
    expect(res).toEqual({ proof: "0xabcd", publicInputs: ["5"] });
    const prove = posted.find((m) => m.op === "prove");
    expect(prove.inputs).toEqual({ root: "5", index_bits: [true, false] });
    expect(seen.map((p) => p.stage)).toEqual(["init", "witness", "proving", "done"]);
    expect(seen.find((p) => p.stage === "witness")?.label).toBe("Checking your record privately…");
  });

  it("surfaces circuit failures as prover_failed with the assertion message, and custom labels", async () => {
    const { w } = fakeWorker();
    const prover = createWorkerProver({ worker: w, labels: { witness: "Checking…" } });
    const lines: string[] = [];
    prover.onProgress((p) => lines.push(p.label));
    await expect(prover.prove("business_pass", {})).rejects.toMatchObject({ code: "prover_failed", message: expect.stringContaining("revenue band below minimum") });
    await prover.prove("standing_pass", { root: 1n });
    expect(lines).toContain("Checking…");
  });

  it("warmup preloads the configured circuits; terminate rejects in-flight calls", async () => {
    const { w, posted } = fakeWorker();
    const prover = createWorkerProver({ circuit: ["standing_pass", "business_pass"], worker: w });
    await prover.warmup();
    expect(posted.find((m) => m.op === "warmup").circuits).toEqual(["standing_pass", "business_pass"]);
    prover.terminate();
    expect(w.terminated).toBe(true);
  });

  it("works with the whole-tree helpers (tree.ts) for a local path", async () => {
    const { w } = fakeWorker();
    const prover = createWorkerProver({ worker: w });
    const r = await tree(prover);
    expect(r.idx).toBe(2);
    expect(r.witness.path).toHaveLength(16);
  });
});
