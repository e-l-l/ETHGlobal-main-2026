import { createHttp, type FetchFn, type Http } from "../http.js";
import type {
  ActivateRequest,
  Address,
  FaucetResponse,
  AgentPassRequest,
  AgentPassResponse,
  AgentStatusResponse,
  BackupResponse,
  BindHumanResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  Decision,
  DrawFirstRequest,
  DrawWithPassRequest,
  HealthResponse,
  HumanStatusResponse,
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
  RpContextResponse,
  TriggerResponse,
  TxResponse,
} from "./types.js";

const AGENT_ID = /^[0-9a-f]{32}$/;
const SHOP_ID = /^0x[0-9a-fA-F]{64}$/;
function shopPath(shopId: string, suffix = "") {
  if (!SHOP_ID.test(shopId)) throw new TypeError("invalid shop id");
  return `/shops/${shopId.toLowerCase()}${suffix}`;
}
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

  // ---- api.py: testnet demo faucet (DEMO_FAUCET=1, Sepolia / anvil only; 404 otherwise)
  /** POST /demo/faucet: gas ETH for ~10 txs + test USDC to a burner address. 409 already_funded, 429 limits. */
  demoFaucet(address: Address) {
    return this.http.request<FaucetResponse>("POST", "/demo/faucet", { body: { address } });
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
  recoveryRpContext() {
    return this.http.request<RpContextResponse>("POST", "/recovery/rp-context");
  }

  // ---- World ID for borrowers: one proven human per shop; defaulters are banned on all their shops.
  /** POST /world/borrower/rp-context: IDKit 4 config for the borrower action (`{ mock: true }` under WORLD_MOCK=1). */
  worldBorrowerRpContext() {
    return this.http.request<RpContextResponse>("POST", "/world/borrower/rp-context");
  }
  /**
   * POST /shops/{shopId}/human: bind the IDKit proof of human to the shop. `ownerAuth` = the full Authorization value
   * from `ownerAuthHeader` (`Owner <issuedAt>:<sig>`). 400 verification_failed | wrong_action | unknown_or_used_nonce |
   * invalid_request, 401 unauthorized, 404 not_found, 409 shop_bound_to_other_human, 429 rate_limited.
   */
  bindHuman(shopId: Hex32, ownerAuth: string, idkit: Record<string, unknown>) {
    return this.http.request<BindHumanResponse>("POST", shopPath(shopId, "/human"), { body: { idkit }, authorization: ownerAuth });
  }
  /** GET /shops/{shopId}/human: `{ verified }`; with owner auth also `banned` and the gradual-unlock status for `tier`. */
  humanStatus(shopId: Hex32, ownerAuth?: string, tier?: 0 | 1 | 2 | 3 | number) {
    return this.http.request<HumanStatusResponse>("GET", shopPath(shopId, "/human"), {
      ...(ownerAuth ? { authorization: ownerAuth } : {}),
      ...(tier !== undefined ? { query: { tier } } : {}),
    });
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
