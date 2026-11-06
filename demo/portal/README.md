# demo-portal: "PagoSur Vendedores" (DEMO seller portal for the zkTLS demo)

A small, deployable stand-in for a merchant dashboard such as Mercado Pago's. A merchant logs in on
their phone inside Reclaim Protocol's zkTLS flow. Reclaim then proves predicates over the HTTPS
response of `GET /api/me/summary` ("active", "6+ months", "allowed country", "revenue band >= k")
**without revealing** the account id, the business name or the exact numbers.

It is shown honestly on stage as a stand-in (track B in `docs/zktls-spike.md`). The UI carries a
"Demo environment" badge, the brand "PagoSur" is fictional, and all accounts are fictional.

## Stack: Next.js 16 (App Router), on Vercel

- **Zero-config on Vercel.** Set Root Directory to `demo-portal`, add one env var, deploy. A FastAPI
  app on Vercel would need a Python runtime plus a separate frontend, which is more moving parts.
- **One codebase** for the server-rendered dashboard, the JSON API and the tests.
- **No database and no native deps.** Accounts are a JSON file, passwords use Node's built-in scrypt,
  and the session is a stateless AES-256-GCM cookie. Cold starts are fast and there is nothing to provision.

## Run locally

```bash
cd demo-portal
npm install
cp .env.example .env.local          # optionally set SESSION_SECRET (a dev fallback is used if empty)
npm run dev                         # http://localhost:3000
npm test                            # vitest: 61 tests
npm run build && npm start          # production mode (SESSION_SECRET required)
```

To test from a phone on the same Wi-Fi: `npm run dev -- -H 0.0.0.0`, then open `http://<laptop-ip>:3000`.
Reclaim itself needs a public HTTPS URL, so use the Vercel deploy (or a tunnel) for the real flow.

## Demo accounts (DEMO ONLY)

These passwords are public, protect nothing real, and live in `config/demo-credentials.env`. The app only
reads the scrypt hashes in `config/demo-accounts.json`. Edit the credentials file, then run `npm run seed` to re-hash.

| Login | Password | Business | Country | Status | Age | Revenue 90d | Band | Demo outcome |
|---|---|---|---|---|---|---|---|---|
| donpepe@example.com | donpepe-demo-2026 | Kiosco Don Pepe | AR | active | 20 mo | $12,345.67 (about $4.1k/mo) | 2 | passes band <= 2 |
| nkechi@example.com | nkechi-demo-2026 | Mama Nkechi Provisions | NG | active | 14 mo | $2,850.40 (about $950/mo) | 1 | passes band 1 |
| wanjiru@example.com | wanjiru-demo-2026 | Duka la Wanjiru | KE | active | 31 mo | $38,765.12 (about $12.9k/mo) | 3 | passes band <= 3 |
| newshop@example.com | newshop-demo-2026 | New Shop | AR | active | **2 mo** | $2,100.00 | 1 | **fails age** |
| suspended@example.com | suspended-demo-2026 | Suspended Store | NG | **suspended** | 26 mo | $9,400.00 | 2 | **fails active** |

Account ids are `acc_` + 128 random bits in hex (e.g. `acc_18bf65eab2bc1711af938e15a335f20c`), generated once and stored in
`config/demo-accounts.json`. They are **never regenerated**: the issuer's per-business nullifier is `HMAC(pepper, account_id)`,
so an id must be stable and must not be guessable or sequential (enforced by `validateAccount` and the tests).

Ages are relative to "now" (`opened_months_ago`), so New Shop is always 2 months old and the demo never drifts.

### Adding accounts

