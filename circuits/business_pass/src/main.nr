// Business Pass: prove "I own a Business Pass whose revenue band >= min_band, whose business is >= 6 months
// old, and whose country is in the allowed set", spend its one-time first-advance nullifier, and bind the
// first Standing Pass commitment and the payout (context). Reveals nothing else: not the leaf, not the band,
// not the country.
//
// Must match contracts/SPEC.md (v2) exactly:
//   h               = Poseidon2::hash([secret], 1)
//   leaf            = Poseidon2::hash([TAG_BIZ, h, country, revenue_band, age_ok], 5)
//                     (computed by the merchant's device, recomputed by the issuer before it signs
//                      BusinessVerified; BusinessPassRegistry only inserts it)
//   nullifier       = Poseidon2::hash([TAG_BIZ_NULL, secret], 2)    (one first advance per Business Pass)
//   commitment_next = Poseidon2::hash([TAG_COMMIT, h_next, 1], 3)    h_next = Poseidon2::hash([secret_next], 1)
//   node            = Poseidon2::hash([left, right], 2), depth 16, zero leaf = 0
// Public inputs, in this order:
//   [root, nullifier, min_band, commitment_next, context, allowed_countries[0..4]]
// AdvanceBook supplies them in the same order: drawFirst (context = keccak(recipient, offerId) % P) and
// registerMandate for tier 0 (context = mandateHash % P, min_band = the mandate's band).
// Country: a public allowed SET (4 slots, from BusinessPassRegistry.countrySet) instead of a public country
// code, so a draw reveals "one of AR/NG/KE" rather than which one; with few merchants per country a public
// code would shrink the anonymity set a lot.

use poseidon::poseidon2::Poseidon2;

global DEPTH: u32 = 16;
// keccak256("standing-pass.commit") % P
global TAG_COMMIT: Field = 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1;
// keccak256("standing-pass.biz") % P
global TAG_BIZ: Field = 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8b;
// keccak256("standing-pass.biz.nullifier") % P
global TAG_BIZ_NULL: Field = 0x075964a690d1888b50278bf8b2aed0ca04febb6b1f1c68514fe4450e85164226;

fn biz_leaf(secret: Field, country: Field, revenue_band: Field, age_ok: Field) -> Field {
    let h = Poseidon2::hash([secret], 1);
    Poseidon2::hash([TAG_BIZ, h, country, revenue_band, age_ok], 5)
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
    country: Field,
    revenue_band: Field,
    age_ok: Field,
    path: [Field; DEPTH],
    index_bits: [bool; DEPTH],
    secret_next: Field,
    // public
    root: pub Field,
    nullifier: pub Field,
    min_band: pub Field,
    commitment_next: pub Field,
    context: pub Field,
    allowed_countries: pub [Field; 4],
) {
    // 0. Attribute ranges (country 16 bits, band 8 bits) so the comparisons below cannot wrap.
    country.assert_max_bit_size::<16>();
    revenue_band.assert_max_bit_size::<8>();
    min_band.assert_max_bit_size::<8>();
    assert(age_ok == 1, "business younger than 6 months");
    assert(country != 0, "no country");

    // 1. I own a Business Pass in the tree.
    assert(merkle_root(biz_leaf(secret, country, revenue_band, age_ok), path, index_bits) == root, "not in tree");

    // 2. One-time first-advance nullifier (domain-separated from the Standing Pass nullifier).
    assert(Poseidon2::hash([TAG_BIZ_NULL, secret], 2) == nullifier, "bad nullifier");

    // 3. revenue_band >= min_band (both range-checked to 8 bits above, so the cast can't wrap).
    assert((revenue_band as u8) >= (min_band as u8), "revenue band below minimum");

    // 4. country in the allowed set (0 slots are padding and never match: country != 0).
    let mut prod = 1;
    for i in 0..4 {
        prod *= country - allowed_countries[i];
    }
    assert(prod == 0, "country not allowed");

    // 5. First Standing Pass commitment (count 1) under a fresh secret, so h_next is unlinkable to the
    //    h published at issuance.
    assert(secret_next != secret, "reuse secret");
    let h_next = Poseidon2::hash([secret_next], 1);
    assert(Poseidon2::hash([TAG_COMMIT, h_next, 1], 3) == commitment_next, "bad next commitment");

    // 6. context = keccak(recipient, offerId) % P binds the proof to one payout (public input).
    let _ = context;
}

