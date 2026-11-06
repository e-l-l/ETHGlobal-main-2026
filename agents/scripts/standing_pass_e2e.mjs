#!/usr/bin/env node
/**
 * Standing Pass, end to end, LIVE on Sepolia, through the real SDK (@repo/sdk) and the real Noir/UltraHonk prover
 * (@repo/sdk/browser/prover-core, the same code the browser's Web Worker runs).
 *
 *   1. Business Pass       issuer /mock/proof (fresh:true) → /issue → BusinessPassRegistry.issue (merchant burner)
 *   2. registerShop        merchant burner
 *   3. tier-0 mandate      World mock Agent Pass + business_pass proof → relayer registerMandate
 *   4. tier-0 advance      POST /agents/{id}/trigger {run_now} → relayer drawByMandate
 *   5. repay fully         customer pays from a second burner (MockUSDC minted by the payer itself)
 *   6. claim               merchant.claimStandingPass() → relayer claimStandingPass → leaf found in the WHOLE tree →
 *                          private self-check proof
 *   7. tier-1 mandate      agent.setup($100) → standing_pass proof over the whole downloaded tree → registerMandate
 *   8. checks              mandate tier/cap onchain, $100 > tierCap[0], nullifier reuse rejected (eth_call),
 *                          the agent's tier-1 trigger (the underwriter decides; reported, not forced)
 *
 * Resumable: progress, the two burner keys and the merchant's device vault live in --state (default: $TMPDIR), never
 * printed. Re-run to continue after a failure.
 *
 *   PATH=<node 24>:$PATH node agents/scripts/standing_pass_e2e.mjs [--state FILE] [--rpc URL] [--fresh] [--stop-after 4]
 *   env: RELAYER_PRIVATE_KEY (gas top-up fallback if the faucet refuses), ATTESTER_PRIVATE_KEY (nullifier-reuse
 *        eth_call only; skipped without it). Load with:  set -a; . agents/.env; set +a
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SDK = resolve(here, "../../packages/sdk");
const imp = (p) => import(pathToFileURL(join(SDK, p)).href);
const sdk = await imp("dist/index.js");
const { createProverCore } = await imp("dist/browser/prover-core.js");
const viem = await imp("node_modules/viem/_esm/index.js");
const { privateKeyToAccount, generatePrivateKey } = await imp("node_modules/viem/_esm/accounts/index.js");
const { sepolia } = await imp("node_modules/viem/_esm/chains/index.js");

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API = arg("--api", "https://api.65-1-36-70.sslip.io");
const ISSUER = arg("--issuer", "https://issuer.65-1-36-70.sslip.io");
const RPC = arg("--rpc", "https://sepolia.gateway.tenderly.co");
const STATE = arg("--state", join(tmpdir(), "standing_pass_e2e.json"));
const FRESH = process.argv.includes("--fresh");
/** Stop after the step whose name starts with this (e.g. "4": a shop with an open advance, for demo_standing_pass.py). */
const STOP_AFTER = arg("--stop-after", undefined);

/* ------------------------------------------------------------------ state */

const st = !FRESH && existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { done: {}, txs: {}, proofs: [], vault: {}, session: {} };
const save = () => writeFileSync(STATE, JSON.stringify(st, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2), { mode: 0o600 });
st.merchantKey ??= generatePrivateKey();
st.payerKey ??= generatePrivateKey();
save();

/** The merchant's device vault, persisted to the state file (IndexedDB stand-in). */
class FileVault extends sdk.MemoryVault {
  kind = "file";
  async load() {
    for (const [k, v] of Object.entries(st.vault)) await super.put(k, v);
  }
  async put(k, v) {
    await super.put(k, v);
    st.vault[k] = v;
    save();
  }
  async delete(k) {
    await super.delete(k);
    delete st.vault[k];
    save();
  }
}

/* ------------------------------------------------------------------ prover */

