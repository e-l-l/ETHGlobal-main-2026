import { resolveConfig, type MRAConfig } from "./config.js";
import { createContext } from "./context.js";
import { agentDomain } from "./domains/agent.js";
import { lenderDomain } from "./domains/lender.js";
import { merchantDomain } from "./domains/merchant.js";
import { onboardingDomain } from "./domains/onboarding.js";
import { payDomain } from "./domains/pay.js";
import { protocolDomain } from "./domains/protocol.js";
import { recoveryDomain } from "./domains/recovery.js";
import { worldDomain } from "./domains/world.js";

/**
 * One entry point, one switch:
 *
 *   const mra = createMRA({ mode: "mock" });                     // apps/web mock data, no network
 *   const mra = createMRA({ mode: "local" });                    // anvil + agents API :8000 + issuer :8787
 *   const mra = createMRA({ mode: "sepolia", apiUrl, issuerUrl, rpc: { anonRpc: true, anonWorker } });
 *
 * Screens call domain methods and render the returned view-models. Nothing else changes between modes.
 */
export function createMRA(config: MRAConfig) {
  const ctx = createContext(resolveConfig(config));
  return {
    mode: ctx.mode,
    onboarding: onboardingDomain(ctx),
    agent: agentDomain(ctx),
    merchant: merchantDomain(ctx),
    pay: payDomain(ctx),
    lender: lenderDomain(ctx),
    protocol: protocolDomain(ctx),
    world: worldDomain(ctx),
    recovery: recoveryDomain(ctx),
    /** mode, chainId, and whether chain reads go through Anon-RPC: for a network badge. */
    network: () => ctx.network(),
    /** Escape hatches for advanced flows (relay draws, raw insights). Not needed by screens. */
    raw: {
      api: () => ctx.api(),
      issuer: () => ctx.issuer(),
      chain: () => ctx.chain(),
      vault: ctx.vault,
      prover: ctx.prover,
    },
  };
}

export type MRA = ReturnType<typeof createMRA>;
