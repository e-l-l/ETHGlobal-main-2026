// Real Reclaim sessions, created server-side so RECLAIM_APP_SECRET never reaches a browser.
//
//   app ──POST /reclaim/session {commitment, band}──► issuer
//        issuer: ReclaimProofRequest.init(APP_ID, APP_SECRET, providerId[band])
//                .setContext(contextAddress, commitmentHex)        ← the proof is bound to the Business Pass leaf
//                .setAppCallbackUrl(ISSUER_PUBLIC_URL/reclaim/callback/<sid>/<secret>, json)   (if configured)
//   app ◄── {sessionId, requestUrl (QR / deeplink), statusToken, expiresAt, delivery}
//   phone: merchant logs into the portal inside Reclaim's flow → attestors sign → proof
//        delivery "callback": Reclaim POSTs the proof straight to this issuer. It is never stored at Reclaim
//                             and never passes through the app.
//        delivery "poll":     the issuer reads Reclaim's status URL itself (server-side) when the app polls.
//   app ──GET /reclaim/session/<sid> (Bearer statusToken)──► {status: waiting | proof_received | failed | issued}
//   app ──POST /issue {proof: {reclaimSession, statusToken}, commitment, band, h, country}──► the normal issue flow,
//        run on the proof the issuer holds. The proof (and its account_id) never leaves the issuer.
//
// State is in memory, single instance (same as the replay cache). Proofs are dropped as soon as they are issued
// or their session expires.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Band, Config } from "./config.js";
import { IssueError } from "./predicates.js";
import { assertProofShape, type ReclaimProof } from "./reclaim.js";

export type SessionStatus = "waiting" | "proof_received" | "failed" | "issued";
export type Delivery = "callback" | "poll";

/** The subset of `ReclaimProofRequest` (js-sdk 5.8.x) we use. */
export interface ReclaimRequestLike {
  setContext(address: string, message: string): void;
  setAppCallbackUrl(url: string, jsonProofResponse?: boolean): void;
  setCancelCallbackUrl(url: string): void;
  getRequestUrl(opts?: { verificationMode?: "portal" | "app" }): Promise<string>;
  getSessionId(): string;
  getProviderVersion?(): { providerId: string; providerVersion: string };
}

/** Reclaim's backend, injectable for offline tests. */
export interface ReclaimBackend {
  createRequest(appId: string, appSecret: string, providerId: string, opts: { providerVersion?: string }): Promise<ReclaimRequestLike>;
  /** `fetchStatusUrl(sessionId).session`: `statusV2` + `proofs` (default-callback sessions only). */
  fetchStatus(sessionId: string): Promise<{ statusV2?: string; proofs?: unknown[] } | null | undefined>;
}

export const sdkBackend: ReclaimBackend = {
  async createRequest(appId, appSecret, providerId, opts) {
    const { ReclaimProofRequest } = await import("@reclaimprotocol/js-sdk");
    return ReclaimProofRequest.init(appId, appSecret, providerId, opts.providerVersion ? { providerVersion: opts.providerVersion } : {}) as unknown as ReclaimRequestLike;
  },
  async fetchStatus(sessionId) {
    const { fetchStatusUrl } = await import("@reclaimprotocol/js-sdk");
    return (await fetchStatusUrl(sessionId)).session as { statusV2?: string; proofs?: unknown[] } | undefined;
  },
};

interface Session {
  id: string;
  band: Band;
  commitmentHex: string;
  providerId: string;
  providerVersion?: string;
  tokenHash: Buffer;
  callbackSecret: string;
  delivery: Delivery;
  expiresAt: number; // ms
  status: SessionStatus;
  reason?: string;
  proof?: ReclaimProof;
  lastPoll: number;
}

export interface SessionView {
  sessionId: string;
  status: SessionStatus;
  reason?: string;
  expiresAt: number; // unix seconds
  delivery: Delivery;
}

/** Reclaim statusV2 values after which no proof will come. */
const TERMINAL_FAILURES = new Set(["PROOF_GENERATION_FAILED", "PROOF_SUBMISSION_FAILED", "ERROR_SUBMITTED", "ERROR_SUBMISSION_FAILED", "SESSION_CANCELLED"]);
const POLL_MIN_INTERVAL_MS = 2000;
const SID = /^[A-Za-z0-9_-]{4,128}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (a: string, b: string) => {
  const x = sha256(a), y = sha256(b);
  return timingSafeEqual(x, y);
};

