import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger } from "fastify";
import type { Config } from "./config.js";
import { Attester } from "./eip712.js";
import { issue } from "./issue.js";
import { buildMockProof, MOCK_ACCOUNTS } from "./mock.js";
import { IssueError } from "./predicates.js";
import { MockVerifier, ReclaimVerifier, type ProofVerifier } from "./reclaim.js";
import { ReplayCache } from "./replay.js";
import { toHex32 } from "./nullifier.js";
import { parseField } from "./issue.js";
import type { Band } from "./config.js";

/** Paths pino must never print, even if someone adds a log line by mistake. */
export const REDACT_PATHS = [
  "req.body", "body", "proof", "*.proof", "account_id", "*.account_id", "accountId", "*.accountId",
  "extractedParameters", "*.extractedParameters", "req.headers.authorization", "req.headers.cookie",
];

export interface AppOptions {
  cfg: Config;
  logger?: FastifyBaseLogger;
  verifier?: ProofVerifier;
  now?: () => number;
}

export async function buildApp({ cfg, logger, verifier, now = Date.now }: AppOptions) {
  const app = Fastify({
    ...(logger ? { loggerInstance: logger } : { logger: { level: process.env.LOG_LEVEL ?? "info", redact: { paths: REDACT_PATHS, censor: "[redacted]" } } }),
    bodyLimit: cfg.bodyLimit,
    trustProxy: cfg.trustProxy,
    // Never log request bodies; the default serializers only log method/url/ip.
    disableRequestLogging: false,
  });

  const attester = new Attester(cfg.issuerPrivateKey, {
    name: cfg.eip712Name,
    version: cfg.eip712Version,
    chainId: cfg.chainId,
    verifyingContract: cfg.registry,
    type: cfg.businessVerifiedType,
  });
  const v = verifier ?? (cfg.mock ? new MockVerifier() : new ReclaimVerifier(cfg));
  const replay = new ReplayCache((cfg.proofMaxAgeSec + cfg.clockSkewSec) * 1000, now);

  await app.register(cors, {
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false,
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof IssueError) return reply.code(err.status).send({ error: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: status === 429 ? "rate_limited" : "bad_request" });
    // Unknown error: log only its class name. Messages could quote input.
    app.log.error({ err: { type: (err as Error)?.name ?? "Error" } }, "unhandled");
    return reply.code(500).send({ error: "internal" });
  });

  app.get("/health", async () => ({ ok: true, mode: v.kind, chainId: cfg.chainId }));

  app.get("/issuer", async () => ({
    address: attester.address,
    chainId: cfg.chainId,
    registry: cfg.registry,
    domain: attester.domain,
    types: attester.types,
    primaryType: attester.parsed.primaryType,
    typehash: attester.typehash,
    attestationTtlSec: cfg.attestationTtlSec,
    mock: cfg.mock,
  }));

  const limit = { rateLimit: { max: cfg.rateLimitMax, timeWindow: cfg.rateLimitWindowMs } };

  app.post("/issue", { config: limit }, async (req) =>
    issue(req.body, { cfg, verifier: v, attester, replay, now, log: req.log }),
  );

  if (cfg.mock) {
    /** MOCK ONLY: a canned proof for a fictional demo account, bound to the caller's commitment. */
    app.post("/mock/proof", { config: limit }, async (req) => {
      const b = (req.body ?? {}) as { account?: unknown; commitment?: unknown; band?: unknown };
      const acct = typeof b.account === "string" ? MOCK_ACCOUNTS[b.account] : undefined;
      if (!acct) throw new IssueError("unknown_mock_account", 400);
      if (b.band !== 1 && b.band !== 2 && b.band !== 3) throw new IssueError("bad_band", 400);
      const commitmentHex = toHex32(parseField(b.commitment, "bad_commitment"));
      return { proof: buildMockProof({ account: acct, commitmentHex, band: b.band as Band, allowedCountries: cfg.allowedCountries, timestampS: Math.floor(now() / 1000) }) };
    });
  }

  return { app, attester, replay, verifier: v };
}