- **Into the repo:** `npm run add-account -- --email shop@example.com --password 'pw' --name "My Shop" --country AR --months 12 --revenue-cents 750000 [--status suspended]`
- **On Vercel without a code change:** run the same command with `--print`, then paste the JSON object (inside `[...]`) into the env var `DEMO_EXTRA_ACCOUNTS_JSON` and redeploy.
- `npm run hash-password -- 'pw'` prints a hash on its own.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | **yes, in production** (>= 32 chars) | Encrypts the session cookie and signs CSRF tokens. `openssl rand -base64 48`. Without it, login returns 500 and `/api/health` returns 503. |
| `DEMO_EXTRA_ACCOUNTS_JSON` | no | A JSON array of extra accounts (same shape as `config/demo-accounts.json`). |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_SEC` | no | Defaults to 10 attempts per 300 s, per IP **and** per email. |

`.env.local` is git-ignored. No secrets are committed. The demo passwords are deliberately public.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/login`, `/dashboard` | UI (es/en; switch with the language pill; defaults to the account locale, then Accept-Language) |
| GET | `/api/auth/csrf` | Issues a signed double-submit CSRF token (cookie + body) |
| POST | `/api/auth/login` | Form: `email`, `password`, `csrf`. 303 to `/dashboard`, or to `/login?error=invalid\|csrf\|rate` |
| POST | `/api/auth/logout` | Form: `csrf` |
| GET | **`/api/me/summary`** | The zkTLS "whoami" endpoint (below) |
| GET | `/api/health` | `{"ok":true,"service":"demo-portal","accounts_loaded":true,"session_secret_configured":true,"time":"..."}`. 503 if misconfigured |
| GET | `/api/reclaim/provider-config?band=1\|2\|3[&mode=issuer]` | Paste-ready provider config for this deployment's origin (set 1, or set 1 + set 2 with `mode=issuer`) |

## `GET /api/me/summary`: the zkTLS endpoint

- **There is no identifier in the URL.** The account comes only from the session cookie, because the
  request URL (`claimInfo.parameters`) is public onchain. **Any query string is rejected with 400**, so an id can't be slipped in.
- Without a valid session it returns `401 {"error":"unauthorized"}`.
- Headers: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store, private`, `Vary: Cookie`.
- The body is compact JSON with a **fixed key order**. The order is part of the contract: the regexes match exact bytes.
  Booleans come first; the values that must never be revealed come last.
- The dashboard fetches this URL from the browser (the "Account status" card), so Reclaim's in-app
  webview sees the request right after login.

Exact response for Kiosco Don Pepe (one line, no whitespace between tokens):

```json
{"v":1,"status":"active","country":"AR","age_ok":true,"band_ge_1":true,"band_ge_2":true,"band_ge_3":false,"account_age_months":20,"revenue_90d_cents":1234567,"currency":"USD","account_id":"acc_18bf65eab2bc1711af938e15a335f20c","business_name":"Kiosco Don Pepe"}
```

| # | Key | Type | Meaning | Revealed? |
|---|---|---|---|---|
| 1 | `v` | `1` | schema version | no |
| 2 | `status` | `"active"\|"suspended"\|"closed"` | account status | only as the `"status":"active",` match |
| 3 | `country` | ISO alpha-2 | country | only as an allowed-list match |
| 4 | `age_ok` | bool | `account_age_months >= 6` | only `"age_ok":true,` |
| 5 | `band_ge_1` | bool | 90-day revenue >= 3 x $500 (150000 cents) | only `"band_ge_k":true,` for the chosen k |
| 6 | `band_ge_2` | bool | 90-day revenue >= 3 x $2,000 (600000 cents) | " |
| 7 | `band_ge_3` | bool | 90-day revenue >= 3 x $10,000 (3000000 cents) | " |
| 8 | `account_age_months` | int | whole calendar months since opening (UTC) | **never** |
| 9 | `revenue_90d_cents` | int | USD cents, last 90 days | **never** |
| 10 | `currency` | `"USD"` | | no |
| 11 | `account_id` | string | `acc_` + 32 hex (128 random bits), fixed forever per business | **never publicly**; only to the issuer via match set 2 |
| 12 | `business_name` | string | display name | **never** |

Band k means the **monthly average over 90 days** is at least the threshold, computed in integer cents
as `revenue_90d_cents >= 3 * monthly_threshold_cents`. A forged-key attack via `business_name` is impossible:
`JSON.stringify` escapes every inner `"` as `\"`, so `"age_ok":true,` can only match the real key (this is tested).

## Reclaim provider config (paste into the provider builder at dev.reclaimprotocol.org)

There are two match sets (source of truth: `lib/reclaim.ts`; every regex is tested against every seeded body):

1. **Set 1: public predicates.** Regexes with **no capture groups**, and redactions that reveal only those predicate tokens.
   `account_id`, `business_name`, `revenue_90d_cents` and `account_age_months` are never selected, so they stay hidden.
