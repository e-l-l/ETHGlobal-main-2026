# The full picture: a private, ZK-based, trustworthy lending platform

**One sentence:** a real, unique human proves they run a real business, borrows against it and repays from sales, and **nobody (us, the lenders, the AI, the RPC provider or the public) can link the borrower to who they are or what they do.** Lenders still get hard, verifiable guarantees.

This doc ties together the pieces we've built and the pieces we still need. Each layer has a status:
- ✅ built and tested
- 🟡 designed, to build at the hackathon
- 🔭 roadmap, pitched but not built

---

## 1. The five layers

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ 5. NETWORK PRIVACY    Anon-RPC for every read; relayer for every write. Nobody sees IP ↔ shop.  │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. CREDIT PRIVACY     Standing Pass (ZK): "I repaid ≥ N advances". History never linkable.      │ ✅
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. BUSINESS PRIVACY   Business Pass (zkTLS → ZK): "my business is real, active, earns ≥ band".   │ 🟡
│                       Yes/no answers only. No name, no ID, no sector, no exact numbers.         │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. HUMAN CONSENT      World Agent Pass: a real human delegates to their managed agent, ONCE.  │ 🟡
│                       World IDKit: only the same human can recover their credentials.         │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. MONEY              Vaults, waterfall, repayment-at-the-till, Uniswap risk market.            │ ✅
│                       Public, auditable, enforced by contracts. Borrowers are pseudonyms.       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The rule:** identity never touches the chain or our servers. Only **ZK yes/no answers** and **pseudonyms** do.

---

## 2. Business verification without identity: the Business Pass 🟡

### What it proves (yes/no only)

| Claim | Revealed | Never revealed |
|---|---|---|
| A real business account exists and **I control it** (logged in, not just "I know a registry number") | yes/no | Business name, tax ID, owner, address |
| It's in an allowed country | `AR` / `NG` / `KE` / … | City, exact location |
| Active for at least 6 months | yes/no | Opening date |
| Revenue in the last 90 days is at least band *k* (e.g. ≥ $500, ≥ $2k, ≥ $10k a month) | the band | Exact revenue, customers, transactions |
| This business has no other Business Pass | (nullifier) | Which business it is |

Sector is **not** revealed by default. "We can't know what they do" is a design goal.

### How: zkTLS, then a ZK credential

1. The merchant logs into **their own business account** in our app's zkTLS flow. Candidate sources by market:
   - **Argentina:** the Mercado Pago seller account, or the ARCA/AFIP monotributo account
   - **Nigeria:** a Paystack or Moniepoint merchant dashboard
   - **Kenya:** M-Pesa business (Lipa na M-Pesa till) statements
   - **Anywhere:** Shopify or Stripe admin
2. A zkTLS prover produces an **attestation** that the HTTPS response came from that site and satisfies our predicates (status active, revenue ≥ band, account age ≥ 6 months), **revealing only the predicate results**. Options to evaluate: Reclaim, vlayer Web Proofs, zkPass, Primus, TLSNotary.
3. **No World ID here.** The platform (Mercado Pago, M-Pesa, Paystack…) already KYC'd the owner. A logged-in seller account already means "a real, verified person runs this real business", and requiring one pass per *human* would wrongly block owners of several businesses.
4. The **issuer** verifies the zkTLS proof, computes the **business nullifier**, discards the account ID, and signs an attestation. The registry checks the signature and inserts a **Business Pass commitment** into the onchain Business Pass tree:

```
leaf     = Poseidon2(TAG_BIZ, h, country, revenueBand, ageOk)   h = Poseidon2(secret) — kept on the device only
issued   = BusinessPassIssued(leafIndex, root)                  no attributes in the event, only the commitment
uniqueness: businessNullifier = HMAC(issuerPepper, accountId) stored as "used": one Business Pass per business, not per human
```

5. **Borrowing** proves membership in ZK: "I own a Business Pass with country ∈ allowed and revenueBand ≥ the offer's minimum". It publishes only a per-use nullifier, bound to the payout address. Same tooling as the Standing Pass (Noir, the onchain Poseidon2, the bb verifier).

### Two traps we design around

