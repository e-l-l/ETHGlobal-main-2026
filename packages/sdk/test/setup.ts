// Default tests never touch the network: any un-mocked fetch (API, issuer, viem RPC) fails loudly.
const blocked = (async (input: unknown) => {
  throw new Error(`network disabled in tests: ${String(input).slice(0, 60)}`);
}) as typeof fetch;
globalThis.fetch = blocked;
