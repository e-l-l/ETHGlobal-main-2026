# Frontend handoff

## New fee model

Screen-by-screen change list: [FRONTEND-CHANGES.md](FRONTEND-CHANGES.md).

Use the current SDK data methods rather than `AdvanceOpened.totalOwed` as a live balance. `totalOwed` is the contract’s maximum debt at the signed fee cap. The onchain reader resolves live debt through `AdvanceBook.owedOf` and calculates accrued fee from draw time, original principal, signed terms, and fee already paid.

- Merchant advance screen: call `mra.merchant.advance()` and render `AdvanceVM.owedNow` as current debt, `feeSoFar` as accrued fee to date, and `left` as the amount still owed. `total` remains temporarily available as an alias for `owedNow` during migration.
- Fee checkpoints: use `feeIfRepaidIn1Week`, `feeIfRepaidIn2Weeks`, `feeIfRepaidIn4Weeks`, and `feeIfRepaidIn6Weeks`. These are fee amounts in USD based on original principal and default terms (50 bps/week, maximum 300 bps). `maxFeeBps` is the signed fee cap in basis points.
- Cost disclosure: `annualizedCostPercent` is the simple annualized maximum (about 26% at the current terms); disclose that this is not an APR computed from actual sale cash flows. Fee accrues on original principal, is collected before principal, stops after full principal payoff, and early payoff saves fee.
- Offer terms from `mra.agent.approveView(...)` / API types contain `fee_rate_bps_per_week: 50` and `fee_cap_bps: 300`; the pilot holdback is 800 bps (8%). The exact merchant copy is: “Fee 0.5% per week while you owe, never more than 3%.”
- **Late fee (the fee doubles while behind).** If the merchant is more than 7 days without meeting the 1% minimum repayment, an extra late fee accrues at another 0.5% a week (1% a week total), capped at another 3% (6% total). It stops as soon as they catch up; what accrued stays owed and is paid fee-first. 100% of it goes to the safety reserve. On-time merchants never see it. `AdvanceVM` fields:
  - `lateFee`: late fee accrued so far in USD (paid + unpaid). It is already included in `owedNow` and `left`, and it is **not** part of `feeSoFar`.
  - `lateFeePaid`: the part already paid.
  - `isBehind`: true while the late fee is accruing. Show a caution state.
  - `lateFeeRateBpsPerWeek` (50) and `maxLateFeeBps` (300): contract constants, not part of the signed offer.
  - `feeRule`: the exact merchant copy below. Show it wherever the fee terms appear (offer, advance screen, week screen).
  - `lateFeeHint`: a one-line status, or `null` when the merchant is on time and was never charged one. Render it as-is when non-null.

  Exact merchant copy: **“Paying on time keeps your fee at 0.5% a week, max 3%. If you fall behind the minimum, the fee doubles to 1% a week (max 6% total) until you catch up; the extra goes to the safety reserve.”**

  Contract views: `AdvanceBook.lateFeeOf(id)`, `AdvanceBook.isBehind(id)`, `getAdvance(id).lateSecs` / `.lateFeePaid`. `owedOf(id)` includes the unpaid late fee. Event: `LateFeePaid(advanceId, amount)`, emitted next to `RepaymentSplit` when a repayment pays late fee. `RepaymentSplit.reserveFee` stays the reserve's 20% share of the normal fee only. Agents API `AdvanceState` adds `late_fee`, `late_fee_paid`, `late_secs` and `is_behind`.
- Lender fee waterfall: call `mra.lender.earn()` and render its `feeSplit` (40% senior / 30% junior DRIP / 20% reserve / 10% protocol). `waterfall` is the separate loss-order view. For a $100 principal repaid in four weeks, the $2 collected fee pays $0.80/$0.60/$0.40/$0.20 respectively.
- Junior asset naming in new UI should be **DripCoin (DRIP)**. This is the junior vault share token; it takes losses first. Tier caps are $50/$100/$200/$300.

SDK types live in `packages/sdk/src/viewmodels.ts`; live reads are in `packages/sdk/src/chain/chain.ts` and `packages/sdk/src/domains/merchant.ts`; mock examples are in `packages/sdk/src/mock/shop.ts` and `packages/sdk/src/mock/lend.ts`.

## World (real)

The agents API owns World OIDC device authorization and IDKit proof verification. The browser never receives the OIDC client secret, device code, RP signing key, or raw IDKit nullifier. Use the SDK adapters and recovery domain; do not implement the OIDC token exchange or World proof verification in the screen.

### Agent Pass

