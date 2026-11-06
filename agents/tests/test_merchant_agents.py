import asyncio
import sqlite3
from types import SimpleNamespace

import pytest
from eth_account import Account

from mra_agents.merchant_agents import (
    DAY,
    PENDING_DRAW_SECONDS,
    AgentDeps,
    AgentError,
    MandateRelay,
    MerchantAgent,
    MerchantAgentRunner,
    MerchantAgentService,
    MerchantAgentStore,
    limit_violations,
    mandate_draw_message,
    restock_decision,
    sign_mandate_draw,
)
from mra_agents.models import AdvanceStatus, SaleEvent
from mra_agents.secretbox import DecryptError, SecretBox
from mra_agents.world import Attester, Limits, MockAgentPass

NOW = 1_800_000_000
SHOP = "0x" + "1" * 64
RECIPIENT = "0x" + "b" * 40
BOOK = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f"
ATTESTER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
_n = iter(range(1, 10**6))


def sale(ts, amount, shop=SHOP):
    i = next(_n)
    return SaleEvent(shop_id=shop, payer="0x" + "c" * 40, amount=amount, repayment=0, block_number=i,
                     timestamp=ts, tx_hash="0x" + f"{i:064x}", log_index=0)


def settings(**kw):
    base = {"restock_drop_threshold": 0.30, "restock_min_avg_daily_usd": 1.0, "mandate_sig_scheme": "eip712",
                "attestation_ttl_seconds": 3600}
    return SimpleNamespace(**{**base, **kw})


def limits(**kw):
    base = {"max_per_draw": 100_000_000, "max_per_period": 200_000_000, "period": 30 * DAY, "expiry": NOW + 90 * DAY}
    return Limits(**{**base, **kw})


def falling_sales():
    """27 days at $20/day, then 3 days at $5/day -> 3d avg far below 30d avg."""
    return [sale(NOW - d * DAY + 60, 20_000_000) for d in range(4, 31)] + \
           [sale(NOW - d * DAY + 60, 5_000_000) for d in range(1, 4)]


def offered(amount=100_000_000, offer_id="0x" + "ab" * 32):
    offer = SimpleNamespace(offer_id=offer_id, amount=amount, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=1000,
                            expires_at=NOW + 900)
    return SimpleNamespace(result="offered", decision_id="dec-1", redline_hits=[], clamp_changes=[],
                           draft=SimpleNamespace(reasons_en=["Steady daily sales", "Many repeat customers"]),
                           verdict=SimpleNamespace(summary_en="Looks healthy"),
                           signed_offer=SimpleNamespace(offer=offer, signature="0x" + "11" * 65))


class World:
    """Fakes for every chain/pipeline touchpoint."""

    def __init__(self, tmp_path, *, sales=None, decision=None, advances=None, **settings_kw):
        self.sales = falling_sales() if sales is None else sales
        self.decision = decision or offered()
        self.advances = advances or []
        self.offer_calls, self.draw_calls = [], []
        self.box = SecretBox(bytes(range(32)))
        self.store = MerchantAgentStore(tmp_path / "a.sqlite", self.box, now=lambda: NOW)
        self.deps = AgentDeps(
            indexer=SimpleNamespace(sync=lambda: 0, sales_for=lambda shop, since: [
                s for s in self.sales if s.shop_id == shop and s.timestamp >= since]),
            advances=lambda: self.advances,
            request_offer=lambda *a: self.offer_calls.append(a) or self.decision,
            draw_by_mandate=lambda so, mid, sig: self.draw_calls.append((so, mid, sig)) or "0x" + "77" * 32,
            chain_id=31337, book_address=BOOK, settings=settings(**settings_kw), now=lambda: NOW)
        self.service = MerchantAgentService(self.store, self.deps, MockAgentPass(),
                                            Attester(ATTESTER_KEY, 31337, BOOK))

    def active_agent(self, lim=None, tier=1):
        created = self.service.create(SHOP, tier, RECIPIENT, lim or limits())
        self.service.agent_pass(created["id"], {"mock": "approve"})
        self.service.activate(created["id"], 7)
        return created["id"]

    def tick(self, agent_id):
        return MerchantAgent(agent_id, self.store, self.deps).tick()


# ------------------------------------------------------------ encryption at rest


