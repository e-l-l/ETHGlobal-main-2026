# Reclaim custom provider for the demo seller portal (real mode)

This page explains how to make the issuer verify real Reclaim zkTLS proofs of `GET https://portal.<host>/api/me/summary`.

- **Source of truth for the match values:** `demo/portal/lib/reclaim.ts`.
- **Paste-ready JSON for your host:** `GET https://portal.<host>/api/reclaim/provider-config?band=2&mode=issuer`.
- **The issuer side:** `issuer/README.md`, section "Real flow".

> **Provenance.** On 2026-11-06, every docs.reclaimprotocol.org page under `/js-sdk/*` returned 404, and the dev portal is a single-page app, so the click paths below could not be checked against Reclaim's docs. Treat the button names as approximate.
>
> The **field values** are exact: the issuer checks them, and `npm run check:provider` tells you whether what you built is accepted. The SDK facts (`ReclaimProofRequest.init`, `setContext`, `setAppCallbackUrl(url, true)`, `getProviderVersion`, `verifyProof({providerId, providerVersion})`, `fetchStatusUrl`) were checked against `@reclaimprotocol/js-sdk` 5.8.3, from its README and `dist/index.d.ts` in `issuer/node_modules`.

## 0. Prerequisites

- **The portal is deployed** on public HTTPS, for example `https://portal.<host>`. Its `SESSION_SECRET` is set (32+ characters; `openssl rand -base64 48`).
  - `https://portal.<host>/api/health` returns `"session_secret_configured":true`.
  - Reclaim cannot reach localhost.
- **The issuer is reachable** on public HTTPS, for example `https://issuer.<host>`. This lets Reclaim POST proofs to it (callback delivery). Without it, the issuer falls back to polling Reclaim (poll delivery).

## 1. Create the Reclaim application → `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`

1. Go to https://dev.reclaimprotocol.org and sign in.
2. Click **Create new application** (or **New Application**). Give it a name ("Merchant Revenue Advance"), a short description and any logo, then create it.
3. Copy two values:
   - **Application ID** (`0x…`, public) → `RECLAIM_APP_ID`
   - **Application Secret** (`0x…`, **secret**, usually shown only once) → `RECLAIM_APP_SECRET`
   - Paste both into `issuer/.env` with the clipboard helper (`scripts/secret_from_clipboard.py`), never by echoing them.
   - `agents/.env` already holds a Reclaim app id and secret (both set). Reuse them if they belong to this application.

## 2. Create the custom HTTP provider (one per band)

Open the provider builder: **Explore / Providers → Create new provider** (the "DevTool"; Reclaim also calls it a "custom provider"). Choose an **HTTP** provider and fill it in:

| Field | Value |
|---|---|
| Name | `PagoSur demo: active, 6+ months, AR/NG/KE, band >= 2 (issuer only)` |
| Login URL | `https://portal.<host>/login` |
| Request URL | `https://portal.<host>/api/me/summary`. Exactly this: no query string (the portal rejects query strings), no dynamic parts. |
| Method | `GET` |
| Response type | JSON |
| Headers | None to add. The `dp_session` cookie comes from the logged-in webview and must stay a **private** header (the default). |
| Body | none |

### 2a. Response matches (all `regex`, none optional, none inverted)

Type the values exactly, including the trailing comma:

| # | Value (as typed) | Why |
|---|---|---|
| 1 | `"status":"active",` | account active |
| 2 | `"age_ok":true,` | open for 6+ months |
| 3 | `"country":"(?:AR\|NG\|KE)",` | allowed country (non-capturing group) |
| 4 | `"band_ge_2":true,` | revenue band ≥ 2. Use `band_ge_1` / `band_ge_3` for the other providers. |
| 5 | `"account_id":"(?<account_id>acc_[0-9a-f]{32})",` | **issuer-only** extraction. The named group becomes `extractedParameters.account_id`. |

### 2b. Response redactions

These select the **only** parts revealed to the attestor. Add one per match:

| # | Regex |
|---|---|
| 1 | `"status":"active",` |
| 2 | `"age_ok":true,` |
| 3 | `"country":"(?:AR\|NG\|KE)",` |
| 4 | `"band_ge_2":true,` |
| 5 | `"account_id":"acc_[0-9a-f]{32}",` |

Never select `business_name`, `revenue_90d_cents` or `account_age_months`.

### 2c. If the builder only lets you click fields in a captured response

The builder may record your login and then let you tick response fields to "verify", which generates `{{param}}` matches such as `"status":"{{status}}"` with `jsonPath` redactions. In that case:

- tick exactly **`status`, `country`, `age_ok`, `band_ge_2`, `account_id`**, and nothing else
- the issuer accepts this "template" style: a predicate holds when a mandatory match contains `{{name}}` **and** the verified extracted value is `active` / `true` / an allowed country
- the extracted values reach only the issuer (the proof never goes onchain), and they are yes/no values anyway, except `account_id`, which is dropped after the HMAC

