import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

// The Reclaim SDK logs through console (at "info" by default, and it logs the raw error on a failed verification,
// which may quote proof content). Our own logs go through pino straight to stdout, so console is muted entirely.
if (process.env.ISSUER_ALLOW_CONSOLE !== "1") {
  const noop = () => {};
  for (const k of ["log", "info", "warn", "error", "debug", "trace"] as const) (console as any)[k] = noop;
}

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  // Config errors name the env var only, never its value.
  process.stderr.write(`config error: ${(e as Error).message}\n`);
  process.exit(1);
}

const { app, attester } = await buildApp({ cfg });
if (cfg.mock) app.log.warn({ chainId: cfg.chainId }, "ISSUER_MOCK=1: Reclaim signatures are NOT verified. Demo only.");
if (!cfg.requireLeafCheck) app.log.warn("ISSUER_REQUIRE_LEAF_CHECK is off: band is checked against the proof but the leaf's attributes are not recomputed unless the client sends h + country");
app.log.info({ issuer: attester.address, registry: cfg.registry, chainId: cfg.chainId }, "issuer ready");
await app.listen({ port: cfg.port, host: cfg.host });
