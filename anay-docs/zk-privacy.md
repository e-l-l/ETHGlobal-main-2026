# ZK and privacy

## Goal

Make borrowing **safe by design**: no one can use the borrower's identity, contacts, books or history against them. Repayment is enforced by the payment flow, not by harassment.

Context: in Kenya and Nigeria, regulators have fined and shut down digital loan apps that harvested borrowers' contacts and shamed them publicly. We remove that possibility by never collecting the data.

## Threat model

| Adversary | Wants to learn | Defence | Status |
|---|---|---|---|
| Us (operator), lenders | Identity, phone, contacts | Not collected. Business Pass via zkTLS. World for uniqueness. | Hackathon |
| Lenders, agents | Offchain books (balance, transactions) | Business Pass reveals only country, revenue band, months active | Hackathon (zkTLS) |
| AI agents and the model provider | Personal data, raw books | Agents receive public onchain data and proven facts only | Hackathon |
| Lenders, agents, other apps | Full borrowing history | Standing Pass: prove a tier, not a history | Hackathon (Noir) |
| RPC provider | Which shop or wallet the app queries | Anon-RPC for all reads | Hackathon |
| Customers, neighbours, suppliers, explorers | "This shop owes money" | Neutral shop names, no advance on the pay screen, fixed advance sizes, shop rotation | Hackathon (partial) |
| A determined chain watcher | Per-shop sales and repayment share | Shielded jar on a shielded pool | Roadmap |

## "What the world sees"

Every screen has a toggle that splits it into what's **public onchain** (shop pseudonym, sales, split, commitments, nullifiers) and what stays **private on the device** (credential secrets, seller account, full books). It turns the threat model into something a judge can check on any screen. Explorer links back it up: a pseudonymous shop, commitments and nullifiers, and no identity anywhere.

## Privacy levels

### Level 0: basics (no ZK, about 2 hours)
- No phone number, contact access, ID upload or photo anywhere in the flow.
- Shop names don't mention debt: `chai-stall.pay`, never `chai-stall.advance`.
- The customer's pay screen never mentions the advance.
- Advances come in **fixed sizes** ($50, $100, $250, $500) so amounts don't fingerprint the borrower.
- Every RPC read goes through Anon-RPC.
- No analytics or trackers in the client.

### Level 1: Business Pass (zkTLS, onboarding)

The merchant logs into their seller dashboard and proves facts about it without showing it to us.

| Fact | Revealed as | Fails with |
|---|---|---|
| Country | `Argentina` | — |
| Monthly revenue | A band (for example band 1: $500–2k, band 2: $2k–5k, band 3: $5k+; to tune) | "Revenue too low" |
| Account age | `6+ months` | "Too new" |
| Account status | Not shown, only checked | "Suspended" |

Nothing else leaves the session: no name, balance, transactions or customers.

- **Nullifier:** derived from the seller account ID, so one seller account gets one Business Pass. It doesn't reveal the account.
- **Binding:** the proof's context includes the shop ID, so it can't be replayed for another shop.
- **Flow:** QR or deep link starts the zkTLS session, the merchant logs in, the proof takes 2–30 seconds, and the API validates the attestation before `BusinessPass` records the facts.
- **Demo source:** our own demo seller portal, standing in for Mercado Pago, with seeded accounts. We can't count on a live Mercado Pago provider during the hackathon. Production would use real providers (Mercado Pago, M-Pesa, Paystack). Say this plainly in the pitch.

### Level 2: Standing Pass (Noir)

A private, reusable credit record. You prove "I've fully repaid at least k advances," and nobody learns which advances, which shops or when.

**Credential**

```
h          = Poseidon2(secret)
commitment = Poseidon2(h, count)        // stored as a leaf in StandingPass tree
nullifier  = Poseidon2(secret, DOMAIN)  // published when the credential is spent
```

The secret is generated and stored only on the merchant's device.

