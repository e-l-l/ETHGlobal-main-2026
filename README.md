# Merchant Revenue Advance

**Get cash today. Pay it back with a slice of every sale. Nobody learns who you are, who you know, or what's in your books.**

Small merchants in dollar-short economies, such as a kiosco in Buenos Aires, a phone-accessory stall in Lagos or a duka in Nairobi, often need cash before their sales arrive. They need it for stock, rent or repairs. Their options today are informal lenders, or digital loan apps that copy the borrower's phone contacts and shame them to family when a payment is late.

We put repayment **inside the payment itself**. A merchant takes stablecoin payments through a checkout link. While an advance is active, every sale splits automatically: for example 90% to the merchant and 10% toward the advance. No sales, no repayment. There are no fixed installments, so the merchant can't miss one. That matters in an economy where a devaluation week can halve sales in dollar terms.

> Built at ETHGlobal Mumbai (Nov 5–7, 2026), From Scratch track.

---

## How it works

```
 Customer scans QR ──► Checkout ──► AdvanceBook.pay ┬──► 90% Merchant
   (pays USDT/any token,           (splits every    │
    Uniswap swaps to USDC)          sale)           └──► 10% repayment ──► Senior vault / Junior / Reserve
```

1. **Prove you're one human, privately.** The merchant verifies with World ID. The zero-knowledge proof shows "unique human" and reveals nothing else. We never ask for a phone number, contacts or ID documents.
2. **Agents make an offer.** The Underwriter agent reads the shop's sales and proposes an amount. The Critic agent looks for wash trading and challenges the proposal.
3. **The contract decides.** `AdvanceBook` enforces hard caps. The merchant approves the draw with World Agent Pass, and USDC arrives at a fresh address.
4. **Every sale repays a slice** until the advance is cleared.
5. **Repaying earns a private Standing Pass**, a ZK credential. Next time the merchant proves "I've repaid N advances" and gets a higher limit. Their history is never revealed.
6. **Risk is priced in public.** A junior token takes the first loss on defaults and trades on a Uniswap v4 pool. If its price falls, the Risk agent tightens limits.

Full details: [docs/architecture.md](docs/architecture.md).

---

## Why ZK is at the core

On most lending apps, being safe to borrow from depends on trusting the lender. We make it a property of the system instead:

| Who | What they could learn | What stops it |
|---|---|---|
| Us, lenders, AI agents | Your identity, phone, contacts | We collect none of it. **World ID** proves uniqueness with a ZK proof. |
| Lenders and agents | Your full borrowing history | **Standing Pass** (Noir circuit). You prove a tier, not a history. |
| Lenders and agents | Your offchain books (stretch) | **zkTLS** proof of a Mercado Pago or M-Pesa statement that reveals only a threshold |
| RPC providers | Which shop the app keeps querying | All reads go through **Anon-RPC** |
| Neighbours, block explorers | "This shop is in debt" | Neutral shop names, advance paid to a fresh address, fixed advance sizes |

The Standing Pass also stops repeat defaulting. A credential is minted only when an advance is fully repaid, and it's spent when you borrow again. Someone who defaults has nothing to spend.

**What we don't hide (yet):** on a public chain, a determined watcher can still see a shop's sales and its repayment share. Fixing that needs a shielded pool. It's on the roadmap. See [docs/zk-privacy.md](docs/zk-privacy.md).

**Private from the public and from us, not from the law.** A production launch needs licensing, and needs selective disclosure for regulators.

## Why AI agents are at the core

Underwriting a merchant with no credit file means reading messy sales data and spotting manipulation. That's a judgment task, and agents do it well. But **agents propose and the contract decides**:

| Agent | Job | What it cannot do |
|---|---|---|
| **Underwriter** | Turns sales history and proven facts into a structured offer | Move funds, or produce anything outside a fixed schema |
| **Critic** | Independently checks for wash trading and sudden sales changes | Anything except reject or send back |
| **Risk** | Tightens limits when the junior token falls or defaults rise | Loosen limits, or move them outside set bounds |

A fooled or prompt-injected agent still can't exceed what `AdvanceBook` allows. Agents only ever see public onchain data and ZK-proven facts. No personal data reaches the model. See [docs/agents.md](docs/agents.md).

---

## What we use

| Layer | Choice |
|---|---|
| Chain | Ethereum Sepolia |
| Contracts | Solidity + Foundry, 2 custom contracts: `AdvanceBook` (payments, advances, policy, Standing Pass tree) and `RiskHook`, plus two OpenZeppelin ERC-4626 vaults. The junior vault's shares are the junior token. See [contracts/SPEC.md](contracts/SPEC.md). |
| ZK | Noir circuits with a Barretenberg-generated Solidity verifier, proving in the browser |
| Identity | World ID (IDKit) + World Agent Pass |
| Trading and swaps | Uniswap v4 pool and hook on junior/USDC, Uniswap API for checkout swaps |
| Private reads | EF Anon-RPC as the default transport for every RPC read |
| Agents | Python service (FastAPI); no LangChain. Judges on Amazon Bedrock: Mistral Large 3 (Underwriter), Kimi K2.5 (independent Critic), Qwen3 (Risk). Claude is a drop-in. See [docs/agents.md](docs/agents.md) |
| App | Next.js mobile web on Vercel. No install, local currency shown next to dollars |

