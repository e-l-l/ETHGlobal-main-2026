# Integration keys: everything real (non-mock) mode needs

This lists every key, app id and secret. The **Set locally?** column was checked on 2026-11-06 by testing only whether each value is non-empty in `agents/.env`, `issuer/.env` and `contracts/.env`. No values were read out. There are no local env files for `demo/portal`, `apps/web` or `deploy/env/*`, so those keys are "no" locally even if they are set on Vercel or the server.

- **Public** keys can appear in a browser bundle.
- **Secret** keys never leave a server.
- Paste secrets with the clipboard helper (`scripts/secret_from_clipboard.py`, `deploy/secrets-howto.md`), never in chat or a terminal echo.

## 1. Reclaim (Business Pass zkTLS)

Full provider walkthrough: [`issuer/RECLAIM_PROVIDER.md`](../issuer/RECLAIM_PROVIDER.md).

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `RECLAIM_APP_ID` | issuer (session init, `wrong_app` check) | dev.reclaimprotocol.org → **Create new application** → Application ID | public | issuer **no** · agents yes · contracts yes |
| `RECLAIM_APP_SECRET` | issuer (session init and TEE check, server-side only) | Same page, Application Secret (shown once) | **secret** | issuer **no** · agents yes · contracts yes |
| `RECLAIM_PROVIDER_ID`, or `RECLAIM_PROVIDER_ID_BAND1/2/3` | issuer | dev.reclaimprotocol.org → create the custom HTTP provider (RECLAIM_PROVIDER.md §2) → Provider ID. Add it to the application. | public | **no** |
| `RECLAIM_PROVIDER_VERSION` (optional) | issuer | The provider page's version, to pin it | public | no |
| `RECLAIM_EXPECTED_URL` | issuer | `https://portal.<host>/api/me/summary` (your portal deploy) | public | no |
| `ISSUER_PUBLIC_URL` | issuer | Your issuer's public HTTPS origin (`deploy/`); Reclaim POSTs proofs to `/reclaim/callback/...` there | public | no |
| `ISSUER_MOCK` | issuer | `0` for real, `1` for the stage fallback | n/a | **absent**. The default is real mode, which needs the provider keys above to start. |

## 2. World: Agent Pass (OIDC, one-time delegation)

