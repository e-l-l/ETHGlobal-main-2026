"""Business Pass issuer: HMAC nullifier, leaf recomputation, EIP-712 BusinessVerified (Solidity vector)."""

import pytest
from eth_account import Account

from mra_agents import zk
from mra_agents.issuer import (
    BusinessClaim,
    Issuer,
    IssuerError,
    business_nullifier,
    business_verified_digest,
    business_verified_message,
)

REG = "0x2e234DAe75C793f67A35089C9d99245E1C58470b"
LEAF = 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43


def test_solidity_vector():
    # BusinessPassRegistry.hashBusinessVerified at REG, chainId 31337 (contracts/test/Eip712Vectors.t.sol)
    assert business_verified_digest(42, LEAF, 1_800_000_000, 31337, REG) == \
        "0x33b9ef7df45f740ccc27cfaa49932f91a79990af90592fb2c9f8af46a78bd702"


def test_nullifier_is_peppered_and_stable():
    a = business_nullifier(b"pepper", "acct_123")
    assert a == business_nullifier(b"pepper", "acct_123") and a != business_nullifier(b"pepper2", "acct_123")
    assert a != business_nullifier(b"pepper", "acct_124") and 0 < a < 2**256
    with pytest.raises(IssuerError):
        business_nullifier(b"", "x")


def _issuer(claim):
    acct = Account.create()
    seen = {}

    def verify(proof, leaf):
        seen["leaf"] = leaf
        return claim

    return acct, Issuer(acct.key.hex(), b"pepper", chain_id=31337, registry=REG, verify_zktls=verify), seen


def test_attest_signs_recomputed_leaf_and_discards_account():
    acct, iss, seen = _issuer(BusinessClaim("acct_123", 32, 2, 1))
    h = zk.h_of(123456789)
    out = iss.attest({"proof": 1}, h, 32, 2, 1, now=1000)
    assert out["commitment"] == LEAF == seen["leaf"]  # zkTLS context must be the leaf
    assert out["businessNullifier"] == business_nullifier(b"pepper", "acct_123")
    assert out["expiresAt"] == 1000 + 3600
    msg = business_verified_message(out["businessNullifier"], LEAF, out["expiresAt"], 31337, REG)
    assert Account.recover_message(msg, signature=bytes.fromhex(out["signature"][2:])) == acct.address
    assert "acct_123" not in repr(out) and "pepper" not in repr(iss) and acct.key.hex() not in repr(iss)


@pytest.mark.parametrize("claimed", [(566, 2, 1), (32, 3, 1)])
def test_attest_rejects_attributes_not_proven(claimed):
    _, iss, _ = _issuer(BusinessClaim("acct_123", 32, 2, 1))
    with pytest.raises(IssuerError):
        iss.attest({}, zk.h_of(1), *claimed, now=0)


def test_attest_rejects_young_business_and_bad_h():
    _, iss, _ = _issuer(BusinessClaim("acct_123", 32, 2, 0))
    with pytest.raises(IssuerError):
        iss.attest({}, zk.h_of(1), 32, 2, 0, now=0)
    with pytest.raises(IssuerError):
        iss.attest({}, zk.P, 32, 2, 1, now=0)


def test_business_nullifier_matches_node_issuer_vector():
    """Both issuers must give the same nullifier for the same business, or one business could get two passes.
    Vector from issuer/README (Node): pepper 0x11 x 32, Don Pepe's demo account id."""
    from mra_agents.issuer import business_nullifier

    got = business_nullifier(bytes([0x11]) * 32, "acc_18bf65eab2bc1711af938e15a335f20c")
    assert got == 0x0e0bcebbf3b835501d7fcd11a9cb2a68b2ba12f2075c6eef9ce44061fc324de5
    assert got < 21888242871839275222246405745257275088548364400416034343698204186575808495617
