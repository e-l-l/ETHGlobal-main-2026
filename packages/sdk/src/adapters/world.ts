/**
 * Reclaim (zkTLS), World Agent Pass and World IDKit adapters. Each has a mock and a real stub. The real stubs
 * take the vendor SDK (or a callback) by injection, so @repo/sdk never depends on vendor packages.
 */
import type { Hex } from "viem";
import type { IssuerApi } from "../api/clients.js";
import type { AgentPassRequest } from "../api/types.js";
import { MRAError } from "../errors.js";

/* ================================================================ Reclaim */

export type Band = 1 | 2 | 3;
/** A Reclaim proof object, sent to the issuer untouched. Treat as opaque and NEVER send it onchain or log it. */
export type ReclaimProof = unknown;
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
      const { proof } = await issuer.mockProof({ account: s.account ?? opts.account ?? "donpepe", commitment: s.commitment, band: s.band });
      o?.onStatus?.("proof_received");
      return proof;
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
 * Real zkTLS via `@reclaimprotocol/js-sdk`. `createRequest(band)` must return an initialised request for the
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
  authorize: (nonce: string) => Promise<{ code: string; code_verifier: string; redirect_uri: string } | { id_token: string }>;
}): AgentPassAdapter {
  return { kind: "world-oidc", authorize: ({ nonce }) => opts.authorize(nonce) };
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
