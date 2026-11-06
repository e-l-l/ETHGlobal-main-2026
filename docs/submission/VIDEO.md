# Video recording plan (target 3:00)

**Rules:** 2–4 minutes (keep it ≤ 3:00 so it also fits CROPS), 720p or better (record at 1080p), **a human voice**, **no speed-up**. Cutting between scenes is fine.

Live stack used in every scene:

| What | URL |
|---|---|
| Merchant / lender app | https://app.65-1-36-70.sslip.io |
| Demo seller portal (zkTLS target) | https://portal.65-1-36-70.sslip.io |
| Agents API | https://api.65-1-36-70.sslip.io |
| Public devnet RPC (default scene) | https://rpc.65-1-36-70.sslip.io |

## Before you hit record

- [ ] **Phone:** Chrome, open the app, screen recording on, Do Not Disturb, volume up so the voice line is audible.
- [ ] **Laptop:** 1080p screen recording (QuickTime or OBS) with a good mic. Close tabs that show secrets (Stripe, AWS, `.env` files).
- [ ] **Two browser profiles:** one merchant, one customer/judge, so their wallets stay separate.
- [ ] **Reset the devnet** before the default scene:
  ```bash
  ssh -i ~/.ssh/mra-demo ubuntu@65.1.36.70 '~/mra/deploy/devnet.sh reset'
  ```
- [ ] **Do one dry run of every scene.** Reads go through the Anon-RPC mixnet and can take 2–20 s, so let pages finish loading before you narrate.

## Scenes

| # | Time | Scene | Where | What to say | Ready? |
|---|---|---|---|---|---|
| 1 | 0:00–0:20 | **The problem** | A title card or a kiosk photo | "A shop owner in Buenos Aires needs dollars for stock today. The sales that pay for it come next week. Loan apps want her contacts." | ✅ |
| 2 | 0:20–0:50 | **Business Pass** | Phone: `/onboarding/prove` → portal login → verifying → pass | "This fictional portal and attestor are simulated. The real Reclaim path is built and tested; the issuer sees the account ID transiently." | ⏳ waits on the burner wallet |
| 3 | 0:50–1:15 | **Delegate once** | `/agent/setup` → approve | "She sets limits and delegates in the World test-mode stub; real OIDC and IDKit are built and tested, pending keys." | ⏳ waits on the burner wallet |
| 4 | 1:15–1:35 | **Automatic advance** | Home → "advance arrived" | "Her agent draws $50 automatically. Our AI underwriter saw only numbers and hashed payers." | ⏳ waits on the burner wallet |
| 5 | 1:35–2:00 | **A live sale + voice** ⭐ | Customer profile scans the merchant's QR → pays → the merchant's phone speaks | Let the phone say *"You received 10 dollars, 1 went to your advance."* Then: "While an advance is active, a slice of each sale repays it." | ⏳ waits on the burner wallet |
| 6 | 2:00–2:15 | **Wash trader caught** | `/risk`, or the agents log showing the rejected `wash-trader` shop (already seeded on Sepolia) | "A fake shop paying itself in a circle. This seeded direct funding pattern is caught; other wash patterns can evade checks." | ✅ |
| 7 | 2:15–2:45 | **Default + market** ⭐ | Laptop terminal: `~/mra/deploy/devnet.sh scene --execute`, next to `/junior` and `/risk` | "This seeded devnet scene moves time forward 31 days. Junior takes losses first; a separate scripted sell moves the pool price. The write-off alone does not move market price. The Risk agent may then cut limits." | ✅ **record first** |
| 8 | 2:45–3:00 | **What the world sees** | `/world-view`, `/explorer`, DevTools console showing `nox-worker ready` | "Owner and payout addresses, payer, shop, amounts, tier and advance-to-commitment claims are public. A later proof hides the leaf; metadata may correlate activity. Configured reads use Anon-RPC." | ✅ |

## Recording order

**Record now:**
1. **Scene 7.** Run the scene and narrate the 8 steps it prints. For another take, run `devnet.sh reset` first.
2. **Scene 8.** `/world-view` and `/explorer`, with DevTools → Console open so the Nox mixnet lines are visible.
3. **Scenes 1 and 6.**
4. **B-roll:** `/protocol` (live Sepolia numbers), `/earn`, `/junior`.

**After the burner wallet and faucet are live:** scenes 2–5, the merchant journey.

## Lines to keep honest

- "zkTLS runs in mock mode today; the real Reclaim path is built and tested."
- "World Agent Pass is in test mode."
- "The seeded default scene runs on our public devnet with time advanced 31 days. A separate scripted sale moves the pool price."

## Fallbacks

| If… | Then |
|---|---|
| Anon-RPC is slow or won't connect | Wait for "Private connection ready"; otherwise record that screen in a second take. Never fake it. |
| A Sepolia transaction hangs | Cut, wait for the receipt, and resume from the next screen. |
| The default scene fails mid-way | `devnet.sh reset`, then `devnet.sh scene --execute --step <name>` to rerun one step at a time. |
| The voice line doesn't play | Tap the toggle or "Test voice" on Home once (the browser needs a tap first), then pay again. |

## After recording

- [ ] Check: 720p or better, voice clear, nothing sped up, ≤ 3:00.
- [ ] No secrets on screen: `.env` files, private keys, Stripe, AWS.
- [ ] Upload unlisted on YouTube. Put the link in the ETHGlobal submission and in [README.md](README.md).
