# ZK and privacy

## Goal

Make borrowing **safe by design**: no one can use the borrower's identity, contacts or history against them. Repayment is enforced by the payment flow, not by harassment.

Context: in Kenya and Nigeria, regulators have fined and shut down digital loan apps that harvested borrowers' contacts and shamed them publicly. We remove that possibility by never collecting the data.

## Threat model

| Adversary | Wants to learn | Defence | Status |
|---|---|---|---|
| Us (operator), lenders | Identity, phone, contacts | Not collected. World ID ZK proof of uniqueness only. | Hackathon |
| AI agents and the model provider | Personal data, raw books | Agents receive public onchain data and proven facts only | Hackathon |
| Lenders, agents, other apps | Full borrowing history | Standing Pass: prove a tier, not a history | Hackathon (Noir) |
| RPC provider | Which shop or wallet the app queries | Anon-RPC for all reads | Hackathon |
| Neighbours, suppliers, explorers | "This shop owes money" | Neutral shop names, fresh payout addresses, fixed advance sizes | Hackathon (partial) |
| Lenders | Offchain books (Mercado Pago, M-Pesa) | zkTLS threshold proof | Stretch |
| A determined chain watcher | Per-shop sales and repayment share | Shielded jar on a shielded pool | Roadmap |

## Privacy levels

### Level 0: basics (no ZK, about 2 hours)
- No phone number, contact access, ID upload or photo anywhere in the flow.
- Shop names don't mention debt: `chai-stall.pay`, never `chai-stall.advance`.
- Advances go to a **fresh payout address**, in **fixed sizes** ($50, $100, $250, $500) so amounts don't fingerprint the borrower.
- Every RPC read goes through Anon-RPC.
- No analytics or trackers in the client.

### Level 1: Standing Pass (Noir, the ZK core)

A private, reusable credit record. You prove "I've fully repaid at least k advances," and nobody learns which advances, which wallets or when.

**Credential**

```
h          = Poseidon2(secret)                    // hash_1
commitment = Poseidon2(TAG_COMMIT, h, count)     // hash_3; leaf in the Standing Pass tree
nullifier  = Poseidon2(TAG_NULL, secret)         // hash_2; published when the credential is spent
// The domain tags keep commitments and nullifiers apart (ethskills noir). Exact values are in contracts/SPEC.md.
```

The secret is generated and stored only on the merchant's device.

**Lifecycle**
1. **First advance.** The merchant proves uniqueness with World ID (action `first-advance`, usable once per human). They submit `h1`. The contract stores pending commitment `Poseidon2(h1, 1)` with the advance.
2. **Full repayment.** Anyone (in practice, our relayer) calls `claimStandingPass`, which inserts the pending commitment into the tree. The credential is now live.
3. **Next advance.** The merchant proves in the browser that they own a live credential with count `k ≥ tier`. The proof spends it (publishing the nullifier) and binds a new pending commitment with count `k + 1`.
4. **Default.** The pending commitment is never inserted. The old credential is already spent, so there's nothing left to borrow with.

The scheme also guarantees two things:
- **At most one active advance.** Each live credential can be spent once, and the next one only exists after repayment.
- **No restart after default.** World ID `first-advance` works once per human.

**Circuit: `standing_pass`**

| Input | Visibility | Constraint |
|---|---|---|
| `secret`, `count`, `path`, `index` | private | `Poseidon2(Poseidon2(secret), count)` is a leaf under `root` via `path` |
| `secret_next` | private | fresh |
| `root` | public | must be a recent root known to the contract |
| `nullifier` | public | `= Poseidon2(secret, DOMAIN)`, unused |
| `tier` | public | `count ≥ tier` |
| `commitment_next` | public | `= Poseidon2(Poseidon2(secret_next), count + 1)` |
| `context` | public | `= hash(payoutAddress, offerId)`, so the proof can't be front-run or replayed |

