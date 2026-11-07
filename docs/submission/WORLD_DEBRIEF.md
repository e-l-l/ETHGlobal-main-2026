# World integration debrief

Tracks: **World ID Agent Pass** and **Best Use of IDKit**.

Status: **real World IDKit and Agent Pass are wired live** on the hosted app since Fri 6 Nov 21:00 IST (`WORLD_MOCK=0`; the app is built with `NEXT_PUBLIC_WORLD_MODE=real`). Test mode remains available as a fallback, and the simulator uses it for unattended runs. At this event, World's Agent Pass proofs use fake identities (per World's prize page), and IDKit testing uses World's staging environment and simulator. The integration debrief World asks for (time to first success, friction, missing docs, the one biggest improvement) is the table at the end of this file.

Code: [`agents/src/mra_agents/world.py`](../../agents/src/mra_agents/world.py) (backend validation and the attester), [`contracts/src/AdvanceBook.sol` L405-L496](../../contracts/src/AdvanceBook.sol#L405-L496) (`registerMandate`, `drawByMandate`, `revokeMandate`, `setAgentPassAttester`).

## The design rule: World sits at human moments only

Credit is fully automatic: agents underwrite, code clamps, and the contract decides. World is used only where the question really is about a human:

1. **World ID first (IDKit):** before any business step, the merchant proves they are a unique human. A banned human, or one with an open advance on another shop, gets a stop screen. Otherwise they get a sealed eligibility ticket, and the shop they create is bound to that human with it.
2. **Agent Pass:** a human delegates to their managed agent, **once**.
3. **IDKit:** only the same human can recover their credentials on a new phone.

**The ban.** If an advance is written off, the human behind the shop is banned. The ban is enforced by our offer signer from a private HMAC list (we keep `HMAC(server key, nullifier, action)`, never the raw nullifier). Nothing about the person goes onchain. The roadmap is a ZK "not in the banned set" proof, so even we can't link a human's shops.

World plays no part in business verification or in the credit decision itself; it only gates *who* may ask for credit.

## 1. Agent Pass: delegating once to the managed cash-flow agent

**Protected action:** registering a *mandate* that lets our hosted, per-merchant cash-flow agent draw advances for that merchant within limits:

- max per draw
- max per period
- the period length
- an expiry (at most 180 days)

**The journey:**

1. The merchant sets the limits on their phone.
2. The app runs World ID OIDC (`auth.world.org`, authorization code + PKCE) with `nonce = agent_pass_nonce(agentKey, limitsHash, attestationNonce)`. The human's approval is bound to **this agent key and these limits**.
3. **Backend validation (server side):**
   - We exchange the code at the discovered token endpoint.
   - We verify the RS256 `id_token` against World's JWKS: `iss`, `aud`, `exp`, `nonce`, and freshness (`auth_time` or `iat`).
   - We never store `sub`.
4. Only then does our attester key sign an EIP-712 `AgentPassAttestation(agentKey, limitsHash, nonce, expiry)`.
5. `AdvanceBook.registerMandate` checks:
   - the attestation, with a single-use nonce
   - the shop owner's signature
   - a ZK credential: a Business Pass for the first advance, a Standing Pass after that
6. **After that, nobody taps.** The agent requests offers, and the relayer calls `drawByMandate`. The contract enforces the mandate limits on every draw.

**Denied or expired path:** the backend returns `denied` or `expired`, so no attestation is signed. Then `registerMandate` can't succeed, there is **no mandate and no draws**. The mock covers both outcomes (`{"mock": "approve" | "deny" | "expire"}`). The merchant or the agent can revoke a mandate at any time.

**What the attester can't do:** it can't draw. A mandate also needs the shop owner's signature and a valid ZK credential ([`contracts/SPEC.md`](../../contracts/SPEC.md), "Trust assumptions").

## 2. IDKit: credential recovery on a new phone

The Business Pass and Standing Pass secrets live only on the merchant's device. A lost phone would mean a lost credit history. Recovery works like this:

- The app keeps a **client-side-encrypted backup**.
- To fetch it, the merchant proves Proof of Human with IDKit for the action `credential-recovery-v1`.
- The backend verifies the proof with `POST /api/v4/verify/{app_id}`, which must return `success: true`.
- The backup is keyed by `HMAC(nullifier, action)`. We never store the raw nullifier.
- Same human means the same nullifier for this app and action, so the same backup comes back.

### Why Proof of Human is the minimum sufficient credential

The only question here is: "Is this the same unique human who stored this backup?"

- The nullifier answers it exactly. It is stable per human, app and action, and reveals nothing else.
- Age, nationality, a document, a phone number or a name would add data we don't need, and each of those could link the merchant to their business.
- Anything weaker, such as an email or a device ID, can be lost or shared, and would let someone else claim the backup.

So Proof of Human is the least we can ask for that still works.

## Why we do NOT use World ID for business verification

- The business is proven by **zkTLS from a logged-in seller account** on a platform that has already KYC'd its owner. That is the Business Pass (Reclaim, issuer, `BusinessPassRegistry`).
- Uniqueness is **one pass per business** (a peppered business nullifier), not one per human. A one-per-human rule would wrongly block people who run several businesses.
- Keeping World out of the credit decision also means World learns only "a human delegated to an agent or recovered credentials in this app". It never learns which business or what was borrowed ([`docs/privacy-architecture.md`](../../docs/privacy-architecture.md) section 6).

## Integration debrief

| Item | Notes |
|---|---|
| Time to first success (mock) | Under 14 hours. Hacking opened Thu 5 Nov 21:00 IST; the mock Agent Pass and IDKit paths were in `main` with their tests by Fri 6 Nov 11:13 IST (`agents/src/mra_agents/world.py`, `agents/tests/test_world.py`). |
| Time to first success (real) | Backend real paths (OIDC code and device flows checked against World's JWKS, IDKit 4 `/api/v4/verify`) passed 27 tests against fake HTTP at Fri 12:05 IST, about 15 hours in. The hosted app switched to real mode at Fri 21:00 IST, about 24 hours in. Overnight testing of the World prompts on laptops with the World ID Simulator produced two fixes (Sat 01:33 and 02:35 IST, see Friction). A full phone run with the mandate landing onchain in real mode was not confirmed when this file was frozen (Sat 04:30 IST), so the checklist box below stays open. Note that at this event World mocks Agent Pass proofs with fake identities, so "real mode" means a real OIDC round trip and a real JWKS check, not a real human. |
| Agent Pass test identities | Test mode uses fake identities ([`docs/research.md`](../../docs/research.md), open questions). The hosted app now runs real mode; the simulator keeps test mode so judges can run it unattended. |
| Friction | (1) The design changed mid-build from "approve every draw" to "delegate once", and we had to decide where the approval binds; we chose the OIDC `nonce`. (2) A hosted agent never holds the user's session, so the redirect flow did not fit; we used device authorization (RFC 8628, which `auth.world.org` advertises) from the backend, with the `device_code` kept server-side and polled there. (3) "Open in World App" is a phone deep link; on a laptop or in the World ID Simulator there was nothing to tap. We added a Copy link button next to it. (4) Our own test mode used one shared fake identity, so every browser was the same human and the second merchant was stopped with `human_has_open_advance`. Now each browser profile gets its own test identity. (5) IDKit 4 returns the nullifier as 0x-hex per the docs, while the idkit-core 4.x types say decimal; we accept both, strictly. (6) IDKit 4 verify: the docs say `rp_id`, the older `app_id` still works; we had to pick one and keep the fallback. |
| Missing docs | Whether the OIDC device flow is the intended Agent Pass integration for a hosted agent, and how to bind an approval to an agent key and a limits hash (we overload `nonce`). The nullifier encoding, hex in the verify docs versus decimal in the idkit-core 4.x types. When `rp_context` signing and `rp_id` are required versus `app_id`. What identity the event's mocked Agent Pass proofs carry (the same fake human every time, or distinct ones), which decides whether two judges testing in a row collide on the one-open-advance rule. |
| Most impactful improvement | A first-class "bind this approval to this payload hash" parameter for Agent Pass, echoed as a claim in the `id_token`, so teams don't have to overload `nonce`. Second: one nullifier encoding across the docs and idkit-core. |
| One project, both World tracks? | Not stated on World's prize page and not confirmed with World. We entered both. The two integrations are separate product moments (Agent Pass for the mandate, IDKit for eligibility and recovery), so either stands on its own if only one can be awarded. |

## Checklist (from docs/hackathon.md, adjusted for the current design)

- [ ] Full journey from request to protected action (the mandate registered onchain) in real mode. Real mode is live on the hosted app; a full phone run was not confirmed before this file was frozen, so this box stays open.
- [x] Denied path that leads to no mandate and no draws (test mode covers deny and expire).
- [x] Server-side validation (the `id_token` JWKS check, and the IDKit verify call). Implemented. 11 tests in `agents/tests/test_world.py` run the real code paths against fake HTTP, and the hosted app now calls live World.
- [x] Integration debrief: this file
- [x] Minimum-sufficient-credential reasoning (above)

