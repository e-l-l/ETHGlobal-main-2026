/**
 * Build-time stub for `@x402/*`: optional imports inside @coinbase/cdp-sdk (pulled in by RainbowKit's Coinbase
 * wallet through @base-org/account) for x402 payments, which this app never uses. Not installed, so next.config.ts
 * aliases them here. Every export throws if it is ever called.
 */
const unavailable = (): never => {
  throw new Error("x402 is not bundled in this app");
};
export const toClientEvmSigner = unavailable;
export const x402Client = unavailable;
export const ExactEvmScheme = unavailable;
export const UptoEvmScheme = unavailable;
export const ExactSvmScheme = unavailable;
export const registerExactEvmScheme = unavailable;
export const registerExactSvmScheme = unavailable;