Configure `worldDeviceAgentPass` on the browser MRA client. Give it an `AgentsApi`, read the agent `manageToken` from the local credential vault, and use its `show` callback to render the approval UI:

```ts
const agentPass = worldDeviceAgentPass({
  api: new AgentsApi({ baseUrl: apiUrl }),
  manageToken: async (agentId) => {
    const session = await vault.get("session");
    if (session?.agentId !== agentId || !session.manageToken) throw new Error("Agent session missing");
    return session.manageToken;
  },
  show: (prompt) => setWorldPrompt(prompt),
});
```

The adapter starts `POST /agents/{id}/agent-pass/device` using the manage token, calls `show`, and polls the non-consuming device status route at the server supplied interval. The callback has these camelCase fields (the API wire response uses the snake_case names):

| UI field | API field | Use |
|---|---|---|
| `verificationUri` | `verification_uri` | Link the user can open |
| `verificationUriComplete` | `verification_uri_complete` | QR value; this includes World's user code when provided |
| `userCode` | `user_code` | Display prominently and allow the user to enter it in World App |
| `expiresIn` | `expires_in` | Countdown duration in seconds |
| `interval` | `interval` | Poll interval in seconds; the SDK observes it |
| `expiresAt` | `expires_at` | Absolute Unix-second deadline for a clock display |

Keep the waiting view visible while `agent.setup(limits, { onStep })` reports `awaiting_agent_pass`. The SDK adapter polls until the backend reports the device request is ready, then the SDK submits the session to `/agent-pass` to record the outcome. At the screen layer, handle the outcome as follows:

- **Pending:** keep showing the QR/link, user code, and countdown. The backend does not deny the agent while the user has not answered.
- **Approved:** `/agent-pass` returns `approved: true`; `agent.setup` continues the private credential proof, owner signature, mandate registration, and activation. Route to the active agent screen when `result.status === "active"`.
- **Denied:** `/agent-pass` returns `approved: false, reason: "denied"`; no attestation or mandate is created. Route to the existing denied screen.
- **Expired:** `/agent-pass` returns `approved: false, reason: "expired"`; no attestation or mandate is created. Route to the existing denied screen with an expired explanation.

The adapter's internal non-consuming GET reports `pending` or `ready`; the final POST supplies the approved, denied, or expired outcome. `agent.setup` resolves to `active`, `denied`, or `expired`, so the screen does not need to poll or call the backend routes itself.

### Credential recovery with IDKit v4

Configure `idkitV4` with the agents API. Its `verify()` first fetches a fresh, signed request config from `POST /recovery/rp-context`, then passes that config to the screen's IDKit runner:

```ts
const idkit = idkitV4({
  api: new AgentsApi({ baseUrl: apiUrl }),
  run: async (cfg) => {
    const request = await IDKit.request({
      app_id: cfg.app_id,
      action: cfg.action,
      rp_context: cfg.rp_context,
      environment: cfg.environment,
      allow_legacy_proofs: false,
    }).preset(proofOfHuman({}));
    const completion = await request.pollUntilCompletion({ timeout: 120_000 });
    if (!completion.success) throw new Error(`World verification failed: ${completion.error}`);
    return completion.result;
  },
});
```

The config includes `app_id`, `action`, `environment`, and the short-lived `rp_context` (`rp_id`, `nonce`, `created_at`, `expires_at`, `signature`). Do not cache it; request a new one for each verification. `recovery.backup(passphrase)` runs IDKit verification if needed, encrypts the current vault export with the passphrase, and uploads only ciphertext through `PUT /recovery/backup`. Require at least 8 passphrase characters and tell the user it cannot be reset. On a new device, `recovery.restore(passphrase)` verifies with IDKit, fetches the same human's ciphertext, decrypts locally, and imports the vault. The recovery token stays in SDK memory and is sent only as an authorization header.

### World ID for borrowers: World ID FIRST, ban on default, gradual unlock

**World ID is the first onboarding step, before any business step.** A banned person, or someone with an open
advance on another shop, is stopped on the World ID screen and never reaches prove business, Business Pass or
Create shop. The backend keeps only an HMAC of World's nullifier and never returns it, or the HMAC. With
`WORLD_BINDING_REQUIRED=1` (the default) an unbound shop still gets no offer: the offer signer is the backstop.

**Screen order (new)**