def test_agent_key_encrypted_at_rest(tmp_path):
    w = World(tmp_path)
    created = w.service.create(SHOP, 1, RECIPIENT, limits())
    key = w.store.private_key(created["id"])
    assert Account.from_key(key).address == created["agent_address"]
    raw = (tmp_path / "a.sqlite").read_bytes()
    key_bytes = bytes.fromhex(key[2:])
    assert key_bytes not in raw and key[2:].encode() not in raw and key[2:].upper().encode() not in raw
    db = sqlite3.connect(tmp_path / "a.sqlite")
    for row in db.execute("SELECT * FROM merchant_agents"):
        assert all(key[2:].lower() not in str(v).lower() for v in row)
    # bound to the row and to the master key
    enc = db.execute("SELECT key_enc FROM merchant_agents").fetchone()[0]
    with pytest.raises(DecryptError):
        w.box.decrypt(enc, aad=b"agent-key:someone-else")
    with pytest.raises(DecryptError):
        SecretBox(bytes(32)).decrypt(enc, aad=b"agent-key:" + created["id"].encode())
    assert "key_enc" not in created and key[2:] not in str(created)


# ------------------------------------------------------------ restock rule


def _two(a_amount, b_amount, *, thr=0.30, min_avg=1.0, trigger=False):
    s = [sale(NOW - 10 * DAY, a_amount), sale(NOW - DAY, b_amount)]
    return restock_decision(s, NOW, drop_threshold=thr, min_avg_daily_usd=min_avg, trigger=trigger)


def test_restock_rule_boundaries():
    # rev30 = A + B, rev3 = B. Needed iff 10*B <= 0.7*(A+B)  <=>  93*B <= 7*A
    assert _two(93_000_000, 7_000_000).needed  # exactly a 30% drop -> draw
    assert _two(93_000_000, 7_000_000).code == "revenue_drop"
    assert not _two(93_000_000, 7_000_001).needed  # a hair less of a drop -> no draw
    assert _two(93_000_000, 7_000_001).code == "steady_sales"
    # too little business to judge stock: 30d avg < min
    r = _two(93_000_000, 7_000_000, min_avg=3.34)
    assert not r.needed and r.code == "too_little_history"
    assert _two(93_000_000, 7_000_000, min_avg=3.33).needed
    assert restock_decision([], NOW, drop_threshold=0.3, min_avg_daily_usd=1).code == "too_little_history"
    # demo trigger overrides the revenue rule (not the safety checks)
    assert _two(10_000_000, 10_000_000, trigger=True).code == "demo_trigger"


def test_restock_window_edges():
    # a sale exactly 3 days ago is outside the 3-day window; exactly 30 days ago is outside the 30-day window
    s = [sale(NOW - 3 * DAY, 50_000_000), sale(NOW - 30 * DAY, 10**12), sale(NOW - 20 * DAY, 50_000_000)]
    r = restock_decision(s, NOW, drop_threshold=0.3, min_avg_daily_usd=1)
    assert r.needed and r.avg_3d_usd == 0 and round(r.avg_30d_usd, 2) == round(100 / 30, 2)
    assert "below your 30-day average" in r.reason


# ------------------------------------------------------------ limits


def test_limit_violations_unit():
    lim = limits(max_per_draw=100_000_000, max_per_period=150_000_000, period=7 * DAY)
    assert limit_violations(100_000_000, lim, [], NOW) == []
    assert limit_violations(250_000_000, lim, [], NOW) == ["over_max_per_draw", "over_max_per_period"]
    assert limit_violations(100_000_000, lim, [(NOW - DAY, 100_000_000)], NOW) == ["over_max_per_period"]
    assert limit_violations(100_000_000, lim, [(NOW - 7 * DAY, 100_000_000)], NOW) == []  # outside the period
    assert limit_violations(50_000_000, lim, [(NOW - DAY, 100_000_000)], NOW) == []  # exactly at the cap
    assert limit_violations(50_000_000, lim, [], lim.expiry) == ["mandate_expired"]


def test_offer_over_max_per_draw_never_reaches_chain(tmp_path):
    w = World(tmp_path, decision=offered(amount=250_000_000))
    aid = w.active_agent()
    r = w.tick(aid)
    assert (r.action, r.code) == ("skipped", "over_max_per_draw")
    assert w.offer_calls and not w.draw_calls


def test_period_limit_enforced_before_chain(tmp_path):
    w = World(tmp_path)
    aid = w.active_agent(limits(max_per_period=150_000_000))
    w.store.record_draw(aid, NOW - PENDING_DRAW_SECONDS - 1, 100_000_000, "0x" + "01" * 32, "0x" + "02" * 32, None)
    r = w.tick(aid)
    assert (r.action, r.code) == ("skipped", "over_max_per_period")
    assert not w.draw_calls
    # period fully used: we don't even ask for an offer
    w.store.record_draw(aid, NOW - PENDING_DRAW_SECONDS - 2, 50_000_000, "0x" + "03" * 32, "0x" + "04" * 32, None)
    w.offer_calls.clear()
    r = w.tick(aid)
    assert r.code == "period_limit_reached" and not w.offer_calls and not w.draw_calls


# ------------------------------------------------------------ mandate + active advance gating