#[test]
fn test_spec_vectors() {
    assert(Poseidon2::hash([1000, 2000], 2) == 0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8a);
    assert(Poseidon2::hash([123456789], 1) == 0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9b);
    // contracts/SPEC.md v2 vectors (also checked by agents/tests/test_zk.py)
    assert(biz_leaf(123456789, 32, 2, 1) == 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43);
    assert(Poseidon2::hash([TAG_BIZ_NULL, 123456789], 2) == 0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434ef);
}

#[test(should_fail_with = "business younger than 6 months")]
fn test_age_not_ok_fails() {
    let mut path = [0; DEPTH];
    let bits = [false; DEPTH];
    let leaf = biz_leaf(7, 32, 2, 0);
    let mut z = 0;
    for i in 0..DEPTH {
        path[i] = z;
        z = Poseidon2::hash([z, z], 2);
    }
    let root = merkle_root(leaf, path, bits);
    let h_next = Poseidon2::hash([8], 1);
    main(7, 32, 2, 0, path, bits, 8, root, Poseidon2::hash([TAG_BIZ_NULL, 7], 2), 1,
         Poseidon2::hash([TAG_COMMIT, h_next, 1], 3), 5, [32, 566, 404, 0]);
}

#[test(should_fail_with = "revenue band below minimum")]
fn test_band_below_min_fails() {
    let mut path = [0; DEPTH];
    let bits = [false; DEPTH];
    let leaf = biz_leaf(7, 32, 1, 1);
    let mut z = 0;
    for i in 0..DEPTH {
        path[i] = z;
        z = Poseidon2::hash([z, z], 2);
    }
    let root = merkle_root(leaf, path, bits);
    let h_next = Poseidon2::hash([8], 1);
    main(7, 32, 1, 1, path, bits, 8, root, Poseidon2::hash([TAG_BIZ_NULL, 7], 2), 2,
         Poseidon2::hash([TAG_COMMIT, h_next, 1], 3), 5, [32, 566, 404, 0]);
}

#[test(should_fail_with = "country not allowed")]
fn test_country_not_allowed_fails() {
    let mut path = [0; DEPTH];
    let bits = [false; DEPTH];
    let leaf = biz_leaf(7, 76, 2, 1);
    let mut z = 0;
    for i in 0..DEPTH {
        path[i] = z;
        z = Poseidon2::hash([z, z], 2);
    }
    let root = merkle_root(leaf, path, bits);
    let h_next = Poseidon2::hash([8], 1);
    main(7, 76, 2, 1, path, bits, 8, root, Poseidon2::hash([TAG_BIZ_NULL, 7], 2), 1,
         Poseidon2::hash([TAG_COMMIT, h_next, 1], 3), 5, [32, 566, 404, 0]);
}

#[test]
fn test_valid_minimal() {
    let mut path = [0; DEPTH];
    let bits = [false; DEPTH];
    let leaf = biz_leaf(7, 566, 3, 1);
    let mut z = 0;
    for i in 0..DEPTH {
        path[i] = z;
        z = Poseidon2::hash([z, z], 2);
    }
    let root = merkle_root(leaf, path, bits);
    let h_next = Poseidon2::hash([8], 1);
    main(7, 566, 3, 1, path, bits, 8, root, Poseidon2::hash([TAG_BIZ_NULL, 7], 2), 3,
         Poseidon2::hash([TAG_COMMIT, h_next, 1], 3), 5, [32, 566, 404, 0]);
}
