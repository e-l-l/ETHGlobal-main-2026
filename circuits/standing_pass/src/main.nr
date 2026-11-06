// Standing Pass: prove "I own an unspent credential for >= `tier` repaid advances"
// without revealing which one, then bind a fresh credential for count + 1.
//
// Must match contracts/SPEC.md exactly:
//   h          = Poseidon2::hash([secret], 1)
//   commitment = Poseidon2::hash([TAG_COMMIT, h, count], 3)      (tree leaf)
//   nullifier  = Poseidon2::hash([TAG_NULL, secret], 2)
//   node       = Poseidon2::hash([left, right], 2), depth 16, zero leaf = 0
// Public inputs, in this order: [root, nullifier, tier, commitment_next, context]
// The verifier (AdvanceBook.drawWithPass) supplies them in the same order.

use poseidon::poseidon2::Poseidon2;

global DEPTH: u32 = 16;
// keccak256("standing-pass.commit") % P
global TAG_COMMIT: Field = 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1;
// keccak256("standing-pass.nullifier") % P
global TAG_NULL: Field = 0x0f08cced1499e13a50af6f29ab9ee272a40d4e4713313e8ff11d52bfe9fb2f42;

fn commitment(secret: Field, count: Field) -> Field {
    let h = Poseidon2::hash([secret], 1);
    Poseidon2::hash([TAG_COMMIT, h, count], 3)
}

fn merkle_root(leaf: Field, path: [Field; DEPTH], index_bits: [bool; DEPTH]) -> Field {
    let mut node = leaf;
    for i in 0..DEPTH {
        let (left, right) = if index_bits[i] { (path[i], node) } else { (node, path[i]) };
        node = Poseidon2::hash([left, right], 2);
    }
    node
}

fn main(
    // private
    secret: Field,
    count: Field,
    path: [Field; DEPTH],
    index_bits: [bool; DEPTH],
    secret_next: Field,
    // public
    root: pub Field,
    nullifier: pub Field,
    tier: pub Field,
    commitment_next: pub Field,
    context: pub Field,
) {
    // 1. I own a credential in the tree.
    assert(merkle_root(commitment(secret, count), path, index_bits) == root, "not in tree");

    // 2. Spending it publishes its nullifier (domain-separated from commitments).
    assert(Poseidon2::hash([TAG_NULL, secret], 2) == nullifier, "bad nullifier");

    // 3. count >= tier >= 1. Range-check before casting so the comparison can't wrap.
    count.assert_max_bit_size::<32>();
    tier.assert_max_bit_size::<32>();
    let c = count as u32;
    let t = tier as u32;
    assert(t >= 1, "tier must be >= 1");
    assert(c >= t, "count below tier");

    // 4. The next credential has count + 1 and a fresh secret.
    assert(secret_next != secret, "reuse secret");
    assert(commitment(secret_next, count + 1) == commitment_next, "bad next commitment");

    // 5. `context` = keccak(recipient, offerId) % P binds the proof to one payout.
    //    It is a public input, so changing it invalidates the proof; this line just
    //    makes the dependency explicit.
    let _ = context;
}

// ---------- tests (values from an independent Python Poseidon2, see contracts/SPEC.md) ----------

#[test]
fn test_spec_vectors() {
    assert(Poseidon2::hash([1000, 2000], 2) == 0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8a);
    assert(Poseidon2::hash([123456789], 1) == 0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9b);
    assert(commitment(123456789, 1) == 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f);
    assert(Poseidon2::hash([TAG_NULL, 123456789], 2) == 0x0cf89fcd279f976f879be030c4624455df2d39f63e99eb51b8f584cbe2493c84);
}

#[test]
fn test_empty_root() {
    let mut z = 0;
    for _ in 0..DEPTH {
        z = Poseidon2::hash([z, z], 2);
    }
    assert(z == 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3);
}