def test_no_draw_without_active_mandate(tmp_path):
    w = World(tmp_path)
    created = w.service.create(SHOP, 1, RECIPIENT, limits())
    assert w.tick(created["id"]).code == "mandate_inactive"
    w.service.agent_pass(created["id"], {"mock": "approve"})  # approved but not registered onchain
    assert w.tick(created["id"]).code == "mandate_inactive"
    w.service.activate(created["id"], 9)
    w.service.revoke(created["id"])
    assert w.tick(created["id"]).code == "mandate_inactive"
    assert not w.offer_calls and not w.draw_calls


def test_no_draw_when_mandate_expired_or_revoked_onchain(tmp_path):
    w = World(tmp_path)
    aid = w.active_agent(limits(expiry=NOW + DAY))
    w.deps.now = lambda: NOW + DAY
    assert w.tick(aid).code == "mandate_expired"
    assert w.store.get(aid).status == "expired"
    w2 = World(tmp_path / "x")
    aid2 = w2.active_agent()
    w2.deps.mandate_reader = lambda mid: {"exists": True, "active": False, "agentKey": "0x" + "0" * 39 + "1"}
    assert w2.tick(aid2).code == "mandate_revoked_onchain"
    assert not w.draw_calls and not w2.draw_calls


def test_no_draw_with_active_advance_or_in_flight(tmp_path):
    adv = SimpleNamespace(shop_id=SHOP.upper().replace("0X", "0x"), status=AdvanceStatus.ACTIVE)
    w = World(tmp_path, advances=[adv])
    aid = w.active_agent()
    r = w.tick(aid)
    assert (r.action, r.code) == ("skipped", "active_advance")
    assert not w.offer_calls and not w.draw_calls
    w.advances = []
    w.store.record_draw(aid, NOW - 60, 50_000_000, "0x" + "05" * 32, "0x" + "06" * 32, None)
    assert w.tick(aid).code == "draw_in_flight" and not w.draw_calls


def test_steady_sales_do_not_draw(tmp_path):
    w = World(tmp_path, sales=[sale(NOW - d * DAY + 60, 20_000_000) for d in range(1, 31)])
    aid = w.active_agent()
    assert w.tick(aid).action == "idle"
    assert not w.offer_calls and w.store.events(aid)[0]["action"] == "activated"


def test_declined_offer_logged_without_draw(tmp_path):
    dec = SimpleNamespace(result="rejected", decision_id="d2", redline_hits=["unique_payers_30d"],
                          clamp_changes=[], draft=None, verdict=None, signed_offer=None)
    w = World(tmp_path, decision=dec)
    aid = w.active_agent()
    r = w.tick(aid)
    assert r.action == "declined" and r.details["blockers"] == ["unique_payers_30d"] and not w.draw_calls


# ------------------------------------------------------------ the happy path + signature


@pytest.mark.parametrize("scheme", ["eip712", "eip191"])
def test_draw_signs_offer_and_mandate_with_agent_key(tmp_path, scheme):
    w = World(tmp_path, mandate_sig_scheme=scheme)
    aid = w.active_agent()
    r = w.tick(aid)
    assert r.action == "drew" and r.code == "revenue_drop"
    assert w.offer_calls == [(SHOP, 1, w.store.get(aid).recipient)]
    so, mandate_id, sig = w.draw_calls[0]
    assert mandate_id == 7 and so is w.decision.signed_offer
    msg = mandate_draw_message(so.offer.offer_id, 7, scheme=scheme, chain_id=31337, verifying_contract=BOOK)
    assert Account.recover_message(msg, signature=sig) == w.store.get(aid).address
    # why-I-drew log for the app
    ev = w.store.events(aid)[0]
    assert ev["action"] == "drew" and "Drew $100 to restock" in ev["summary"]
    assert "Steady daily sales" in ev["details"]["reasons"]
    assert w.store.draws(aid)[0]["amount"] == 100_000_000


def test_trigger_is_one_shot_and_still_checks_safety(tmp_path):
    steady = [sale(NOW - d * DAY + 60, 20_000_000) for d in range(1, 31)]
    w = World(tmp_path, sales=steady)
    aid = w.active_agent()
    out = w.service.trigger(aid, run_now=True)
    assert out["tick"]["action"] == "drew" and out["tick"]["code"] == "demo_trigger"
    assert not w.store.get(aid).trigger
    assert w.tick(aid).action == "idle"  # trigger consumed
    w.advances = [SimpleNamespace(shop_id=SHOP, status=AdvanceStatus.ACTIVE)]
    w.service.trigger(aid)
    assert w.tick(aid).code == "active_advance" and len(w.draw_calls) == 1


