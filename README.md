<p align="center">
  <img src="apps/web/src/app/apple-icon.png" width="72" height="72" alt="DripMoni" />
</p>

<h1 align="center">DripMoni</h1>

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
| Sepolia contracts; browser-generated ZK proofs verified onchain; Bedrock AI underwriting; managed agents and Risk agent; test-USDC payments; v4 DripCoin swap via RiskHook; Anon-RPC app reads | Mock zkTLS attestor and fictional seller portal; World test-mode stub (real OIDC/IDKit built and tested, pending keys); cash-out; any-token checkout; testnet money |

DripCoin (DRIP): junior, takes losses first. The deployed contract still uses Junior/JNR until redeploy. The demo pool is seeded; its price is not a validated credit oracle. See [privacy architecture](docs/privacy-architecture.md) for public data and trust boundaries and [economics](docs/economics.md) for fees and risks.

## What it is

DripMoni is a private **merchant cash advance** for small shops in dollar-short economies, such as a kiosco in Buenos Aires, a phone-accessory stall in Lagos or a duka in Nairobi.

1. **Prove the business, not the person.** The merchant proves with zkTLS that their seller dashboard shows a country, a revenue band and 6+ months of activity. That becomes a **Business Pass**. We never ask for a name, phone number or contacts.
2. **Get paid in stablecoins.** Customers scan the shop's QR and pay in test USDC. While an advance is active, a repayment slice goes toward it: 10% in the demo, 5–20% in the contract. Without an advance there is no holdback. Any-token checkout swaps are planned.
3. **An agent draws stock on credit.** The merchant sets limits (max per advance, max per month, recipient and expiry) and approves them once with a **test-mode World Agent Pass**. The cash-flow agent draws small advances to pay suppliers, and `PolicyGuard` enforces the limits onchain.
4. **Repay through sales, build a private record.** Repayment comes out of the 10% split automatically. There's one flat fee, and no interest, late fees or penalties. A fully repaid advance mints a **Standing Pass**, a Noir zero-knowledge credential that raises the merchant's limit without revealing their history.
5. **Lenders fund it.** A senior ERC-4626 USDC vault earns most of the fee. A junior first-loss token (DripCoin (DRIP)) earns more for taking losses first, and trades on a Uniswap v4 pool with a `RiskHook`.

The **World view** toggle on every screen shows exactly which data is onchain and which stays on the device.

## Status

| Part | State |
|---|---|
| Web app: every screen for merchant, customer, lender, junior and public users | ✅ Built, responsive (390px phone, 1440px desktop). Reads through `@repo/sdk`: mock by default, live on Sepolia with `NEXT_PUBLIC_MRA_MODE=sepolia` |
| Design system (`/final/components`) | ✅ Built |
| Demo seller portal | ✅ Built (inside the web app, deliberately unbranded) |
| Contracts (Foundry): AdvanceBook, BusinessPassRegistry, senior/junior ERC-4626 vaults, Uniswap v4 `RiskHook` | ✅ Live on Sepolia ([addresses](docs/submission/README.md)), 152 tests |
| Noir circuits: `standing_pass`, `business_pass` | ✅ Proofs made in the browser verify on the deployed verifiers |
| Agents service (Python): Underwriter, Critic, managed cash-flow agents, Risk agent, keeper, relayer | ✅ Running on EC2, 406 tests |
| Business Pass issuer (zkTLS → attestation) | ✅ Running; demo uses a mock attestor; the real Reclaim path is built and tested |
| `@repo/sdk`: the one integration layer every screen uses | ✅ Anon-RPC wired in the app (26/26 reads routed in a Chrome measurement), in-browser prover, burner wallet + demo faucet |
| World Agent Pass + IDKit | 🟡 Built and tested; test mode until the World app keys are added |
| Live demo | https://app.65-1-36-70.sslip.io (public devnet for the default scene: `rpc.` / `api-devnet.`) |

## Quick start

Requires **Node.js ≥ 26.13.0** and **pnpm 12.16.1** (pinned in `packageManager`).

```sh
pnpm install
pnpm dev
```

Open <http://localhost:3001/home> to choose a role (merchant, lender or public dashboard).

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
| `NEXT_PUBLIC_SHOW_KIT` | unset | Set to `1` to serve the component gallery (`/final/components`) in a production build. It is always on in dev. |

No other secrets are needed today. All data comes from `apps/web/src/lib/mock`.

## Tour of the app

| Who | Start here | Flow |
|---|---|---|
| Merchant, new | `/onboarding` | Welcome → Prove business (zkTLS) → Verifying → Business Pass → Create shop |
| Merchant, signed up | `/merchant` | Home and live sales · advance details · bad week · agent log, setup, approve and manage · repaid / Standing Pass · cash out · my QR · World view |
| Customer | `/pay/corner-kiosk` | Pay with test USDC → receipt. The advance is never mentioned. |
| Demo seller portal | `/portal/login` | The page the zkTLS proof reads from (stand-in for Mercado Pago) |
| Lender | `/earn` | Senior vault: overview, deposit / withdraw, position |
| Risk taker | `/junior` | Junior token: overview, mint / redeem, trade on Uniswap v4 |
| Public / judges | `/protocol` | Protocol dashboard, `/risk` status, `/explorer` |
| Dev | `/screens`, `/final/components` | Every screen on one page; the component gallery |

