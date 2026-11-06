// Prints the EIP-712 test vector (public anvil key #0, chain 31337, registry 0x5FbDB...0aa3).
// Usage: npx tsx scripts/vector.ts [registry] [chainId]
import { Attester } from "../src/eip712.js";
import { DEFAULT_BUSINESS_VERIFIED_TYPE } from "../src/config.js";

const pos = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const registry = (pos[0] ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3") as `0x${string}`;
const chainId = Number(pos[1] ?? 31337);
const a = new Attester("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", {
  name: "BusinessPassRegistry", version: "1", chainId, verifyingContract: registry, type: DEFAULT_BUSINESS_VERIFIED_TYPE,
});
const v = {
  businessNullifier: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn,
  commitment: 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81fn,
  // --fresh: a usable attestation (expires in 10 min) for submitting to issue() on a devnet.
  expiresAt: process.argv.includes("--fresh") ? BigInt(Math.floor(Date.now() / 1000) + 600) : 1790000600n,
  revenueBand: 0n,
};
const sig = await a.sign(v);
console.log(JSON.stringify({
  domain: a.domain, types: a.types, typehash: a.typehash, issuer: a.address,
  message: { businessNullifier: "0x" + v.businessNullifier.toString(16).padStart(64, "0"), commitment: "0x" + v.commitment.toString(16), expiresAt: Number(v.expiresAt) },
  digest: a.digest(v), signature: sig,
}, null, 2));