const core = await createProverCore();
const prover = {
  kind: "node",
  poseidon2: (x) => core.poseidon2(x),
  async prove(circuit, inputs) {
    const t0 = performance.now();
    const r = await core.prove(circuit, inputs);
    const rec = { circuit, ms: Math.round(performance.now() - t0), proofBytes: (r.proof.length - 2) / 2 };
    st.proofs.push(rec);
    save();
    log(`   proof ${circuit}: ${rec.proofBytes} bytes in ${(rec.ms / 1000).toFixed(1)} s`);
    return r;
  },
};

/* ------------------------------------------------------------------ clients */

// The script's own sends/reads: fall back to a second public RPC when the first rate-limits (Tenderly 429s bursts).
const transport = viem.fallback([viem.http(RPC, { retryCount: 2 }), viem.http("https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 4 })]);
const pub = viem.createPublicClient({ chain: sepolia, transport });
const merchantAcct = privateKeyToAccount(st.merchantKey);
const payerAcct = privateKeyToAccount(st.payerKey);
const wallet = (account) => viem.createWalletClient({ account, chain: sepolia, transport });


const vault = new FileVault();
await vault.load();
const base = { mode: "sepolia", apiUrl: API, issuerUrl: ISSUER, rpc: { url: RPC }, timeoutMs: 120_000, prover };
const mra = sdk.createMRA({ ...base, wallet: wallet(merchantAcct), vault });
const payer = sdk.createMRA({ ...base, wallet: wallet(payerAcct), vault: new sdk.MemoryVault() });
const chain = mra.raw.chain();
const A = chain.addresses;

/* ------------------------------------------------------------------ helpers */

const t00 = Date.now();
function log(...x) {
  console.log(`[${((Date.now() - t00) / 1000).toFixed(0).padStart(4)}s]`, ...x);
}
const ok = (cond, what) => {
  log(`${cond ? "PASS" : "FAIL"} ${what}`);
  st.checks ??= {};
  st.checks[what] = !!cond;
  save();
  if (!cond) process.exitCode = 1;
};
async function step(name, fn) {
  if (st.done[name]) {
    log(`skip ${name} (done)`);
    return;
  }
  log(`---- ${name}`);
  await fn();
  st.done[name] = true;
  save();
  if (STOP_AFTER && name.startsWith(STOP_AFTER)) {
    log(`stopped after "${name}" (--stop-after ${STOP_AFTER}); shop ${st.shopId}`);
    await core.destroy();
    process.exit(process.exitCode ?? 0);
  }
}
const tx = (name, hash) => {
  if (!hash) return;
  st.txs[name] = hash;
  save();
  log(`   tx ${name}: https://sepolia.etherscan.io/tx/${hash}`);
};
const usdcAbi = viem.parseAbi(["function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"]);

/** The demo faucet, tolerating its failures (we top up from the relayer key instead). */
async function faucet(client, label) {
  try {
    const f = await client.wallet.ensureFunded();
    log(`   faucet ${label}: ${f.status}`);
    (f.txHashes ?? []).forEach((h, i) => tx(`faucet ${label} ${i}`, h));
  } catch (e) {
    log(`   faucet ${label} failed: ${e.code ?? e.message} (falling back to the relayer key)`);
    st.faucetErrors ??= [];
    st.faucetErrors.push(`${label}: ${e.status ?? ""} ${e.code ?? e.message}`);
    save();
  }
}

async function ensureGas(addr, label) {
  const bal = await pub.getBalance({ address: addr });
  if (bal >= viem.parseEther("0.0002")) return;
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) throw new Error(`${label} has no gas and RELAYER_PRIVATE_KEY is not set`);
  const relayer = wallet(privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`));
  const h = await relayer.sendTransaction({ to: addr, value: viem.parseEther("0.0005") });
  await pub.waitForTransactionReceipt({ hash: h });
  tx(`gas top-up → ${label}`, h);
}

/* ------------------------------------------------------------------ the loop */

const relayerAddr = process.env.RELAYER_PRIVATE_KEY ? privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY.startsWith("0x") ? process.env.RELAYER_PRIVATE_KEY : `0x${process.env.RELAYER_PRIVATE_KEY}`).address : undefined;
st.relayerEthStart ??= relayerAddr ? (await pub.getBalance({ address: relayerAddr })).toString() : undefined;
log(`merchant ${merchantAcct.address}  payer ${payerAcct.address}  state ${STATE}`);
const caps = (await chain.protocol()).tierCaps;
log(`tierCap: ${caps.map((c) => `$${Number(c) / 1e6}`).join(" / ")}   standing leaves now: ${(await chain.leaves("standing")).length}`);

await step("1 business pass", async () => {
  await faucet(mra, "merchant");
  await ensureGas(merchantAcct.address, "merchant");
  const r = await mra.onboarding.proveBusiness({ band: 2, country: "AR" });
  if (!r.ok) throw new Error(`issuer refused: ${r.code}`);
  tx("1 BusinessPassRegistry.issue", r.pass.txHash);
  log(`   business leaf #${r.pass.leafIndex}`);
});

await step("2 registerShop", async () => {
  const shop = await mra.onboarding.createShop("Standing Pass E2E");
  tx("2 registerShop", shop.txHash);
  st.shopId = shop.shopId;
});

await step("3 tier-0 mandate", async () => {
  const r = await mra.agent.setup({ perAdvance: 50, perMonth: 50 }, { onStep: (s) => log(`   ${s}`) });
  if (r.status !== "active") throw new Error(`agent setup: ${r.status} ${r.reason ?? ""}`);
  tx("3 registerMandate (tier 0)", r.txHash);
  st.mandate0 = r.mandateId;
});

await step("4 tier-0 advance (agent trigger)", async () => {
  let opened;
  for (let i = 0; i < 3 && !opened; i++) {
    const t = await mra.agent.trigger({ runNow: true });
    log(`   trigger: ${t.action} ${t.code} | ${t.summary ?? ""}`);
    if (t.action === "drew") {
      const agent = await mra.raw.api().getAgent((await vault.get("session")).agentId, (await vault.get("session")).manageToken);
      tx("4 drawByMandate (tier 0)", agent.draws.at(-1)?.tx_hash);
      await pub.waitForTransactionReceipt({ hash: agent.draws.at(-1).tx_hash });
    }
    const shop = await chain.shop(st.shopId);
    if (shop.activeAdvanceId > 0n) opened = await chain.advance(shop.activeAdvanceId);
    else await new Promise((r) => setTimeout(r, 8000));
  }
  if (!opened) throw new Error("no advance opened");
  st.advance0 = opened.id.toString();
  log(`   advance #${opened.id}: $${Number(opened.principal) / 1e6} tier ${opened.tier}, owes $${Number(opened.totalOwed) / 1e6}, holdback ${opened.holdbackBps / 100}%`);
  ok(opened.tier === 0 && opened.principal === caps[0], "tier-0 advance is $50 (tierCap[0])");
});

await step("5 repay fully (customer pays)", async () => {
  await faucet(payer, "payer");
  await ensureGas(payerAcct.address, "payer");
  for (let i = 0; i < 4; i++) {
    const a = await chain.advance(BigInt(st.advance0));
    if (a.status === 2) break;
    const left = a.totalOwed - a.repaid;
    const need = (left * 10_000n + BigInt(a.holdbackBps) - 1n) / BigInt(a.holdbackBps); // sale that repays the rest
    const cents = (need + 9_999n) / 10_000n; // round up to whole cents
    const amount = Number(cents) / 100;
    const have = await pub.readContract({ address: A.usdc, abi: usdcAbi, functionName: "balanceOf", args: [payerAcct.address] });
    if (have < cents * 10_000n) {
      const h = await wallet(payerAcct).writeContract({ address: A.usdc, abi: usdcAbi, functionName: "mint", args: [payerAcct.address, cents * 10_000n - have + 1_000_000n] });
      await pub.waitForTransactionReceipt({ hash: h });
      tx(`5 MockUSDC.mint (payer) ${i}`, h);
    }
    log(`   paying $${amount} (owes $${Number(left) / 1e6} at ${a.holdbackBps / 100}%)`);
    const r = await payer.pay.pay(st.shopId, amount, { onStep: (s) => s.hash && tx(`5 ${s.label} ${i}`, s.hash) });
    log(`   sale: $${r.toRepayment} to repayment, $${r.toShop} to the shop`);
  }
  const a = await chain.advance(BigInt(st.advance0));
  ok(a.status === 2 && a.repaid === a.totalOwed, "advance fully repaid (status Repaid)");
});

await step("6 claim Standing Pass", async () => {
  const before = await mra.merchant.repaid();
  ok(before.standingPass.claimable === true, "repaid() shows the claim button (claimable)");
  log(`   repaid(): tier ${before.currentTier}, nextCap $${before.standingPass.nextCap}`);
  const r = await mra.merchant.claimStandingPass({ onStep: (s) => log(`   ${s}`) });
  tx("6 claimStandingPass (relayed)", r.txHash);
  st.claim = r;
  log(`   leaf #${r.leafIndex}, repaid ${r.repaidCount}, tier ${r.tier}, new limit $${r.newCap}` + (r.selfCheck ? `, self-check proof ${r.selfCheck.proofBytes} B in ${(r.selfCheck.ms / 1000).toFixed(1)} s` : ""));
  const a = await chain.advance(BigInt(st.advance0));
  ok(a.credentialClaimed, "advance.credentialClaimed onchain");
  ok(r.newCap === Number(caps[1]) / 1e6, "new limit = tierCap[1]");
  const opts = await mra.agent.setupOptions();
  ok(opts.currentTier === 1 && !opts.perAdvanceOptions.find((o) => o.value === 100)?.lockedReason, "agent setup unlocks the $100 chip");
});

await step("6b claim retry", async () => {
  // A second tap after success: same answer, no second tx.
  const again = await mra.merchant.claimStandingPass({ selfCheck: false });
  ok(!again.txHash && again.leafIndex === st.claim.leafIndex && again.newCap === st.claim.newCap, "claim retry is idempotent (no tx)");
});

await step("7 tier-1 mandate ($100)", async () => {
  // $250 is still locked (offchain guard; the contract would cap the draw anyway).
  try {
    await mra.agent.setup({ perAdvance: 250, perMonth: 250 });
    ok(false, "$250 refused at tier 1");
  } catch (e) {
    ok(e.code === "invalid_limits", "$250 refused at tier 1");
  }
  const r = await mra.agent.setup({ perAdvance: 100, perMonth: 100 }, { onStep: (s) => log(`   ${s}`) });
  if (r.status !== "active") throw new Error(`agent setup: ${r.status} ${r.reason ?? ""}`);
  tx("7 registerMandate (tier 1, standing_pass proof)", r.txHash);
  st.mandate1 = r.mandateId;
});

await step("8 checks", async () => {
  const m = await chain.mandate(BigInt(st.mandate1));
  log(`   mandate #${st.mandate1}: tier ${m.tier}, maxPerDraw $${Number(m.maxPerDraw) / 1e6}`);
  ok(Number(m.tier) === 1 && m.maxPerDraw === caps[1], "tier-1 mandate onchain with maxPerDraw = $100 (tierCap[1])");
  ok(caps[1] > caps[0], "tier-1 cap $100 > tier-0 cap $50");
  const sp = await vault.get("standing_pass");
  ok(sp.spent === true && sp.next?.count === 2, "device marks the pass spent and holds the count-2 successor");
  const opts = await mra.agent.setupOptions();
  ok(opts.currentTier === 0, "a spent pass can't be reused for another agent (chips lock again)");

  // Nullifier reuse: replay the exact registerMandate calldata of step 7 (decoded from the chain, so no precision is
  // lost) with a FRESH attestation, so only the credential can fail → must revert NullifierAlreadySpent.
  const attKey = process.env.ATTESTER_PRIVATE_KEY;
  if (!attKey) {
    log("   (nullifier-reuse eth_call skipped: no ATTESTER_PRIVATE_KEY)");
  } else {
    const sent = await pub.getTransaction({ hash: st.txs["7 registerMandate (tier 1, standing_pass proof)"] });
    const { args } = viem.decodeFunctionData({ abi: sdk.abi.advanceBookAbi, data: sent.input });
    const [req, cred, , ownerSig] = args;
    const att = privateKeyToAccount(attKey.startsWith("0x") ? attKey : `0x${attKey}`);
    const limitsHash = await pub.readContract({ address: A.book, abi: sdk.abi.advanceBookAbi, functionName: "hashLimits", args: [req.limits] });
    const nonce = BigInt(Date.now()) * 1000n + 7n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 600);
    const sig = await att.signTypedData({
      domain: { name: "AdvanceBook", version: "1", chainId: sepolia.id, verifyingContract: A.book },
      types: { AgentPassAttestation: [{ name: "agentKey", type: "address" }, { name: "limitsHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
      primaryType: "AgentPassAttestation",
      message: { agentKey: req.agentKey, limitsHash, nonce, expiry },
    });
    log(`   replaying nullifier ${viem.toHex(cred.nullifier).slice(0, 12)}… (root known: ${await chain.isKnownStandingRoot(cred.root)}, spent: ${await pub.readContract({ address: A.book, abi: sdk.abi.advanceBookAbi, functionName: "nullifierSpent", args: [cred.nullifier] })})`);
    try {
      await pub.simulateContract({ address: A.book, abi: sdk.abi.advanceBookAbi, functionName: "registerMandate", args: [req, cred, { nonce, expiry, signature: sig }, ownerSig], account: payerAcct.address });
      ok(false, "reusing the Standing Pass nullifier reverts (NullifierAlreadySpent)");
    } catch (e) {
      const name = e?.cause?.data?.errorName ?? e?.shortMessage ?? String(e);
      log(`   reuse → ${name}`);
      ok(/NullifierAlreadySpent/.test(name), "reusing the Standing Pass nullifier reverts (NullifierAlreadySpent)");
    }
  }

  // The tier-1 agent's first draw: the underwriter decides (red lines apply beyond tier 0). Reported, not forced.
  const t = await mra.agent.trigger({ runNow: true });
  st.tier1Trigger = t;
  log(`   tier-1 trigger: ${t.action} ${t.code} | ${t.summary ?? ""}`);
  if (t.action === "drew") {
    const s = await vault.get("session");
    const agent = await mra.raw.api().getAgent(s.agentId, s.manageToken);
    tx("8 drawByMandate (tier 1)", agent.draws.at(-1)?.tx_hash);
  }
});

const spent = st.relayerEthStart && relayerAddr ? Number(BigInt(st.relayerEthStart) - (await pub.getBalance({ address: relayerAddr }))) / 1e18 : undefined;
log("==== tx hashes");
for (const [k, v] of Object.entries(st.txs)) console.log(`  ${k.padEnd(48)} ${v}`);
log("==== proofs");
for (const p of st.proofs) console.log(`  ${p.circuit.padEnd(14)} ${p.proofBytes} B  ${(p.ms / 1000).toFixed(1)} s`);
if (spent !== undefined) log(`relayer ETH spent since the first run: ${spent.toFixed(6)}`);
await core.destroy();
process.exit(process.exitCode ?? 0);
