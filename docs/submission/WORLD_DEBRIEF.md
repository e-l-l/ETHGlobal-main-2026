# World integration debrief

Tracks: **World ID Agent Pass** and **Best Use of IDKit**.

Status: **real World IDKit and Agent Pass are wired live** on the hosted app (`WORLD_MOCK=0`; the app is built with `NEXT_PUBLIC_WORLD_MODE=real`). Test mode remains available as a fallback, and the simulator uses it for unattended runs. The first real end-to-end phone test is under way at the time of writing.

> **`TODO(team): paste time-to-first-success and result of the first real run`** (date/time, elapsed time from first attempt, pass/fail, anything that broke).

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
| Time to first success (mock) | Backend Agent Pass and IDKit paths, with tests, were built during the hackathon. `TODO(team): hours from start to the first passing mock flow.` |
| Time to first success (real) | `TODO(team): paste time-to-first-success and result of the first real run` |
| Agent Pass test identities | Test mode uses fake identities ([`docs/research.md`](../../docs/research.md), open questions). The hosted app now runs real mode; the simulator keeps test mode so judges can run it unattended. |
| Friction | `TODO(team): update after the real run.` Known so far: the design changed mid-build from "approve every draw" to "delegate once", and we had to decide where the approval binds (we chose the OIDC `nonce`). |
| Missing docs | `TODO(team): update after the real run.` Open so far: whether the OIDC flow is the intended Agent Pass integration for a hosted agent, and how to bind an approval to an agent key and limits. |
| Most impactful improvement | `TODO(team): confirm.` Our candidate: a first-class "bind this approval to this payload hash" parameter for Agent Pass, so teams don't have to overload `nonce`. |
| One project, both World tracks? | `TODO(team): ask World on site` ([`docs/hackathon.md`](../../docs/hackathon.md)). |

## Checklist (from docs/hackathon.md, adjusted for the current design)

- [ ] Full journey from request to protected action (the mandate registered onchain) in real mode. `TODO(team): tick after the first real run.`
- [x] Denied path that leads to no mandate and no draws (test mode covers deny and expire).
- [x] Server-side validation (the `id_token` JWKS check, and the IDKit verify call). Implemented. 11 tests in `agents/tests/test_world.py` run the real code paths against fake HTTP, and the hosted app now calls live World.
- [ ] Integration debrief: this file, with the TODOs filled in
- [x] Minimum-sufficient-credential reasoning (above)

