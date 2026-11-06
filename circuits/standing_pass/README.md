# standing_pass (Noir)

Proves "I own an unspent Standing Pass credential for at least `tier` repaid advances", and nothing else. It also binds a fresh credential for `count + 1` and the payout address (`context`).

- **Public inputs, in this order:** `[root, nullifier, tier, commitment_next, context]`. This matches `AdvanceBook.drawWithPass`.
- **Size:** 4,398 gates (UltraHonk). Small enough to prove in a phone browser.
- **Hash:** Poseidon2 from `noir-lang/poseidon` v0.4.0. It matches the Solidity Poseidon2 at `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2` and the `contracts/SPEC.md` vectors.

```bash
noirup -v 1.0.0-rc.3 && bbup -v 6.0.0   # pinned pair; `bbup -nv 1.0.0` has no map entry yet
./build.sh                               # test, compile, prove, verify, regenerate the verifier and fixture
```

`Prover.toml` is a valid example: secret `123456789`, count 1, a leaf at index 2 of the tree `[0x1111, 0x2222, leaf]`, recipient `0xbEEF`, offerId `1`.

**Browser proving:** use `@noir-lang/noir_js` with `@aztec-foundation/bb.js@6.0.0`. That package moved to the `@aztec-foundation` scope in Aztec v6; ethskills still says `@aztec/bb.js`. Use `UltraHonkBackend` and `{ verifierTarget: "evm" }`.
