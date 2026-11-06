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
- **Direct-contract path (no frontend, no API).** Addresses are in [`agents/deployments/sepolia.json`](../../agents/deployments/sepolia.json). Use your own RPC and key:

  ```bash
  BOOK=0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1  USDC=0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb
  SENIOR=0xc2286c564bde614ca1414518d02cacec77f3e297 DRIP=0x5998b918db6edaccde4ce3fc282b9b057ab8d81c
  # pay a shop (the holdback repays its advance automatically)
  cast send $USDC "approve(address,uint256)" $BOOK 10000000 --rpc-url $RPC --private-key $PK
  cast send $BOOK "pay(bytes32,uint256)" $SHOP_ID 10000000 --rpc-url $RPC --private-key $PK
  # repay an advance directly (anyone may repay any active advance)
  cast send $BOOK "repay(uint256,uint256)" $ADVANCE_ID 5000000 --rpc-url $RPC --private-key $PK
  # withdraw from a vault (ERC-4626 redeem)
  cast send $SENIOR "redeem(uint256,address,address)" $SHARES $ME $ME --rpc-url $RPC --private-key $PK
  # write off a defaulted advance after 30 days (anyone; earns the 5 USDC bounty)
  cast send $BOOK "writeOff(uint256)" $ADVANCE_ID --rpc-url $RPC --private-key $PK
  # push accrued hook fees to the reserve and treasury (anyone)
  cast send 0xf5174b8f8642aef786e6bb1c1facac6d0f201044 "flush()" --rpc-url $RPC --private-key $PK
  ```

  Junior (DRIP) withdrawals are limited so that junior keeps covering 20% of senior outstanding.

## R / O: Open source

- **License: MIT** ([LICENSE](../../LICENSE)). The Solidity sources already carry `SPDX-License-Identifier: MIT`.
- Builds from the repo alone:
  - `forge build && FOUNDRY_OFFLINE=true forge test`: 152 tests
  - `uv run pytest -q` in `agents/`: 256 offline tests
  - `npm test` in `issuer/` and `demo/portal/`: 61 portal tests
  - a full local devnet with `agents/scripts/devnet.sh`, or the whole stack with no real keys via [`docs/LOCAL.md`](../LOCAL.md)

  See [`contracts/README.md`](../../contracts/README.md), [`agents/README.md`](../../agents/README.md) and [`deploy/README.md`](../../deploy/README.md).
- No governance token, no points. DripCoin (DRIP) is the first-loss tranche share (ERC-4626), not a platform token.

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
| RPC providers | Browser reads go through **Anon-RPC (Nox)** by default on the hosted app (`NEXT_PUBLIC_ANON_RPC=1`; see [ANON_RPC.md](ANON_RPC.md)). Backend reads use Tenderly directly and see the backend's IP, not the merchant's. Writes are public transactions. | The merchant's IP, for browser reads |
| World | That a human verified before borrowing, delegated to an agent, or recovered credentials in our app | Which business, what was borrowed |

- Credential secrets (Standing Pass, Business Pass) are created and kept on the device. Proofs are built in the browser.
- Merkle paths are computed locally from the whole tree, so the app never asks for "my leaf".
- **No third-party trackers or analytics in the client.** Checked on 2026-11-06 by grepping `apps/web` (source and `package.json`) for analytics, gtag, posthog, segment, `@vercel/analytics`, sentry, plausible, mixpanel, amplitude, hotjar and googletagmanager. The only matches were the false positive `waitingTag` (UI copy), and there are no such dependencies.
- **World ID** is the first onboarding step. We keep only an HMAC of the World nullifier, linked privately to that human's shops. A write-off bans the human, and the ban is enforced by our offer signer from that private list. Nothing about the person goes onchain.

## S: Security

- **Keys:**
  - offer signer, risk manager, issuer, Agent Pass attester, relayer and deployer/owner
  - all in git-ignored env files ([`contracts/README.md`](../../contracts/README.md), [`deploy/secrets-howto.md`](../../deploy/secrets-howto.md))
  - the agent key signs offers only and holds no funds
- **No upgrades, no pause, nobody can move user funds.**
- Every advance is bounded onchain: tier caps of $50 / $100 / $200 / $300, an exposure cap, fixed sizes, and junior first-loss cover of 20% of senior outstanding.
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
- **The World ID ban is enforced by our offer signer, not the contract.** An operator with the server key could link a human's shops. Roadmap: a ZK "not in the banned set" proof.
- **Draws under one mandate are linkable to each other.** They are bounded by rotating the mandate per cycle.
- **We see the payout address at request time.** A planned recipient commitment `H(recipient, salt)` is not built.
- **Owner is a single key**, not a multisig.
- **Anon-RPC covers browser reads only.** It is on by default (Nox), and 26/26 SDK reads were routed in a Chrome measurement. If it is unavailable and strict mode is off (the default), the app falls back to direct reads. Backend reads use Tenderly directly, and writes are public.
- **The business proof uses a demo attestor in the live demo.** The demo seller portal ("PagoSur") is a fictional stand-in, shown as such. The real Reclaim path is built and tested ([`docs/zktls-spike.md`](../zktls-spike.md)). World ID and Agent Pass run in real mode on the hosted app, with test mode as a fallback.
- **Unaudited hackathon code.**
- **Bedrock (AWS) is a third party that sees underwriting features.** These are numbers only, but AWS is still a party.
- Not private from the law: a production launch needs licensing and selective disclosure (roadmap).
