/**
 * Reclaim (zkTLS), World Agent Pass and World IDKit adapters. Each has a mock and a real stub. The real stubs
 * take the vendor SDK (or a callback) by injection, so @repo/sdk never depends on vendor packages.
 */
import type { Hex } from "viem";
import type { IssuerApi } from "../api/clients.js";
import type { Http } from "../http.js";
import type { AgentPassRequest } from "../api/types.js";
import { MRAError } from "../errors.js";

/* ================================================================ Reclaim */

export type Band = 1 | 2 | 3;
/** A Reclaim proof object, sent to the issuer untouched. Treat as opaque and NEVER send it onchain or log it. */
export type ReclaimProof = unknown;
/** What the real adapter hands to `issuer.issue({ proof })`: a reference to the proof the ISSUER holds. */
export type ReclaimSessionRef = { reclaimSession: string; statusToken: string };
export type ReclaimStatus = "waiting" | "proof_received" | "failed";

export type ReclaimStartRequest = {
  band: Band;
  commitment: Hex;
  /** Demo only (mock / issuer-mock): which seeded demo-portal account logs in. Ignored by the real adapter. */
  account?: string;
};

export interface ReclaimAdapter {
  readonly kind: "mock" | "issuer-mock" | "reclaim-js-sdk" | (string & {});
  /** Start a session bound to the Business Pass commitment (Reclaim `setContext(addr, commitmentHex)`). */
  start(req: ReclaimStartRequest): Promise<{ requestUrl: string; sessionId: string }>;
  /** Resolves with the proof once the merchant finished the portal login on their phone. */
  wait(sessionId: string, opts?: { signal?: AbortSignal; onStatus?: (s: ReclaimStatus) => void }): Promise<ReclaimProof>;
}

/** Mock mode: no network. The "proof" is a marker object the mock issuer path understands. */
export function mockReclaim(opts: { account?: string; delayMs?: number } = {}): ReclaimAdapter {
  const sessions = new Map<string, ReclaimStartRequest>();
  return {
    kind: "mock",
    async start(req) {
      const sessionId = `mock-${sessions.size + 1}`;
      sessions.set(sessionId, req);
      return { requestUrl: `https://share.reclaimprotocol.org/verify/?mock=${sessionId}`, sessionId };
    },
    async wait(sessionId, o) {
      o?.onStatus?.("waiting");
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const s = sessions.get(sessionId);
      if (!s) throw new MRAError("not_found", "unknown Reclaim session");
      o?.onStatus?.("proof_received");
      return { mock: true, ...s, account: s.account ?? opts.account ?? "donpepe" };
    },
  };
}

/**
 * Local demo path: the issuer runs with ISSUER_MOCK=1 and mints a stand-in proof for a seeded demo-portal
 * account (`donpepe` passes; `newshop` fails age_ok → M05 too-new; `suspended` fails active → M05 suspended).
 * Everything after the proof (issuer signature, registry.issue) is real.
 */
export function issuerMockReclaim(issuer: IssuerApi, opts: { account?: string } = {}): ReclaimAdapter {
  const sessions = new Map<string, ReclaimStartRequest>();
  return {
    kind: "issuer-mock",
    async start(req) {
      const sessionId = `issuer-mock-${sessions.size + 1}`;
      sessions.set(sessionId, req);
      return { requestUrl: `${issuer.http.baseUrl}/mock/proof`, sessionId };
    },
    async wait(sessionId, o) {
      const s = sessions.get(sessionId);
      if (!s) throw new MRAError("not_found", "unknown Reclaim session");
      o?.onStatus?.("waiting");
      // No account named: a FRESH donpepe-like business each time (one Business Pass per business onchain, so
      // the fixed demo account would only ever pass once). Named accounts (the M05 failure demos) stay fixed.
      const account = s.account ?? opts.account;
      const { proof } = await issuer.mockProof({ account: account ?? "donpepe", commitment: s.commitment, band: s.band, ...(account ? {} : { fresh: true }) });
      o?.onStatus?.("proof_received");
      return proof;
    },
  };
}


/* ------------------------------------------------- Reclaim, real: issuer-held sessions (recommended) */

