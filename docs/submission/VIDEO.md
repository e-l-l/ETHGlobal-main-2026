# Video recording plan (≤ 3:00)

**Demo video:** https://youtu.be/5P_cowDnvXM

**Rules:** 2–4 minutes (keep it ≤ 3:00 so it also fits CROPS), 720p or better (record at 1080p), **a human voice**, **no speed-up** in the edit. Cutting between scenes is fine. The narrative and the lines to say are in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

Live stack:

| What | URL |
|---|---|
| Merchant / lender app | https://app.65-1-36-70.sslip.io |
| Demo seller portal (zkTLS target) | https://portal.65-1-36-70.sslip.io |
| Agents API | https://api.65-1-36-70.sslip.io |
| Public devnet RPC (simulator) | https://rpc.65-1-36-70.sslip.io |

## Before you hit record

- [ ] **Phone:** World App installed, Chrome open on the app, screen recording on, Do Not Disturb on.
- [ ] **Laptop:** 1080p screen recording (QuickTime or OBS) with a good mic. Close every tab and terminal that shows secrets (`.env` files, AWS, keys).
- [ ] **Two browser profiles:** merchant and customer, so their burner wallets stay separate.
- [ ] **Dry-run every scene once.** Browser reads go through Anon-RPC (Nox) and can take 2–20 s, so let pages finish loading before you narrate.

## Scenes

| # | Time | Scene | Where | Say |
|---|---|---|---|---|
| 1 | 0:00–0:15 | **Problem** | Title card or kiosk photo | The problem, and the one-line idea: an advance that repays itself from sales, privately. |
| 2 | 0:15–0:50 | **World ID first → Business Pass → shop** | Phone: `/onboarding` → World ID (real IDKit) → `/portal/login` (demo portal) → Business Pass → create shop | "World ID first; a banned human stops here. The portal and attestor are a demo stand-in; the real Reclaim path is built and tested." |
| 3 | 0:50–1:10 | **The agent draws $50** | Phone: agent setup → Agent Pass (delegate once) → home shows the advance | "Delegated once. The agent proposes, the contract decides." |
| 4 | 1:10–1:30 | **A customer pays: 92/8** | Customer profile: `/pay/<shop>` → pays → merchant home updates | "92% to her, 8% repays the advance." |
| 5 | 1:30–1:50 | **Proof center** | Laptop: `/proof` | "The onchain ZK proof, decoded, plus the AI decision." |
| 6 | 1:50–2:35 | **Simulator: defaulter** ⭐ | Laptop: `/simulator` → `defaulter` | Late fee → write-off → DRIP absorbs → Risk agent lowers caps → World ID ban → refused at the World ID step. "Public devnet, real proofs, AI and txs, **time fast-forwarded**; World test mode." |
| 7 | 2:35–3:00 | **Lenders + close** | `/earn` (40/30/20/10 split) → `/dripcoin/trade` (swap; hook fee to the reserve) | "Testnet money; the DRIP pool is seeded by us." Then the close line. |

## Recording order

1. **Scene 6** first: it is the most valuable and fully unattended. Record a second take if anything stalls.
2. **Scenes 5 and 7** (laptop only).
3. **Scenes 2–4** (phone, real World ID). If real World ID fails, record with test mode and say "test mode" on camera.
4. **Scene 1** last.

## Lines to keep honest

- "The seller portal and attestor are a demo stand-in; the real Reclaim path is built and tested."
- "Testnet: Sepolia and MockUSDC."
- "The simulator fast-forwards time on our public devnet; proofs, AI and transactions are real."
- "Checkout is USDC only; any-token payment via Uniswap is roadmap."

## Fallbacks

| If… | Then |
|---|---|
| Anon-RPC is slow | Wait for the private connection; otherwise retake. If it falls back to direct reads, don't claim network privacy for that take. |
| A Sepolia transaction hangs | Cut, wait for the receipt, and resume from the next screen. |
| The simulator run fails mid-way | Start the run again; it restores caps and the pool price at the end. |
| Real World ID fails | Use test mode and say so on camera. |

## After recording

- [ ] Check: 720p or better, voice clear, nothing sped up, ≤ 3:00.
- [ ] No secrets on screen.
- [x] Uploaded to YouTube: **https://youtu.be/5P_cowDnvXM**, linked in the ETHGlobal submission and in [README.md](README.md).
