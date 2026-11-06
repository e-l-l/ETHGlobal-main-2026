import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyBaseLogger } from "fastify";
import type { Config } from "./config.js";
import { Attester } from "./eip712.js";
import { issue } from "./issue.js";
import { buildMockProof, MOCK_ACCOUNTS } from "./mock.js";
import { IssueError } from "./predicates.js";
import { MockVerifier, ReclaimVerifier, type ProofVerifier } from "./reclaim.js";
import { ReplayCache } from "./replay.js";
import { ReclaimSessions, sdkBackend, type ReclaimBackend } from "./sessions.js";
import { toHex32 } from "./nullifier.js";
import { parseField } from "./issue.js";
import type { Band } from "./config.js";

/** Paths pino must never print, even if someone adds a log line by mistake. */
export const REDACT_PATHS = [
  "req.body", "body", "proof", "*.proof", "account_id", "*.account_id", "accountId", "*.accountId",
  "extractedParameters", "*.extractedParameters", "req.headers.authorization", "req.headers.cookie",
  // No client IPs in logs.
  "req.remoteAddress", "req.remotePort", "req.headers[\"x-forwarded-for\"]", "req.headers[\"x-real-ip\"]",
];

export interface AppOptions {
  cfg: Config;
  logger?: FastifyBaseLogger;
  verifier?: ProofVerifier;
  /** Reclaim backend for /reclaim/session (tests inject a fake; default is the js-sdk). */
  reclaimBackend?: ReclaimBackend;
  now?: () => number;
}

export async function buildApp({ cfg, logger, verifier, reclaimBackend = sdkBackend, now = Date.now }: AppOptions) {
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
  const sessions = new ReclaimSessions(cfg, reclaimBackend, now);

  // Reclaim's default callback encoding is application/x-www-form-urlencoded (a urlencoded JSON proof).
  // Parse it as a plain string; sessions.parseCallbackBody decodes it.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => done(null, body));

  await app.register(cors, {
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
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

  app.get("/health", async () => ({ ok: true, mode: v.kind, chainId: cfg.chainId, reclaimSessions: sessions.configured ? sessions.delivery : "off" }));

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
    issue(req.body, { cfg, verifier: v, attester, replay, now, log: req.log, sessions }),
  );

  // ---------------------------------------------------------------- real Reclaim sessions (not in mock mode)
  if (!cfg.mock) {
    const bearer = (h: unknown) => (typeof h === "string" && h.startsWith("Bearer ") && h.length < 512 ? h.slice(7).trim() : undefined);

    /** Body {commitment, band, mode?} -> {sessionId, requestUrl, statusToken, expiresAt, delivery}. */
    app.post("/reclaim/session", { config: limit }, async (req) => {
      const b = (req.body ?? {}) as { commitment?: unknown; band?: unknown; mode?: unknown };
      if (b.band !== 1 && b.band !== 2 && b.band !== 3) throw new IssueError("bad_band", 400);
      if (b.mode !== undefined && b.mode !== "portal" && b.mode !== "app") throw new IssueError("bad_body", 400);
      const commitmentHex = toHex32(parseField(b.commitment, "bad_commitment"));
      const out = await sessions.create(commitmentHex, b.band as Band, b.mode as "portal" | "app" | undefined);
      req.log.info({ event: "reclaim_session", band: b.band, delivery: out.delivery }, "reclaim session created");
      return out;
    });

    /** Header `Authorization: Bearer <statusToken>`. Never returns the proof. */
    app.get("/reclaim/session/:id", { config: { rateLimit: { max: cfg.rateLimitMax * 10, timeWindow: cfg.rateLimitWindowMs } } }, async (req) =>
      sessions.status((req.params as { id: string }).id, bearer(req.headers.authorization)),
    );

    /** Called by Reclaim (setAppCallbackUrl). The secret in the path authenticates it. */
    app.post("/reclaim/callback/:id/:secret", { config: limit }, async (req) => {
      const { id, secret } = req.params as { id: string; secret: string };
      sessions.callback(id, secret, req.body);
      req.log.info({ event: "reclaim_proof_received" }, "proof received from reclaim");
      return { ok: true };
    });

    /** Called by Reclaim (setCancelCallbackUrl) when the user or provider aborts. Body ignored. */
    app.post("/reclaim/cancel/:id/:secret", { config: limit }, async (req) => {
      const { id, secret } = req.params as { id: string; secret: string };
      sessions.cancel(id, secret);
      return { ok: true };
    });
  }

  if (cfg.mock) {
    /**
     * MOCK ONLY: a canned proof for a fictional demo account, bound to the caller's commitment.
     * `fresh: true` clones the account with a random account id: a NEW fictional business, so its business
     * nullifier is new and BusinessPassRegistry.issue doesn't revert BusinessAlreadyHasPass on the second demo run.
     */
    app.post("/mock/proof", { config: limit }, async (req) => {
      const b = (req.body ?? {}) as { account?: unknown; commitment?: unknown; band?: unknown; fresh?: unknown };
      const named = typeof b.account === "string" ? MOCK_ACCOUNTS[b.account] : undefined;
      if (!named) throw new IssueError("unknown_mock_account", 400);
      const acct = b.fresh === true ? { ...named, accountId: `acc_${randomBytes(16).toString("hex")}` } : named;
      if (b.band !== 1 && b.band !== 2 && b.band !== 3) throw new IssueError("bad_band", 400);
      const commitmentHex = toHex32(parseField(b.commitment, "bad_commitment"));
      return { proof: buildMockProof({ account: acct, commitmentHex, band: b.band as Band, allowedCountries: cfg.allowedCountries, timestampS: Math.floor(now() / 1000) }) };
    });
  }

  return { app, attester, replay, verifier: v, sessions };
}