- **Proving knowledge isn't proving ownership.** Many registries are public (anyone can look up a tax ID). The zkTLS proof must come from an **authenticated session** (the logged-in seller dashboard), not a public lookup page.
- **A hashed business ID can be brute-forced.** Tax IDs have about 10¹⁰ possible values, so `Poseidon(accountId)` can be reversed by trying them all. The business nullifier therefore uses an **issuer pepper**: `HMAC(pepper, accountId)`.
  - Hackathon: a secret key held by the issuer, named in CROPS as a trust assumption.
  - Roadmap 🔭: an **OPRF** service, where the issuer computes the nullifier **without ever seeing the ID**, or a TEE.

### Why this is the strongest part of the pitch

- It answers **"is the business real?"** with no KYC documents, no photos, no contacts.
- It **fixes cold start.** A brand-new merchant with no onchain history can get a first advance sized on their *proven revenue band*. That's real underwriting, and nothing about them leaks.
- The agents get **proven facts** ("revenue band 2, active ≥ 6 months, AR") instead of raw books.

---

## 3. Where World fits: at human moments, never in the credit decision 🟡

**Credit is fully automatic.** Agents underwrite, code clamps, the contract decides, and no human is in the loop on any draw. World sits only where a genuinely *human* question exists:

| Moment | World product | Why it's a human question | Prize track |
|---|---|---|---|
| **Delegating to the merchant's managed cash-flow agent, once** | **Agent Pass** | We host one agent per merchant. Before it may draw advances on the merchant's behalf, a **real, consenting human** must authorise it, with limits. Without this, anyone could run bots posing as merchants' agents. A denied or expired approval means no mandate and no automatic draws. | Agent Pass |
| **Recovering credentials on a new phone** | **IDKit** (Proof of Human) | The Business Pass and Standing Pass secrets live on the device. Only the same human can unlock their encrypted backup. Proof of Human is the minimum sufficient credential: we need "same unique human", not age or nationality. | Best Use of IDKit |
| Business verification, credit decisions | *(none)* | The business is proven by zkTLS from a KYC'd platform. Decisions are agents + code + contract. | — |

### Managed agents with mandates (how automation stays private)

```
Setup (once, on the merchant's phone):
  limits (max per draw, per month, purpose) + World Agent Pass approval
  + ZK proof "I hold a valid Business Pass / Standing Pass", bound to our agent's key
  ─► AdvanceBook.registerMandate(agentKey, limits, expiry, proof, agentPassAttestation)

Every draw (automatic, nobody taps):
  managed agent sees sales/stock → requests offer → Underwriter/Critic → clamp → EIP-712 offer
  ─► AdvanceBook.drawByMandate(offer, mandateId, agentSig)   (contract enforces mandate limits)

Merchant can revoke any time; mandates expire on pseudonym rotation.
```

- **Our infra knows:** the pseudonymous shop, its public sales, the payout address, the mandate limits.
- **It never knows:** the identity, the credential secret, or history under past pseudonyms.
- **Roadmap 🔭:** managed agents run in a TEE so even we can't look inside.
- **Trade-off:** draws under one mandate are linkable to each other. Rotating the pseudonym and mandate per credit cycle bounds this.

## 4. Where Anon-RPC fits: ZK leaks without network privacy 🟡

A ZK proof hides *which* credential you hold. But to **build** the proof, the app must fetch the Merkle tree, and if it asks an RPC provider "give me leaf #417", the provider learns exactly who you are. The same goes for checking your balance, your advance or your shop's sales.

| Traffic | Route | Who could link it without this |
|---|---|---|
| All app reads: tree events, balances, advance status, shop sales | **Anon-RPC** (`@anon-rpc/browser-harness`, an anonymized `fetch`) | The RPC provider: IP ↔ shop ↔ credential |
| Merkle path for a proof | **Download the whole tree** (all `LeafInserted` events) through Anon-RPC and compute the path locally | Asking for one leaf reveals the leaf |
| Writes: draws, claims | **Our relayer** (Anon-RPC is reads only) | The merchant's wallet would link advances |
| Our backend's reads (indexer, features) | Anon-RPC too | — |

**Open:** Anon-RPC docs only mention mainnet. If Sepolia isn't supported, we either run a Sepolia worker (that's literally one of the track's suggested builds) or demo reads on a supported network. **Check this first thing.**

**EF CROPS story:** "Private is the reason it exists." Credentials (ZK), network (Anon-RPC), writes (relayer), and no PII anywhere. The README CROPS section lists what each third party learns (section 6).

