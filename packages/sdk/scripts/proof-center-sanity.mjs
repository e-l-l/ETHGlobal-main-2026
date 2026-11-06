// Read-only sanity run of mra.protocol.proofCenter() against a live chain (no transactions, no wallet, no secrets).
//   node scripts/proof-center-sanity.mjs [rpcUrl]      (after `pnpm build`)
// Anon-RPC is off and the RPC is called directly. Prints counts per section and the checks.
import { createMRA } from "../dist/index.js";

const url = process.argv[2] ?? "https://sepolia.gateway.tenderly.co";
const apiUrl = process.env.MRA_API_URL; // optional: adds the risk agent's status to the AI card
const mra = createMRA({ mode: "sepolia", rpc: { url, anonRpc: false }, ...(apiUrl ? { apiUrl } : {}), faucet: false });
const t0 = Date.now();
const v = await mra.protocol.proofCenter({ days: 3 });
const count = (xs) => xs.reduce((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
console.log(`network   ${v.network.name} chainId=${v.network.chainId} block=${v.network.block} window=${v.window?.fromBlock}..${v.window?.toBlock} (${Date.now() - t0} ms)`);
console.log(`contracts ${v.contracts.length}: ${v.contracts.map((c) => `${c.name}=${c.codeSize}B`).join(", ")}`);
console.log(`zkProofs  ${v.zkProofs.length} ${JSON.stringify(count(v.zkProofs))}`);
for (const z of v.zkProofs.slice(0, 5)) console.log(`  - ${z.when} ${z.fn ?? z.kind}: ${z.title} | verifier ${z.verifier.name} | proof ${z.proofBytes ?? "-"}B | inputs ${z.publicInputCount ?? "-"} | ${z.explorerUrl}\n      ${(z.publicInputs ?? []).map((r) => `${r.label}=${r.value}`).join("; ")}`);
console.log(`device    ${v.deviceProofs.length}`);
console.log(`txs       ${v.transactions.length} rows ${JSON.stringify(count(v.transactions))}; in window ${JSON.stringify(v.transactionCounts)}`);
console.log(`ai        source=${v.ai.source} latest=${v.ai.latest.length} ${JSON.stringify(v.ai.summary)}`);
console.log(`privacy   public=${v.privacy.publicOnchain.length} neverStored=${v.privacy.neverStored.length} aiSees=${v.privacy.aiSees.length} rpc=${v.privacy.rpc.mode}`);
console.log(`checks    ${v.checks.map((c) => `${c.ok === true ? "PASS" : c.ok === false ? "FAIL" : "N/A "} ${c.id}: ${c.detail}`).join("\n          ")}`);
if (v.errors.length) console.log(`errors    ${v.errors.join(" | ")}`);