| # | Route | Screen | SDK call | Next |
|---|---|---|---|---|
| 1 | `/onboarding` | Welcome | none (static copy) | 2 |
| 2 | `/onboarding/world` | **World ID** ("Prove you're a unique person") | `mra.onboarding.checkHuman({ onStep })` | eligible → 3; not eligible → 2a |
| 2a | `/onboarding/world/stopped?reason=` | **Stop screen** | show `result.message` (no business steps, no retry button for the two red lines) | none |
| 3 | `/onboarding/prove` | Prove business (portal / zkTLS, M02) | `mra.onboarding.startProof(...)`, or `proveBusiness({ onRequestUrl, onStep })` | 4 |
| 3b | `/onboarding/verifying` | Verifying (M03) | `mra.onboarding.finishProof(sessionId, { onStep })` | 4 or M05 |
| 4 | `/onboarding/pass` | Business Pass (M04) | `mra.onboarding.pass()` | 5 |
| 5 | `/onboarding/shop` | Create shop (M06) | `mra.onboarding.createShop(name)`: binds the World ID automatically, see `shop.human` | 6 |
| 6 | `/agent/...` | Agent setup | unchanged | |

Routes are suggestions; only the order matters. The World ID screen needs the device wallet (the burner, created on
first use), not a shop.

**Screen 2, World ID.** Copy: "World ID proves you're a real, unique person. We never learn who you are and nothing
goes onchain." Button: "Verify with World". Call:

```ts
const r = await mra.onboarding.checkHuman({ onStep: (s) => setStep(s) }); // verifying_human → checking → eligible | stopped
if (r.eligible) router.push("/onboarding/prove");                       // ticket saved on the device (30 min, one use)
else if (r.reason === "human_banned" || r.reason === "human_has_open_advance") router.push(`/onboarding/world/stopped?reason=${r.reason}`);
else showRetry(r.message);                                              // verification_failed, unknown_or_used_nonce, rate_limited...
```

**Screen 2a, stop screen** (exact copy, also what `r.message` / `reasonMessage(reason)` returns):

- `human_banned`: **"This World ID can't borrow on DripMoni after a default."**
- `human_has_open_advance`: **"Repay your open advance first."** (Link to the open advance if the device has it.)

**Screen 5, Create shop.** `createShop(name)` registers the shop, then binds it to the human from screen 2 with the
stored ticket (no second World scan; the burner signs the owner message silently) and clears the ticket. Read
`shop.human`:

- `{ verified: true }`: continue to agent setup.
- `{ verified: false, needsWorldId: true, reason }` (`ticket_expired` after 30 min, `no_ticket`, `ticket_used`,
  `ticket_owner_mismatch`): send the merchant back to the World ID screen, call `checkHuman()` again, then
  `mra.onboarding.bindHumanTicket()`. The shop already exists; don't create another.
- `{ verified: false, needsWorldId: false, reason }` (network, 429, 5xx): retry `bindHumanTicket()`; the ticket is kept.

**Mock mode:** `checkHuman()` is eligible by default and stores a fake ticket; `createShop()` then returns
`human: { verified: true }`. Show the stop screens with `?mockWorld=banned` or `?mockWorld=open_advance` in the page
URL, or `createMRA({ mode: "mock", mockWorld: "banned" })`.

**Other SDK calls (unchanged)**

| Call | Returns |
|---|---|
| `mra.onboarding.checkHuman({ onStep })` | `{ eligible: true, expiresAt, source }` or `{ eligible: false, reason, message, source }` |
| `mra.onboarding.bindHumanTicket()` | `{ verified: true }` or `{ verified: false, needsWorldId, reason }`. Never throws. |
| `mra.onboarding.verifyHuman({ onStep })` | Legacy / re-verify an existing shop with a fresh scan: `{ verified: true }` or `{ verified: false, reason }`. |
| `mra.onboarding.humanStatus({ tier? })` | `{ humanVerified, banned, unlock, source }`. `unlock`: `{ tier, limit, availableNow, unlockedPct, goodWeeks, frozen, nextUnlockAt, steps, reasons }` |
| `mra.merchant.home()`, `mra.merchant.advance()`, `mra.agent.approveView()` | also carry `humanVerified`, `banned`, `limit`, `availableNow`, `nextUnlockAt` (unix s or null), `unlockSteps: {pct, amount, unlocked}[]`. Mock: verified, not banned, limit 100, available 50, next unlock in 7 days, steps 50%=$50 ✓ / 75%=$50 / 100%=$100. |
| `reasonMessage(code)` | merchant copy for every red-line code, including the three below |

`checkHuman` and `verifyHuman` run IDKit with `idkitV4` for the purpose `"borrower"` (it fetches
`POST /world/borrower/rp-context`; same `run` callback as recovery).

**HTTP** (for reference; the SDK does this)

