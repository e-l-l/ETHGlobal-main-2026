"""Relayer validation, rate limiting and the privacy rule (always the relayer key), offline."""

from __future__ import annotations

import logging

import pytest

from mra_agents.config import Settings
from mra_agents.models import Offer, SignedOffer
from mra_agents.relayer import BN254_P, RateLimited, Relayer, RelayError

NOW = 1_800_000_000
SHOP_A = "0x" + "aa" * 32
SHOP_B = "0x" + "bb" * 32
SIG = "0x" + "11" * 64 + "1b"  # v = 27
PROOF = "0x" + "ab" * 64


def signed(*, tier=0, pn=42, band=0, shop=SHOP_A, expires=NOW + 900, amount=100_000_000, sig=SIG, oid=1, **kw):
    o = {"offer_id": "0x" + f"{oid:064x}", "shop_id": shop,
         "recipient": "0x000000000000000000000000000000000000beef", "amount": amount, "fee_rate_bps_per_week": 50, "fee_cap_bps": 300,
         "holdback_bps": 1000, "tier": tier, "pass_nullifier": pn, "min_revenue_band": band, "expires_at": expires}
    o.update(kw)
    return SignedOffer(offer=Offer(**o), signature=sig, digest="0x" + "00" * 32)


def pass_offer(**kw):
    return signed(tier=1, pn=0, **kw)


class FakeWriter:
    def __init__(self):
        self.calls = []

    def send(self, fn_name, args, *, signer):
        self.calls.append((fn_name, args, signer))
        return "0x" + f"{len(self.calls):064x}"


@pytest.fixture
def w():
    return FakeWriter()


@pytest.fixture
def clock():
    return [float(NOW)]


@pytest.fixture
def relayer(w, clock):
    return Relayer(w, Settings(), now=lambda: clock[0])


# ---------------------------------------------------------------- happy paths & privacy


def test_draw_first_args_and_signer(relayer, w):
    tx = relayer.draw_first(signed(band=2), PROOF, 5, 7)
    (fn, args, signer), = w.calls
    assert fn == "drawFirst" and signer == "relayer" and tx == "0x" + f"{1:064x}"
    offer, sig, proof, root, nxt = args
    assert offer[2] == "0x000000000000000000000000000000000000bEEF"  # checksummed
    assert offer[0] == (1).to_bytes(32, "big") and offer[3:] == (100_000_000, 50, 300, 1000, 0, 42, 2, NOW + 900)
    assert len(sig) == 65 and sig[64] == 27 and proof == bytes.fromhex("ab" * 64) and (root, nxt) == (5, 7)


def test_draw_with_pass_args(relayer, w):
    relayer.draw_with_pass(pass_offer(), PROOF, "0x05", 6, BN254_P - 1)
    (fn, args, signer), = w.calls
    assert fn == "drawWithPass" and signer == "relayer"
    assert args[2] == bytes.fromhex("ab" * 64) and args[3:] == [5, 6, BN254_P - 1]


def test_claim(relayer, w):
    relayer.claim(3)
    assert w.calls == [("claimStandingPass", [3], "relayer")]


def test_only_relayer_signer_and_allowlisted_fns(relayer, w):
    relayer.draw_first(signed(oid=1), PROOF, 1, 1)
    relayer.draw_with_pass(pass_offer(oid=2), PROOF, 1, 2, 3)
    relayer.claim(9)
    assert {c[2] for c in w.calls} == {"relayer"}
    assert {c[0] for c in w.calls} == {"drawFirst", "drawWithPass", "claimStandingPass"}
    public = {n for n in dir(Relayer) if not n.startswith("_")}
    assert public == {"draw_first", "draw_with_pass", "draw_by_mandate", "register_mandate", "issue_business_pass",
                      "claim"}
    with pytest.raises(RelayError, match="function_not_allowed"):
        relayer._send("writeOff", [1], key="x", ctx="")


def test_accepts_dict_offer(relayer, w):
    relayer.draw_first(signed().model_dump(), PROOF, 1, 1)
    assert len(w.calls) == 1


# ---------------------------------------------------------------- expiry


@pytest.mark.parametrize("expires,ok", [(NOW + 16, True), (NOW + 15, True), (NOW + 14, False), (NOW - 1, False)])
def test_expiry_boundary(relayer, w, expires, ok):
    # min_validity_seconds = 15: an offer must still be valid 15 s from now
    if ok:
        relayer.draw_first(signed(expires=expires), PROOF, 1, 1)
        assert len(w.calls) == 1
    else:
        with pytest.raises(RelayError, match="offer_expired"):
            relayer.draw_first(signed(expires=expires), PROOF, 1, 1)
        assert w.calls == []


# ---------------------------------------------------------------- ZK field inputs


@pytest.mark.parametrize("v,ok", [(BN254_P - 1, True), (BN254_P, False), (BN254_P + 1, False), (0, False),
                                  (-1, False), (hex(BN254_P - 1), True), (hex(BN254_P), False),
                                  ("0x" + "f" * 65, False), ("12", False), (True, False), (1.0, False)])
