/**
 * Build-time stand-in for `@repo/sdk/browser/prover`, aliased by next.config.ts while the SDK doesn't ship that
 * subpath (or NEXT_PUBLIC_MRA_BROWSER_STUBS=1). It throws, so lib/mra-browser.ts keeps the SDK's unconfigured prover.
 */
export const MRA_BROWSER_STUB = true;

export function createWorkerProver(): never {
  throw new Error("prover_module_missing");
}
