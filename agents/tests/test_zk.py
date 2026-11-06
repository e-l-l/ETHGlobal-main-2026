"""Python Poseidon2 + credential formulas vs. the contracts/SPEC.md vectors and the Noir fixtures."""

import pytest
from eth_utils import keccak

from mra_agents import zk
from mra_agents.bizpass import Limits, MandateRequest, mandate_context, prover_inputs

SPEC = {
    "h": 0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9b,
    "commit1": 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f,
    "null": 0x0cf89fcd279f976f879be030c4624455df2d39f63e99eb51b8f584cbe2493c84,
    "empty": 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3,
}


def test_spec_vectors():
    assert zk.poseidon2(1000, 2000) == 0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8a
    assert zk.h_of(123456789) == SPEC["h"]
    assert zk.standing_commitment(123456789, 1) == SPEC["commit1"]
    assert zk.standing_nullifier(123456789) == SPEC["null"]
    assert zk.EMPTY_ROOT == SPEC["empty"]
    assert zk.merkle_path([1], 0)[2] == 0x0730cfe06254f1d70d09db1974d720fbb8e3b8e75f1c116466d3cb850ac6b8f4
    assert zk.merkle_path([1, 2], 1)[2] == 0x0845b34d79339209303ed8f456c75d762ec77145d79d40a49941169ae85e34d3
    assert zk.merkle_path([1, 2, 3], 0)[2] == 0x2b09a6c5ef1a0755e9c595fec30b72a4bdb1053fc8a253db86ed2147010c5a9b


def test_tags_are_keccak_mod_p():
    assert zk.TAG_COMMIT == 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1
    assert zk.TAG_NULL == 0x0f08cced1499e13a50af6f29ab9ee272a40d4e4713313e8ff11d52bfe9fb2f42
    assert zk.TAG_BIZ == 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8b
    assert zk.TAG_BIZ_NULL == 0x075964a690d1888b50278bf8b2aed0ca04febb6b1f1c68514fe4450e85164226


def test_business_pass_vectors_match_noir_and_foundry():
    # circuits/business_pass test_spec_vectors and contracts/test/BusinessPassE2E.t.sol
    assert zk.business_leaf(123456789, 32, 2, 1) == 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43
    assert zk.business_nullifier(123456789) == 0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434ef
    assert zk.merkle_path([zk.business_leaf(123456789, 32, 2, 1)], 0)[2] == \
        0x1da5b44f817335e17c31ff665643e7c8252c28aa6a3f1f594310b3a4fd9f5851
    assert zk.offer_context("0x000000000000000000000000000000000000bEEF", (1).to_bytes(32, "big")) == \
        0x2da7d3844245eb02c1913f4900e2fc846502b815c06dface72203765865992b7


def test_leaf_hides_nothing_but_binds_attributes():
    base = zk.business_leaf(7, 32, 2, 1)
    assert len({base, zk.business_leaf(7, 566, 2, 1), zk.business_leaf(7, 32, 3, 1), zk.business_leaf(8, 32, 2, 1)}) == 4
    for bad in ((0, 2, 1), (32, 256, 1), (32, 2, 2), (2**16, 2, 1)):
        with pytest.raises(ValueError):
            zk.business_leaf(7, *bad)
    with pytest.raises(ValueError):
        zk.poseidon2(zk.P)


def test_merkle_path_recomputes_root():
    leaves = [zk.poseidon2(i) for i in range(1, 8)]
    for i in range(len(leaves)):
        path, bits, root = zk.merkle_path(leaves, i)
        node = leaves[i]
        for sib, right in zip(path, bits):
            node = zk.poseidon2(sib, node) if right else zk.poseidon2(node, sib)
        assert node == root
    assert len({zk.merkle_path(leaves, i)[2] for i in range(7)}) == 1


def test_mandate_context_matches_foundry_fixture():
    r = MandateRequest(shop_id=keccak(text="chai-stall"), agent_key="0x3805Ecc0043365A3d1c6b68ABD41dEC19C988d08",
                       recipient="0x000000000000000000000000000000000000bEEF",
                       limits=Limits(100_000_000, 250_000_000, 30 * 86400, 1_800_000_000), tier=0, band=1)
    assert mandate_context(r) == 0x246fd9403177080a71c53bea7247015857943cbb7371d1e8762a7a9e1421973e


def test_prover_inputs_reject_wrong_leaf():
    leaf = zk.business_leaf(5, 32, 1, 1)
    inp = prover_inputs(secret=5, country=32, revenue_band=1, age_ok=1, leaves=[11, leaf], leaf_index=1,
                        secret_next=6, min_band=1, context=9)
    assert inp.nullifier == zk.business_nullifier(5) and 'index_bits = [true, false' in inp.toml
    with pytest.raises(ValueError):
        prover_inputs(secret=5, country=32, revenue_band=2, age_ok=1, leaves=[11, leaf], leaf_index=1,
                      secret_next=6, min_band=1, context=9)
