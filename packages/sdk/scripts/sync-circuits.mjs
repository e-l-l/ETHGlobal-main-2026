#!/usr/bin/env node
/**
 * Compile the Noir circuits and copy their ACIR artifacts into src/browser/circuits/, where the browser prover
 * (src/browser/prover-core.ts) imports them. Run after any change under circuits/:
 *
 *   node packages/sdk/scripts/sync-circuits.mjs            # nargo compile + copy
 *   node packages/sdk/scripts/sync-circuits.mjs --no-compile  # copy existing target/*.json only
 *
 * Toolchain: nargo 1.0.0-rc.3 (matches @noir-lang/noir_js 1.0.0-rc.3 and bb / bb.js 6.0.0).
 * The vk the deployed HonkVerifier / BusinessPassVerifier embed is derived from exactly this bytecode, so a
 * changed circuit also needs `circuits/<name>/build.sh` + a verifier redeploy.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = resolve(here, "../src/browser/circuits");
const CIRCUITS = ["standing_pass", "business_pass"];
const EXPECTED_NARGO = "1.0.0-rc.3";
const compile = !process.argv.includes("--no-compile");

const env = { ...process.env, PATH: `${join(homedir(), ".nargo/bin")}:${process.env.PATH ?? ""}` };
mkdirSync(out, { recursive: true });

if (compile) {
  const v = execFileSync("nargo", ["--version"], { env, encoding: "utf8" });
  if (!v.includes(EXPECTED_NARGO)) {
    console.error(`nargo ${EXPECTED_NARGO} required (got: ${v.split("\n")[0]}). Run: noirup -v ${EXPECTED_NARGO}`);
    process.exit(1);
  }
}

for (const c of CIRCUITS) {
  const dir = join(root, "circuits", c);
  if (compile) execFileSync("nargo", ["compile"], { cwd: dir, env, stdio: "inherit" });
  const src = join(dir, "target", `${c}.json`);
  if (!existsSync(src)) {
    console.error(`missing ${src}: run without --no-compile`);
    process.exit(1);
  }
  const art = JSON.parse(readFileSync(src, "utf8"));
  if (!art.bytecode || !art.abi) throw new Error(`${src} is not a nargo artifact`);
  copyFileSync(src, join(out, `${c}.json`));
  console.log(`synced ${c}.json (noir ${art.noir_version}, ${art.abi.parameters.length} params)`);
}