Every route lives in [`apps/web/src/lib/routes.ts`](apps/web/src/lib/routes.ts). Link through `routes.*` rather than hard-coding paths.

## Repository layout

```
.
├── apps/
│   └── web/                     Next.js 16 app (App Router, React 19, Tailwind v4)
│       ├── src/app/             Routes: onboarding, merchant, pay, portal, earn, junior, protocol, risk, explorer
│       ├── src/final/           Design-system components (Tailwind utilities only)
│       ├── src/screens/         Larger screen compositions shared by routes
│       ├── src/lib/             routes, brand name, copy (EN/ES), formatting, mock data
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
├── deploy/                      EC2: Docker Compose + Caddy, public devnet with an RPC allowlist
├── docs/                        Architecture, privacy, agents, integration keys; docs/submission for prize write-ups
├── anay-docs/                   Product, architecture, economics, ZK and agent docs
├── anay-design.md               Design source of truth (palette, type, logo, patterns, screens)
└── work-split.md                Who builds which screens
```

The monorepo uses **Turborepo** and **pnpm workspaces**.

## Design system

The light-only, green-focused system lives in [`packages/tailwind-config/final.css`](packages/tailwind-config/final.css). You can browse it at `/final/components`.

- **Ground:** white cards on a very light green-grey canvas (`#F6FAF5`). Cards separate by a hairline border, not a shadow.
- **Greens:** Charcoal `#262E24` (text), Hunter `#2C5A3A` (primary action, links), Fern, Sage, Leaf, Honeydew. **Lime `#C6F28C` is a fill on Hunter only, never on white** (1.2:1).
- **Type:** Urbanist (display, money) · Figtree (body) · JetBrains Mono (labels, IDs, local amounts).
- **Logo:** the ribbon drop. Its four bands double as the tier meter (lit bands = tier + 1).
- **Patterns:** wave band, jar gradient, ledger grid, pixel dune (real sales only), 9:1 split bar.

Rules for contributors:

- **No hex values outside the token files.** Use utilities such as `bg-hunter`, `text-charcoal-soft` and `border-hairline`.
- **No hand-written CSS for components.** Compose Tailwind utilities, with `cva` for variants and `cn()` for merging.
- **When you add a token, also add it to [`apps/web/src/lib/cn.ts`](apps/web/src/lib/cn.ts).** Otherwise tailwind-merge can drop a size class in favour of a colour class (`text-h1` vs `text-charcoal`).
- **Contrast:** body text ≥ 4.5:1, and borders on anything tappable ≥ 3:1. Every pair used is measured in `final.css`.

Full spec: [anay-design.md](anay-design.md).

## Documentation

| Doc | Covers |
|---|---|
| [architecture.md](anay-docs/architecture.md) | System diagram, contracts, off-chain services, onboarding and advance lifecycle, chain and deployment |
| [economics.md](anay-docs/economics.md) | Advance terms (factor, holdback, flat fee), tier caps, the senior / junior / reserve waterfall |
| [zk-privacy.md](anay-docs/zk-privacy.md) | Threat model, Business Pass (zkTLS), Standing Pass (Noir), what is and isn't hidden |
| [agents.md](anay-docs/agents.md) | Cash-flow, Underwriter, Critic and Risk agents; mandates; what agents can't do |
| [ux.md](anay-docs/ux.md) | Users, every screen, copy rules |
| [hackathon.md](anay-docs/hackathon.md) | Partner tracks, prizes and submission checklists |
| [judge-qa.md](anay-docs/judge-qa.md) | The hard questions and our answers |
| [research.md](anay-docs/research.md) | Why a cash advance and not a payday loan |
| [privacy-architecture.md](docs/privacy-architecture.md) | The full privacy design: Business Pass, Agent Pass, Anon-RPC, who learns what |
| [packages/sdk/README.md](packages/sdk/README.md) | How any frontend plugs in: every screen → SDK call → view-model |
| [integration-keys.md](docs/integration-keys.md) | Every key and app id for real mode, and where to get it |
| [LOCAL.md](docs/LOCAL.md) | Running the whole stack on your own machine (Docker or native; mock, local devnet, Sepolia) |
| [deploy/README.md](deploy/README.md) | Running the whole stack on one EC2 box |
| [docs/submission/](docs/submission/) | Uniswap feedback, World debrief, CROPS, Anon-RPC, AI usage, demo script, video plan |

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Radix UI primitives · class-variance-authority · tailwind-merge · Playwright + axe-core · Turborepo · pnpm.

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