- `POST /world/borrower/rp-context`: IDKit 4 config for `WORLD_BORROWER_ACTION` (mock: `{"mock": true, "action"}`).
- `POST /world/borrower/check`, body `{"idkit": <IDKit result>, "owner": "<burner address>"}`, no auth →
  `{"eligible": true, "ticket": "<opaque>", "expires_at": <unix s>}` or `{"eligible": false, "reason":
  "human_banned" | "human_has_open_advance"}` (both 200). Errors: 400 `verification_failed` / `wrong_action` /
  `unknown_or_used_nonce` / `invalid_request`, 429.
- `POST /shops/{shopId}/human`, header `Authorization: Owner <issuedAt>:<sig>`, body `{"ticket": "<from check>"}` or
  `{"idkit": <IDKit result>}` (exactly one) → `{"verified": true}`. Errors: 401 `unauthorized`, 404 `not_found`,
  400 `verification_failed` / `wrong_action` / `unknown_or_used_nonce` / `ticket_expired` / `ticket_invalid`,
  403 `ticket_owner_mismatch` (the shop's onchain owner is not the wallet the check was for), 409
  `shop_bound_to_other_human` / `ticket_used` (the ticket already bound another shop; the same shop again is a
  no-op success).
- `GET /shops/{shopId}/human?tier=` → `{"verified"}`; with the owner header also `{"banned", "unlock"}`.
- Owner message: `"DripMoni shop owner\nshop: <shopId lowercase>\nchain: <chainId>\nissued: <unix s>"`, valid ±10 min.

**Red-line codes on `POST /offers`** (`result: "rejected"`, no model was called), the backstop:
`human_not_verified` → send to the World ID screen, then `bindHumanTicket()`; `human_banned` → the banned stop
screen; `human_has_open_advance` → "Repay your open advance first." A clamp change can read "Gradual unlock: capped
at $50 of the $100 limit".

**Other screen states**

1. **Banned after onboarding** (`banned === true` on home, or an offer rejected with `human_banned`): "This World ID
   can't borrow on DripMoni after a default." No retry button; the shop can still sell.
2. **Unlock progress on home and advance:** "Available now $`availableNow` of $`limit`". A 3-step bar from
   `unlockSteps` (50% / 75% / 100%, ticked when `unlocked`). If `nextUnlockAt`: "Next unlock on `<date>` if you keep
   up the weekly minimum (1% plus fee every 7 days)." If frozen (`unlock.frozen` from `humanStatus`): "Unlock paused:
   the weekly minimum was missed."

### Environment and testing

For the app build, set:

- `NEXT_PUBLIC_WORLD_MODE=real` to enable real World adapters (`mock` is the default and keeps existing e2e/demo behavior).
- `NEXT_PUBLIC_MRA_MODE=sepolia` (or `local`) and `NEXT_PUBLIC_API_URL=https://<agents-api-origin>`.
- `NEXT_PUBLIC_ISSUER_URL` for live onboarding; World flows themselves use the agents API.

On the agents service, set `WORLD_MOCK=0`, `WORLD_AGENT_PASS_CLIENT_ID`, `WORLD_AGENT_PASS_CLIENT_SECRET`, `WORLD_AGENT_PASS_CLIENT_AUTH=client_secret_basic`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, and `WORLD_RECOVERY_ACTION=credential-recovery-v1`. Borrower binding: `WORLD_BORROWER_ACTION` (defaults to the recovery action) and `WORLD_BINDING_REQUIRED` (default 1). `WORLD_AGENT_PASS_ISSUER` defaults to `https://auth.world.org`; `WORLD_AGENT_PASS_REDIRECT_URI` remains available for the alternate redirect flow. Set `CORS_ALLOW_ORIGINS` to the deployed app origin. These values are server environment variables; only public `NEXT_PUBLIC_*` values belong in the app build.

For production, set `WORLD_ENVIRONMENT=production` and use the production recovery action; complete verification in World App. For simulator testing, set `WORLD_ENVIRONMENT=staging`, create/select the matching staging action for the configured app, rebuild with `NEXT_PUBLIC_WORLD_MODE=real`, and scan the recovery QR using [World's simulator](https://simulator.worldcoin.org). The agents API pins the expected environment, so staging and production proofs cannot be mixed. Agent Pass still uses the configured OIDC issuer.

On a phone, open the agent approval screen, continue with World, scan `verificationUriComplete` (or open `verificationUri`), and approve or deny the request in World App. For recovery, back up with a passphrase, then restore on a second device after proving the same World identity and entering that passphrase.