def test_commitment_next_field_range(relayer, w, v, ok):
    if ok:
        relayer.draw_first(signed(), PROOF, 1, v)
    else:
        with pytest.raises(RelayError):
            relayer.draw_first(signed(), PROOF, 1, v)
    assert len(w.calls) == int(ok)


@pytest.mark.parametrize("which", ["root", "nullifier", "commitment_next"])
@pytest.mark.parametrize("v,ok", [(BN254_P - 1, True), (BN254_P, False), (2**256 - 1, False)])
def test_pass_field_range(relayer, w, which, v, ok):
    args = {"root": 1, "nullifier": 2, "commitment_next": 3, which: v}
    if ok:
        relayer.draw_with_pass(pass_offer(), PROOF, **args)
    else:
        with pytest.raises(RelayError, match="field_out_of_range"):
            relayer.draw_with_pass(pass_offer(), PROOF, **args)
    assert len(w.calls) == int(ok)


@pytest.mark.parametrize("proof", ["", "0x", "0xabc", "abcd", "0xzz", "0x" + "00" * (64 * 1024 + 1), None])
def test_bad_proof(relayer, w, proof):
    with pytest.raises(RelayError, match="bad_proof"):
        relayer.draw_with_pass(pass_offer(), proof, 1, 2, 3)
    assert w.calls == []


# ---------------------------------------------------------------- signature & offer fields


@pytest.mark.parametrize("sig", ["0x" + "11" * 64, "0x" + "11" * 66, "0x" + "11" * 64 + "1d", "0x" + "11" * 64 + "00",
                                 "11" * 65])
def test_bad_signature(relayer, w, sig):
    with pytest.raises(RelayError, match="bad_signature"):
        relayer.draw_first(signed(sig=sig), PROOF, 1, 1)
    assert w.calls == []


def test_v28_ok(relayer, w):
    relayer.draw_first(signed(sig="0x" + "11" * 64 + "1c"), PROOF, 1, 1)
    assert len(w.calls) == 1


@pytest.mark.parametrize("kw,code", [
    ({"amount": 75_000_000}, "bad_amount"),
    ({"fee_rate_bps_per_week": 49}, "bad_fee_terms"),
    ({"fee_cap_bps": 301}, "bad_fee_terms"),
    ({"holdback_bps": 499}, "bad_holdback"),
    ({"holdback_bps": 2_001}, "bad_holdback"),
    ({"tier": 1}, "bad_tier"),
    ({"pn": 0}, "missing_pass_nullifier"),
    ({"pn": BN254_P}, "bad_pass_nullifier"),
    ({"band": 256}, "bad_band"),
    ({"expires": 2**64}, "bad_expiry"),
])
def test_draw_first_offer_rules(relayer, w, kw, code):
    with pytest.raises(RelayError, match=code):
        relayer.draw_first(signed(**kw), PROOF, 1, 1)
    assert w.calls == []


@pytest.mark.parametrize("kw,code", [({"tier": 0, "pn": 0}, "bad_tier"), ({"tier": 4, "pn": 0}, "bad_tier"),
                                     ({"tier": 2, "pn": 5}, "unexpected_pass_nullifier"),
                                     ({"tier": 2, "pn": 0, "band": 1}, "unexpected_pass_nullifier")])
def test_draw_with_pass_offer_rules(relayer, w, kw, code):
    with pytest.raises(RelayError, match=code):
        relayer.draw_with_pass(signed(**kw), PROOF, 1, 2, 3)
    assert w.calls == []


def test_tampered_model_construct_is_revalidated(relayer, w):
    so = signed()
    bad = SignedOffer.model_construct(offer=Offer.model_construct(**{**so.offer.__dict__, "shop_id": "0xnothex"}),
                                      signature=SIG, digest=so.digest)
    with pytest.raises(RelayError, match="bad_offer"):
        relayer.draw_first(bad, PROOF, 1, 1)


@pytest.mark.parametrize("aid", [0, -1, 2**256, True, "1"])
def test_bad_claim_id(relayer, w, aid):
    with pytest.raises(RelayError, match="bad_advance_id"):
        relayer.claim(aid)
    assert w.calls == []


# ---------------------------------------------------------------- rate limits


def test_per_shop_rate_limit_sliding_window(w, clock):
    r = Relayer(w, Settings(), now=lambda: clock[0], per_shop_limit=2, per_shop_window=100, global_limit=100)
    r.draw_first(signed(oid=1), PROOF, 1, 1)
    r.draw_first(signed(oid=2), PROOF, 1, 1)
    with pytest.raises(RateLimited, match="shop"):
        r.draw_first(signed(oid=3), PROOF, 1, 1)
    r.draw_first(signed(oid=4, shop=SHOP_B), PROOF, 1, 1)  # other shop unaffected
    clock[0] += 99
    with pytest.raises(RateLimited):
        r.draw_first(signed(oid=5), PROOF, 1, 1)
    clock[0] += 1  # first hit is now exactly window old -> expires
    r.draw_first(signed(oid=6), PROOF, 1, 1)
    assert len(w.calls) == 4


