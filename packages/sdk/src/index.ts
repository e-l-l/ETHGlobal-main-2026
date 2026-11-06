/**
 * @repo/sdk: Merchant Revenue Advance integration layer. Framework-agnostic (no React), ESM.
 * See README.md for the screen → method table.
 */
export { createMRA, type MRA } from "./client.js";
export { resolveConfig, DEFAULTS, type MRAConfig, type RpcConfig, type ResolvedConfig } from "./config.js";
export * from "./viewmodels.js";
export * from "./errors.js";
export { SCREENS, type ScreenMap } from "./screens.js";

// API clients + wire types
export { AgentsApi, IssuerApi } from "./api/clients.js";
export type * from "./api/types.js";
export { AGENTS_API_ERROR_CODES, ISSUER_ERROR_CODES } from "./api/types.js";
export { createHttp, toJson, type FetchFn, type Http } from "./http.js";

// Chain
export { createChain, isTransientWriteError, advanceStatusName, type Chain, type ChainOptions, type ProtocolSnapshot, type PositionSnapshot } from "./chain/chain.js";
export { DEPLOYMENTS, deploymentFor, parseDeployment, type Deployment } from "./chain/deployments.js";
export { poolSwapTestAbi, poolIdOf, poolKeyOf, poolSlots, decodeSlot0, decodeBalanceDelta, priceOf, priceLimit, parseSwapReceipt, type PoolKey, type Slot0 } from "./chain/swap.js";
export type { JuniorSwapOptions } from "./domains/lender.js";
export { riskPanelFrom, waterfallFrom, gatherRiskRaw, TWAP_TRIGGER, type RiskRaw } from "./domains/lender-risk.js";
export * as abi from "./abi/index.js";

// Injectable adapters
export { mockProver, workerProver, unconfiguredProver, type Prover, type ProofResult, type CircuitName, type ProverRequest, type ProverResponse, type WorkerLike } from "./adapters/prover.js";
export {
  MemoryVault,
  IndexedDbVault,
  defaultVault,
  encryptRecords,
  decryptRecords,
  type CredentialVault,
  type BusinessPassSecret,
  type StandingPassSecret,
  type BurnerWalletSecret,
  type Session,
  type VaultKey,
} from "./adapters/vault.js";
export { loadOrCreateBurner, type BurnerWallet } from "./adapters/burner.js";
export {
  mockReclaim,
  issuerMockReclaim,
  reclaimJsSdk,
  issuerReclaim,
  mockAgentPass,
  worldOidcAgentPass,
  worldDeviceAgentPass,
  agentPassBodyFromRedirect,
  mockIdkit,
  idkit,
  idkitV4,
  type ReclaimSessionRef,
  type IssuerReclaimSession,
  type IssuerReclaimStatus,
  type AgentPassRealRequest,
  type DevicePrompt,
  type IdkitRequestConfig,
  type ReclaimAdapter,
  type ReclaimProofRequestLike,
  type AgentPassAdapter,
  type IdkitAdapter,
  type Band,
} from "./adapters/world.js";
export { ANON_SPECIFIERS, anonFetchFrom, bootstrapProvider, type AnonRpcWorkerLike } from "./transport/anon.js";

// Helpers
export { formatMoney, formatLocal, formatNumber, formatPercent, formatDays, truncateAddress, capitalize } from "./format.js";
export { splitSale, pseudonymOf } from "./domains/util.js";
export { failReasonFor } from "./domains/onboarding.js";
export * as credentials from "./credentials.js";