export type IssuerReclaimSession = {
  sessionId: string;
  /** Show as a QR / open on the phone. Reclaim portal (remote browser) by default, or the Verifier app with mode "app". */
  requestUrl: string;
  /** Bearer for GET /reclaim/session/:id. Single session, short-lived. Never log it. */
  statusToken: string;
  /** unix seconds */
  expiresAt: number;
  /** "callback": Reclaim POSTs the proof straight to the issuer. "poll": the issuer reads Reclaim's status URL. */
  delivery: "callback" | "poll";
};
export type IssuerReclaimStatus = {
  sessionId: string;
  status: "waiting" | "proof_received" | "failed" | "issued";
  reason?: string;
  expiresAt: number;
  delivery: "callback" | "poll";
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new MRAError("aborted", "aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new MRAError("aborted", "aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Real zkTLS, with RECLAIM_APP_SECRET kept on the issuer (issuer `POST /reclaim/session`, real mode).
 *
 * - `start()` asks the issuer to create the Reclaim request for the band's provider, bound to the Business Pass
 *   leaf (`setContext(registry, commitmentHex)`), and returns its `requestUrl` (QR / deeplink).
 * - `wait()` polls the issuer until the proof has arrived, then resolves with a `ReclaimSessionRef`. The domain passes
 *   that as `proof` to `issuer.issue(...)`, which runs the normal issue flow on the proof it holds. The combined
 *   proof (predicates + account_id) therefore goes ONLY to the issuer: never to this app, never onchain.
 */
export function issuerReclaim(issuer: IssuerApi | { http: Http }, opts: { mode?: "portal" | "app"; pollMs?: number } = {}): ReclaimAdapter {
  const sessions = new Map<string, IssuerReclaimSession>();
  const http = issuer.http;
  return {
    kind: "issuer-reclaim",
    async start({ band, commitment }) {
      const s = await http.request<IssuerReclaimSession>("POST", "/reclaim/session", {
        body: { commitment: commitment.toLowerCase(), band, ...(opts.mode ? { mode: opts.mode } : {}) },
      });
      sessions.set(s.sessionId, s);
      return { requestUrl: s.requestUrl, sessionId: s.sessionId };
    },
    async wait(sessionId, o) {
      const s = sessions.get(sessionId);
      if (!s) throw new MRAError("not_found", "unknown Reclaim session");
      o?.onStatus?.("waiting");
      for (;;) {
        const st = await http.request<IssuerReclaimStatus>("GET", `/reclaim/session/${encodeURIComponent(sessionId)}`, {
          token: s.statusToken,
          ...(o?.signal ? { signal: o.signal } : {}),
        });
        if (st.status === "proof_received" || st.status === "issued") {
          o?.onStatus?.("proof_received");
          sessions.delete(sessionId);
          return { reclaimSession: sessionId, statusToken: s.statusToken } satisfies ReclaimSessionRef;
        }
        if (st.status === "failed") {
          o?.onStatus?.("failed");
          sessions.delete(sessionId);
          // reason is a stable issuer code: cancelled | proof_generation_failed | context_mismatch | bad_proof ...
          throw new MRAError(st.reason ?? "proof_not_verified", "Reclaim session failed");
        }
        await sleep(opts.pollMs ?? 2000, o?.signal);
      }
    },
  };
}

/** The subset of `@reclaimprotocol/js-sdk`'s ReclaimProofRequest the adapter uses. */
export type ReclaimProofRequestLike = {
  setContext(address: string, message: string): void;
  getRequestUrl(): Promise<string>;
  startSession(handlers: { onSuccess: (proofs: unknown) => void; onError: (e: unknown) => void }): Promise<void>;
};

/**
 * Alternative (browser SDK) path. Prefer `issuerReclaim`: here the proof, including the issuer-only account_id,
 * passes through the browser before it reaches the issuer. Real zkTLS via `@reclaimprotocol/js-sdk`. `createRequest(band)` must return an initialised request for the
 * band's provider (`RECLAIM_PROVIDER_ID_BAND{n}`, issuerProviderConfig in demo-portal/lib/reclaim.ts).
 * Keep RECLAIM_APP_SECRET off the client: init it in a server route and hand back
 * `ReclaimProofRequest.fromJsonString(json)`.
 */
export function reclaimJsSdk(opts: { createRequest: (band: Band) => Promise<ReclaimProofRequestLike> }): ReclaimAdapter {
  const sessions = new Map<string, Promise<unknown>>();
  let n = 0;
  return {
    kind: "reclaim-js-sdk",
    async start({ band, commitment }) {
      const req = await opts.createRequest(band);
      // The issuer compares contextMessage to the commitment, exactly 0x + 64 lowercase hex.
      req.setContext("0x0000000000000000000000000000000000000000", commitment.toLowerCase());
      const requestUrl = await req.getRequestUrl();
      const sessionId = `reclaim-${++n}`;
      sessions.set(
        sessionId,
        new Promise((resolve, reject) => {
          void req.startSession({
            onSuccess: (proofs) => resolve(Array.isArray(proofs) ? proofs[0] : proofs),
            onError: () => reject(new MRAError("proof_not_verified", "Reclaim session failed")),
          });
        }),
      );
      return { requestUrl, sessionId };
    },
    async wait(sessionId, o) {
      const p = sessions.get(sessionId);
      if (!p) throw new MRAError("not_found", "unknown Reclaim session");
      o?.onStatus?.("waiting");
      try {
        const proof = await p;
        o?.onStatus?.("proof_received");
        return proof;
      } catch (e) {
        o?.onStatus?.("failed");
        throw e;
      }
    },
  };
}

/* =========================================================== World Agent Pass */

export type AgentPassOutcome = "approve" | "deny" | "expire";

export interface AgentPassAdapter {
  readonly kind: "mock" | "world-oidc" | (string & {});
  /**
   * Get the human's approval for this agent + limits. `nonce` is CreateAgentResponse.agent_pass_nonce and MUST be
   * sent to World as the OIDC nonce: it binds the approval to exactly this agent key and these limits.
   * Returns the body for POST /agents/{id}/agent-pass.
   */
  authorize(req: { agentId: string; nonce: string }): Promise<AgentPassRequest>;
}

/** Works against the backend's WORLD_MOCK=1 (the default), and in mock mode. */
export function mockAgentPass(outcome: AgentPassOutcome | (() => AgentPassOutcome) = "approve"): AgentPassAdapter {
  return {
    kind: "mock",
    async authorize() {
      return { mock: typeof outcome === "function" ? outcome() : outcome };
    },
  };
}

/**
 * Real World Agent Pass (OIDC). `authorize(nonce)` runs the World sign-in with that nonce (authorization code +
 * PKCE, or implicit id_token) and returns what the backend verifies. Backend needs WORLD_MOCK=0 + World app config.
 */
export function worldOidcAgentPass(opts: {
  /** Run World sign-in (https://auth.world.org, response_type=code, scope=openid, PKCE S256, nonce = `nonce`) and
   *  return the backend body; use `agentPassBodyFromRedirect` on the redirect query (it maps ?error= to a denial). */
  authorize: (nonce: string) => Promise<AgentPassRealRequest>;
}): AgentPassAdapter {
  return { kind: "world-oidc", authorize: async ({ nonce }) => (await opts.authorize(nonce)) as unknown as AgentPassRequest };
}


/** Body for POST /agents/{id}/agent-pass in the real modes (superset of the API's AgentPassRequest). */
export type AgentPassRealRequest =
  | { code: string; code_verifier: string; redirect_uri: string }
  | { id_token: string }
  /** World redirected back with ?error=... (the human declined): the backend records "denied", no mandate. */
  | { error: string }
  /** Device flow: the backend polls World itself and records approved / denied / expired. */
  | { device_session: string };

/**
 * Helper for the redirect flow: turn World's redirect query into the backend body. On `?error=access_denied`
 * it returns `{ error }`, so the DENIED path is recorded server-side too (no attestation, no mandate).
 * `codeVerifier` is the PKCE verifier you generated before redirecting (S256).
 */
export function agentPassBodyFromRedirect(query: URLSearchParams | string, codeVerifier: string, redirectUri: string): AgentPassRealRequest {
  const q = typeof query === "string" ? new URLSearchParams(query.startsWith("?") ? query.slice(1) : query) : query;
  const err = q.get("error");
  if (err) return { error: /^[a-z_]{1,64}$/.test(err) ? err : "access_denied" };
  const code = q.get("code");
  if (!code) return { error: "access_denied" };
  return { code, code_verifier: codeVerifier, redirect_uri: redirectUri };
}

export type DevicePrompt = {
  verificationUri: string;
  /** World's QR-ready URL; falls back to verificationUri when the provider omits it. */
  verificationUriComplete: string;
  userCode: string | null;
  expiresIn: number;
  interval: number;
  /** Unix seconds, retained for callers that render a clock deadline. */
  expiresAt: number;
};

/**
 * Real World Agent Pass via the OIDC device flow (auth.world.org advertises it). Nothing to register but the client;
 * no redirect handling in the app. The backend starts the flow, keeps the device_code, polls World and validates the
 * id_token server-side. The app only shows `verificationUri` (QR / link) and waits.
 *
 * Needs the agent's manage token: pass `manageToken` (the agent domain passes `req.manageToken` when it has it).
 */
export function worldDeviceAgentPass(opts: {
  api: { http: Http };
  show: (p: DevicePrompt) => void;
  manageToken?: (agentId: string) => string | Promise<string>;
  pollMs?: number;
  signal?: AbortSignal;
}): AgentPassAdapter {
  return {
    kind: "world-device",
    async authorize(req) {
      const r = req as { agentId: string; nonce: string; manageToken?: string };
      const token = r.manageToken ?? (await opts.manageToken?.(r.agentId));
      if (!token) throw new MRAError("adapter_not_configured", "worldDeviceAgentPass needs the agent manage token");
      const path = `/agents/${encodeURIComponent(r.agentId)}/agent-pass/device`;
      const d = await opts.api.http.request<{ device_session: string; verification_uri: string; verification_uri_complete?: string; user_code: string | null; expires_in?: number; expires_at: number; interval: number }>(
        "POST", path, { token },
      );
      opts.show({
        verificationUri: d.verification_uri,
        verificationUriComplete: d.verification_uri_complete ?? d.verification_uri,
        userCode: d.user_code,
        expiresIn: d.expires_in ?? Math.max(0, d.expires_at - Math.floor(Date.now() / 1000)),
        interval: d.interval,
        expiresAt: d.expires_at,
      });
      for (;;) {
        await sleep(Math.max(opts.pollMs ?? 0, d.interval * 1000), opts.signal);
        const st = await opts.api.http.request<{ status: "pending" | "ready" }>("GET", `${path}/${encodeURIComponent(d.device_session)}`, {
          token,
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
        // "ready" covers approved, denied and expired: the POST that follows records the outcome.
        if (st.status === "ready") return { device_session: d.device_session } as unknown as AgentPassRequest;
      }
    },
  };
}

/* ================================================================== IDKit */

export interface IdkitAdapter {
  readonly kind: "mock" | "idkit" | (string & {});
  /** Proof of Human for the recovery action. Returns the IDKit result to forward to POST /recovery/verify. */
  verify(): Promise<Record<string, unknown>>;
}

/** WORLD_MOCK=1 payload: the same `human` label always yields the same World nullifier (same human). */
export function mockIdkit(opts: { human?: string; outcome?: "approve" | "deny" } = {}): IdkitAdapter {
  return {
    kind: "mock",
    async verify() {
      return { mock: opts.outcome ?? "approve", mock_human: opts.human ?? "demo-merchant" };
    },
  };
}

/**
 * Real IDKit: open the widget (`@worldcoin/idkit`, action = the backend's WORLD_RECOVERY_ACTION, Proof of Human)
 * and resolve with its `onSuccess` result. The backend forwards it unchanged to World's verify endpoint.
 */
export function idkit(opts: { request: () => Promise<Record<string, unknown>> }): IdkitAdapter {
  return { kind: "idkit", verify: opts.request };
}

/** POST /recovery/rp-context: what IDKit 4 needs. `rp_context` is signed by the backend's WORLD_RP_SIGNING_KEY. */
export type IdkitRequestConfig = {
  app_id: string;
  action: string;
  environment: "production" | "staging" | "sandbox" | (string & {});
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
};

/**
 * Real World ID 4.0 (IDKit 4.x). Fetches a fresh backend-signed `rp_context` (single-use nonce, 5 min), then `run`s
 * IDKit with it and returns the result unchanged for POST /recovery/verify. @repo/sdk never imports IDKit; e.g.:
 *
 *   idkitV4({ api, run: async (c) => {
 *     const req = await IDKit.request({ app_id: c.app_id, action: c.action, rp_context: c.rp_context,
 *                                       environment: c.environment, allow_legacy_proofs: false })
 *                             .preset(proofOfHuman({}));
 *     showQr(req.connectorURI);
 *     const r = await req.pollUntilCompletion({ timeout: 120_000 });
 *     if (!r.success) throw new Error(r.error);
 *     return r.result;
 *   }})
 */
export function idkitV4(opts: { api: { http: Http }; run: (cfg: IdkitRequestConfig) => Promise<Record<string, unknown>> }): IdkitAdapter {
  return {
    kind: "idkit",
    async verify() {
      const cfg = await opts.api.http.request<IdkitRequestConfig | { mock: true }>("POST", "/recovery/rp-context");
      if ("mock" in cfg) throw new MRAError("not_supported", "backend runs WORLD_MOCK=1: use mockIdkit()");
      return opts.run(cfg);
    },
  };
}