/** Parse a Reclaim callback body: JSON (jsonProofResponse=true), or the default urlencoded JSON string. */
export function parseCallbackBody(body: unknown): unknown {
  if (body && typeof body === "object") return body;
  if (typeof body !== "string" || !body.length) throw new IssueError("bad_proof", 400);
  const tries = [body, () => decodeURIComponent(body.replace(/\+/g, "%20")), () => decodeURIComponent(body.replace(/\+/g, "%20")).replace(/=$/, "")];
  for (const t of tries) {
    try {
      return JSON.parse(typeof t === "string" ? t : t());
    } catch {
      /* next */
    }
  }
  throw new IssueError("bad_proof", 400);
}

export class ReclaimSessions {
  #s = new Map<string, Session>();
  constructor(
    private cfg: Config,
    private backend: ReclaimBackend = sdkBackend,
    private now: () => number = Date.now,
    private maxEntries = 10_000,
  ) {}

  get configured(): boolean {
    return !this.cfg.mock && !!this.cfg.reclaim.appId && !!this.cfg.reclaim.appSecret;
  }

  get delivery(): Delivery {
    return this.cfg.publicUrl ? "callback" : "poll";
  }

  sweep(t = this.now()) {
    for (const [k, s] of this.#s) if (s.expiresAt <= t) this.#s.delete(k);
  }

  get size() {
    return this.#s.size;
  }

  async create(commitmentHex: string, band: Band, mode?: "portal" | "app") {
    if (!this.configured) throw new IssueError("reclaim_not_configured", 503);
    const pin = this.cfg.reclaim.pins[band];
    if (!pin.providerId) throw new IssueError("reclaim_not_configured", 503);
    this.sweep();
    if (this.#s.size >= this.maxEntries) throw new IssueError("rate_limited", 429);

    let req: ReclaimRequestLike;
    let requestUrl: string;
    let sid: string;
    const callbackSecret = randomBytes(24).toString("hex");
    try {
      req = await this.backend.createRequest(this.cfg.reclaim.appId!, this.cfg.reclaim.appSecret!, pin.providerId, { providerVersion: pin.providerVersion });
      req.setContext(this.cfg.reclaim.contextAddress, commitmentHex);
      sid = req.getSessionId();
      if (typeof sid !== "string" || !SID.test(sid)) throw new Error("bad session id");
      if (this.cfg.publicUrl) {
        // Secret in the PATH (Reclaim may append its own query params to the callback URL).
        req.setAppCallbackUrl(`${this.cfg.publicUrl}/reclaim/callback/${sid}/${callbackSecret}`, true);
        req.setCancelCallbackUrl(`${this.cfg.publicUrl}/reclaim/cancel/${sid}/${callbackSecret}`);
      }
      requestUrl = await req.getRequestUrl({ verificationMode: mode ?? this.cfg.reclaim.verificationMode });
      if (typeof requestUrl !== "string" || !/^https:\/\//.test(requestUrl)) throw new Error("bad request url");
    } catch {
      // Never surface SDK errors: they can quote config. The app shows a generic retry.
      throw new IssueError("reclaim_upstream", 502);
    }
    let providerVersion: string | undefined;
    try {
      const pv = req.getProviderVersion?.();
      if (pv && pv.providerId === pin.providerId && pv.providerVersion) providerVersion = pv.providerVersion;
    } catch {
      /* the env pin (or latest) is used */
    }

    const statusToken = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.cfg.reclaim.sessionTtlSec * 1000;
    this.#s.set(sid, {
      id: sid, band, commitmentHex, providerId: pin.providerId, providerVersion,
      tokenHash: sha256(statusToken), callbackSecret, delivery: this.delivery,
      expiresAt, status: "waiting", lastPoll: 0,
    });
    return { sessionId: sid, requestUrl, statusToken, expiresAt: Math.floor(expiresAt / 1000), delivery: this.delivery };
  }

  #get(id: unknown): Session {
    if (typeof id !== "string" || !SID.test(id)) throw new IssueError("session_not_found", 404);
    const s = this.#s.get(id);
    if (!s || s.expiresAt <= this.now()) {
      if (s) this.#s.delete(id);
      throw new IssueError("session_not_found", 404);
    }
    return s;
  }

