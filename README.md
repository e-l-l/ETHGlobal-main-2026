<p align="center">
  <img src="apps/web/src/app/apple-icon.png" width="72" height="72" alt="DripMoney" />
</p>

<h1 align="center">DripMoney</h1>

<p align="center">
  <b>A shop gets an advance and repays a slice of sales while it is active. ZK proofs protect credential details; transactions remain public.</b>
</p>

<p align="center">
  Built at ETHGlobal Mumbai 2026 · Uniswap v4 · World ID / Agent Pass · zkTLS · Noir
</p>

---

## What is live vs simulated

| Live | Simulated or planned |
|---|---|
| Sepolia contracts; browser-generated ZK proofs verified onchain (decoded at `/proof`); real World IDKit + Agent Pass wired live; Bedrock AI underwriting; managed agents and Risk agent; test-USDC checkout; v4 DripCoin swap via RiskHook; Anon-RPC browser reads (Nox, on by default) | Demo seller portal + mock zkTLS attestor (real Reclaim path built and tested); World test mode as a fallback and in the simulator; simulator time is fast-forwarded on a public devnet; cash-out; pay in any token via Uniswap (roadmap); testnet money |

DripCoin (DRIP) is the junior, first-loss tranche share (ERC-4626); the deployed vault is named "DripCoin"/"DRIP". The demo pool is seeded by the team; its price is an early-warning signal, not a validated credit oracle. See [privacy architecture](docs/privacy-architecture.md) for public data and trust boundaries and [economics](docs/economics.md) for fees and risks.

## What it is

DripMoney is a private **merchant cash advance** for small shops in dollar-short economies, such as a kiosco in Buenos Aires, a phone-accessory stall in Lagos or a duka in Nairobi.

1. **Prove the business, not the person.** The merchant proves with zkTLS that their seller dashboard shows a country, a revenue band and 6+ months of activity. That becomes a **Business Pass**. We never ask for a name, phone number or contacts.
2. **Get paid in stablecoins.** Customers scan the shop's QR and pay in test USDC. While an advance is active, 8% of each sale goes toward repayment; without an advance there is no holdback. Any-token checkout swaps are planned.
3. **An agent draws stock on credit.** World ID comes first: before any business step, the merchant proves they are a unique human who is not banned and has no open advance. They then set limits (max per advance, max per month, recipient and expiry) and delegate **once** with a **World Agent Pass**, with no approval on each draw. The cash-flow agent draws small advances to pay suppliers, and `AdvanceBook` (via `Policy`) enforces the mandate limits and tier caps onchain.
4. **Repay through sales, build a private record.** Repayment comes out of the 8% split automatically. The fee is 0.5% per week while principal remains, capped at 3%; early payoff saves fee. Falling behind the minimum (1% of owed per 7 days) adds a late fee of 0.5% per week (capped at 3%, so 6% total), paid 100% to the reserve. After 30 days anyone can write the advance off, and the human behind it is banned at the World ID step. A fully repaid advance mints a **Standing Pass**, a Noir zero-knowledge credential that raises the merchant's limit without revealing their history.
5. **Lenders fund it.** Fees split 40% senior vault, 30% DripCoin (DRIP), 20% reserve, 10% protocol. DRIP is the junior first-loss tranche (it must cover 20% of senior outstanding) and trades on a Uniswap v4 pool whose `RiskHook` takes a 0.3% USDC-side fee (75% to the reserve, 25% to the treasury).

The **World view** toggle on every screen shows exactly which data is onchain and which stays on the device.

## Status