2. **Set 2: issuer-only extraction of `account_id`.** It has one named capture group, so the id becomes an extracted parameter
   in the claim context. A proof that contains it goes **only to our issuer** (offchain) and is **never submitted onchain**.
   The issuer verifies it, computes `nullifier = HMAC(pepper, account_id)`, discards the id, and signs
   {predicates, nullifier}. The registry checks only that signature.

**Use the issuer provider (set 1 + set 2 in ONE provider/proof) for the real flow.** If the sets were two separate proofs,
nothing would bind them to the same account: someone with one qualifying account and N throwaway accounts could pair the good
predicates with N different nullifiers. The set-1-only provider is for showing or verifying predicates where no nullifier is needed.

Set 2, exactly:

| | Regex | JSON-escaped |
|---|---|---|
| match (extraction) | `"account_id":"(?<account_id>acc_[0-9a-f]{32})",` | `"\"account_id\":\"(?<account_id>acc_[0-9a-f]{32})\","` |
| redaction (reveals only this token) | `"account_id":"acc_[0-9a-f]{32}",` | `"\"account_id\":\"acc_[0-9a-f]{32}\","` |

Full JSON for the **band-2 issuer provider** (`GET /api/reclaim/provider-config?band=2&mode=issuer` fills in the origin):

```json
{
  "loginUrl": "https://<your-deployment>/login",
  "url": "https://<your-deployment>/api/me/summary",
  "method": "GET",
  "responseType": "json",
  "responseMatches": [
    { "type": "regex", "value": "\"status\":\"active\"," },
    { "type": "regex", "value": "\"age_ok\":true," },
    { "type": "regex", "value": "\"country\":\"(?:AR|NG|KE)\"," },
    { "type": "regex", "value": "\"band_ge_2\":true," },
    { "type": "regex", "value": "\"account_id\":\"(?<account_id>acc_[0-9a-f]{32})\"," }
  ],
  "responseRedactions": [
    { "regex": "\"status\":\"active\"," },
    { "regex": "\"age_ok\":true," },
    { "regex": "\"country\":\"(?:AR|NG|KE)\"," },
    { "regex": "\"band_ge_2\":true," },
    { "regex": "\"account_id\":\"acc_[0-9a-f]{32}\"," }
  ]
}
```

### Set 1 details (public predicates)

Replace `https://<your-deployment>` with the production URL. Or `GET /api/reclaim/provider-config?band=2`
on the deployment and it is filled in for you. **Create one provider per band** (1, 2, 3). They differ
only in the last match and redaction.

- **Login URL:** `https://<your-deployment>/login`
- **Request URL:** `https://<your-deployment>/api/me/summary` (no params, no dynamic parts)
- **Method:** `GET`
- **Response type:** JSON
- **Headers:** none extra. The session cookie `dp_session` is supplied by the logged-in webview and must stay a **private/secret** header (Reclaim keeps cookies private by default).

**Response matches** (type `regex`, no capture groups; the trailing comma pins the exact value):

| Predicate | Regex (as typed in the builder) | JSON-escaped |
|---|---|---|
| active | `"status":"active",` | `"\"status\":\"active\","` |
| 6+ months | `"age_ok":true,` | `"\"age_ok\":true,"` |
| allowed country | `"country":"(?:AR\|NG\|KE)",` | `"\"country\":\"(?:AR\|NG\|KE)\","` |
| band >= 1 | `"band_ge_1":true,` | `"\"band_ge_1\":true,"` |
| band >= 2 | `"band_ge_2":true,` | `"\"band_ge_2\":true,"` |
| band >= 3 | `"band_ge_3":true,` | `"\"band_ge_3\":true,"` |

**Redactions.** In Reclaim, `responseRedactions` select the **only** parts revealed to the attestor, and everything
else stays hidden. So use exactly the same regexes as the matches. `account_id`, `business_name`,
`revenue_90d_cents` and `account_age_months` are never selected, so they are never revealed (the tests check
that no revealed span can contain them).

Full JSON for the **band-2 public-only provider** (set 1; `GET /api/reclaim/provider-config?band=2`):