### 2d. Repeat for each band and add the providers to the application

- Repeat section 2 for **band 1** and **band 3**. Only match and redaction #4 change.
- If you only demo one band, a single provider is enough: set `RECLAIM_PROVIDER_ID` and leave the per-band ones unset. The issuer then uses it for every band, and `/issue` rejects a band whose predicate isn't in the proof.
- Save or publish each provider, then add it to your application (**Application → Providers → Add provider**). `ReclaimProofRequest.init` fails for a provider that hasn't been added.
- Copy each **Provider ID** (a UUID).

## 3. Configure the issuer (`issuer/.env`)

```
ISSUER_MOCK=0
RECLAIM_APP_ID=<step 1>
RECLAIM_APP_SECRET=<step 1>                     # secret
RECLAIM_PROVIDER_ID_BAND1=<uuid>                # or RECLAIM_PROVIDER_ID=<uuid> for all bands
RECLAIM_PROVIDER_ID_BAND2=<uuid>
RECLAIM_PROVIDER_ID_BAND3=<uuid>
RECLAIM_EXPECTED_URL=https://portal.<host>/api/me/summary
ISSUER_PUBLIC_URL=https://issuer.<host>         # Reclaim POSTs proofs to /reclaim/callback/... here
CORS_ALLOW_ORIGINS=https://app.<host>,https://portal.<host>
# RECLAIM_PROVIDER_VERSION=<x.y.z>              # optional pin; unset = the version Reclaim resolved for the session
# RECLAIM_VERIFICATION_MODE=portal              # portal (remote browser, any phone) | app (Reclaim Verifier app)
```

## 4. Check before the demo

```bash
cd issuer && set -a && . ./.env && set +a
npm run check:provider -- --init
```

- **The check fetches each provider's public config from Reclaim and shows:**
  - its URL and its matches and redactions
  - whether the issuer would accept a proof from it (all four predicates plus the `account_id` extraction, and no forbidden field revealed)
- **`--init`** also creates one real session with your app id and secret. It prints only the session id and the request URL's origin.
- It must end with `RESULT: OK`.

## 5. Live run (what the app does through the SDK's `issuerReclaim`)

```bash
npm run dev    # issuer
# app (or curl): POST /reclaim/session {"commitment":"0x<64 hex leaf>","band":2}
#   -> {sessionId, requestUrl, statusToken, expiresAt, delivery}
```

1. Open `requestUrl` on the phone (or as a QR code).
2. Log in as `donpepe@example.com` / `donpepe-demo-2026`.
3. Poll `GET /reclaim/session/<sessionId>` with `Authorization: Bearer <statusToken>` until it returns `proof_received`.
4. `POST /issue {"proof":{"reclaimSession":"<sessionId>","statusToken":"<token>"},"commitment":…,"band":2,"h":…,"country":"AR"}`.

Expected failures:

| Account | Result |
|---|---|
| `newshop` | Reclaim can't satisfy `age_ok`, so the session fails (`proof_generation_failed`) or `/issue` returns `predicate_failed:age_ok` |
| `suspended` | the same, for `active` |

## 6. Capture a real proof as a fixture

1. Run the issuer with `RECLAIM_CAPTURE_FIXTURE_DIR=/tmp/reclaim-capture`. This is a debug option and prints a warning at startup.
2. Do one flow with a **demo account** (`donpepe`, band 2). The issuer writes `reclaim-proof.<sessionId>.json` (mode 0600).
3. Copy it to the repo:
   ```bash
   cp /tmp/reclaim-capture/reclaim-proof.*.json issuer/test/fixtures/reclaim-proof.captured.json
   ```
   The file contains that demo account's (public, fictional) `account_id`. **Never capture a real business.**
4. Run the test offline: it recomputes the claim identifier and recovers the attestor signatures locally, then reads the predicates, context and account id.
   ```bash
   CAPTURED_BAND=2 npx vitest run test/reclaim-captured.test.ts
   ```
5. Optionally verify it online with the real `verifyProof`:
   ```bash
   RECLAIM_E2E=1 RECLAIM_PROVIDER_ID=<uuid> npx vitest run test/reclaim-captured.test.ts
   ```
6. Unset `RECLAIM_CAPTURE_FIXTURE_DIR` and restart the issuer.
7. Check the four "Unverified until a real proof exists" items in `README.md` against the captured file:
   - the exact strings in `parameters.responseMatches`
   - that `extractedParameters.account_id` is present
   - that `contextMessage` is lowercase
   - that verification passes with `providerId` alone

## Fallbacks (stage)

| If | Do |
|---|---|
| Reclaim or the venue Wi-Fi fails | Run the issuer with `ISSUER_MOCK=1`. The app's `issuer-mock` path uses `/mock/proof` with the same demo accounts and the same nullifiers; everything after the proof is real. |
| The callback URL is unreachable | Unset `ISSUER_PUBLIC_URL`. The issuer polls Reclaim's status URL instead (the proof then sits at Reclaim until it is fetched). |