---

## 5. Money: vaults and tokens ✅ (built), with the decisions to confirm

### Pieces

| Piece | What it is | Token? |
|---|---|---|
| **Senior vault** | ERC-4626 over USDC. Lends principal; earns 60% of fees; loses last. | `sUSDC` vault shares (transferable ERC-20, not traded by us) |
| **Junior vault** | ERC-4626 over USDC. First-loss buffer; earns 30% of fees; must hold ≥ 10% of senior's outstanding loans. | **Junior token** = its shares, **traded on Uniswap v4** |
| **Reserve** | USDC held in `AdvanceBook`. Earns 10% of fees + Uniswap hook fees. Covers losses after junior; pays write-off bounties. | none |
| **Standing Pass / Business Pass** | ZK credentials (Merkle leaves) | **Not tokens.** Non-transferable, private, no market |
| **Protocol token** | **None.** No governance token, no points | Trust: nothing to pump |

### Money flows

```
Lenders ──USDC──► Senior vault ──lend──► fresh merchant address
Risk takers ──USDC──► Junior vault (shares = junior token ⇄ Uniswap v4 pool + RiskHook)
Customer ──pay──► AdvanceBook ──90%──► merchant
                              └─10%──► principal → Senior ; fee → 60% Senior / 30% Junior / 10% Reserve
Default (30 days, no repaying sale) ─► anyone calls writeOff (bounty) ─► Junior pays → Reserve pays → Senior writes down
Uniswap swaps (junior/USDC) ─► hook fee → Reserve ; TWAP → Risk agent → lowerLimits (down only)
```

### Why lenders can trust a book they can't see the borrowers of