```json
{
  "loginUrl": "https://<your-deployment>/login",
  "url": "https://<your-deployment>/api/me/summary",
  "method": "GET",
  "responseType": "json",
  "responseMatches": [
    { "type": "regex", "value": "\"status\":\"active\"," },
    { "type": "regex", "value": "\"age_ok\":true," },
    { "type": "regex", "value": "\"country\":\"(?:AR|NG|KE)\"," },
    { "type": "regex", "value": "\"band_ge_2\":true," }
  ],
  "responseRedactions": [
    { "regex": "\"status\":\"active\"," },
    { "regex": "\"age_ok\":true," },
    { "regex": "\"country\":\"(?:AR|NG|KE)\"," },
    { "regex": "\"band_ge_2\":true," }
  ]
}
```

Expected results: Don Pepe passes bands 1 and 2. Nkechi passes band 1 only. Wanjiru passes bands 1 to 3.
**New Shop fails** (`age_ok` is false). **Suspended Store fails** (status). All of these are covered by the tests.

**Country trade-off (a team decision).** The allowed-list regex proves "country in {AR, NG, KE}" without saying which one.
If the issuer must put the exact country into the Business Pass leaf, use per-country providers with
`"country":"AR",` instead. Then the country is effectively public, because the provider's regexes appear in the
public claim parameters. Either way, **never** use a capture group such as `(?<country>..)`: extracted values
go into the claim context, which is published onchain.

## Deploy to Vercel

1. Vercel, then New Project, then import the repo. Set **Root Directory = `demo-portal`** (the framework is auto-detected as Next.js).
2. Settings, then Environment Variables: add `SESSION_SECRET` for Production (and Preview), e.g. `openssl rand -base64 48`.
3. Deploy. Check `https://<deployment>/api/health`; it should return `"ok":true,"session_secret_configured":true`.
4. Settings, then Deployment Protection: make sure the **production** URL is publicly reachable. Reclaim's attestor
   and the phone must reach it without Vercel auth. Preview URLs are protected by default, so use production.
5. Paste the provider config above into Reclaim's builder with the production URL.

CLI alternative: `cd demo-portal && npx vercel link && npx vercel env add SESSION_SECRET production && npx vercel --prod`.

## Security notes

- Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt) with constant-time compare. Unknown emails still run a dummy hash to equalise timing.
- Session: `dp_session` is AES-256-GCM encrypted `{sub, exp}`, opaque, 8 h. `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` in production.
- CSRF: an HMAC-signed double-submit token (cookie plus hidden field) on login and logout, plus an Origin check (a foreign Origin gets 403).
- Login rate limit: 10 attempts per 5 minutes per IP and per email.
- `/api/lang` only redirects to local paths. Security headers are set via `next.config.ts` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`).

## Known gaps

- The rate limiter is in-memory, **per serverless instance**. For anything real, add a Vercel WAF rate-limit rule on `POST /api/auth/login` or use Upstash.
- Accounts are static (JSON plus env), so adding one requires a redeploy. There is no signup and no password reset.
- The Reclaim regex-redaction behaviour is not yet verified end-to-end in the provider builder. Use its preview with
  Don Pepe first. If the builder's redactions only accept JSONPath, note that `$.status` reveals only the value
  `"active"`; then change the matches to `"active"` / `true` per path accordingly.
- The proven band is public: each provider's regexes (and so "band >= k") appear in the public claim parameters. This is intended per the privacy doc.
- The per-business nullifier needs `account_id` in the clear at the **attestor and the issuer** (set 2). That is a trust
  assumption: the issuer pepper is a hackathon secret, and the attestor sees the id. Roadmap: Reclaim's OPRF-hashed
  redaction (`hash: "oprf"`) or an OPRF issuer, so nobody sees the raw id (not verified here).
- Whether Reclaim's SDK lets us keep a proof's extracted parameters strictly offchain must be checked in the real flow.
  The proof must be POSTed to the issuer and never sent to a contract as is. `docs/zktls-spike.md` rule 4 ("no business-ID
  nullifier") predates the per-business design update and should be reconciled.
- Revenue is USD only (there is no local-currency view). The dashboard data is generated deterministically from the seed, and the daily totals sum exactly to `revenue_90d_cents`.
- Dev tooling: vitest is pinned to 3.2, because vitest 5 crashes npm 10's installer (`edgesOut`). `npm audit` flags advisories in vitest 3's dev-only deps (not shipped).
- The login page lists the demo emails (not passwords) to make stage logins easy. Remove the `<details>` in `app/login/page.tsx` if unwanted.