Read by the **agents** API (`world.py`). The SDK's `worldDeviceAgentPass` / `worldOidcAgentPass` call it; apps/web never holds these.

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `WORLD_MOCK` | agents | `0` for real World (default `1`) | n/a | absent (so mock) |
| `WORLD_AGENT_PASS_CLIENT_ID` (alias `WORLD_OIDC_CLIENT_ID`) | agents | The OIDC client id. See "Getting the OIDC client" below. | public | **no** |
| `WORLD_AGENT_PASS_CLIENT_SECRET` (alias `WORLD_OIDC_CLIENT_SECRET`) | agents | Same page. Shown once; **Reset** gives a new one. | **secret** | **no** |
| `WORLD_AGENT_PASS_ISSUER` (alias `WORLD_OIDC_ISSUER`) | agents | Default `https://auth.world.org`. Sandbox is `https://sandbox.auth.world.org`. | public | absent (default) |
| `WORLD_AGENT_PASS_REDIRECT_URI` | agents (exact match is enforced) | The redirect you register on the client, e.g. `https://app.<host>/agent-pass/callback`. Only the redirect flow needs it; the device flow does not. | public | no |
| `WORLD_AGENT_PASS_CLIENT_AUTH` (optional) | agents | `client_secret_post` (default) or `client_secret_basic`. Match what you chose when registering the client. | n/a | absent |
| `WORLD_AGENT_PASS_ACR` (optional) | agents | Comma list of required `acr` values, e.g. `https://world.org/oidc/acr/orb`. Leave unset until you've seen a real token. | n/a | absent |
| `ATTESTER_PRIVATE_KEY` | agents | `cast wallet new`. Its address must be `AdvanceBook.agentPassAttester` (contracts' `AGENT_PASS_ATTESTER`). | **secret** | yes |
| `AGENT_KEY_ENCRYPTION_KEY` | agents | `openssl rand -hex 32` (encrypts agent keys and backups) | **secret** | yes |

**Getting the OIDC client.** I checked the live discovery documents on 2026-11-06.

- **Preferred: the "World IdP" at `https://auth.world.org`.**
  - It supports authorization code with PKCE S256 and the **device flow** (`device_authorization_endpoint`).
  - Client auth is `client_secret_basic` or `client_secret_post`. The only scope is `openid`.
  - Signing is RS256 with `kid`. Claims include `nonce`, `auth_time`, `acr` and `amr`.
  - World's `human-in-the-loop` README says to "register a confidential OIDC client in the World IdP developer portal" with `client_secret_basic` or `client_secret_post`, and to enter a redirect URI when asked. **The URL of that portal is not documented publicly: ask the World team on site.**
- **Legacy: `https://id.worldcoin.org`.**
  - In developer.world.org → your app → **Sign in with World ID** → **Client information**, you'll find the Client ID (`app_…`) and the Client secret (**Reset** shows it once). Add the redirect under it.
  - The portal disables this page for apps **created after 2025-09-29**.
  - If you do use it, set `WORLD_AGENT_PASS_ISSUER=https://id.worldcoin.org`. Note that it has no `auth_time` claim; the backend then falls back to `iat`.
- **Redirect rules:** HTTPS (or `http://localhost:PORT`), at most 256 characters, exact match.

## 3. World: IDKit 4 (credential recovery only, action `credential-recovery-v1`)

Read by **agents** (`/recovery/rp-context`, `/recovery/verify`).

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `WORLD_APP_ID` | agents (returned to the app for `IDKit.request({app_id})`) | developer.world.org → create the app → App ID `app_…` | public | **no** |
| `WORLD_RP_ID` | agents (verify URL `/api/v4/verify/{rp_id}`, `rp_context.rp_id`) | Same app. Older apps click the **Enable World ID 4.0** banner first. RP ID `rp_…`. | public | **no** |
| `WORLD_RP_SIGNING_KEY` (aliases `RP_SIGNING_KEY`, `WORLD_SIGNING_KEY`) | agents (signs `rp_context`, EIP-191 secp256k1) | Same place, shown **once** at creation or rotation | **secret** | **no** |
| `WORLD_RECOVERY_ACTION` | agents | Default `credential-recovery-v1`. Create the action in the app's **World ID actions** page (World ID 4.0). | public | absent (default) |
| `WORLD_ENVIRONMENT` | agents (pinned in the verify body, checked on the result) | `production` (real World App), or `staging` (simulator at https://simulator.worldcoin.org; the action must be a staging action) | public | absent (production) |
| `NEXT_PUBLIC_WORLD_APP_ID` / `_RP_ID` / `_ACTION` | apps/web (`deploy/env/compose.env.example`) | Same values as above. *Not needed with the SDK's `idkitV4`*, which reads them from `/recovery/rp-context`. | public | no |

## 4. Business Pass issuer and chain

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `ISSUER_PRIVATE_KEY` | issuer (agents too, for the Python issuer) | `cast wallet new`. Its address is `BusinessPassRegistry.issuer` (contracts' `BUSINESS_PASS_ISSUER`). | **secret** | issuer yes · agents yes |
| `ISSUER_PEPPER` (agents: `BUSINESS_PEPPER`) | issuer (agents) | `openssl rand -hex 32`, prefix `0x`. **Never rotate it.** Node and Python must hold the same value. | **secret** | issuer yes · agents yes |
| `REGISTRY_ADDRESS` | issuer | BusinessPassRegistry address from `contracts/deployments/<net>.json` | public | issuer **no (absent: the issuer won't start)** |
| `CHAIN_ID` | issuer, agents | `11155111` for Sepolia | public | issuer yes · agents absent (default 31337) |
| `RPC_URL` | agents | Sepolia RPC or Anon-RPC endpoint | secret-ish (provider key in URL) | agents absent |
| `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `DEPLOYER_ADDRESS` | contracts (forge scripts) | Your RPC provider; a funded deployer | URL secret-ish / key **secret** | yes |
| `OFFER_SIGNER_PRIVATE_KEY`, `RISK_MANAGER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` | agents | `cast wallet new`. Their addresses go to contracts' `OFFER_SIGNER` / `RISK_MANAGER` / `RELAYER_ADDRESS`. | **secret** | yes |
| `PAYER_HASH_KEY` | agents | `openssl rand -hex 32` | **secret** | yes |
| `ETHERSCAN_API_KEY` (optional) | contracts (`forge verify-contract --etherscan-api-key`), not wired into any script | etherscan.io → sign in → **API Keys** → **Add** (one v2 key covers Sepolia) | secret | **no** |

## 5. LLM (Bedrock)

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `LLM_PROVIDER` | agents | `bedrock-converse` (Mistral, Kimi and Qwen per role) or `bedrock` / `anthropic` | n/a | yes |
| `BEDROCK_API_KEY` | agents | AWS console → Amazon Bedrock → **API keys** → **Generate long-term API key** (region `ap-south-1`); enable model access for the three models | **secret** | yes |
| `BEDROCK_REGION`, `BEDROCK_*_MODEL` | agents | Defaults in `config.py` | public | absent (defaults) |
| `ANTHROPIC_API_KEY` | agents (only if `LLM_PROVIDER=anthropic`) | console.anthropic.com → API keys | **secret** | no |

## 6. Portal, web and CORS

| Env var | Read by | Where to get it | Public / secret | Set locally? |
|---|---|---|---|---|
| `SESSION_SECRET` | demo/portal (Vercel) | `openssl rand -base64 48`. In Vercel: project → **Settings → Environment Variables** → add `SESSION_SECRET` (Production) → redeploy. | **secret** | no local file (check Vercel) |
| `DEMO_EXTRA_ACCOUNTS_JSON` (optional) | demo/portal | `npm run add-account -- … --print` | public (fictional) | no |
| `CORS_ALLOW_ORIGINS` | agents **and** issuer (issuer also reads `CORS_ORIGINS`) | `https://app.<host>,https://portal.<host>`, comma-separated, no `*` | public | agents **no** · issuer no |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ISSUER_URL`, `NEXT_PUBLIC_MRA_MODE` | apps/web | `https://api.<host>`, `https://issuer.<host>`, `sepolia` | public | no |
| `RECOVERY_PEPPER` | apps/web server (`deploy/env/app.env.example`) | `openssl rand -base64 48` | **secret** | no |

## 7. What to do when the keys arrive (in order)

1. **Reclaim**
   - Do RECLAIM_PROVIDER.md steps 1–3.
   - Copy `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` into `issuer/.env`.
   - Set `RECLAIM_PROVIDER_ID*`, `RECLAIM_EXPECTED_URL`, `ISSUER_PUBLIC_URL`, `REGISTRY_ADDRESS`, `CORS_ALLOW_ORIGINS` and `ISSUER_MOCK=0`.
   - Run `npm run check:provider -- --init` and expect `RESULT: OK`.
2. **World IDKit**
   - In developer.world.org, create (or open) the app and enable World ID 4.0.
   - Copy the App ID, RP ID and signing key into `agents/.env` as `WORLD_APP_ID`, `WORLD_RP_ID` and `WORLD_RP_SIGNING_KEY`.
   - Create the action `credential-recovery-v1`, in the same environment as `WORLD_ENVIRONMENT`.
3. **World Agent Pass**
   - Get an OIDC client on `auth.world.org` (ask World on site).
   - Set `WORLD_AGENT_PASS_CLIENT_ID` and `WORLD_AGENT_PASS_CLIENT_SECRET`.
   - Register the redirect and set `WORLD_AGENT_PASS_REDIRECT_URI` (only needed for the redirect flow).
4. Set `WORLD_MOCK=0` and `CORS_ALLOW_ORIGINS` in `agents/.env`, then restart the agents API.
5. **Smoke test**
   - Agent Pass: `POST /agents/{id}/agent-pass/device`, open `verification_uri`, then approve and deny once each. Deny must give `reason: denied` and no attestation.
   - Recovery: `POST /recovery/rp-context`, then run IDKit and `POST /recovery/verify`.
   - Business Pass: the Reclaim flow in RECLAIM_PROVIDER.md §5.
