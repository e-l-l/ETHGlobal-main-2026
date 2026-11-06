# zkTLS spike: Business Pass verification (2026-11-05)

Goal: a merchant proves **"I control a real business account, active, revenue ≥ band"**, and we learn nothing else. It must also be **demo-able live, reliably**.

## Decision: Reclaim Protocol (with onchain verification on Sepolia)

| Criterion | Reclaim | vlayer | Notes |
|---|---|---|---|
| Who sees the merchant's data | Nobody in plaintext. The user's device runs TLS; the attestor sees ciphertext and reveals only the matched parts. | The server-side Web Prover API needs the request (with auth) sent to vlayer | Privacy is our core pitch, so Reclaim wins |
| Mobile, no extension | Yes: QR / link → phone flow, 2–30 s | Browser extension or server-side | Demo: a judge watches the phone |
| Onchain verification | ✅ **Verified live on Sepolia**: proxy `0xAe94FB09711e1c6B057853a515483792d8e474d0` → impl `0x1d0e…9634`, `verifyProof(...)` selector `0xa960e69e` present, owner `0xc157…06d5`, 1-day attestor epochs | ✅ RISC Zero verifier, about 300k gas | Both work; Reclaim is cheaper and simpler |
| Bind the proof to our credential | `setContext(address, message)`: we put the Business Pass commitment in `message` | Custom | Stops proof theft |
| SDK | `@reclaimprotocol/js-sdk` **5.8.3** (Oct 2026): `ReclaimProofRequest.init(appId, secret, providerId)`, `getRequestUrl()`, `startSession`, `verifyProof`, `transformForOnchain` | `@vlayer/sdk` | |
| Existing merchant providers | ❌ **None** among its 121 verified providers: no Stripe, Shopify, Mercado Pago, M-Pesa, Paystack (closest: "Fiverr Seller Info") | n/a | **We build a custom provider** (`build.reclaimprotocol.org`) |

## Design

```
App (phone) ── ReclaimProofRequest(providerId).setContext(registry, commitmentHex) ── QR ─► merchant logs into seller dashboard
           ◄─ proof (claimInfo{provider, parameters, context}, signedClaim{identifier, owner, ts, epoch, sigs})
App ── relayer ─► BusinessPassRegistry.issue(reclaimProof, worldIdProof, commitment)
                    1. Reclaim.verifyProof(proof)                       (attestor signatures, current epoch)
                    2. provider == our allowed provider hash            (pinned version)
                    3. context.contextMessage == commitment             (anti-theft binding)
                    4. used[identifier] == false                         (no replay)
                    5. (moved offchain) issuer signature over HMAC(pepper, account_id) business nullifier, unused (one pass per business)
                    6. insert commitment into Business Pass tree ─► BusinessPassIssued(index, root)
```

### Privacy rules for the provider (non-negotiable)

1. **Only "whoami" endpoints**, e.g. `/me` or `/account`. **No account ID in the URL.** `claimInfo.parameters` (URL and params) is public onchain.
2. **Reveal predicates, not values.** Use regex matches **without capture groups** where possible:
   - `"status":"active"` → yes/no
   - Revenue band by digit count: `"volume_90d":\s*\d{6,}` (≥ 100000 cents) proves "≥ $1,000" without revealing the amount
   - Account age: a `created` timestamp that's older than the cutoff
3. **Reveal the country only as an allowed-list match.** Sector is never revealed.
4. **Uniqueness is per business, via the issuer** (updated design). One combined proof (public predicates + the issuer-only `account_id`) goes **only to our issuer, never onchain**. The issuer computes `HMAC(pepper, account_id)`, discards the ID and signs `BusinessVerified(nullifier, commitment)`; the registry checks that signature.
   - Two separate proofs won't do: nothing would tie the predicates to the nullifier, so a single qualifying account could be paired with many throwaway accounts.
   - Roadmap: Reclaim's OPRF hashing, or an OPRF/TEE issuer, so even the issuer never sees the ID.

## Demo plan (two tracks, so the stage never depends on one thing)

| Track | What | Why |
|---|---|---|
| **A: "real platform"** | Custom provider on **Stripe** (a test-mode account we control; we create test charges to reach a revenue band) | Globally recognised; a real authenticated HTTPS dashboard. **Risk:** 2FA or bot checks in the login webview. Test early. |
| **B: guaranteed** | Custom provider on our own **demo seller portal** (a "Mercado Pago-style" dashboard we host, with a login) | 100% under our control; same cryptography. Shown honestly as a stand-in. |
| Backup | Pre-recorded proof JSON + replayed `issue()` tx | If the venue Wi-Fi breaks the live flow |

**What the judge sees:**
1. The merchant scans a QR and logs into the dashboard on the phone (~10 s).
2. The app shows "✅ Verified business · Argentina · revenue band 2 · 6+ months. **We learned nothing else.**"
3. The explorer shows only `BusinessPassIssued(index, root)`: no name, no amount, no ID.

## Needed from the team (accounts can't be created by the agent)

1. A **Reclaim developer account** at dev.reclaimprotocol.org: `APP_ID` and `APP_SECRET` into `agents/.env` with `scripts/secret_from_clipboard.py`.
2. Pick the track-A platform (default: **Stripe test mode**) and have someone create the account.
3. Then: build the custom providers (A and B), `BusinessPassRegistry` + Sepolia fork test against the real Reclaim verifier, and the app flow.