- **Every number is onchain and auditable:** total outstanding, each advance's size and repayment, defaults, the reserve, both vaults' assets. **Only identities are hidden.**
- **Invariants tested:** accounting adds up, no USDC is lost or created (about 4,000 random calls per run).
- **First-loss capital (junior + reserve)** stands in front of senior, and the junior must stay ≥ 10% of what senior has lent.
- **Risk is priced publicly:** the junior token's TWAP is a live market estimate. Limits only fall automatically; raising them needs the owner (to be a multisig).
- **Non-upgradeable, no pause, nobody can touch funds.** Operator powers are listed in [architecture.md](architecture.md#operator-powers-named-for-crops).
- **Underwriting is bounded:** agents propose, and a code clamp plus the onchain caps decide (per tier, total exposure, fixed sizes).

### Decisions to confirm (proposals)

| Decision | Proposal |
|---|---|
| Fee split senior / junior / reserve | 60 / 30 / 10 (built) |
| Junior coverage | ≥ 10% of senior outstanding (built) |
| Tier caps | $50 / $100 / $250 / $500 (built) |
| Default window and bounty | 30 days, 5 USDC (built) |
| **Minimum repayment per window** | **Add:** at least 1% of owed per 7 days, or the clock keeps running. Stops tiny sales delaying write-off. |
| Pool starting price | Junior at its vault share price (≈ 1.00 USDC at launch), not a fixed 1:1 |
| Idle senior USDC | Stays idle at the hackathon. Roadmap 🔭: a yield venue |
| Who seeds | Hackathon: us. Pitch: stablecoin DAOs and treasuries (senior), crypto-native risk takers (junior) |

---

## 6. Who learns what (CROPS "Private")

| Party | Learns | Never learns |
|---|---|---|
| **The public chain** | A pseudonymous shop's sales and repayments; advance sizes; that *some* valid credential was used | The person, the business, which credential, credit history across shops |
| **Customers** | The shop's pseudonym (they pay its QR), so they can look up that pseudonym's activity ⚠️ | Who owns it, its other pseudonyms, past advances |
| **Lenders (LPs)** | All aggregate and per-advance numbers | Any borrower identity |
| **Us (API + relayer)** | Shop ID, offer, payout address *at request time* (not stored beyond the decision log) | Name, tax ID, phone, contacts, the World identity, the credential secret |
| **The issuer (Business Pass)** | That a zkTLS predicate passed; the HMAC of the account ID | The business name or account data; the revealed predicates are yes/no plus bands |
| **AI models (Bedrock)** | Numbers and hashed payers only | Any identity; raw payer addresses |
| **RPC providers** | Nothing linkable to an IP (Anon-RPC) | — |
| **World** | That a human delegated to an agent / recovered credentials in our app | Which business, what was borrowed |
| **Regulators** | Only what the merchant chooses to disclose (selective disclosure, 🔭) | Everything else |

### The honest gap ⚠️ and how we shrink it

A customer who pays at the stall learns its **pseudonym**, and can then see that pseudonym's sales and current advance. Three answers:

1. **Rotate the pseudonym every advance** 🟡 (cheap, high value). After repaying, the merchant opens a **new shop ID** and carries their reputation privately through the Standing Pass and Business Pass, which are unlinkable. Anyone watching sees one short-lived pseudonym, never the history.
2. **Hide our payout address** 🟡: offers commit to `H(recipient, salt)`, so our server never learns where the money goes. Small contract change.
3. **Shielded settlement** 🔭 (the north star):
   - Every sale pays into a pool as a note bound to a per-sale one-time commitment (a dynamic QR, like UPI).
   - The merchant withdraws through a ZK proof that also enforces the holdback against a private account balance.
   - Nobody (not even the customer) can see a shop's totals or debt.
   - This is a privacy-pool-style system (Kohaku / Privacy Pools / Aztec). We pitch it; it's not a 36-hour build.

**Compliant privacy** 🔭: Privacy-Pools-style association sets (prove "my funds aren't from a sanctioned set") and **selective-disclosure keys**, so a merchant can prove their history to a regulator or a bank *by choice*.

---

## 7. The end-to-end journey

```
① Onboard   zkTLS of seller dashboard ─► issuer (business nullifier) ─► Business Pass leaf onchain
② Shop      Merchant registers a fresh pseudonymous shop ID; prints a QR
③ Offer     App reads tree via Anon-RPC, builds Business Pass proof in browser (Noir/bb.js)
            Agents: red lines → Underwriter (Mistral) → independent Critic (Kimi) → clamp → EIP-712 offer
④ Delegate  Once: World Agent Pass approves the merchant's managed agent + limits → mandate onchain (denied → no mandate)
⑤ Draw      Automatic: managed agent → offer → relayer drawByMandate ─► USDC to a fresh address. Nobody taps.
⑥ Sell      Customers pay the QR; 10% repays automatically; voice: "Recibiste 10 dólares, 1 fue a tu adelanto"
⑦ Repaid    Relayer claims the Standing Pass (count = 1). Merchant rotates to a new shop ID.
⑧ Grow      Next advance: Standing Pass proof (tier 1+) from a fresh shop and a fresh wallet: no visible link.
⑨ Default   No repaying sale for 30 days → anyone writes off → junior absorbs → junior TWAP falls → Risk agent lowers caps
```

---

## 8. What to build at the hackathon, in order

| # | Item | Effort | Unlocks |
|---|---|---|---|
| 1 | **Check Anon-RPC on Sepolia**; integrate the harness in the app; whole-tree download for proofs | S–M | EF Anon-RPC / CROPS |
| 2 | **zkTLS provider spike:** pick one that works today with an authenticated merchant dashboard and an EVM-verifiable attestation | M | Business Pass |
| 3 | **Business Pass:** `BusinessPassRegistry` (2nd tree + issuer), `business_pass` Noir circuit, `drawFirst` takes the proof instead of `worldNullifierHash` | M–L | Private business verification + cold start |
| 4 | **Managed agent + mandates** with **World Agent Pass** delegation (denied path = no mandate), and **IDKit credential recovery** | M | World tracks; fully automatic credit |
| 5 | Pseudonym rotation after repayment (app flow + agents read Standing Pass/Business Pass bands) | S | Breaks linkability |
| 6 | Recipient commitment in the offer | S | Our server never learns the payout address |
| 7 | Minimum-repayment-per-window rule | S | Closes the tiny-sales loophole |
| — | Shielded settlement, OPRF nullifiers, association sets, selective disclosure | 🔭 | The pitch's north star |

**What wins it:** the demo shows a merchant proving "real business, real human, real revenue" with **zero personal data**, getting an AI-underwritten advance, repaying at the till, and coming back under a **new pseudonym with their reputation intact**, while judges watch the explorer and **can't link any of it**.
