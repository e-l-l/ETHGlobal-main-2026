# Business Pass issuer

The small trusted service behind the Business Pass (`docs/privacy-architecture.md` section 2). It:

- receives the merchant's **combined Reclaim proof**: the public predicates plus the issuer-only `account_id` extraction (`demo-portal/lib/reclaim.ts`, `issuerProviderConfig`)
- verifies it
- derives a per-business nullifier
- **drops the account id**
- signs an EIP-712 `BusinessVerified` that `contracts/src/BusinessPassRegistry.sol` checks in `issue()`

The proof never goes onchain.

```
app ──POST /issue {proof, commitment, band[, h, country]}──► issuer
      1. shape + freshness (claim timestampS within PROOF_MAX_AGE_SEC)
      2. predicates from claimData.parameters.responseMatches (active, age_ok, country in allow-list, band_ge_{band})
      3. Reclaim js-sdk verifyProof(proof, {providerId[, providerVersion]} | {hashes}) → attestor sigs + provider pin
      4. context.contextMessage === commitment (0x + 64 lowercase hex)
      5. (optional) commitment === Poseidon2(TAG_BIZ, h, country + 2^16·band + 2^24·1)
      6. replay: claim identifier unseen within TTL
      7. businessNullifier = HMAC-SHA256(ISSUER_PEPPER, account_id) mod P, account_id dropped
      8. EIP-712 sign BusinessVerified(businessNullifier, commitment, expiresAt = now + 600)
app ◄── {businessNullifier, commitment, expiresAt, signature}
app/relayer ──► BusinessPassRegistry.issue((businessNullifier, commitment, expiresAt), signature, commitment)
```

## Run

```bash
cd issuer
npm install
cp .env.example .env    # fill in the values; .env* is git-ignored
npm test                # vitest
npm run dev             # tsx watch; or: npm run build && npm start
npm run check:anvil     # cross-check against the REAL registry bytecode (needs foundry + contracts/out)
```

Env is read from the process environment, so load `.env` yourself (for example with `node --env-file=.env dist/server.js` or `set -a; . ./.env`).

Docker (node:20-slim, multi-stage, non-root `node` user):

```bash
docker build -t bp-issuer issuer/
docker run --env-file issuer/.env -p 8787:8787 bp-issuer
```

### Demo mock flow (`ISSUER_MOCK=1`)

```bash
curl -XPOST localhost:8787/mock/proof -H 'content-type: application/json' \
  -d '{"account":"donpepe","commitment":"0x…64 hex…","band":2}'        # → {proof}
curl -XPOST localhost:8787/issue -H 'content-type: application/json' \
  -d '{"proof":<that proof>,"commitment":"0x…","band":2}'              # → real signed attestation
```

The mock accounts are the demo portal's fictional accounts (`donpepe`, `nkechi`, `wanjiru`, `newshop`, `suspended`) with the same `account_id`s. So:

- a mock pass and a real-proof pass for the same demo business share one nullifier
- `newshop` fails on `age_ok` and `suspended` fails on `active`, as in the live flow

Mock mode skips **only** the Reclaim signature and provider-hash check. Everything else, including the real signing key, is the same. It is refused on chain 1, `/health` reports `"mode":"mock"`, and it logs a warning at startup.

Anyone who can reach a mock issuer can mint Business Passes for the demo accounts. So keep `CORS_ORIGINS` tight, and never point a mock issuer's key at a registry you care about.

## Endpoints

| Method | Path | |
|---|---|---|
| POST | `/issue` | Body: `{ proof: ReclaimProof, commitment: "0x…", band: 1\|2\|3, h?: "0x…", country?: "AR"\|32 }`. Returns `{ businessNullifier, commitment, expiresAt, signature }`. Rate-limited. |
| GET | `/issuer` | `{ address, chainId, registry, domain, types, primaryType, typehash, attestationTtlSec, mock }`. Pass `address` to `BusinessPassRegistry` as `issuer_` or `setIssuer`. |
| GET | `/health` | `{ ok, mode, chainId }` |
| POST | `/mock/proof` | Mock mode only: `{ account, commitment, band }` → `{ proof }` |

Errors are `{ "error": "<code>" }` and never echo input:

- **400:** `bad_body`, `bad_band`, `bad_commitment`, `bad_proof`, `bad_h`, `bad_country`, `leaf_inputs_required`
- **409:** `proof_replayed`
- **422:** `proof_not_verified`, `tee_not_verified`, `context_mismatch`, `commitment_mismatch`, `predicate_failed:{active|age_ok|country|band_ge_N}`, `proof_too_old`, `proof_from_future`, `wrong_provider_url`, `account_id_missing`, `wrong_app`, `bad_parameters`, `bad_context`
- **429:** `rate_limited`