| Part | State |
|---|---|
| Web app: every screen for merchant, customer, lender, DripCoin holder and public users | ✅ Built, responsive (390px phone, 1440px desktop). Reads through `@repo/sdk`: mock by default, live on Sepolia with `NEXT_PUBLIC_MRA_MODE=sepolia` |
| Landing page (`/`) | ✅ Redesigned: pixel-art hero, bento and mosaic blocks, a day-of-sales timeline and a bad-week chart that animate on scroll (`apps/web/src/app/_landing/`). The first landing is kept at `/old-landing`. |
| Wallet connect | ✅ RainbowKit + wagmi (the Scaffold-ETH 2 stack) on Sepolia. A wallet prompt only appears on click; page load checks silently and falls back to the on-device wallet. |
| Faucet (`/faucet`) | ✅ Gas, test USDC and DRIP to any address, plus "Add to MetaMask" |
| Loading states | ✅ Page skeleton plus a status card (steps, elapsed time, why private reads are slower) |
| Design system (`/final/components`) | ✅ Built |
| Demo seller portal | ✅ Built (inside the web app, deliberately unbranded) |
| Contracts (Foundry): AdvanceBook, BusinessPassRegistry, vault and DripCoin ERC-4626 tranches, Uniswap v4 `RiskHook` | ✅ Live on Sepolia ([addresses](docs/submission/README.md)), 169 Foundry tests (offline suite) |
| Noir circuits: `standing_pass`, `business_pass` | ✅ Proofs made in the browser verify on the deployed verifiers |
| Agents service (Python): Underwriter, Critic, managed cash-flow agents, Risk agent, keeper, relayer | ✅ Running on EC2, 554 offline tests |
| Business Pass issuer (zkTLS → attestation) | ✅ Running; demo uses a mock attestor; the real Reclaim path is built and tested |
| `@repo/sdk`: the one integration layer every screen uses | ✅ Anon-RPC wired in the app (26/26 reads routed in a Chrome measurement), in-browser prover, burner wallet + demo faucet; 152 offline tests |
| World ID (IDKit) + Agent Pass | ✅ Real mode wired live on the hosted app (`WORLD_MOCK=0`, `NEXT_PUBLIC_WORLD_MODE=real`); test mode as a fallback and in the simulator. At this event, World's Agent Pass proofs use fake identities (per World's prize page), and IDKit testing uses World's staging environment and simulator. |
| Proof center and simulator | ✅ `/proof` decodes onchain ZK proofs, txs and AI decisions; `/simulator` runs real proofs, AI and devnet txs with time fast-forwarded |
| Live demo | https://app.65-1-36-70.sslip.io (public devnet for the default scene: `rpc.` / `api-devnet.`) |

## CROPS

- **C (censorship resistance):** if our API, relayer, issuer or agents disappear, the contracts keep working. Anyone can call `pay`, `repay`, `writeOff` (for a 5 USDC bounty), `RiskHook.flush` and the ERC-4626 vault deposits and withdrawals. The contracts are non-upgradeable and have no pause. New advances need a signed offer, and new passes need the issuer, but both are replaceable services that the owner can rotate.
- **O (open source):** [MIT](LICENSE). The whole stack builds and runs locally with no real keys ([docs/LOCAL.md](docs/LOCAL.md)).
- **P (privacy, the lead property):** ZK passes (Business Pass, Standing Pass) are built on the device, and only proofs reach the chain. Browser reads go through Anon-RPC (Nox) by default. World ID is kept only as an HMAC on our server, and nothing about the person goes onchain. What stays public: the shop pseudonym's sales, repayments and advance sizes, and every transaction (writes are public, and backend reads use Tenderly). **No third-party analytics or trackers** ship in `apps/web`.
- **S (security):** the contract enforces tier caps, the exposure cap, mandate limits and 20% junior cover. Agents only propose signed offers, and the Risk agent can only lower limits, never below the floors. This is **unaudited hackathon code**.

Details and honest gaps: [docs/submission/CROPS.md](docs/submission/CROPS.md).

## Uniswap v4: RiskHook and the DRIP/USDC pool

DRIP (the junior, first-loss tranche) trades on a Uniswap v4 pool whose hook does two jobs: it takes a USDC-side fee for the reserve, and it keeps a TWAP that the Risk agent reads as an early-warning signal.