**Lifecycle**
1. **First advance.** When the merchant activates their agent, the app submits `h1`. `PolicyGuard` stores pending commitment `Poseidon2(h1, 1)` with the shop's first advance, backed by the Business Pass.
2. **Full repayment.** `AdvanceManager` inserts the pending commitment into the tree. The credential is now live. The app shows "You've repaid 1 advance, your limit is now $100, nobody can see your history."
3. **Next limit.** The merchant proves in the browser that they own a live credential with count `k ≥ tier`. The proof spends it (publishing the nullifier) and binds a new pending commitment with count `k + 1`. The proof can target the same shop or a **fresh shop**.
4. **Default.** The pending commitment is never inserted. The old credential is already spent, so there's nothing left to borrow with.

The scheme also guarantees two things:
- **At most one active advance.** Each live credential can be spent once, and the next one only exists after repayment.
- **No restart after default.** The Business Pass nullifier is one per seller account, and World allows one agent per human.

**Circuit: `standing_pass`**

| Input | Visibility | Constraint |
|---|---|---|
| `secret`, `count`, `path`, `index` | private | `Poseidon2(Poseidon2(secret), count)` is a leaf under `root` via `path` |
| `secret_next` | private | fresh |
| `root` | public | must be a recent root known to the contract |
| `nullifier` | public | `= Poseidon2(secret, DOMAIN)`, unused |
| `tier` | public | `count ≥ tier` |
| `commitment_next` | public | `= Poseidon2(Poseidon2(secret_next), count + 1)` |
| `context` | public | `= hash(shopId, payoutAddress, offerId)`, so the proof can't be front-run or replayed |

- Tree depth: 16 (65k leaves). This keeps proving fast on low-end Android.
- Verifier: generated with Barretenberg (`bb`), deployed alongside `StandingPass`.
- **Gotcha:** onchain leaf insertion needs Poseidon2 in Solidity that exactly matches Noir's. Check a Solidity Poseidon2 library against Noir test vectors **first**. If no match works in time, fall back to keccak in the circuit, which makes proofs slower.

**Start fresh shop.** The merchant rotates to a new shop pseudonym and a new payout address, then proves their Standing Pass for it. The new shop starts at the earned tier, and the explorer shows no link to the old one.

**Demo:** a merchant repays, starts a fresh shop, proves tier 1 and gets a higher limit. The explorer shows no link between the two shops.

### Level 3: shielded jar (roadmap)

Every shop sends 10% of each sale into a dollar jar, **whether or not it has an advance**. Private state decides whether the jar is savings or repayment, so nobody can tell who owes. This needs a shielded pool: EF's Kohaku SDK (Privacy Pools, Railgun) or a privacy chain such as Aztec. It also turns the product into automatic dollar savings with credit built in.

## Backup and recovery

Credential secrets live only on the device, so losing the phone would lose the reputation.

- **Backup and export** (Settings): the app encrypts the secrets. The merchant can export the encrypted file or store it with us. We can't read it.
- **Recover on a new phone:** a World ID check (IDKit) proves the same human who made the backup, and unlocks it. The merchant can cancel at any point, and nothing changes.
- **Trade-off:** tying a backup to a World ID check means our server can tell that one backup belongs to one human. It can't read the backup or link it to a shop. Merchants who don't want this can keep an exported file only.

## Known limitations (be honest in the pitch)

- **The shop's repayment flow is public.** The router split is visible onchain. The Standing Pass and shop rotation hide history across shops and lenders, not the current advance on a known shop.
- **zkTLS trust.** Depending on the provider, a notary or attester is trusted not to collude with the merchant. And at the hackathon the data source is our own demo portal, so the demo shows the mechanism, not real-world trust.
- **Agent Pass `sub`.** World describes a stable per-person identifier. We must not store it or put it onchain, and our server still sees it during approval.
- **Small anonymity set.** In a demo with a few credentials, there are few candidates to hide among. Real privacy needs volume.
- **Timing correlation.** Repaying and then rotating to a fresh shop immediately can link the two. The app should suggest waiting.
- **Regulation.** Production lending needs licensing and KYC in most markets. The plan is selective disclosure: the merchant can reveal their records to a regulator, while the public and the operator still can't see them.