`commitment` is `uint256`. Pass it as 0x-hex (< P, nonzero). The app must call `setContext(<any address>, commitmentHex)` with **exactly** `0x` + 64 lowercase hex, and the issuer compares that exact string.

## Environment variables

| Var | Required | Meaning |
|---|---|---|
| `ISSUER_PRIVATE_KEY` | yes | 0x + 64 hex. Signs `BusinessVerified`. Its address (`GET /issuer`) must be the registry's `issuer`. |
| `ISSUER_PEPPER` | yes | Nullifier HMAC key: `0x`-hex (>= 32 bytes; `openssl rand -hex 32`) or a raw string >= 32 chars. **Never rotate it**: rotating changes every nullifier and re-opens one-pass-per-business. |
| `CHAIN_ID` | yes | EIP-712 domain `chainId` (31337 anvil, 11155111 Sepolia) |
| `REGISTRY_ADDRESS` | yes | EIP-712 domain `verifyingContract` (the BusinessPassRegistry) |
| `CORS_ORIGINS` | no | Comma-separated allow-list of app origins. Empty means no CORS headers (browsers blocked). |
| `ISSUER_MOCK` | no | `1` = mock mode (above) |
| `RECLAIM_PROVIDER_ID` | real mode | Reclaim provider id. `RECLAIM_PROVIDER_ID_BAND1/2/3` override it per band, since the demo portal has one provider per band. |
| `RECLAIM_PROVIDER_VERSION` | no | Exact provider version to pin (`_BANDn` overrides allowed). Omitted means the SDK fetches the latest version's hash requirements. |
| `RECLAIM_PROVIDER_HASHES` | no | Comma-separated provider hashes (`_BANDn` overrides). If set, they are used **instead of** the provider id: an offline pin with no fetch from Reclaim's backend. |
| `RECLAIM_APP_ID` | no | If set and the proof context carries `attestationNonceData.applicationId`, they must match. |
| `RECLAIM_APP_SECRET` | with TEE | Used only for `teeAttestation` when `RECLAIM_REQUIRE_TEE=1` |
| `RECLAIM_REQUIRE_TEE` | no | `1` = require the SDK's TEE attestation check |
| `RECLAIM_EXPECTED_URL` | no | Pin `claimData.parameters.url`, e.g. `https://<portal>/api/me/summary` |
| `ALLOWED_COUNTRIES` | no | Default `AR,NG,KE`. Every country in the proof's match must be in this list. |
| `ISSUER_REQUIRE_LEAF_CHECK` | no (default **on**) | `h` + `country` are mandatory and the leaf is recomputed, so a merchant can't claim a higher band than proven. `0` disables it (debugging only). |
| `ACCOUNT_ID_PARAM` / `ACCOUNT_ID_PATTERN` | no | Extracted-parameter name (default `account_id`) and format (default `^acc_[0-9a-f]{32}$`) |
| `EIP712_NAME` / `EIP712_VERSION` / `BUSINESS_VERIFIED_TYPE` | no | Defaults match the contract: `BusinessPassRegistry` / `1` / `BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)`. Allowed fields: `businessNullifier`, `commitment`, `expiresAt`, `revenueBand`. |
| `PROOF_MAX_AGE_SEC` / `CLOCK_SKEW_SEC` | no | 900 / 120. The replay TTL is their sum, so a proof can never be replayed: it is either remembered or already too old. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC` | no | 20 per 60 s per IP on `/issue` and `/mock/proof` |
| `TRUST_PROXY` | no | `1` behind a reverse proxy, so rate limits key on the real client IP |
| `PORT` / `HOST` / `LOG_LEVEL` / `BODY_LIMIT_BYTES` | no | 8787 / 0.0.0.0 / info / 262144 |
| `ISSUER_ALLOW_CONSOLE` | no | `1` un-mutes `console` (debug only; see Privacy) |

The Reclaim credentials for the team live in `agents/.env`. Copy the values you need into `issuer/.env` and don't print them.

## EIP-712 (matches `BusinessPassRegistry.hashBusinessVerified`)

```
domain = { name: "BusinessPassRegistry", version: "1", chainId: CHAIN_ID, verifyingContract: REGISTRY_ADDRESS }
types  = { BusinessVerified: [ {name:"businessNullifier",type:"uint256"}, {name:"commitment",type:"uint256"}, {name:"expiresAt",type:"uint64"} ] }
typehash = keccak256("BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)")
         = 0x034695f359f7d3ba8ccfa73a8e48a520f2762994891b7f53930fe7e42b15ad98