def test_global_rate_limit(w, clock):
    r = Relayer(w, Settings(), now=lambda: clock[0], per_shop_limit=100, global_limit=3, global_window=60)
    r.draw_first(signed(oid=1), PROOF, 1, 1)
    r.draw_first(signed(oid=2, shop=SHOP_B), PROOF, 1, 1)
    r.claim(1)
    with pytest.raises(RateLimited, match="global"):
        r.claim(2)
    clock[0] += 60
    r.claim(2)
    assert len(w.calls) == 4


def test_claims_limited_per_advance(w, clock):
    r = Relayer(w, Settings(), now=lambda: clock[0], per_shop_limit=1)
    r.claim(1)
    with pytest.raises(RateLimited, match="advance"):
        r.claim(1)
    r.claim(2)


def test_invalid_requests_do_not_consume_quota(w, clock):
    r = Relayer(w, Settings(), now=lambda: clock[0], per_shop_limit=1)
    with pytest.raises(RelayError):
        r.draw_first(signed(), PROOF, 1, BN254_P)
    r.draw_first(signed(), PROOF, 1, 1)
    assert len(w.calls) == 1


# ---------------------------------------------------------------- logging


def test_logs_have_no_signature_or_proof_or_key(relayer, caplog):
    s = Settings(relayer_private_key="0x" + "77" * 32)
    r = Relayer(FakeWriter(), s, now=lambda: NOW)
    with caplog.at_level(logging.DEBUG, logger="mra_agents"):
        r.draw_with_pass(pass_offer(), PROOF, 1, 2, 3)
    text = caplog.text
    assert "drawWithPass" in text
    for secret in ("11" * 64, "ab" * 64, "77" * 32, "beef"):
        assert secret not in text.lower()


# ---------------------------------------------------------------- v2: mandates and Business Pass issuance

AGENT_SIG = "0x" + "22" * 64 + "1c"


def test_draw_by_mandate_args(relayer, w):
    relayer.draw_by_mandate(signed(pn=0, band=1), 7, AGENT_SIG)
    (fn, args, signer), = w.calls
    assert fn == "drawByMandate" and signer == "relayer"
    offer, osig, mid, asig = args
    assert offer[7:9] == (0, 0) and mid == 7 and len(osig) == 65 and asig == bytes.fromhex(AGENT_SIG[2:])


@pytest.mark.parametrize("kw,mid,asig,code", [
    ({"pn": 42}, 1, AGENT_SIG, "unexpected_pass_nullifier"),  # spent at registerMandate
    ({"pn": 0, "tier": 1, "band": 1}, 1, AGENT_SIG, "bad_band"),
    ({"pn": 0}, 0, AGENT_SIG, "bad_mandate_id"),
    ({"pn": 0}, True, AGENT_SIG, "bad_mandate_id"),
    ({"pn": 0}, 1, "0x" + "22" * 65, "bad_signature"),
])
def test_draw_by_mandate_rules(relayer, w, kw, mid, asig, code):
    with pytest.raises(RelayError, match=code):
        relayer.draw_by_mandate(signed(**kw), mid, asig)
    assert w.calls == []


def test_register_mandate_args(relayer, w):
    req = (b"\xaa" * 32, "0x000000000000000000000000000000000000a6e7", "0x000000000000000000000000000000000000beef",
           (50_000_000, 100_000_000, 2_592_000, NOW + 86400), 0, 1)
    relayer.register_mandate(req, PROOF, 1, 2, 3, 42, NOW + 3600, SIG, AGENT_SIG)
    (fn, args, signer), = w.calls
    assert fn == "registerMandate" and signer == "relayer"
    r, cred, att, owner = args
    assert r[1] == "0x000000000000000000000000000000000000A6e7" and r[3][3] == NOW + 86400 and r[4:] == (0, 1)
    assert cred[1:] == (1, 2, 3) and att[:2] == (42, NOW + 3600) and len(owner) == 65
    with pytest.raises(RelayError, match="bad_mandate"):
        relayer.register_mandate(req[:5], PROOF, 1, 2, 3, 42, NOW, SIG, SIG)
    with pytest.raises(RelayError, match="field_out_of_range"):
        relayer.register_mandate(req, PROOF, 1, BN254_P, 3, 42, NOW, SIG, SIG)


def test_issue_business_pass_args(relayer, w):
    relayer.issue_business_pass(0xB12, 5, NOW + 3600, SIG)
    (fn, args, signer), = w.calls
    assert fn == "issue" and signer == "relayer" and args[0] == (0xB12, 5, NOW + 3600) and args[2] == 5
    with pytest.raises(RelayError, match="field_out_of_range"):
        relayer.issue_business_pass(0xB12, BN254_P, NOW, SIG)
    with pytest.raises(RelayError, match="bad_attestation"):
        relayer.issue_business_pass(0, 5, NOW, SIG)
