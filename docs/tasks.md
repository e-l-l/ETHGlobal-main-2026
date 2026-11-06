# Task list

**Priority:**
- **P0:** must ship, the demo breaks without it
- **P1:** should ship
- **P2:** stretch

**Est:** focused hours for one person. **Owner:** fill in.

**Status at 7 Nov:** contracts, circuits, agents, SDK, app, integrations and the submission docs are built, and the contracts are deployed and verified on Sepolia. Open: C12, C13, the demo video and rehearsal (D5, D6), and the items marked TODO below. Post-hackathon work is in [FUTURE.md](FUTURE.md).

Design rules everyone should know:
- One advance at a time, paid out once, at a fixed size.
- The holdback % is fixed when the offer is accepted and never changes afterwards.
- The Risk agent only lowers limits for new advances.

---

## 0. Before 21:00 (setup, no project code): ✅ done

- [ ] Install toolchains: `noirup` (Noir 1.0.0), `bbup` (Barretenberg), Foundry, Node 20+ · owner:
- [ ] Get Sepolia ETH from faucets for 3–4 wallets: deployer, demo merchant ×2, judge phone · owner:
- [ ] Accounts and keys: World Developer Portal app (create actions `first-advance`, `approve-draw`), Uniswap API key, Anthropic API key, Vercel project · owner:
- [ ] Read docs: Uniswap v4 hooks and Sepolia deployments, IDKit and Agent Pass, Anon-RPC wallet guide, Noir and `bb` Solidity verifier · owner:
- [ ] Check whether Anon-RPC supports Sepolia, and whether the Uniswap API works on Sepolia · owner:
- [ ] Read Tap Pay, Usury Protocol and Kreditos on the ETHGlobal showcase (competition check) · owner:
- [ ] Decide team roles (one owner per workstream below) · owner:

## 1. Contracts (Solidity, Foundry): ✅ done, deployed and verified on Sepolia 2026-11-06

Built in parallel by 3 Claude and 3 Codex agents, then merged. The first iteration had 97 tests; the suite is now 169 Foundry tests (offline). The fee model later changed to time-based (0.5% per week, max 3%, late fee while behind), holdback 8%, tier caps $50/$100/$200/$300, and a 40/30/20/10 fee split. See [economics.md](economics.md). Spec: [contracts/SPEC.md](../contracts/SPEC.md).

| ID | Task | P | Status |
|---|---|---|---|
| C1 | Foundry setup, remappings (OpenZeppelin 5.5 + v4-core from uniswap-hooks, solc 0.8.26) | P0 | ✅ |
| C2–C3 | `AdvanceBook`: `pay` split, `drawFirst` / `drawWithPass`, waterfalls, `writeOff` with bounty, `claimStandingPass` | P0 | ✅ |
| C4–C5 | `TrancheVault` ×2 (ERC-4626) with junior coverage limit | P0 | ✅ |
| C6 | `Policy`: EIP-712 offers, caps, downward-only risk limits | P0 | ✅ |
| C7 | `StandingPassTree`: Poseidon2, depth 16, matches the Noir vectors | P0 | ✅ |
| C9 | `RiskHook`: USDC fee to the reserve, 64-slot TWAP | P0 | ✅ |
| C10 | Tests + invariants (accounting, USDC conservation) | P0 | ✅ |
| C11 | Deploy script | P0 | ✅ Run on 2026-11-06; all 8 contracts live and Etherscan-verified ([addresses](submission/README.md)) |
| C12 | Pinned Sepolia fork test for the hook against the real PoolManager | P1 | TODO |
| C13 | `slither .`, then resolve high/medium findings | P1 | TODO |
| C14 | Convert `contracts/lib` to git submodules | P0 | ✅ (`git submodule update --init --recursive`) |
| C15 | Decide: minimum repayment per window (stops tiny sales delaying write-off), pool starting price | P1 | ✅ Minimum is 1% of owed per 7 days; the pool is seeded by the team |

## 2. ZK (Noir)

| ID | Task | P | Est | Depends on |
|---|---|---|---|---|
| Z1 | ✅ Rerun the Poseidon2 check with real `nargo test`: matches | P0 | 0.5 | — |
| Z2 | ✅ `standing_pass` circuit (4,398 gates): membership, nullifier, `count ≥ tier`, next commitment, `context` binding | P0 | 4 | Z1 |
| Z3 | ✅ Generated `HonkVerifier` (18KB), real-proof end-to-end tests pass | P0 | 1.5 | Z2 |
| Z4 | ✅ Browser proving with `@aztec-foundation/bb.js@6.0.0` in the app, time it on a cheap Android phone | P0 | 3 | Z2 |
| Z5 | ✅ Secret storage on the device and a backup or export flow | P1 | 1.5 | Z4 |
| Z6 | Real Reclaim path built and tested; the live demo uses a mock attestor. zkTLS proof of offchain sales (M-Pesa) | P2 | 6+ | — |

## 3. Agents (Python, models on Amazon Bedrock): ✅ done, running on EC2, see [agents/README.md](../agents/README.md)