- Tree depth: 16 (65k leaves). This keeps proving fast on low-end Android.
- Verifier: generated with Barretenberg (`bb`), called by `AdvanceBook.drawWithPass`.
- **Poseidon2 match: verified 2026-11-05.**
  - **Noir side:** use the `noir-lang/poseidon` library at v0.4.0, built for Noir 1.0.0: `poseidon::poseidon2::Poseidon2::hash(input, len)`. In Noir 1.0.0 the standard library's hasher is internal (`pub(crate)`). Only `std::hash::poseidon2_permutation` is public.
  - **Solidity side:** `zemse/poseidon2-evm`, already deployed on Sepolia. Yul version at `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2`, Huff version at `0xB25421813D7d7B8001BB19d6b70642A277422eff`. Call `hash_1`, `hash_2` or `hash_3`.
  - **Test:** 34 of 34 cases matched on both deployments. They covered the official Noir and Barretenberg test values, the Standing Pass hashes (`h`, leaf, nullifier, next commitment, Merkle node), edge values (0, p−1) and 24 random inputs.
  - **Gas:** about 14.3k per hash for Yul, 9.6k for Huff. **Measured in the built contract:** about 20k gas per call including call overhead, so a depth-16 insert is about **372k gas** (about $0.06 on mainnet today).
  - **Watch out:** the library reduces inputs mod p, so `hash(p+5) == hash(5)`. Always reduce keccak-derived values (such as `context`) mod p before hashing or passing them to the circuit, or the contract and the circuit will disagree.
  - **Confirmed with the real compiler (nargo 1.0.0-rc.3):** `nargo test` reproduces the same vectors and the empty root.
  - The library isn't audited, which is fine for a hackathon.

**Built and verified end to end (2026-11-05):** `circuits/standing_pass`, 4,398 gates. A real `bb` proof passes the generated `HonkVerifier` inside `AdvanceBook.drawWithPass`. It can't be redirected, replayed or tampered with (`contracts/test/StandingPassE2E.t.sol`). Gas: about 2.8M for verification and 3.09M for the whole draw, about $0.52 on mainnet at 0.07 gwei and $2,414 per ETH.

**Toolchain:** nargo **1.0.0-rc.3** + bb **6.0.0**, the pair shipped together in Aztec v6.0.0. `bbup -nv 1.0.0` has no map entry yet. For browser proving use `@aztec-foundation/bb.js@6.0.0` (new scope).

**Demo:** a merchant repays, opens a fresh wallet, proves tier 1 and unlocks a higher limit. Public metadata may correlate the two wallets.

### ethskills `noir` rules we must follow

- **Never send the proof from the merchant's own wallet.** The public sender would link the advances the proof keeps apart. Use a relayer, or a fresh account paid for by a paymaster that was never funded from the merchant's wallet. The contract never reads `msg.sender` in the draws.
- **Bind the proof to the recipient.** The `context` public input is `keccak(recipient, offerId) % P`, so a copied proof can't be redirected. The contract tests already check this.
- **Save each credential on the device:** `secret` and `leafIndex`. Losing them means losing your credit history. Offer an export or backup (task Z5).
- **Build the Merkle path from events, offchain.** `LeafInserted(commitment, leafIndex, newRoot)` is emitted on every insert. The app's mirror must be a **fixed depth-16 tree padded with zeros, using Poseidon2 from `@aztec/bb.js`**. `@zk-kit/lean-imt` gives different roots.
- **Any historical root is accepted,** so an honest proof doesn't fail when another insert lands first.
- **Tooling:**
  - `nargo compile`, then `nargo execute`, then `bb` for everything else
  - generate the VK and verifier with `--verifier_target evm`
  - browser proving: `UltraHonkBackend` with `{ verifierTarget: "evm" }`
  - pin `@aztec/bb.js` to `bb --version`
  - the verifier needs solc ≥0.8.27 and the optimizer turned on
- **Every private input must be constrained,** and public inputs must be in the order `[root, nullifier, tier, commitmentNext, context]`.

### Level 2: zkTLS sales proof (stretch)

The merchant proves their Mercado Pago, M-Pesa or Paystack statement shows sales of at least $X a month, from at least N customers, and reveals nothing else. This fixes **cold start** (new merchants have no onchain history) without exposing their books. Check before 21:00 whether a zkTLS SDK such as Reclaim or vlayer has a working provider for these sites.

### Level 3: shielded jar (roadmap)

A shielded repayment design is a future research idea, not the current product. Today the repayment slice applies only while an advance is active, and sales and advances are public.

## Known limitations (be honest in the pitch)

- **The shop's repayment flow is public.** The router split is visible onchain. The Standing Pass hides history across wallets and lenders, not the current advance on a known shop.
- **Small anonymity set.** In a demo with a few credentials, there are few candidates to hide among. Real privacy needs volume.
- **Timing correlation.** Repaying and then borrowing again immediately can link two advances. The app should suggest waiting, or batch requests.
- **Regulation.** Production lending needs licensing and KYC in most markets. The plan is selective disclosure: the merchant can reveal their records to a regulator, while the public and the operator still can't see them.
