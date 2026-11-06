// Default tests never touch the network: any un-mocked fetch (API, issuer, viem RPC) fails loudly.
// One exception, only for the opt-in real-prover test (MRA_PROVER_E2E=1): bb.js downloading its public CRS.
const realFetch = globalThis.fetch;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const blocked = (async (input: unknown, init?: RequestInit) => {
  if (env.MRA_PROVER_E2E === "1" && /^https:\/\/crs\.aztec(-labs)?\.com\//.test(String(input))) return realFetch(input as string, init);
  throw new Error(`network disabled in tests: ${String(input).slice(0, 60)}`);
}) as typeof fetch;
globalThis.fetch = blocked;