Built by 3 Claude and 3 Codex agents, then integrated:
- **Tests:** first iteration had 256 offline tests plus 3 live chain tests; the suite is now 554 offline tests.
- **End to end on a local devnet:** the wash-trader is rejected by red lines; chai-stall gets an offer that the clamp cuts to the $50 tier-0 cap; the signed offer is accepted onchain; the relayer's `drawFirst` pays a fresh address; the keeper writes off stalled advances.
- **Live models on Bedrock tested:** the live e2e passes with Mistral Large 3 as Underwriter and Kimi K2.5 as Critic, and the Critic rejects a wash trader built to pass every red line. Claude on Bedrock is blocked for this AWS account.

Details of each task follow.

| ID | Task | P | Est | Depends on |
|---|---|---|---|---|
| ✅ A1 | Service skeleton, read `Sale` events, hash payer addresses | P0 | 2 | C2 |
| ✅ A2 | Underwriter: sales → `Offer` schema (structured outputs), validate against policy bounds | P0 | 3 | ✅ A1 |
| ✅ A3 | Critic: independent prompt, wash-trading checks (unique payers, round bursts, last-minute spikes) → approve, reject or send back | P0 | 3 | ✅ A1 |
| ✅ A4 | Sign approved offers (EIP-712) | P0 | 1 | A2, A3, C6 |
| ✅ A5 | Risk agent: watch junior price, defaults and repay speed, call the downward-only limit setter | P1 | 3 | C6, C9 |
| ✅ A6 | Seed scripts: one honest merchant's sales history, one wash-traded merchant with an injection string in its shop name | P0 | 2 | C2 |

## 4. App (Next.js mobile web): ✅ built

Beyond the original list, the app now also has a redesigned landing page, RainbowKit wallet connect (device wallet as fallback), `/faucet`, the proof center (`/proof`), the simulator (`/simulator`), loading-state skeletons and a World ID first onboarding. U10 (any-token checkout) is roadmap: checkout is USDC only.

| ID | Task | P | Est | Depends on |
|---|---|---|---|---|
| ✅ U1 | App shell, palette (green system, see [anay-design.md](../anay-design.md)), local currency toggle (ARS, NGN, KES) | P0 | 2 | design |
| ✅ U2 | Onboarding: World ID, with "we never ask for your phone or contacts" | P0 | 2 | ✅ W1 |
| ✅ U3 | Offer screen: weekly fee (max 3%), slow, normal and busy days to repay, reasons, next limit | P0 | 2 | ✅ A4 |
| ✅ U4 | Approve (Agent Pass) and receive. Denied screen with the next step. | P0 | 2 | ✅ W2 |
| ✅ U5 | Live sales: balance falling, sale-by-sale split, **voice announcement** | P0 | 2 | C2 |
| ✅ U6 | Checkout page: QR → pay. No mention of the advance. | P0 | 2 | C2 |
| ✅ U7 | Standing Pass screen + "Checking your record privately…" proving state | P0 | 1.5 | Z4 |
| ✅ U8 | Lender / risk view: vault, junior price chart, current limits | P1 | 2 | C4, C9 |
| ✅ U9 | Bad-week screen (repayment slows, no penalty) | P1 | 1 | ✅ U5 |
| U10 (roadmap) | Checkout swap from any token through the Uniswap API | P2 | 3 | ✅ U6 |
| ✅ U11 | Spanish copy | P1 | 1 | U1–U7 |

## 5. Integrations: ✅ wired live (World real mode, Anon-RPC on by default, faucet)

| ID | Task | P | Est | Depends on |
|---|---|---|---|---|
| ✅ W1 | World ID with IDKit, server-side proof validation | P0 | 2 | setup |
| ✅ W2 | World Agent Pass: merchant delegates once (a mandate), plus a denied path | P0 | 3 | W1, A4 |
| ✅ R1 | Anon-RPC as the default transport for every read in the app and checkout | P0 | 2 | — |
| ✅ G1 | Gas sponsorship for the merchant and the judge's phone | P0 | 2 | C11 |
| ✅ G2 | Pre-funded judge wallet on a demo phone, "received" shown as soon as the payment is sent | P0 | 1 | ✅ G1 |

## 6. Demo and submission

| ID | Task | P | Est |
|---|---|---|---|
| ✅ D1 | `FEEDBACK.md` (Uniswap) + Developer Feedback Form | P0 | 1 |
| ✅ D2 | World integration debrief + "why this credential is the minimum" | P0 | 0.5 |
| ✅ D3 | Fill in the README CROPS section TODOs (license, direct-contract path). One TODO is left: the link to the original repo in the README. | P0 | 0.5 |
| ✅ D4 | AI-usage notes | P0 | 0.5 |
| D5 | Demo video, 2–4 min, 720p or better, human voice. CROPS version ≤3 min. Checklist: [VIDEO.md](submission/VIDEO.md). | P0 | 2 |
| D6 | Rehearse the 4-minute demo twice ([hackathon.md](hackathon.md)) | P0 | 1 |
| D7 | Print the QR, set up the stall props | P1 | 0.5 |
| D8 | Submit by Sat 07:00 IST | P0 | — |

---

## Critical path

`C1 → C2 → C3 → C6` and `Z1 → Z2 → Z3 → C7` run in parallel. Both feed `A4 → W2 → U4`, which is the first full end-to-end run. Aim for that by **Fri 15:00**.

**Cut order if behind:** Z6, U10, A5, U8, U9.
