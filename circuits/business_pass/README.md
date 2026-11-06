# business_pass (Noir)

Proves "I own a Business Pass whose revenue band ≥ `min_band`, whose business is ≥ 6 months old, and whose country is in the allowed set". It spends the pass's one-time first-advance nullifier and binds the first Standing Pass commitment and a `context`. Nothing else is revealed: not the leaf, not the band, not the country.

- **Leaf:** `Poseidon2(TAG_BIZ, h, country, revenue_band, age_ok)` with `h = Poseidon2(secret)`. The issuer recomputes it before signing `BusinessVerified`, and `BusinessPassRegistry.issue` inserts it.
- **Public inputs, in this order:** `[root, nullifier, min_band, commitment_next, context, allowed_countries[4]]`. They match `AdvanceBook.drawFirst` (context = `keccak(recipient, offerId) % P`) and tier-0 `registerMandate` (context = `mandateHash % P`, `min_band` = the mandate's band).
- **Nullifier:** `Poseidon2(TAG_BIZ_NULL, secret)`. **Next:** `Poseidon2(TAG_COMMIT, Poseidon2(secret_next), 1)`.
- **Size:** 4,532 gates (UltraHonk).

```bash
cd agents && uv run python scripts/bizpass_fixtures.py   # regenerate Prover.toml (drawFirst) + Mandate.toml (registerMandate)
../circuits/business_pass/build.sh                        # nargo test, prove both, BusinessPassVerifier.sol + fixtures
```

`PROVER=<name> ./build.sh` proves `<name>.toml` only. `agents/src/mra_agents/bizpass.py` uses this for devnet proofs. Those TOMLs contain secrets and are gitignored.
