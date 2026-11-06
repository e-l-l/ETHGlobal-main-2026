/**
 * Build-time stand-in for `@repo/sdk/browser/anon`, aliased by next.config.ts while the SDK doesn't ship that
 * subpath (or NEXT_PUBLIC_MRA_BROWSER_STUBS=1). It throws, so lib/mra-browser.ts falls back to a direct RPC.
 */
export const MRA_BROWSER_STUB = true;

export function createAnonRpc(): never {
  throw new Error("anon_rpc_module_missing");
}
