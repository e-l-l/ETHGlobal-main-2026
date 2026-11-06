import type { Ctx } from "../context.js";
import type { FundResult } from "../viewmodels.js";

/**
 * This device's wallet (the burner the app injects in testnet modes, or any viem WalletClient passed as `wallet`).
 *
 *   mra.wallet.address()                       // for the wallet chip; undefined when none is connected
 *   await mra.wallet.ensureFunded({ usdc: 10 }) // before the first write: "Getting your test dollars…"
 *
 * Every SDK write already calls ensureFunded itself; call it from a screen first only to show the funding state.
 */
export function walletDomain(ctx: Ctx) {
  return {
    address(): string | undefined {
      if (ctx.mode === "mock" || !ctx.cfg.wallet?.account) return undefined;
      return ctx.cfg.wallet.account.address;
    },
    /** Gas (and `usdc` dollars of test USDC) for the next writes: asks the demo faucet at most once. */
    ensureFunded(opts: { usdc?: number; onFunding?: () => void } = {}): Promise<FundResult> {
      return ctx.ensureFunded(opts);
    },
  };
}

export type WalletDomain = ReturnType<typeof walletDomain>;