def test_eip191_and_eip712_messages_differ_and_bad_scheme():
    key = Account.create().key
    a = sign_mandate_draw(key, "0x" + "ab" * 32, 1, scheme="eip712", chain_id=1, verifying_contract=BOOK)
    b = sign_mandate_draw(key, "0x" + "ab" * 32, 1, scheme="eip191", chain_id=1, verifying_contract=BOOK)
    assert a != b and len(a) == 132
    with pytest.raises(AgentError):
        mandate_draw_message("0x" + "ab" * 32, 1, scheme="nope", chain_id=1, verifying_contract=BOOK)


# ------------------------------------------------------------ activation checks


def test_activate_verifies_chain_when_available(tmp_path):
    w = World(tmp_path)
    created = w.service.create(SHOP, 1, RECIPIENT, limits())
    with pytest.raises(AgentError):  # not approved yet
        w.service.activate(created["id"], 1)
    w.service.agent_pass(created["id"], {"mock": "approve"})
    w.deps.mandate_reader = lambda mid: {"exists": True, "active": True, "agentKey": "0x" + "9" * 40}
    with pytest.raises(AgentError, match="mandate_agent_mismatch"):
        w.service.activate(created["id"], 1)
    w.deps.mandate_reader = lambda mid: {"exists": True, "active": True, "agentKey": created["agent_address"],
                                         "limitsHash": "0x" + "00" * 32}
    with pytest.raises(AgentError, match="mandate_limits_mismatch"):
        w.service.activate(created["id"], 1)
    w.deps.mandate_reader = lambda mid: {"exists": True, "active": True, "agentKey": created["agent_address"],
                                         "limitsHash": created["limits_hash"]}
    st = w.service.activate(created["id"], 1)
    assert st["status"] == "active" and st["mandate_verified"] is True


# ------------------------------------------------------------ runner


def test_runner_isolates_agent_errors(tmp_path):
    w = World(tmp_path)
    good, bad = w.active_agent(), None
    other = SHOP[:-1] + "2"
    created = w.service.create(other, 1, RECIPIENT, limits())
    w.service.agent_pass(created["id"], {"mock": "approve"})
    w.service.activate(created["id"], 8)
    bad = created["id"]
    w.sales += [s.model_copy(update={"shop_id": other}) for s in falling_sales()]
    real = w.deps.request_offer

    def flaky(shop, tier, recipient):
        if shop == other:
            raise RuntimeError("upstream exploded with secret detail")
        return real(shop, tier, recipient)
    w.deps.request_offer = flaky
    results = {r.agent_id: r for r in MerchantAgentRunner(w.store, w.deps, 0.01).tick_all()}
    assert results[good].action == "drew" and results[bad].action == "error"
    ev = w.store.events(bad)[0]
    assert ev["action"] == "error" and "secret" not in str(ev)


def test_runner_async_loop_stops(tmp_path):
    w = World(tmp_path)
    w.active_agent()
    runner = MerchantAgentRunner(w.store, w.deps, 0.01)

    async def go():
        stop = asyncio.Event()
        task = asyncio.create_task(runner.run(stop))
        await asyncio.sleep(0.05)
        stop.set()
        await asyncio.wait_for(task, 1)
    asyncio.run(go())
    assert len(w.draw_calls) == 1  # in-flight guard stops repeat draws across ticks


# ------------------------------------------------------------ default relay adapter


def test_mandate_relay_validates_and_rate_limits():
    sent = []
    writer = SimpleNamespace(send=lambda fn, args, signer: sent.append((fn, args, signer)) or "0xtx")
    relay = MandateRelay(writer, now=lambda: NOW, per_mandate_limit=1)
    so = offered().signed_offer
    good_sig = "0x" + "22" * 64 + "1b"
    with pytest.raises(AgentError, match="bad_signature"):
        relay(so, 7, "0x" + "22" * 65)  # v = 0x22
    so_bad = SimpleNamespace(offer=so.offer, signature="0x" + "11" * 64 + "1c")
    from mra_agents import relayer
    relayer_offer_tuple = relayer.offer_tuple
    try:
        relayer.offer_tuple = lambda o: ("tuple",)
        assert relay(so_bad, 7, good_sig) == "0xtx"
        assert sent[0][0] == "drawByMandate" and sent[0][2] == "relayer" and sent[0][1][2] == 7
        with pytest.raises(AgentError, match="rate_limited"):
            relay(so_bad, 7, good_sig)
    finally:
        relayer.offer_tuple = relayer_offer_tuple
    expired = SimpleNamespace(offer=SimpleNamespace(**{**vars(so.offer), "expires_at": NOW}), signature=so.signature)
    with pytest.raises(AgentError, match="offer_expired"):
        MandateRelay(writer, now=lambda: NOW)(expired, 7, good_sig)
