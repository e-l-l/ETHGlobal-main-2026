import { createHttp, type FetchFn, type Http } from "../http.js";
import type {
  ActivateRequest,
  AgentPassRequest,
  AgentPassResponse,
  AgentStatusResponse,
  BackupResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  Decision,
  DrawFirstRequest,
  DrawWithPassRequest,
  HealthResponse,
  Hex32,
  InsightsResponse,
  IssueRequest,
  IssueResponse,
  IssuerHealth,
  IssuerInfo,
  MockProofRequest,
  OfferRequest,
  RecoveryVerifyResponse,
  RegisterMandateRequest,
  RiskStatus,
  TriggerResponse,
  TxResponse,
} from "./types.js";

const AGENT_ID = /^[0-9a-f]{32}$/;
function agentPath(agentId: string, suffix = "") {
  // Validate before it reaches a URL: the backend's own pattern.
  if (!AGENT_ID.test(agentId)) throw new TypeError("invalid agent id");
  return `/agents/${agentId}${suffix}`;
}

/** Typed client for the agents FastAPI service (agents/src/mra_agents/api.py + agents_api.py). */
export class AgentsApi {
  readonly http: Http;
  constructor(opts: { baseUrl: string; fetch?: FetchFn; timeoutMs?: number }) {
    this.http = createHttp({ ...opts, service: "agents-api" });
  }

  // ---- api.py
  health() {
    return this.http.request<HealthResponse>("GET", "/health");
  }
  /** POST /offers: underwrite → Decision (with a signed offer when result = "offered"). */
  requestOffer(body: OfferRequest) {
    return this.http.request<Decision>("POST", "/offers", { body });
  }
  decision(id: string) {
    return this.http.request<Decision>("GET", `/decisions/${encodeURIComponent(id)}`);
  }
  insights(shopId: Hex32) {
    return this.http.request<InsightsResponse>("GET", `/shops/${shopId}/insights`);
  }
  riskStatus() {
    return this.http.request<RiskStatus>("GET", "/risk/status");
  }
  relayDrawFirst(body: DrawFirstRequest) {
    return this.http.request<TxResponse>("POST", "/relay/draw-first", { body });
  }
  relayDrawWithPass(body: DrawWithPassRequest) {
    return this.http.request<TxResponse>("POST", "/relay/draw-with-pass", { body });
  }
  relayRegisterMandate(body: RegisterMandateRequest) {
    return this.http.request<TxResponse>("POST", "/relay/register-mandate", { body });
  }
  relayClaim(advanceId: bigint | number) {
    return this.http.request<TxResponse>("POST", `/relay/claim/${BigInt(advanceId).toString()}`);
  }

  // ---- agents_api.py: managed agents. `token` = manage_token from createAgent.
  createAgent(body: CreateAgentRequest) {
    return this.http.request<CreateAgentResponse>("POST", "/agents", { body });
  }
  agentPass(agentId: string, token: string, body: AgentPassRequest) {
    return this.http.request<AgentPassResponse>("POST", agentPath(agentId, "/agent-pass"), { body, token });
  }
  activateAgent(agentId: string, token: string, body: ActivateRequest) {
    return this.http.request<AgentStatusResponse>("POST", agentPath(agentId, "/activate"), { body, token });
  }
  getAgent(agentId: string, token: string) {
    return this.http.request<AgentStatusResponse>("GET", agentPath(agentId), { token });
  }
  triggerAgent(agentId: string, token: string, runNow = false) {
    return this.http.request<TriggerResponse>("POST", agentPath(agentId, "/trigger"), { body: { run_now: runNow }, token });
  }
  revokeAgent(agentId: string, token: string) {
    return this.http.request<AgentStatusResponse>("POST", agentPath(agentId, "/revoke"), { token });
  }

  // ---- agents_api.py: World IDKit recovery
  recoveryVerify(idkit: Record<string, unknown>) {
    return this.http.request<RecoveryVerifyResponse>("POST", "/recovery/verify", { body: { idkit } });
  }
  putBackup(recoveryToken: string, ciphertextB64: string) {
    return this.http.request<void>("PUT", "/recovery/backup", { body: { ciphertext: ciphertextB64 }, token: recoveryToken });
  }
  getBackup(recoveryToken: string) {
    return this.http.request<BackupResponse>("GET", "/recovery/backup", { token: recoveryToken });
  }
}

/** Typed client for the Business Pass issuer (issuer/README.md). */
export class IssuerApi {
  readonly http: Http;
  constructor(opts: { baseUrl: string; fetch?: FetchFn; timeoutMs?: number }) {
    this.http = createHttp({ ...opts, service: "issuer" });
  }
  issue(body: IssueRequest) {
    return this.http.request<IssueResponse>("POST", "/issue", { body });
  }
  info() {
    return this.http.request<IssuerInfo>("GET", "/issuer");
  }
  health() {
    return this.http.request<IssuerHealth>("GET", "/health");
  }
  /** ISSUER_MOCK=1 only: a stand-in Reclaim proof for a seeded demo-portal account (donpepe, nkechi, wanjiru, newshop, suspended). */
  mockProof(body: MockProofRequest) {
    return this.http.request<{ proof: unknown }>("POST", "/mock/proof", { body });
  }
}
