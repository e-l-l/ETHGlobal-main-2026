# Demo script (≤ 3 minutes)

One narrative for the live demo and the video: ETHGlobal allows 2–4 minutes, and EF CROPS wants 3 minutes or less. The scene-by-scene recording checklist is in [VIDEO.md](VIDEO.md).

Cast:
- **Presenter**
- **Merchant phone:** "Kiosco Don Pepe", Argentina, with World App installed
- **Customer:** a judge or a second browser profile
- **Laptop:** `/proof`, `/simulator`, `/earn`, `/dripcoin/trade`

Live app: https://app.65-1-36-70.sslip.io

## The narrative

| # | Time | Scene | What the judge sees | Say out loud |
|---|---|---|---|---|
| 1 | 0:00–0:15 | **Problem** | One slide or a kiosk photo | "A kiosco owner in Buenos Aires needs dollars for stock today. Her sales come next week. Loan apps want her name, phone and contacts. DripMoney gives her a small advance that repays itself from sales, without knowing who she is." |
| 2 | 0:15–0:50 | **World ID first → Business Pass → shop** | Phone: `/onboarding`. World ID (real IDKit, World App) comes first, before any business step. Then she proves her seller dashboard (the demo portal) with zkTLS and gets a Business Pass. The shop is created and bound to her World ID with a sealed ticket. | "World ID comes first, so a banned human stops right here. The business is proven with zkTLS. **This portal and attestor are a demo stand-in; the real Reclaim path is built and tested.** Nothing about her goes onchain: only a ZK proof." |
| 3 | 0:50–1:10 | **The agent draws $50** | She sets limits and delegates **once** with World Agent Pass. Her cash-flow agent requests an offer: the Underwriter proposes, the Critic checks, code clamps, and the offer is signed. `drawByMandate` lands, and $50 test USDC arrives. | "She delegates once and never taps again. The agent proposes, the contract decides: caps are enforced onchain." |
| 4 | 1:10–1:30 | **A customer pays: 92/8** | The customer pays the shop's QR in test USDC. 92% goes to the merchant and 8% repays the advance; the balance owed falls. | "Repayment lives inside the payment. A slow day just repays less, as long as she meets the 1% weekly minimum." |
| 5 | 1:30–1:50 | **The proof center** | Laptop: `/proof`. The draw's onchain ZK proof, decoded, with the tx link and the AI decision behind it. | "Don't trust us, verify it: the proof is onchain and decoded here, and so is the AI's reasoning." |
| 6 | 1:50–2:35 | **The simulator: a defaulter** | Laptop: `/simulator`, `defaulter` run. The shop goes quiet → behind the minimum, so the **late fee** accrues to the reserve → 30 days → **write-off** → **DRIP absorbs** the loss and senior is untouched → a DRIP holder sells, and the **Risk agent** lowers caps (TWAP plus write-offs and repayment pace) → the **World ID ban** → the same human tries a new shop and is **refused at the World ID step**. | "**This is our public devnet, with real proofs, real AI and real transactions, but time is fast-forwarded.** World runs in test mode here so the run is unattended. The ban lives in our offer signer as a private HMAC list. Nothing about the person goes onchain." |
| 7 | 2:35–3:00 | **The lenders** | `/earn`: the fee split 40% senior, 30% DRIP, 20% reserve, 10% protocol. Then `/dripcoin/trade`: a DRIP ⇄ USDC swap on Uniswap v4, with the RiskHook's 0.3% fee going to the reserve. | "Senior earns most and loses last. DRIP takes first loss for 30%. **This is Sepolia testnet money**, and the DRIP pool is seeded by us, so its price is an early warning, not an oracle." Close: "Private credit for the smallest shops: repayment inside the payment, agents that propose, and a contract that decides." |

## Honest lines (say them, don't skip them)

- "The seller portal and attestor are a demo stand-in. The real Reclaim zkTLS path is built and tested."
- "Everything is on testnet: Sepolia and a MockUSDC."
- "The simulator runs on our public devnet with time fast-forwarded. The proofs, the AI calls and the transactions are real."
- "World ID and Agent Pass are real on the hosted app; the simulator uses World's test mode."
- "Checkout is USDC only. Paying in any token via Uniswap is roadmap."
- If asked: "This is unaudited hackathon code."

## Fallbacks for each live dependency

| Dependency | If it fails | Fallback |
|---|---|---|
| World IDKit / Agent Pass (real) | World App or verify fails on stage | Switch to World test mode (`WORLD_MOCK=1` on the agents service, app built with `NEXT_PUBLIC_WORLD_MODE=mock`). **Say "test mode" out loud.** Or show scene 2 through the simulator, which already uses test mode. |
| Reclaim zkTLS | n/a in the live demo | The live demo already uses the mock attestor (`ISSUER_MOCK=1`). |
| Bedrock judge models | Timeout or access error | `LLM_PROVIDER=anthropic` (Claude). The Risk agent has its own deterministic −25% fallback. |
| Sepolia RPC | Errors or "block not found" | Use the Tenderly gateway. Otherwise run scenes 3–6 in the simulator. |
| Anon-RPC (Nox) | Slow or unavailable | The app falls back to direct reads when strict mode is off (the default). **Say so out loud**; don't claim network privacy that isn't running. |
| Simulator run | Fails mid-way | Rerun it (it restores the caps and pool price for the next judge), or show a recorded run. |
| EC2 box | Down | `./deploy/compose.sh restart <service>`, or the laptop stack ([`docs/LOCAL.md`](../LOCAL.md)). |
| Venue Wi-Fi | Down | Phone on mobile data, or the laptop stack. Last resort: the recorded video. |
| Relayer gas | Out of Sepolia ETH | Top up the relayer and risk manager before judging. |

Before the demo, run `uv run python scripts/smoke_sepolia.py` in `agents/` (read-only). Expect `SMOKE PASS`.