```

Test vector (`test/eip712.test.ts`, `npx tsx scripts/vector.ts`). Signer: anvil key #0 (public), address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Domain: chainId 31337, registry `0x5FbDB2315678afecb367f032d93F642f64180aa3`.

| | |
|---|---|
| businessNullifier | `0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| commitment | `0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f` |
| expiresAt | `1790000600` |
| domainSeparator | `0x82c63940bcca96e4f0a90f5b1cf771cfc0ea94581ca85f1b78aeb562e88aa845` |
| structHash | `0xffe66f67394cfb2b347c60db121e1539f9cd847cb8efdbba9f1e3b9185f82fee` |
| **digest** | `0x356e1512d84e25060648e149afdc027867acf2b81471eba5bb77edda13f11c5e` |
| signature | `0xde56ce4b8b77b3cbfb4b55210311fee07914399607ce13fd189fc0a2975c1d36544a08099fd2d022ba4301ec3350349ca62c91d361b9998f63a574e9be0aea2d1c` |

`npm run check:anvil` checks the vector against the real contract. It deploys the compiled registry from `contracts/out` to a throwaway anvil (with the Poseidon2 fixture etched) and confirms that:

- `hashBusinessVerified(vector)` equals the digest above
- a fresh attestation is accepted by `issue()`
- a second `issue()` with the same nullifier reverts

## How predicates are read from a Reclaim proof

- **Where the predicates live.** Reclaim puts the provider's request spec, including `responseMatches`, into `proof.claimData.parameters` (a JSON string). The attestors sign a claim only if every mandatory, non-inverted match held on the real HTTPS response, and `claimData` is covered by the signed claim identifier.
- **What counts as a proven predicate:** a `responseMatches` entry with exactly the demo portal's regex, `type` `regex`/`contains`, not `invert`, not `isOptional`:
  - `"status":"active",`
  - `"age_ok":true,`
  - `"band_ge_{band}":true,`
  - `"country":"(?:AR|NG|KE)",` (or an exact `"country":"AR",`), where every listed country must be in `ALLOWED_COUNTRIES`
- **The pin is the primary guarantee.** `verifyProof` content-validates `parameters` against the pinned provider (hash requirements). The regex check is defence in depth, and it is how the issuer learns **which band** was proven.
- **The values themselves are never seen.** The redacted response is not part of the proof.
- **Where `account_id` comes from.** It is the named capture group of set 2, and arrives in `JSON.parse(claimData.context).extractedParameters.account_id`. The SDK's `verifyProof` returns it as `data[0].extractedParameters`, and the context minus it as `data[0].context`, which is where `contextMessage` is read.

**Unverified until a real proof exists:**

1. That a custom provider built in the Reclaim dev tool keeps our regexes byte-identical in `parameters.responseMatches`. The builder might add `invert:false` or `isOptional:false` (handled), or normalise or escape strings (not handled).
2. That the named capture `(?<account_id>…)` lands in `context.extractedParameters.account_id` and not under a different key. `ACCOUNT_ID_PARAM` exists for this.
3. That `contextMessage` is passed through verbatim (lowercase).
4. Whether `verifyProof({providerId})` hash validation passes for a custom provider without `providerVersion`.

Capture one real proof into a test fixture as soon as the provider exists.

## Privacy

- `account_id` lives in one block-scoped const, is used for the HMAC, and is deleted from the verified-data object before signing. It is never logged, stored, returned or put in an error (tested across success and failure paths, against both pino output and `console`).
- **Logs** carry only an outcome code, the band and the mode. Not the nullifier and not the commitment: logging those next to an IP would link a business to a pass.
- **pino redaction** covers body, proof, account and extractedParameters paths as a backstop.
- The **Reclaim SDK logs through `console`** at `info` level by default, and prints the raw error on a failed verification. The server therefore mutes `console` entirely (pino writes to stdout directly). SDK errors are mapped to a generic `proof_not_verified`.
- **Nothing is persisted.** The only state is the in-memory replay set of claim identifiers.

## Known gaps

- **Attribute binding is opt-in.** The contract comment says the issuer "recomputes the leaf from h and the proven attributes". But the specified body is `{proof, commitment, band}`, and the signed struct carries no band, so by default the issuer cannot stop a merchant from putting `band = 3` in a leaf backed by a band-1 proof.
  - Fix: have the app send `h` and `country`, and run with `ISSUER_REQUIRE_LEAF_CHECK=1`. The issuer then recomputes `Poseidon2(TAG_BIZ, h, attrs)` with bb.js 6.0.0, checked against the circuit's own vectors.
  - Country: the allow-list provider proves only membership, so the claimed country is accepted if it is in the proven set. That is equivalent for draws, which check only membership in the allowed set.
- **The replay cache is in memory and single-instance**, so it resets on restart. Onchain, `businessNullifierUsed` is the real uniqueness guard. Replays only matter for re-issuing to a *different* commitment, which the context binding already prevents.
- **Pepper custody:** a single env secret, named as a trust assumption. Roadmap: OPRF/TEE.
- **No onchain pre-check** of `businessNullifierUsed`. A second pass for the same business gets a valid signature and reverts at `issue()`.
- **Image size:** bb.js adds about 170 MB to the image. It is loaded only when a leaf check runs.
