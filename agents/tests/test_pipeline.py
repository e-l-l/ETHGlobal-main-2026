import json

import pytest
from eth_utils import keccak
from test_clamp import draft, features, limits

from mra_agents.config import Settings
from mra_agents.decisions import DecisionStore, features_hash
from mra_agents.models import CriticVerdict, SignedOffer
from mra_agents.pipeline import UnderwritingPipeline

SHOP = "0x" + "11" * 32
RECIPIENT = "0x" + "22" * 20


class Reader:
    chain_id = 31337
    book_address = RECIPIENT
    def __init__(self, events): self.events = events
    def limits(self): self.events.append("limits"); return limits()
    def usdc_funders(self, addresses, since_ts): return {}
    def shop_payout(self, shop_id): return RECIPIENT
    active: list = []  # noqa: RUF012 - test fake, reset per test
    def advances(self): return self.active


class Indexer:
    def __init__(self, events): self.events = events
    def sync(self): self.events.append("sync")
    def sales_for(self, shop_id, since_ts): return []


class Judge:
    def __init__(self, events, mode): self.events, self.mode = events, mode
    def underwrite(self, f, tier, l):
        self.events.append("underwrite")
        if self.mode == "underwrite_error": raise RuntimeError("private provider detail")
        return draft(decision="decline" if self.mode == "decline" else "offer")
    def critique(self, f, d):
        self.events.append("critique")
        if self.mode == "critique_error": raise RuntimeError("private provider detail")
        return CriticVerdict(verdict=self.mode if self.mode in ("reject", "send_back") else "approve", flags=[], summary_en="", summary_es="")


class Signer:
    def __init__(self, events): self.events = events
    def sign_offer(self, offer, *, chain_id, verifying_contract):
        self.events.append("sign")
        return SignedOffer(offer=offer, signature="0x" + "00" * 65, digest="0x" + "00" * 32)


def build(events):
    def fn(*args): events.append("features"); return features()
    return fn


@pytest.mark.parametrize("mode,result,expected", [("redline","rejected",[]),("decline","declined",["underwrite"]),("reject","rejected",["underwrite","critique"]),("send_back","rejected",["underwrite","critique"]),("underwrite_error","error",["underwrite"]),("critique_error","error",["underwrite","critique"]),("clamp_none","declined",["underwrite","critique","clamp"]),("offer","offered",["underwrite","critique","clamp","sign"])])
def test_branches(mode, result, expected):
    events = []
    store = DecisionStore(":memory:")
    def redlines(f): events.append("redlines"); return ["few_payers"] if mode == "redline" else []
    def clamp(d, f, tier, l, days):
        events.append("clamp")
        return (None, ["no room"]) if mode == "clamp_none" else (d, [])
    p = UnderwritingPipeline(reader=Reader(events), indexer=Indexer(events), judge=Judge(events, mode), signer=Signer(events), store=store, settings=Settings(_env_file=None), build_features=build(events), redline_check=redlines, clamp=clamp, now=lambda: 123456)
    decision = p.request_offer(SHOP, 1, RECIPIENT)
    assert decision.result == result
    assert events == ["sync", "limits", "features", "redlines"] + expected
    assert store.get(decision.decision_id) == decision
    assert (decision.signed_offer is not None) == (result == "offered")
    if result == "offered":
        assert decision.signed_offer.offer.pass_nullifier == 0
        assert decision.signed_offer.offer.expires_at == 123456 + 900


def test_first_tier_and_store(tmp_path):
    events = []
    path = tmp_path / "decisions.sqlite"
    store = DecisionStore(path)
    p = UnderwritingPipeline(reader=Reader(events), indexer=Indexer(events), judge=Judge(events, "offer"), signer=Signer(events), store=store, settings=Settings(_env_file=None), build_features=build(events), redline_check=lambda _: [], now=lambda: 123456)
    for bad in ((1, 42, 0), (1, 0, 1), (0, 2**254, 0), (0, 42, 256)):  # tier>0 nullifier/band, not field, band>255
        denied = p.request_offer(SHOP, bad[0], RECIPIENT, bad[1], bad[2])
        assert denied.result == "declined" and "underwrite" not in events
    first = p.request_offer(SHOP, 0, RECIPIENT, 42, 2)
    second = p.request_offer(SHOP, 0, RECIPIENT, 43)
    mandate = p.request_offer(SHOP, 0, RECIPIENT)  # mandate draw: no nullifier (spent at registerMandate)
    assert first.signed_offer.offer.pass_nullifier == 42 and first.signed_offer.offer.min_revenue_band == 2
    assert mandate.result == "offered" and mandate.signed_offer.offer.pass_nullifier == 0
    assert first.signed_offer.offer.offer_id != second.signed_offer.offer.offer_id
    reopened = DecisionStore(path)
    assert reopened.get(first.decision_id) == first
    assert reopened.latest_for_shop(SHOP) == mandate
    assert reopened.get("missing") is None
    assert reopened.latest_for_shop("0x" + "33"*32) is None
    canonical = json.dumps(features().model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    assert features_hash(features()) == "0x" + keccak(canonical).hex()
    assert features_hash(features(999)) != features_hash(features())


def test_active_advance_declines_before_any_model_call(tmp_path):
    from mra_agents.models import AdvanceState, AdvanceStatus
    events = []
    reader = Reader(events)
    reader.active = [AdvanceState(advance_id=2, shop_id=SHOP.upper().replace("0X", "0x"), principal=50_000_000,
                                  total_owed=57_500_000, repaid=0, holdback_bps=1000, tier=0, last_sale_at=1,
                                  status=AdvanceStatus.ACTIVE, credential_claimed=False)]
    p = UnderwritingPipeline(reader=reader, indexer=Indexer(events), judge=Judge(events, "offer"),
                             signer=Signer(events), store=DecisionStore(tmp_path / "d.sqlite"),
                             settings=Settings(_env_file=None), build_features=build(events),
                             redline_check=lambda _: [], now=lambda: 123456)
    d = p.request_offer(SHOP, 0, RECIPIENT, 42)
    assert d.result == "declined" and d.signed_offer is None
    assert "underwrite" not in events and "critique" not in events
    # A repaid advance does not block a new one.
    reader.active[0] = reader.active[0].model_copy(update={"status": AdvanceStatus.REPAID})
    assert p.request_offer(SHOP, 0, RECIPIENT, 43).result == "offered"