| What | Where |
|---|---|
| Hook permissions | [`contracts/src/RiskHook.sol#L86`](contracts/src/RiskHook.sol#L86) `getHookPermissions` |
| USDC-side fee on every swap | [`contracts/src/RiskHook.sol#L101`](contracts/src/RiskHook.sol#L101) `_afterSwap` |
| Fee payout (anyone can call) | [`contracts/src/RiskHook.sol#L129`](contracts/src/RiskHook.sol#L129) `flush` |
| TWAP ring buffer | [`contracts/src/RiskHook.sol#L153`](contracts/src/RiskHook.sol#L153) `_recordObservation`, [`#L174`](contracts/src/RiskHook.sol#L174) `consult` |
| Address mining and pool init | [`contracts/script/Deploy.s.sol#L70`](contracts/script/Deploy.s.sol#L70) `HookMiner.find`, [`#L76`](contracts/script/Deploy.s.sol#L76) `manager.initialize` |
| App swap (PoolSwapTest → PoolManager → RiskHook) | [`packages/sdk/src/domains/lender.ts#L466`](packages/sdk/src/domains/lender.ts#L466) `junior.swap` (implementation [`#L220`](packages/sdk/src/domains/lender.ts#L220)); pool key, slot0 and price helpers in [`packages/sdk/src/chain/swap.ts`](packages/sdk/src/chain/swap.ts) |
| Risk agent reads the TWAP and lowers limits | [`agents/src/mra_agents/risk.py#L204`](agents/src/mra_agents/risk.py#L204) (`consult` over 1h and 24h), [`#L217`](agents/src/mra_agents/risk.py#L217) `twap_drop_fires`, [`#L319`](agents/src/mra_agents/risk.py#L319) `enforce_down_only` |
| Tests | [`contracts/test/RiskHook.t.sol`](contracts/test/RiskHook.t.sol): fee direction, flush, TWAP, HookMiner address, only-PoolManager |

**Live on Sepolia:** RiskHook [`0xf5174b8f8642aef786e6bb1c1facac6d0f201044`](https://sepolia.etherscan.io/address/0xf5174b8f8642aef786e6bb1c1facac6d0f201044); the DRIP/USDC pool is on PoolManager [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543). Try it in the app at `/dripcoin/trade`.

**Honest limitations:** the pool is seeded by the team, so its price is a signal, not a validated credit oracle. The hook accepts any pool key that initializes with it; it is not locked to the DRIP/USDC pool. Paying a shop in any token through a Uniswap swap is roadmap: checkout is USDC only today.

## Quick start

Requires **Node.js ≥ 26.13.0** and **pnpm 12.16.1** (pinned in `packageManager`).

```sh
pnpm install
pnpm dev
```

Open <http://localhost:3001> for the landing page, or <http://localhost:3001/home> to choose a role (merchant, lender or public dashboard).

| Command (repo root) | What it does |
|---|---|
| `pnpm dev` | Runs the web app on port 3001 with hot reload |
| `pnpm build` | Production build of every package |
| `pnpm lint` | ESLint with zero warnings allowed |
| `pnpm check-types` | Generates Next.js route types, then runs `tsc --noEmit` |
| `pnpm format` | Prettier, with Tailwind class sorting |
| `pnpm --filter web test:e2e` | Playwright: every route at phone and desktop sizes, with axe accessibility checks |

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MRA_MODE` | `mock` | `mock` (built-in demo data, no network), `local` (anvil + local services) or `sepolia` (live). |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ISSUER_URL` | unset | Agents API and Business Pass issuer. Required for `sepolia`. |
| `NEXT_PUBLIC_ANON_RPC` | on for `sepolia` | Route browser reads through Anon-RPC (Nox). Set `NEXT_PUBLIC_ANON_RPC_STRICT=1` to fail closed. |
| `NEXT_PUBLIC_WORLD_MODE` | mock | `real` uses World IDKit + Agent Pass. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | unset | WalletConnect project id for the RainbowKit connect button. Optional: without it the on-device wallet is used. |
| `NEXT_PUBLIC_SHOW_KIT` | unset | Set to `1` to serve the component gallery (`/final/components`) in a production build. It is always on in dev. |

The default `mock` mode needs no secrets and reads from `apps/web/src/lib/mock`. Every `NEXT_PUBLIC_*` value ends up in the browser bundle, so no secrets belong there. Full list with comments: [`apps/web/.env.example`](apps/web/.env.example); keys for real mode: [integration-keys.md](docs/integration-keys.md).

## Tour of the app

| Who | Start here | Flow |
|---|---|---|
| Merchant, new | `/onboarding` | Welcome → World ID (stop screen if banned or an advance is open) → Prove business (zkTLS) → Verifying → Business Pass → Create shop (bound via a sealed ticket) |
| Merchant, signed up | `/merchant` | Home and live sales · advance details · bad week · agent log, setup, approve and manage · repaid / Standing Pass · cash out · my QR · World view |
| Customer | `/pay/corner-kiosk` | Pay with test USDC → receipt. The advance is never mentioned. |
| Demo seller portal | `/portal/login` | The page the zkTLS proof reads from (stand-in for a real seller marketplace) |
| Lender | `/earn` | Vault: overview, deposit / withdraw, position |
| Risk taker | `/dripcoin` | DripCoin (DRIP): overview, mint / redeem, trade on Uniswap v4 |
| Public / judges | `/protocol`, `/proof`, `/simulator` | Protocol dashboard, `/risk` status, `/explorer`, the proof center, and the simulator |
| Anyone | `/` , `/faucet` | The landing page; the testnet faucet (gas, test USDC, DRIP) |
| Dev | `/screens`, `/covers`, `/final/components` | Every screen on one page (`pnpm --filter web screenshots` captures them); cover-image generator; the component gallery |

Every route lives in [`apps/web/src/lib/routes.ts`](apps/web/src/lib/routes.ts). Link through `routes.*` rather than hard-coding paths.

## Repository layout

```
.
├── apps/
│   └── web/                     Next.js 16 app (App Router, React 19, Tailwind v4)
│       ├── src/app/             Routes: onboarding, merchant, pay, portal, earn, dripcoin, protocol, risk, explorer
│       ├── src/final/           Design-system components (Tailwind utilities only)
│       ├── src/screens/         Larger screen compositions shared by routes
│       ├── src/lib/             routes, brand name, copy, formatting, mock data
│       └── e2e/                 Playwright + axe tests
├── packages/
│   ├── sdk/                     @repo/sdk: typed view-models per screen; mock | local | sepolia; Anon-RPC, prover, wallet
│   ├── tailwind-config/         theme.css + final.css: every design token (colours, type, radii, motion)
│   ├── eslint-config/           Shared flat ESLint configs
│   └── typescript-config/       Shared tsconfig bases
├── contracts/                   Solidity (Foundry), live on Sepolia
├── circuits/                    Noir: standing_pass, business_pass
├── agents/                      Python agents service (FastAPI): underwriting, managed agents, risk, keeper, relayer
├── issuer/                      Node: Business Pass issuer (zkTLS proof → nullifier → signed attestation)
├── demo/portal/                 Standalone zkTLS seller dashboard (reference for the in-app portal screens)
├── deploy/                      EC2: Docker Compose + Caddy, public devnet; autodeploy.sh pulls CI-green main
├── docs/                        Architecture, privacy, agents, integration keys; docs/submission for prize write-ups
└── anay-design.md               Design source of truth (palette, type, logo, patterns, screens)
```

The monorepo uses **Turborepo** and **pnpm workspaces**.

## Design system

The light-only, green-focused system lives in [`packages/tailwind-config/final.css`](packages/tailwind-config/final.css). You can browse it at `/final/components`.

- **Ground:** white cards on a very light green-grey canvas (`#F6FAF5`). Cards separate by a hairline border, not a shadow.
- **Greens:** Charcoal `#262E24` (text), Hunter `#2C5A3A` (primary action, links), Fern, Sage, Leaf, Honeydew. **Lime `#C6F28C` is a fill on Hunter only, never on white** (1.2:1).
- **Type:** Urbanist (display, money) · Figtree (body) · JetBrains Mono (labels, IDs, local amounts).
- **Logo:** the ribbon drop. Its four bands double as the tier meter (lit bands = tier + 1).
- **Patterns:** wave band, gradient hero, ledger grid, pixel dune (real sales only), 9:1 split bar.

Rules for contributors:

- **No hex values outside the token files.** Use utilities such as `bg-hunter`, `text-charcoal-soft` and `border-hairline`.
- **No hand-written CSS for components.** Compose Tailwind utilities, with `cva` for variants and `cn()` for merging.
- **When you add a token, also add it to [`apps/web/src/lib/cn.ts`](apps/web/src/lib/cn.ts).** Otherwise tailwind-merge can drop a size class in favour of a colour class (`text-h1` vs `text-charcoal`).
- **Contrast:** body text ≥ 4.5:1, and borders on anything tappable ≥ 3:1. Every pair used is measured in `final.css`.

Full spec: [anay-design.md](anay-design.md).

## Documentation

| Doc | Covers |
|---|---|
| [architecture.md](docs/architecture.md) | System diagram, contracts, off-chain services, onboarding and advance lifecycle, chain and deployment |
| [economics.md](docs/economics.md) | Time-based fee, 8% holdback, $50/$100/$200/$300 tier caps, and the 40/30/20/10 fee waterfall |
| [zk-privacy.md](docs/zk-privacy.md) | Threat model, Business Pass (zkTLS), Standing Pass (Noir), what is and isn't hidden |
| [agents.md](docs/agents.md) | Cash-flow, Underwriter, Critic and Risk agents; mandates; what agents can't do |
| [ux.md](docs/ux.md) | Users, every screen, copy rules |
| [hackathon.md](docs/hackathon.md) | Partner tracks, prizes and submission checklists |
| [judge-qa.md](docs/judge-qa.md) | The hard questions and our answers |
| [research.md](docs/research.md) | Why a cash advance and not a payday loan |
| [privacy-architecture.md](docs/privacy-architecture.md) | The full privacy design: Business Pass, Agent Pass, Anon-RPC, who learns what |
| [packages/sdk/README.md](packages/sdk/README.md) | How any frontend plugs in: every screen → SDK call → view-model |
| [integration-keys.md](docs/integration-keys.md) | Every key and app id for real mode, and where to get it |
| [LOCAL.md](docs/LOCAL.md) | Running the whole stack on your own machine (Docker or native; mock, local devnet, Sepolia) |
| [deploy/README.md](deploy/README.md) | Running the whole stack on one EC2 box |
| [docs/submission/](docs/submission/) | Uniswap feedback, World debrief, CROPS, Anon-RPC, AI usage, demo script, video plan |

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · RainbowKit + wagmi · Radix UI primitives · class-variance-authority · tailwind-merge · Playwright + axe-core · Turborepo · pnpm.

Onchain and services: Solidity (Foundry) · Uniswap v4 hooks · ERC-4626 · Noir + bb.js (UltraHonk) · World Agent Pass / IDKit 4 · Reclaim zkTLS · Anon-RPC (Nox, Nym) · Python (FastAPI, web3.py, AWS Bedrock) · Node (Fastify) · viem · Ethereum Sepolia.

## Running the backend

**Whole stack on your machine** (macOS, Windows or Linux): see [docs/LOCAL.md](docs/LOCAL.md). `scripts/dev-up.sh` (or `.\scripts\dev-up.ps1`) brings up anvil with the contracts deployed and seeded, the agents API and worker, the issuer, the demo portal and the web app in `local` mode, with no real keys. The playbook also covers the native path, mock and Sepolia modes, the demo walkthrough and troubleshooting.

| Part | Setup | Test |
|---|---|---|
| Contracts | `cd contracts && git submodule update --init --recursive` | `forge test` |
| Circuits | Noir 1.0.0-rc.3 + bb 6.0.0 (`circuits/*/build.sh`) | `nargo test` |
| Agents | `cd agents && uv sync` | `uv run pytest` |
| Issuer | `cd issuer && npm ci` | `npx vitest run` |
| SDK | `pnpm install` | `pnpm --filter @repo/sdk test` |
| Whole stack on your machine | see [docs/LOCAL.md](docs/LOCAL.md) | `scripts/doctor.sh`, then `scripts/dev-up.sh` runs health checks |
| Whole stack on a server | see [deploy/README.md](deploy/README.md) | `deploy.sh` runs health checks |

Secrets live in git-ignored `.env` files; each folder has a `.env.example`.

## License

[MIT](LICENSE)

## Future work

What's not done yet (privacy gaps, any-token checkout, audits, real seller data), with designs and sizes: [docs/FUTURE.md](docs/FUTURE.md).
