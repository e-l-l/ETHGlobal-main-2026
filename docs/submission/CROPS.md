# CROPS

For the EF Best CROPS App track. Every claim links to its source, and the gaps are listed at the end.

## C: Censorship resistance

- **What we run:**
  - the app and API
  - the relayer
  - the offer signer (agents)
  - the Business Pass issuer
  - the Agent Pass attester
  - the risk-manager key
- **If all of it goes away:**
  - `pay` (sales and repayment), vault deposits and withdrawals (ERC-4626), `writeOff` (anyone can call it, and earns a bounty) and `RiskHook.flush` all keep working straight from the contracts.
  - Contracts are non-upgradeable and have no pause.
- **What needs us:** new advances need a signed offer from the offer signer. New Business Passes need the issuer, and new mandates need the attester. The offer signer can refuse new advances. That is a censorship power, and we name it below.
- **TODO:** write up the direct-contract path (the `cast` calls to pay, repay and withdraw without our frontend).

## R / O: Open source

- **License: TODO** (MIT or GPL-3.0; there is no LICENSE file yet). The Solidity sources already carry `SPDX-License-Identifier: MIT`.
- Builds from the repo alone:
  - `forge build && FOUNDRY_OFFLINE=true forge test`: 152 tests
  - `uv run pytest -q` in `agents/`: 256 offline tests
  - `npm test` in `issuer/` and `demo-portal/`: 61 portal tests
  - a full local devnet with `agents/scripts/devnet.sh`

  See [`contracts/README.md`](../../contracts/README.md), [`agents/README.md`](../../agents/README.md) and [`deploy/README.md`](../../deploy/README.md).
- No protocol token, no points.

## P: Privacy

Identity never touches the chain or our servers. Only ZK yes/no answers and pseudonyms do. The table below is from [`docs/privacy-architecture.md`](../../docs/privacy-architecture.md), section 6.

| Party | Learns | Never learns |
|---|---|---|
| Public chain | A pseudonymous shop's sales and repayments; advance sizes; that *some* valid credential was used | The person, the business, which credential, history across shops |
| Customers | The shop's pseudonym (they pay its QR) | Owner, other pseudonyms, past advances |
| Lenders (LPs) | All aggregate and per-advance numbers | Any borrower identity |
| Us (API + relayer) | Shop ID, offer, payout address at request time | Name, tax ID, phone, contacts, World identity, credential secret |
| Business Pass issuer | That a zkTLS predicate passed. It also sees the **account ID transiently**: it computes `HMAC(pepper, account_id)`, then drops the ID. The ID is never logged, stored or returned ([`issuer/README.md`](../../issuer/README.md), Privacy). | Business name, account data. Predicates are yes/no plus a band. |
| AI models (Amazon Bedrock) | **Numbers and HMAC-hashed payers only** | Any identity; raw payer addresses |
| RPC providers | Nothing linkable to an IP, once reads go through **Anon-RPC** (see [ANON_RPC.md](ANON_RPC.md); **integration TODO**) | |
| World | That a human delegated to an agent or recovered credentials in our app | Which business, what was borrowed |

- Credential secrets (Standing Pass, Business Pass) are created and kept on the device. Proofs are built in the browser.
- Merkle paths are computed locally from the whole tree, so the app never asks for "my leaf".
- **TODO: confirm there are no third-party trackers or analytics in the client** (`apps/web`).

## S: Security

- **Keys:**
  - offer signer, risk manager, issuer, Agent Pass attester, relayer and deployer/owner
  - all in git-ignored env files ([`contracts/README.md`](../../contracts/README.md), [`deploy/secrets-howto.md`](../../deploy/secrets-howto.md))
  - the agent key signs offers only and holds no funds
- **No upgrades, no pause, nobody can move user funds.**
- Every advance is bounded onchain: tier caps of $50 / $100 / $250 / $500, an exposure cap, fixed sizes, and junior first-loss of at least 10% of senior outstanding.
- **Operator powers** ([`docs/architecture.md`](../../docs/architecture.md#operator-powers-named-for-crops), [`contracts/SPEC.md`](../../contracts/SPEC.md) "Trust assumptions"):

| Power | Held by | What it can do to users | If the key is lost |
|---|---|---|---|
| Offer signer | Agent service | Refuse new advances (censorship) | No new advances. Payments, repayment and withdrawals still work. |
| Risk manager | Risk agent | Lower limits only, never below the floors | Limits freeze at their current values |
| Owner (`Ownable2Step`) | A single key for the hackathon (meant to be a multisig) | Raise limits; rotate the signer, risk manager, issuer and attester; set the country set | Same as above. It can't touch funds. |
| Issuer | Business Pass issuer | Mint fake Business Passes, bounded by tier-0 caps, the exposure cap and junior first-loss. Holds the HMAC pepper. | No new Business Passes |
| Agent Pass attester | Backend | Vouch for a human approval. It can't draw: a mandate also needs the shop owner's signature and a ZK credential. | No new mandates |

- Testing:
  - Foundry invariants: accounting adds up and no USDC is created or lost (about 4,000 random calls per run)
  - real-proof E2E tests
  - a read-only Sepolia smoke test (24/24 checks pass, no transactions sent; commit `c4840bb`)

## Honest gaps

- **Customers can see the pseudonym's activity.** Sales and repayment share are public for a known shop. The mitigation is to rotate the pseudonym after each advance. Shielded settlement is roadmap only.
- **The issuer is trusted.** It sees the account ID transiently and holds the pepper. Roadmap: OPRF or TEE.
- **Draws under one mandate are linkable to each other.** They are bounded by rotating the mandate per cycle.
- **We see the payout address at request time.** A planned recipient commitment `H(recipient, salt)` is not built.
- **Owner is a single key**, not a multisig.
- **Anon-RPC is not wired yet.** The backend's Sepolia profile uses a Tenderly gateway. Support for Sepolia is unconfirmed.
- **World and Reclaim have run in mock mode only.** The demo seller portal ("PagoSur") is a fictional stand-in, shown as such.
- **Bedrock (AWS) is a third party that sees underwriting features.** These are numbers only, but AWS is still a party.
- **No license file yet.**
- Not private from the law: a production launch needs licensing and selective disclosure (roadmap).
