/**
 * Real-proof test of the browser prover's code path (src/browser/prover-core.ts, the code the Web Worker runs),
 * in Node with bb.js's WASM backend (the same backend the browser uses). Proves both circuits from their
 * Prover.toml fixtures and checks:
 *   - Poseidon2 matches the circuit / SPEC vectors,
 *   - public inputs come out in the order AdvanceBook passes them to the verifiers,
 *   - the proof verifies (bb.js, evm target) and has the size of the bb CLI's evm proofs,
 *   - the verification key equals the one `bb write_vk -t evm` produced for the deployed verifier, when present.
 *
 * Slow (~10-30 s per proof). Skipped unless MRA_PROVER_E2E=1 (`pnpm --filter @repo/sdk test:prover`).
 * MRA_PROOF_OUT=<dir> writes the proofs as JSON for an onchain eth_call check against the deployed verifiers.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createProverCore, fieldHex, type ProverCore, type ProveProgress } from "../src/browser/prover-core.js";
import { TAG_BIZ_NULL } from "../src/credentials.js";
import { createWorkerProver } from "../src/browser/prover.js";
import { handleProverMessage } from "../src/browser/prover-worker-handler.js";
import type { WorkerLike } from "../src/adapters/prover.js";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const run = env.MRA_PROVER_E2E === "1";

/** Just enough TOML for nargo's Prover.toml: `k = "v"`, `k = ["a", ...]`, `k = [true, ...]`, comments. */
function parseProverToml(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of src.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^(\w+)\s*=\s*(.+)$/.exec(line);
    if (!m) throw new Error(`unparsed line: ${line}`);
    out[m[1]!] = JSON.parse(m[2]!);
  }
  return out;
}

const fixture = (c: string) => parseProverToml(readFileSync(join(ROOT, "circuits", c, "Prover.toml"), "utf8"));
const asField = (v: unknown) => fieldHex(BigInt(v as string));

describe.skipIf(!run)("browser prover (real Noir + bb.js 6.0.0, Node WASM)", () => {
  let core: ProverCore;
  const out = env.MRA_PROOF_OUT;
  afterAll(async () => core?.destroy());

  it("Poseidon2 matches the circuit test vectors", async () => {
    core = await createProverCore();
    expect(await core.poseidon2([1000n, 2000n])).toBe(0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8an);
    expect(await core.poseidon2([123456789n])).toBe(0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9bn);
    expect(await core.poseidon2([TAG_BIZ_NULL, 123456789n])).toBe(0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434efn);
  }, 120_000);

  for (const [circuit, publicOrder] of [
    ["standing_pass", ["root", "nullifier", "tier", "commitment_next", "context"]],
    ["business_pass", ["root", "nullifier", "min_band", "commitment_next", "context", "allowed_countries"]],
  ] as const) {
    it(`${circuit}: proves the Prover.toml fixture, public inputs in contract order, verifies`, async () => {
      core ??= await createProverCore();
      const inputs = fixture(circuit);
      const stages: ProveProgress["stage"][] = [];
      const t0 = Date.now();
      const res = await core.prove(circuit, inputs, (p) => stages.push(p.stage));
      const ms = Date.now() - t0;

      expect(stages).toEqual(["init", "witness", "proving", "done"]);
      // AdvanceBook builds the verifier's bytes32[] from exactly these, in this order.
      const expected = publicOrder.flatMap((k) => (Array.isArray(inputs[k]) ? (inputs[k] as unknown[]).map(asField) : [asField(inputs[k])]));
      expect(res.publicInputs).toEqual(expected);
      // Same size as `bb prove -t evm` (contracts/test/fixtures/<circuit>.proof.hex).
      const cli = readFileSync(join(ROOT, "contracts/test/fixtures", `${circuit}.proof.hex`), "utf8").trim();
      expect(res.proof.length).toBe(cli.length);
      expect(await core.verify(circuit, res)).toBe(true);
      // A tampered public input must fail.
      const bad = { ...res, publicInputs: [fieldHex(BigInt(res.publicInputs[0]!) + 1n), ...res.publicInputs.slice(1)] };
      expect(await core.verify(circuit, bad)).toBe(false);

      // vk == the one the deployed Solidity verifier was generated from (only if build.sh left it in target/).
      const vkPath = join(ROOT, "circuits", circuit, "target", "vk");
      if (existsSync(vkPath)) expect(Buffer.from(await core.verificationKey(circuit)).equals(readFileSync(vkPath))).toBe(true);

      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${circuit}.proof.json`), JSON.stringify({ ...res, ms }, null, 1));
      }
      console.log(`${circuit}: proof ${(res.proof.length - 2) / 2} bytes, ${res.publicInputs.length} public inputs, ${ms} ms`);
    }, 300_000);
  }

  it("full browser path: createWorkerProver → worker message handler → core; structured-cloned messages", async () => {
    const subs = new Set<(ev: { data: unknown }) => void>();
    const worker: WorkerLike = {
      addEventListener: (t, fn) => void (t === "message" && subs.add(fn)),
      removeEventListener: (_t, fn) => void subs.delete(fn),
      postMessage: (msg) => void handleProverMessage(structuredClone(msg), (m) => subs.forEach((f) => f({ data: structuredClone(m) }))),
    };
    const labels: string[] = [];
    const prover = createWorkerProver({ circuit: "standing_pass", worker, onProgress: (p) => labels.push(p.label) });
    await prover.warmup();
    const inputs = fixture("standing_pass");
    const res = await prover.prove("standing_pass", inputs);
    expect(res.publicInputs[0]).toBe(asField(inputs.root));
    expect(labels).toContain("Checking your record privately…");
    core ??= await createProverCore();
    expect(await core.verify("standing_pass", res)).toBe(true);
    // A failing witness comes back as prover_failed with the circuit's assertion, not the inputs.
    await expect(prover.prove("standing_pass", { ...inputs, tier: "9" })).rejects.toMatchObject({ code: "prover_failed" });
    if (out) writeFileSync(join(out, "standing_pass.worker-path.proof.json"), JSON.stringify(res, null, 1));
  }, 300_000);
});
