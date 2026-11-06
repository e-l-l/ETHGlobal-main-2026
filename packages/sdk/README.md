# @repo/sdk

The integration layer for Merchant Revenue Advance. It's framework-agnostic: TypeScript, ESM, and no React in the core. Screens depend only on its typed **view-models**, so any frontend (Next, Vite, React Native) can plug in. Switching from mock data to the real backend is **one config value**.

```ts
import { createMRA } from "@repo/sdk";

const mra = createMRA({ mode: "mock" });                       // apps/web mock data, no network
const mra = createMRA({ mode: "local" });                      // anvil :8545 + agents API :8000 + issuer :8787
const mra = createMRA({
  mode: "sepolia",
  apiUrl: "https://api.example",                               // agents FastAPI
  issuerUrl: "https://issuer.example",                         // Business Pass issuer
  rpc: { anonRpc: true, anonWorker },                          // chain reads over Anon-RPC
  wallet,                                                      // viem WalletClient (writes the user signs)
});

const home = await mra.merchant.home();                        // HomeView, the same shape in every mode
```

Every method returns a plain, serialisable view-model with a `source` field (`"mock" | "chain" | "api" | "device"`), so a screen can show a "live" badge. Errors are typed `MRAError`s with a stable `code` (see [Errors](#errors)).

## Install / scripts

```sh
pnpm install                         # from the repo root (Node >= 26.13 per the root engines; >= 22.12 works for vitest)
pnpm --filter @repo/sdk build        # tsc -> dist/
pnpm --filter @repo/sdk check-types  # tsc --noEmit (src + tests)
pnpm --filter @repo/sdk test         # vitest run (no network)
pnpm turbo run build check-types --filter=@repo/sdk
```

- **Dependencies:** `viem` only (TypeScript and vitest are dev dependencies).
- **tsconfig:** extends `../typescript-config/base.json` by relative path, so the package also builds standalone.
- **Turbo:** `turbo.json` has no `test` task yet. To run tests through turbo, add `"test": { "dependsOn": ["^build"] }` to the root `turbo.json`.
- **Other scripts:**
  - `pnpm --filter @repo/sdk openapi [apiUrl]`: regenerates `src/api/openapi.gen.ts` from a running API's `/openapi.json` (see [API types](#api-types)).
  - `pnpm --filter @repo/sdk sync-backend [path/to/agents]`: re-copies `deployments/*.json` and `abi/*.json` from the backend and regenerates the typed `as const` modules. Run it after a redeploy.

### Using it from apps/web

Add `"@repo/sdk": "workspace:*"` to `apps/web/package.json` dependencies, then run `pnpm install`. The package exports `dist/`, and turbo's `dev` / `build` already depend on `^build`.

Create one instance per app, for example `src/lib/mra.ts`:

```ts
import { createMRA } from "@repo/sdk";
export const mra = createMRA({
  mode: (process.env.NEXT_PUBLIC_MRA_MODE as "mock" | "local" | "sepolia") ?? "mock",
  apiUrl: process.env.NEXT_PUBLIC_MRA_API_URL,
  issuerUrl: process.env.NEXT_PUBLIC_MRA_ISSUER_URL,
  rpc: { url: process.env.NEXT_PUBLIC_MRA_RPC_URL },
});
```

A server component can just `await mra.merchant.home()`. A client component can wrap calls in your own hook or TanStack Query; the SDK stays React-free.

## Screen → SDK mapping (all 34 canvas screens)

Machine-readable as `SCREENS` (`src/screens.ts`). View-model types are in `src/viewmodels.ts`.

| Canvas | Screen | Route | SDK call | View-model |
|---|---|---|---|---|
| M01 | Welcome | `/` | — (static copy) | — |
| M02 | Prove business | `/onboarding/prove` | `onboarding.startProof({ band, country, account? })` | `ProveSession` |
| M03 | Verifying | `/onboarding/verifying` | `onboarding.finishProof(sessionId, { onStep })` | `ProveResult (+ ProveStep events)` |
| M04 | Business Pass | `/onboarding/pass` | `onboarding.pass()` | `BusinessPassView` |
| M05 | Failed | `/onboarding/failed?reason=` | `ProveResult.reason from finishProof` | `ProveResult { ok: false, reason }` |
| M06 | Create shop | `/onboarding/shop` | `onboarding.createShop(name), onboarding.nameIdeas()` | `ShopView` |
| M07 | Agent setup | `/agent/setup` | `agent.setupOptions()` | `AgentSetupView` |
| M08 | Approve | `/agent/approve` | `agent.approveView(limits), then agent.setup(limits, { onStep })` | `AgentApproveView, AgentSetupResult` |
| M09 | Agent denied | `/agent/denied` | `AgentSetupResult.status === 'denied' \| 'expired'` | `AgentSetupResult` |
| M10 | Home | `/home` | `merchant.home()` | `HomeView` |
| M11 | Advance arrived | `/advance/arrived` | `merchant.arrived()` | `AdvanceArrivedView` |
| M12 | Advance details | `/advance` | `merchant.advance()` | `AdvanceDetailsView` |
| M13 | Bad week | `/week` | `merchant.week()` | `WeekView` |
| M14 | Agent log | `/agent` | `agent.log()` | `AgentLogView` |
| M15 | Manage agent | `/agent/manage` | `agent.status(), agent.revoke(), agent.trigger()` | `AgentStatusView` |
| M16 | Repaid | `/repaid` | `merchant.repaid(), merchant.claimStandingPass()` | `RepaidView` |
| M17 | Fresh shop | `/settings/fresh-shop` | `merchant.freshShop(name?)` | `FreshShopResult` |
| M18 | Cash out | `/cash-out` | `merchant.cashOutView(), merchant.cashOut(amount, dest)` | `CashOutView, CashOutResult` |
| M19 | Settings | `/settings` | `merchant.settings(), mra.network()` | `SettingsView` |
| M20 | Recover | `/settings/recover` | `recovery.verify(), recovery.restore(passphrase), recovery.backup(passphrase)` | `RecoveryResult, BackupResult` |
| P01 | World view | `/world-view` | `world.publicView(step)` | `WorldView` |
| C01 | Pay | `/pay/corner-kiosk` | `pay.shop(shopId, { name }), pay.pay(shopId, amount)` | `PayShopView` |
| C02 | Paid | `/pay/corner-kiosk/paid` | `result of pay.pay(...)` | `PayReceipt` |
| S01 | Portal login | `/portal/login` | — (demo-portal app; seeded accounts) | — |
| S02 | Portal dashboard | `/portal` | — (the page the Reclaim proof reads) | — |
| L01 | Earn | `/earn` | `lender.overview()` | `EarnView` |
| L02 | Deposit | `/earn/deposit` | `lender.depositView(), lender.deposit(amount), lender.withdraw(amount)` | `DepositView, TxResult` |
| L03 | Position | `/earn/position` | `lender.position()` | `PositionView` |
| J01 | Junior | `/junior` | `lender.junior.overview()` | `JuniorView` |
| J02 | Mint | `/junior/mint` | `lender.junior.mintView(), lender.junior.deposit / withdraw` | `DepositView, TxResult` |
| J03 | Trade | `/junior/trade` | `lender.junior.trade()` | `TradeView` |
| P02 | Protocol | `/protocol` | `protocol.stats()` | `ProtocolView` |
| P03 | Risk | `/risk` | `protocol.risk()` | `RiskView` |
| P04 | Explorer | `/explorer` | `protocol.explorer()` | `ExplorerView` |

Notes:

- **Flows that return a status.** `agent.setup` and `onboarding.finishProof` resolve to a status that tells the screen where to route:
  - `AgentSetupResult.status`: `active` goes to M10, `denied` / `expired` go to M09.
  - `ProveResult.ok === false`: route to `failedHref(result.reason)` (M05). The reason is `too-new` / `suspended` / `revenue-low`.
- **Progress events.** Long flows take an `onStep` callback that drives the step UI:
  - `ProveStep`: `starting`, `waiting_for_portal`, `proof_received`, `issuing`, `registering`, `saved`
  - `AgentSetupStep`: `creating_agent`, `awaiting_agent_pass`, `proving_credential`, `registering_mandate`, `activating`, `done`
  - `RecoveryStep` and `TxStep` work the same way.
- **Demo outcomes in mock mode.**
  - M05: `onboarding.proveBusiness({ account: "newshop" | "suspended" })` (the seeded portal accounts).
  - M09: `agent.setup(limits, { mockOutcome: "deny" })`.
  - Spinners: `createMRA({ mode: "mock", mockLatencyMs: 800 })` gives them a visible delay.
- **Helpers.** `merchant.splitSale(total, holdback)` replaces apps/web's `splitSale`. `formatMoney` and the other format helpers are re-exported unchanged.

## Mock mode is identical to apps/web

`src/mock/*` is a **copy** of `apps/web/src/lib/mock/{shop,merchant,lend,catalog}.ts` (plus `routes.ts` and `brand.ts`). Only the import paths were rewritten; each file's header names its source. The SDK never imports apps/web.

`test/mock-parity.test.ts` deep-compares every mock-mode view-model with the live apps/web files. That suite needs apps/web's tsconfig to resolve, which means running `pnpm install` at the root, or pointing `MRA_WEB_SRC` at a copy. If either mock file changes, the test fails until the copy is updated.

> **Heads-up for the lender screens:** `apps/web/src/screens/lend/{screens,client}.tsx` import `./data`, a second copy whose `VAULT` uses **numbers** (for example `sharePrice: 1.024`, `walletUsdc: 2500`). `lib/mock/lend.ts` uses **display strings** (`"$1.024"`, `"$2,500"`). The SDK follows `lib/mock/lend.ts`, so those screens need to read the string fields (or delete `screens/lend/data.ts`) when they switch.

## From mock to Sepolia

1. **`mode: "local"`** (everything on your laptop):
   - anvil with `agents/deployments/local.json` deployed
   - the agents API: `cd agents && uv run uvicorn mra_agents.api:app --port 8000`, with `WORLD_MOCK=1` (the default) and `CORS_ALLOW_ORIGINS=http://localhost:3001`
   - the issuer with `ISSUER_MOCK=1`, on port 8787
   - Defaults need no URLs. Onboarding uses the issuer's `/mock/proof` as the Reclaim stand-in; everything after the proof is real.
2. **`mode: "sepolia"`**:
   - set `apiUrl` and `issuerUrl`
   - optionally `rpc.url` (default `https://ethereum-sepolia-rpc.publicnode.com`)
   - Contract addresses come from the bundled `src/deployments/sepolia.json` (chainId 11155111, deployBlock 12070938). Override with `deployment`.
3. **Writes** need a connected viem `WalletClient` (`wallet`):
   - lender deposit / withdraw, customer `pay`, `createShop` / `freshShop` (`registerShop`)
   - `BusinessPassRegistry.issue` and the shop owner's mandate signature
   - Draws and Standing Pass claims are relayed by the backend (`/relay/*`) and never need the merchant's wallet.
4. **Real proofs** need a `prover` (see below). Without one, real-mode flows that prove fail with `prover_not_configured` instead of sending a bogus proof.
5. **Lender screens with no wallet connected:** pass `account` to show a read-only position.

### What each real adapter needs

| Adapter | Mock (default) | Real | Needs |
|---|---|---|---|
| `Prover` | `mockProver()`: keccak stand-in, zero proofs (mock mode only) | `workerProver(new Worker(...))` | A Web Worker running `@noir-lang/noir_js` + `@aztec-foundation/bb.js@6.0.0` (`UltraHonkBackend`, `{ verifierTarget: "evm" }`) with the compiled `business_pass` / `standing_pass` circuits (nargo 1.0.0-rc.3). Protocol: `ProverRequest` / `ProverResponse` in `src/adapters/prover.ts`. It must also answer `poseidon2` (bb.js Poseidon2, BN254). |
| `CredentialVault` | `MemoryVault` (mock / SSR / tests) | `IndexedDbVault` (browser default) | Nothing. Stores the Business Pass, Standing Pass and session (shop id, agent `manage_token`) on the device only. `export(passphrase)` / `import()` use PBKDF2 + AES-GCM. |
| `ReclaimAdapter` | `mockReclaim()` offline; `issuerMockReclaim` in local / sepolia | `reclaimJsSdk({ createRequest })` | `@reclaimprotocol/js-sdk` in the app. Also a small server route that runs `ReclaimProofRequest.init(RECLAIM_APP_ID, RECLAIM_APP_SECRET, RECLAIM_PROVIDER_ID_BAND{n})` and returns `toJsonString()`; the client rebuilds it with `fromJsonString`. Keep the secret off the client. The SDK calls `setContext(addr, commitmentHex)`. The issuer needs `ISSUER_MOCK=0` and the `RECLAIM_*` env (issuer/README.md). |
| `AgentPassAdapter` | `mockAgentPass("approve" \| "deny" \| "expire")` (works with the backend's `WORLD_MOCK=1`) | `worldOidcAgentPass({ authorize: (nonce) => ... })` | A World sign-in that sends **`agent_pass_nonce` as the OIDC nonce** and returns `{ code, code_verifier, redirect_uri }` or `{ id_token }`. The backend needs `WORLD_MOCK=0`, its World app config, and `ATTESTER_PRIVATE_KEY`. |
| `IdkitAdapter` | `mockIdkit({ human })` (same label = same human) | `idkit({ request })` | `@worldcoin/idkit` with action = the backend's `WORLD_RECOVERY_ACTION` (Proof of Human). Resolve with the widget's success result; the backend forwards it to World unchanged. |
| Anon-RPC | Direct RPC | `rpc: { anonRpc: true, anonWorker }` | Below. |

### Anon-RPC

`@anon-rpc/browser-harness` (v0.4) is browser-only: it runs a null-origin iframe plus WebRTC. So the SDK takes the worker by injection, and doesn't depend on the package.

```ts
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { ANON_SPECIFIERS, bootstrapProvider, createMRA } from "@repo/sdk";

const worker = new AnonRpcWorker({
  address: ANON_SPECIFIERS.nox.specifier,                       // Nox: specifier published on Sepolia
  preExisting: { rpcProvider: bootstrapProvider("https://ethereum-sepolia-rpc.publicnode.com") }, // one bootstrap read
});
const mra = createMRA({ mode: "sepolia", apiUrl, issuerUrl, rpc: { anonRpc: true, anonWorker: worker } });
mra.network(); // { rpc: "anon", chainId: 11155111, ... }
```

- **How reads are routed:** every viem read goes through `http(url, { fetchFn: worker.fetch })`.
- **Fail closed:** if `anonRpc` is on but no worker or fetch was given, chain reads throw `anon_rpc_unavailable`. Set `allowDirectFallback: true` to read directly instead, for example as a demo fallback.
- **Specifiers:** `ANON_SPECIFIERS` lists the adopters' specifiers (passthrough, tor-js, nym, nox).
  - The tor-js and nym specifiers live on mainnet, so their bootstrap provider must be a mainnet RPC.
  - `passthrough` is not anonymous; it's for wiring tests only.
- **Merkle paths:** proofs download the **whole** leaf list (`LeafInserted`) through this transport and compute the path locally, so the RPC never learns which leaf belongs to the user.

## What's real vs mock

| Area | mode `mock` | modes `local` / `sepolia` |
|---|---|---|
| Merchant home / advance / week / repaid / QR | apps/web values | **Real chain**: `shops`, `getAdvance`, `Sale` / `AdvanceOpened` logs, `tierCap`; insights + decision from the API for reasons and estimates |
| Agent setup / status / log / revoke / trigger | Stateful mock | **Real API**: `POST /agents`, `/agent-pass`, `/relay/register-mandate`, `/activate`, `GET /agents/{id}`, `/revoke`, `/trigger`. Setup also needs a real prover and wallet. |
| Onboarding prove | Offline mock (seeded accounts fail as in the portal) | Issuer `/mock/proof` by default, then a **real** `POST /issue` and `registry.issue`; real zkTLS with `reclaimJsSdk` |
| Create shop / fresh shop | Mock pseudonym rotation | **Real** `registerShop` from the connected wallet (random bytes32 id) |
| Pay | Simulated receipt | **Real** USDC `approve` + `AdvanceBook.pay`; the split comes from the `Sale` event |
| Lender / junior views | apps/web values | **Real chain**: ERC-4626 totals, share price, reserve, caps, fee bps, RiskHook TWAP, position, Deposit / Withdraw logs, v4 `Swap` logs |
| Lender deposit / withdraw / mint / redeem | Simulated steps | **Real** wallet transactions |
| Junior swap (J03 buy/sell button) | Not provided | **Not implemented.** The view is real; the swap needs a v4 router. |
| Protocol stats / explorer | apps/web values | **Real chain** logs |
| Risk | apps/web values | **Real** `GET /risk/status` + `LimitsChanged` logs |
| World view | apps/web values (step-aware) | From this device's vault and the real chain |
| Recovery | In-memory backup | **Real** `/recovery/verify` + `PUT` / `GET /recovery/backup` (mock IDKit payload unless `idkit()` is injected) |
| Cash out | Simulated | **Simulated** (off-ramp out of scope). `cashOutView` shows the real payout USDC balance. |

Verified read-only against the live Sepolia deployment (protocol snapshot, stats and explorer).

## API types

`src/api/types.ts` holds the wire types, **hand-checked** against `agents/src/mra_agents/{api.py,agents_api.py,models.py,merchant_agents.py,world.py}` and `issuer/README.md`.

Several `agents_api.py` routes return untyped dicts, so OpenAPI alone can't type them. With the API running, `pnpm --filter @repo/sdk openapi http://localhost:8000` writes `src/api/openapi.gen.ts` (schemas plus a `ROUTES` list) to diff against.

Field elements and `uint256` values are sent as **exact JSON integers** (bigints are never stringified), because FastAPI's `StrictInt` rejects strings.

## Errors

Everything thrown is an `MRAError` with `code`:

- **`NetworkError`:** the request never got a usable response. Codes: `network_unreachable`, `timeout`, `aborted`, `bad_response`.
- **`ApiError`:** an HTTP status plus the backend's stable code, for example `rate_limited`, `unauthorized`, `bad_state`, `invalid_limits`, `predicate_failed:age_ok`, `proof_replayed`, `upstream_failed`. The full lists are `AGENTS_API_ERROR_CODES` and `ISSUER_ERROR_CODES`.
- **`ChainError`:** `chain_read_failed`, `chain_write_failed`, `wallet_required`, `anon_rpc_unavailable`.
- **`VaultError`:** `vault_locked` (wrong passphrase), `vault_corrupt`, `session_missing`.
- **`ConfigError`:** `config_invalid`. **`NotSupportedError`:** `not_supported` (for example the raw API in mock mode).

**No secrets in logs.** The SDK never logs. Error messages carry codes only, never request bodies, tokens, proofs or credential secrets. `onEvent` receives step codes only. The `manage_token` and recovery token are sent as headers, never in URLs. Vaults serialise as `"memoryVault"` / `"indexeddbVault"`.

## Tests

`pnpm --filter @repo/sdk test` runs 46 tests; `test/setup.ts` blocks `fetch`, so nothing touches the network:

- `mock-parity`: mock mode equals apps/web for home, advance, week, repaid, earn, position, junior, trade, protocol, risk, explorer, world view, cash out, QR and setup options
- `api-client`: request paths, methods, Bearer headers, exact bigint JSON, error-code mapping, timeouts, and real-mode agent view-models over a mocked fetch
- `deployments`: the bundled config equals the copied JSON, validation, the ABI surface, and Anon-RPC routing
- `vault`: encrypted export/import round trip, wrong passphrase, and the mock recovery flow
- `flows`: mock onboarding, agent, rotation, pay and lender flows, Merkle paths, and the 34-screen map

## Layout

```
src/
  index.ts            public API            client.ts   createMRA
  config.ts           MRAConfig + defaults  context.ts  shared runtime (lazy API/issuer/chain)
  viewmodels.ts       every screen type     screens.ts  the 34-screen map
  domains/            onboarding agent merchant pay lender protocol world recovery
  api/                types.ts (hand-checked) clients.ts (AgentsApi, IssuerApi)
  chain/              viem reads/writes, deployments
  adapters/           prover, vault, Reclaim / Agent Pass / IDKit
  transport/anon.ts   Anon-RPC glue
  credentials.ts      circuit tags, Merkle path, contexts
  abi/ deployments/   copied JSON + generated as-const TS (scripts/sync-backend.mjs)
  mock/               copied apps/web mocks
```