## Partners and prizes

| Partner | Tracks | Best case |
|---|---|---|
| Uniswap Foundation | Build with Uniswap | $4,000 |
| World | World ID Agent Pass, Best Use of IDKit | $3,750 |
| Ethereum Foundation | Best Use of Anon-RPC, Best CROPS App (one EF prize per project) | $2,500 |
| **Total** | $26,000 in tracks entered | **$10,250** (realistic: $3.5k–7.5k) |

Details and checklists: [docs/hackathon.md](docs/hackathon.md).

---

## CROPS

*Required for the EF CROPS track. Kept honest and updated as we build.*

- **Censorship resistant:** contracts are permissionless once deployed. If our frontend or server goes away, merchants can still be paid and can repay through the contracts directly. *TODO: document the direct-contract path.*
- **Open source:** licensed under *TODO (MIT or GPL-3.0)*. Everything builds from this repo alone.
- **Private:** our server learns nothing that identifies a merchant. World ID proofs reveal only uniqueness. Standing Pass proofs reveal only a tier. RPC reads go through Anon-RPC, so providers don't learn which shop is querying. The agents see only public onchain data and proven facts. There are no third-party trackers or analytics in the client.
- **Secure:** Standing Pass secrets and proofs are generated and kept on the merchant's device. Agents can't move funds. `AdvanceBook` hard limits bound every advance. Operator powers are listed in [docs/architecture.md](docs/architecture.md#operator-powers-named-for-crops): the offer signer can refuse new advances, but nobody can touch funds, upgrade or pause.

---
## Repo layout

```
apps/web/            Next.js merchant, customer and lender screens (pnpm + Turborepo)
packages/sdk/        @repo/sdk: the integration layer. Screens call it; one switch goes mock → local → sepolia
packages/*-config    shared ESLint, Tailwind and TypeScript config
contracts/           Solidity (Foundry): AdvanceBook, BusinessPassRegistry, vaults, RiskHook. Live on Sepolia
circuits/            Noir: standing_pass, business_pass
agents/              Python (uv, FastAPI): underwriting, managed agents, risk, keeper, relayer, World backends
issuer/              Node: Business Pass issuer (Reclaim proof → nullifier → signed attestation)
demo/portal/         Fictional seller dashboard Reclaim proves against; reference for the S01/S02 screens
deploy/              EC2: Docker Compose + Caddy (agents, issuer, demo portal, and apps/web once it has a Dockerfile)
docs/                Architecture, privacy, agents, economics, judge Q&A; docs/submission for prize write-ups
```

## Running it

| Part | Setup | Test |
|---|---|---|
| Frontend | `pnpm install && pnpm dev` (Node ≥ 26, pnpm 12), opens on :3001 | `pnpm check-types` |
| Contracts | `cd contracts && git submodule update --init --recursive` | `forge test` (152) |
| Circuits | Noir 1.0.0-rc.3 + bb 6.0.0 (`circuits/*/build.sh`) | `nargo test` (7) |
| Agents | `cd agents && uv sync` | `uv run pytest` (345) |
| Issuer | `cd issuer && npm ci` | `npx vitest run` (39) |
| Demo portal | `cd demo/portal && npm ci && npm run dev` | `npx vitest run` (61) |

Python and the two Node services keep their own installs, outside the pnpm workspace. Secrets live in git-ignored `.env` files; each folder has a `.env.example`. Sepolia addresses: [contracts/README.md](contracts/README.md) and `agents/deployments/sepolia.json`.


## Docs

| Doc | What's in it |
|---|---|
| [privacy-architecture.md](docs/privacy-architecture.md) | **Start here: the full picture.** Business Pass (zkTLS), World ID, Anon-RPC, vaults and tokens, who learns what |
| [architecture.md](docs/architecture.md) | Components, contracts, the advance lifecycle, sequence diagrams |
| [zk-privacy.md](docs/zk-privacy.md) | Threat model, Standing Pass circuit spec, privacy levels, limitations |
| [agents.md](docs/agents.md) | Agent roles, offer schema, guardrails, prompt-injection defence |
| [economics.md](docs/economics.md) | Tranches, fees, worked numbers, break-even |
| [ux.md](docs/ux.md) | Merchant UX principles for Africa and Argentina |
| [design-brief.md](docs/design-brief.md) | 150-word summary, palette, screens for the design team |
| [hackathon.md](docs/hackathon.md) | Prize checklists, build plan, cut order, 4-minute demo |
| [tasks.md](docs/tasks.md) | Build task list by workstream, priorities, critical path |
| [judge-qa.md](docs/judge-qa.md) | Hard questions and our answers |
| [research.md](docs/research.md) | Why this project, data, open questions, sources |

| [submission/](docs/submission/) | Uniswap feedback, World debrief, CROPS, Anon-RPC, AI usage, demo script |

## Status

Contracts are live on Sepolia, and the agents service, issuer and circuits are tested end to end on a local chain. The merchant app is moving from mock data onto `@repo/sdk`.