  #auth(id: unknown, token: unknown): Session {
    const s = this.#get(id);
    if (typeof token !== "string" || !token || !timingSafeEqual(sha256(token), s.tokenHash)) throw new IssueError("unauthorized", 401);
    return s;
  }

  #fail(s: Session, reason: string) {
    s.status = "failed";
    s.reason = reason;
    delete s.proof;
  }

  /** Accept a proof for a session: single proof, valid shape, bound to this session's commitment. */
  #accept(s: Session, raw: unknown) {
    if (s.status !== "waiting") throw new IssueError("session_not_waiting", 409);
    let p = raw;
    if (p && typeof p === "object" && !Array.isArray(p) && Array.isArray((p as { proofs?: unknown }).proofs)) p = (p as { proofs: unknown[] }).proofs;
    if (Array.isArray(p)) {
      if (p.length !== 1) {
        this.#fail(s, "bad_proof");
        throw new IssueError("bad_proof", 400);
      }
      p = p[0];
    }
    try {
      assertProofShape(p);
      const ctx = JSON.parse(p.claimData.context) as { contextMessage?: unknown; reclaimSessionId?: unknown };
      if (ctx.contextMessage !== s.commitmentHex) throw new IssueError("context_mismatch");
      if (ctx.reclaimSessionId !== undefined && ctx.reclaimSessionId !== s.id) throw new IssueError("context_mismatch");
    } catch (e) {
      const code = e instanceof IssueError ? e.code : "bad_context";
      this.#fail(s, code);
      throw e instanceof IssueError ? e : new IssueError("bad_context");
    }
    s.proof = p;
    s.status = "proof_received";
    if (this.cfg.reclaim.captureDir) {
      // DEBUG ONLY (RECLAIM_CAPTURE_FIXTURE_DIR): the proof contains account_id. Use with demo accounts only.
      mkdirSync(this.cfg.reclaim.captureDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(this.cfg.reclaim.captureDir, `reclaim-proof.${s.id}.json`), JSON.stringify(p, null, 2), { mode: 0o600 });
    }
  }

  /** POST /reclaim/callback/:sid/:secret, called by Reclaim. */
  callback(id: unknown, secret: unknown, body: unknown) {
    const s = this.#get(id);
    if (typeof secret !== "string" || !sameSecret(secret, s.callbackSecret)) throw new IssueError("unauthorized", 401);
    this.#accept(s, parseCallbackBody(body));
  }

  /** POST /reclaim/cancel/:sid/:secret, called by Reclaim when the user or provider aborts. */
  cancel(id: unknown, secret: unknown) {
    const s = this.#get(id);
    if (typeof secret !== "string" || !sameSecret(secret, s.callbackSecret)) throw new IssueError("unauthorized", 401);
    if (s.status === "waiting") this.#fail(s, "cancelled");
  }

  /** GET /reclaim/session/:sid. In poll mode, reads Reclaim's status URL (throttled) while waiting. */
  async status(id: unknown, token: unknown): Promise<SessionView> {
    const s = this.#auth(id, token);
    if (s.status === "waiting" && s.delivery === "poll" && this.now() - s.lastPoll >= POLL_MIN_INTERVAL_MS) {
      s.lastPoll = this.now();
      let st: { statusV2?: string; proofs?: unknown[] } | null | undefined;
      try {
        st = await this.backend.fetchStatus(s.id);
      } catch {
        st = undefined; // transient: keep waiting
      }
      if (st?.proofs && st.proofs.length > 0) {
        try {
          this.#accept(s, st.proofs);
        } catch {
          /* recorded as failed */
        }
      } else if (st?.statusV2 && TERMINAL_FAILURES.has(st.statusV2)) {
        this.#fail(s, st.statusV2 === "SESSION_CANCELLED" ? "cancelled" : "proof_generation_failed");
      }
    }
    return { sessionId: s.id, status: s.status, ...(s.reason ? { reason: s.reason } : {}), expiresAt: Math.floor(s.expiresAt / 1000), delivery: s.delivery };
  }

  /** For /issue: the held proof of a session in proof_received, checked against the request's band + commitment. */
  take(ref: { reclaimSession?: unknown; statusToken?: unknown }, band: Band, commitmentHex: string) {
    const s = this.#auth(ref.reclaimSession, ref.statusToken);
    if (s.status === "issued") throw new IssueError("proof_replayed", 409);
    if (s.status !== "proof_received" || !s.proof) throw new IssueError(s.status === "failed" ? (s.reason ?? "proof_not_verified") : "proof_pending", s.status === "failed" ? 422 : 409);
    if (s.band !== band) throw new IssueError("bad_band", 400);
    if (s.commitmentHex !== commitmentHex) throw new IssueError("context_mismatch");
    return {
      proof: s.proof,
      pin: { providerId: s.providerId, ...(s.providerVersion ? { providerVersion: s.providerVersion } : {}) },
      done: () => {
        s.status = "issued";
        delete s.proof;
      },
    };
  }
}

export const isSessionRef = (p: unknown): p is { reclaimSession: string; statusToken: string } =>
  !!p && typeof p === "object" && "reclaimSession" in (p as object);
