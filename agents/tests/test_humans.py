"""World ID binding for borrowers (humans.py), the ban on default and the gradual unlock (unlock.py)."""
import json
import sqlite3
import time

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_clamp import draft, features, limits

from mra_agents.agents_api import build_human_router
from mra_agents.clamp import clamp_offer
from mra_agents.config import Settings
from mra_agents.decisions import DecisionStore
from mra_agents.humans import (
    HUMAN_BANNED,
    HUMAN_HAS_OPEN_ADVANCE,
    HUMAN_NOT_VERIFIED,
    HumanBindingService,
    HumanError,
    HumanRegistry,
    owner_auth_message,
)
from mra_agents.keeper import Keeper
from mra_agents.models import AdvanceState, AdvanceStatus, CriticVerdict, SignedOffer
from mra_agents.pipeline import UnderwritingPipeline
from mra_agents.redlines import message
from mra_agents.secretbox import SecretBox
from mra_agents.unlock import WEEK, allowed_at_most, compute_unlock, restarts
from mra_agents.world import MockIDKit, make_borrower_verifier

USDC = 1_000_000
CAPS = (50 * USDC, 100 * USDC, 200 * USDC, 300 * USDC)
SHOP_A, SHOP_B, SHOP_C = ("0x" + c * 64 for c in "abc")
OWNER = Account.create()
OTHER = Account.create()
T0 = 1_700_000_000
ACTION = "credential-recovery-v1"


def nullifier(label):
    return MockIDKit(ACTION).verify({"mock": "approve", "mock_human": label})


def registry(path=":memory:"):
    return HumanRegistry(SecretBox(b"k" * 32), path, action=ACTION)


def adv(i, shop, status=AdvanceStatus.ACTIVE, tier=1, principal=100 * USDC, drawn=T0, last_sale=None):
    return AdvanceState(advance_id=i, shop_id=shop, principal=principal, total_owed=principal * 103 // 100,
                        repaid=0, holdback_bps=800, tier=tier, last_sale_at=last_sale or drawn, status=status,
                        credential_claimed=False, drawn_at=drawn)


def auth(shop, acct=OWNER, issued=None, chain=31337):
    issued = int(time.time()) if issued is None else issued
    sig = Account.sign_message(encode_defunct(text=owner_auth_message(shop, chain, issued)), acct.key)
    return f"Owner {issued}:0x{sig.signature.hex().removeprefix('0x')}"


class Reader:
    chain_id = 31337
    book_address = "0x" + "22" * 20

    def __init__(self, advances=(), payments=None, now=T0):
        self._advances, self._payments, self._now = list(advances), payments or {}, now

    def shop_owner(self, shop):
        return OWNER.address if shop in (SHOP_A, SHOP_B) else None

    def advances(self):
        return list(self._advances)

    def limits(self):
        return limits().model_copy(update={"tier_cap": CAPS})

    def repayments(self, ids):
        return {i: self._payments.get(i, []) for i in ids}

    def latest_block(self):
        return 1

    def block_timestamp(self, _):
        return self._now


# ------------------------------------------------------------------ registry and privacy

def test_bind_is_per_human_and_stores_no_nullifier_or_shop_id(tmp_path):
    db = tmp_path / "h.sqlite"
    reg = registry(db)
    n = nullifier("alice")
    reg.bind(SHOP_A, n)
    reg.bind(SHOP_A, n)  # idempotent
    reg.bind(SHOP_B, n)
    assert reg.shops_of_shop(SHOP_B) == [SHOP_A, SHOP_B]
    assert reg.human_for_shop(SHOP_A) == reg.human_for_shop(SHOP_B) == reg.human_key(n)
    with pytest.raises(HumanError) as e:
        reg.bind(SHOP_A, nullifier("mallory"))
    assert e.value.code == "shop_bound_to_other_human"
    dump = "\n".join(str(row) for t in ("world_humans", "world_shop_bindings")
                     for row in sqlite3.connect(db).execute(f"SELECT * FROM {t}"))
    assert n[2:] not in dump and str(int(n, 16)) not in dump
    assert SHOP_A[2:] not in dump and SHOP_B[2:] not in dump


def test_human_key_differs_from_recovery_owner_key():
    from mra_agents.world import RecoveryService
    box = SecretBox(b"k" * 32)
    n = nullifier("alice")
    rec = RecoveryService(MockIDKit(ACTION), box, ":memory:", action=ACTION)
    assert HumanRegistry(box, ":memory:", action=ACTION).human_key(n) != rec._owner_key(n)


def test_mock_mode_is_deterministic_per_human():
    s = Settings(_env_file=None, world_mock=True)
    v = make_borrower_verifier(s)
    assert isinstance(v, MockIDKit) and v.action == s.world_borrower_action == s.world_recovery_action
    one = v.verify({"mock": "approve", "mock_human": "alice"})
    assert one == v.verify({"mock": "approve", "mock_human": "alice"}) != v.verify(
        {"mock": "approve", "mock_human": "bob"})


# ------------------------------------------------------------------ red lines and ban on write-off

def test_red_lines():
    reg = registry()
    assert reg.check(SHOP_A, [], required=True) == [HUMAN_NOT_VERIFIED]
    assert reg.check(SHOP_A, [], required=False) == []
    reg.bind(SHOP_A, nullifier("alice"))
    reg.bind(SHOP_B, nullifier("alice"))
    assert reg.check(SHOP_B, [], required=True) == []
    # an open advance on ANY of the human's shops blocks a new offer on another one
    assert reg.check(SHOP_B, [adv(1, SHOP_A)], required=True) == [HUMAN_HAS_OPEN_ADVANCE]
    assert reg.check(SHOP_B, [adv(1, SHOP_C)], required=True) == []  # someone else's advance
    # a write-off on any shop bans the human everywhere, including shops bound later
    assert reg.check(SHOP_B, [adv(1, SHOP_A, AdvanceStatus.WRITTEN_OFF)], required=True) == [HUMAN_BANNED]
    reg.bind(SHOP_C, nullifier("alice"))
    assert reg.check(SHOP_C, [], required=True) == [HUMAN_BANNED]
    for code in (HUMAN_BANNED, HUMAN_HAS_OPEN_ADVANCE, HUMAN_NOT_VERIFIED):
        assert message(code) != code and message(code, "es") != message(code)


def test_keeper_bans_the_human_behind_a_written_off_advance():
    reg = registry()
    reg.bind(SHOP_A, nullifier("dora"))
    reg.bind(SHOP_B, nullifier("bob"))
    reader = Reader([adv(1, SHOP_A, AdvanceStatus.WRITTEN_OFF), adv(2, SHOP_B, AdvanceStatus.REPAID)])

    class Writer:
        def send(self, *a, **k):
            raise AssertionError("nothing to send")

    res = Keeper(reader, Writer(), Settings(_env_file=None), now=lambda: T0, humans=reg).tick()
    assert res.banned == 1 and not res.errors
    assert reg.is_banned(reg.human_for_shop(SHOP_A)) and not reg.is_banned(reg.human_for_shop(SHOP_B))
    assert Keeper(reader, Writer(), Settings(_env_file=None), now=lambda: T0, humans=reg).tick().banned == 0


class PReader(Reader):
    def usdc_funders(self, addresses, since_ts):
        return {}

    def shop_payout(self, shop):
        return "0x" + "22" * 20


class Indexer:
    def sync(self):
        pass

    def sales_for(self, shop, since):
        return []


class Judge:
    def __init__(self):
        self.calls = []

    def underwrite(self, f, tier, l):
        self.calls.append(("underwrite", f.available_now, f.approved_limit))
        return draft(amount=100 * USDC)

    def critique(self, f, d):
        self.calls.append(("critique", f.available_now))
        return CriticVerdict(verdict="approve", flags=[], summary_en="", summary_es="")


class Signer:
    def sign_offer(self, offer, *, chain_id, verifying_contract):
        return SignedOffer(offer=offer, signature="0x" + "00" * 65, digest="0x" + "00" * 32)


def pipeline(reg, reader, judge, required=True):
    return UnderwritingPipeline(reader=reader, indexer=Indexer(), judge=judge, signer=Signer(),
                                store=DecisionStore(":memory:"),
                                settings=Settings(_env_file=None, world_binding_required=required),
                                build_features=lambda *a: features(), redline_check=lambda f: [], now=lambda: T0,
                                humans=reg)


@pytest.mark.parametrize("setup,code", [("none", HUMAN_NOT_VERIFIED), ("banned", HUMAN_BANNED),
                                        ("open", HUMAN_HAS_OPEN_ADVANCE)])
def test_pipeline_refuses_before_any_model_call(setup, code):
    reg = registry()
    advances = []
    if setup != "none":
        reg.bind(SHOP_A, nullifier("eve"))
        reg.bind(SHOP_B, nullifier("eve"))
        advances = [adv(1, SHOP_A, AdvanceStatus.WRITTEN_OFF if setup == "banned" else AdvanceStatus.ACTIVE)]
    judge = Judge()
    d = pipeline(reg, PReader(advances), judge).request_offer(SHOP_B, 1, "0x" + "22" * 20)
    assert d.result == "rejected" and d.redline_hits == [code] and d.signed_offer is None
    assert judge.calls == []


def test_pipeline_caps_first_tier1_offer_at_half_the_limit_and_judges_see_it():
    reg = registry()
    reg.bind(SHOP_A, nullifier("rita"))
    reg.bind(SHOP_B, nullifier("rita"))
    judge = Judge()
    reader = PReader([adv(1, SHOP_A, AdvanceStatus.REPAID, tier=0, principal=50 * USDC)])
    d = pipeline(reg, reader, judge).request_offer(SHOP_B, 1, "0x" + "22" * 20)
    assert d.result == "offered" and d.signed_offer.offer.amount == 50 * USDC
    assert judge.calls == [("underwrite", 50 * USDC, 100 * USDC), ("critique", 50 * USDC)]
    assert any("Gradual unlock" in c for c in d.clamp_changes)


def test_legacy_pipeline_without_registry_is_unchanged():
    judge = Judge()
    p = pipeline(None, PReader(), judge)
    d = p.request_offer(SHOP_B, 1, "0x" + "22" * 20)
    assert d.result == "offered" and d.signed_offer.offer.amount == 100 * USDC
    assert judge.calls[0] == ("underwrite", None, None)


# ------------------------------------------------------------------ unlock math

def weekly(advance_id, weeks, amount=2 * USDC, start=T0, day=6):
    """One minimum-meeting repayment per week (day `day` of each week)."""
    return {advance_id: [(start + k * WEEK + day * 86_400, amount) for k in range(weeks)]}


def u(tier, advances=(), payments=None, now=T0):
    return compute_unlock(tier=tier, tier_caps=CAPS, human_advances=list(advances), payments=payments or {}, now=now)


def test_first_advance_at_a_level_is_half_rounded_down_never_below_minimum():
    assert u(0).available_now == 50 * USDC  # 50% of $50 -> the $50 minimum
    assert u(1).available_now == 50 * USDC  # $50 of $100
    assert u(2).available_now == 100 * USDC
    assert u(3).available_now == 100 * USDC  # $150 rounds down to $100
    assert allowed_at_most(10 * USDC, 40 * USDC) == 0  # limit below the minimum size
    first = u(1)
    assert first.unlocked_pct == 50 and first.next_unlock_at is None and "First advance" in first.reasons[0]
    assert [(s.pct, s.amount // USDC, s.unlocked) for s in first.steps] == [(50, 50, True), (75, 50, False),
                                                                            (100, 100, False)]


@pytest.mark.parametrize("tier,weeks,expected", [(2, 1, 100), (2, 2, 200), (2, 5, 200), (3, 1, 200), (3, 2, 300),
                                                 (1, 2, 100)])
def test_each_on_time_week_unlocks_a_quarter(tier, weeks, expected):
    a = adv(1, SHOP_A, AdvanceStatus.ACTIVE, tier=tier, principal=CAPS[tier] // 2)
    r = u(tier, [a], weekly(1, weeks), now=T0 + weeks * WEEK + 3600)
    assert r.good_weeks == weeks and r.available_now == expected * USDC and not r.frozen
    assert r.next_unlock_at == (None if r.unlocked_pct == 100 else T0 + (weeks + 1) * WEEK)


def test_repaid_history_carries_to_the_next_advance_at_that_level():
    a = adv(1, SHOP_A, AdvanceStatus.REPAID, tier=2, principal=100 * USDC)
    pays = {1: [(T0 + 6 * 86_400, 2 * USDC), (T0 + 13 * 86_400, 2 * USDC), (T0 + 15 * 86_400, 99 * USDC)]}
    r = u(2, [a], pays, now=T0 + 40 * WEEK)
    assert r.good_weeks == 2 and r.available_now == 200 * USDC
    assert u(3, [a], pays, now=T0 + 40 * WEEK).available_now == 100 * USDC  # a new, higher level starts at 50%


def test_missed_minimum_freezes_the_unlock():
    a = adv(1, SHOP_A, AdvanceStatus.ACTIVE, tier=2, principal=100 * USDC)
    # met in week 1, then nothing: behind now
    r = u(2, [a], {1: [(T0 + 6 * 86_400, 2 * USDC)]}, now=T0 + 3 * WEEK)
    assert r.frozen and r.good_weeks == 0 and r.next_unlock_at is None and r.available_now == 100 * USDC
    # a 10-day gap, then caught up: weeks after the miss never count on that advance
    caught = {1: [(T0 + 6 * 86_400, 2 * USDC), (T0 + 16 * 86_400, 2 * USDC), (T0 + 20 * 86_400, 2 * USDC)]}
    r = u(2, [a], caught, now=T0 + 3 * WEEK)
    assert not r.frozen and r.good_weeks == 0 and any("missed" in x for x in r.reasons)


def test_paying_the_minimum_many_times_in_a_day_earns_nothing_extra():
    a = adv(1, SHOP_A, AdvanceStatus.ACTIVE, tier=2, principal=100 * USDC)
    pays = {1: [(T0 + 3600 * k, 2 * USDC) for k in range(1, 10)]}
    assert len(restarts(a, pays[1])) == 9
    assert u(2, [a], pays, now=T0 + 86_400).good_weeks == 0


def test_restart_replay_matches_the_contract_window_rule():
    a = adv(1, SHOP_A, AdvanceStatus.ACTIVE, tier=1, principal=100 * USDC)
    # need = ceil(1% of (principal + fee)); two partial payments inside one window add up
    assert restarts(a, [(T0 + 86_400, 600_000), (T0 + 2 * 86_400, 500_000)]) == [T0 + 2 * 86_400]
    # a partial payment from an expired window is dropped (fresh window at the late payment)
    assert restarts(a, [(T0 + 86_400, 600_000), (T0 + 9 * 86_400, 500_000)]) == []


def test_clamp_caps_the_draft_at_available_now():
    f = features().model_copy(update={"available_now": 50 * USDC, "approved_limit": 100 * USDC})
    out, changes = clamp_offer(draft(amount=100 * USDC), f, 1, limits(), 60)
    assert out.amount == 50 * USDC and any("Gradual unlock: capped at $50 of the $100 limit" in c for c in changes)


# ------------------------------------------------------------------ API

@pytest.fixture
def client():
    reg = registry()
    reader = Reader()
    svc = HumanBindingService(MockIDKit(ACTION), reg, reader)
    app = FastAPI()
    app.include_router(build_human_router(svc))
    return TestClient(app), reg, reader


def test_bind_returns_verified_only_and_never_the_nullifier(client):
    c, reg, _ = client
    r = c.post(f"/shops/{SHOP_A}/human", json={"idkit": {"mock": "approve", "mock_human": "alice"}},
               headers={"Authorization": auth(SHOP_A)})
    assert r.status_code == 200 and r.json() == {"verified": True}
    n = nullifier("alice")
    assert n[2:] not in r.text and str(int(n, 16)) not in r.text and reg.human_key(n) not in r.text
    pub = c.get(f"/shops/{SHOP_A}/human")
    assert pub.json() == {"verified": True}  # banned and unlock are for the owner only
    mine = c.get(f"/shops/{SHOP_A}/human?tier=1", headers={"Authorization": auth(SHOP_A)}).json()
    assert set(mine) == {"verified", "banned", "unlock"} and mine["banned"] is False
    assert mine["unlock"]["available_now_usd"] == 50 and mine["unlock"]["limit_usd"] == 100
    assert n[2:] not in json.dumps(mine)


@pytest.mark.parametrize("header", [None, "Bearer x", "Owner 1:0x" + "00" * 65])
def test_bind_requires_the_shop_owner(client, header):
    c, reg, _ = client
    r = c.post(f"/shops/{SHOP_A}/human", json={"idkit": {"mock": "approve", "mock_human": "alice"}},
               headers={"Authorization": header} if header else {})
    assert r.status_code == 401 and r.json() == {"detail": "unauthorized"}
    assert reg.human_for_shop(SHOP_A) is None


def test_bind_rejects_wrong_signer_stale_auth_and_wrong_chain(client):
    c, reg, _ = client
    body = {"idkit": {"mock": "approve", "mock_human": "alice"}}
    for h in (auth(SHOP_A, OTHER), auth(SHOP_A, issued=int(time.time()) - 3600), auth(SHOP_A, chain=1),
              auth(SHOP_B)):
        assert c.post(f"/shops/{SHOP_A}/human", json=body, headers={"Authorization": h}).status_code == 401
    assert c.post(f"/shops/{SHOP_C}/human", json=body, headers={"Authorization": auth(SHOP_C)}).status_code == 404
    assert reg.human_for_shop(SHOP_A) is None


def test_bind_errors_and_owner_sees_ban(client):
    c, _reg, reader = client
    h = {"Authorization": auth(SHOP_A)}
    deny = c.post(f"/shops/{SHOP_A}/human", json={"idkit": {"mock": "deny"}}, headers=h)
    assert deny.status_code == 400 and deny.json() == {"detail": "verification_failed"}
    assert c.post(f"/shops/{SHOP_A}/human", json={"idkit": {"mock": "approve", "mock_human": "dora"}},
                  headers=h).status_code == 200
    other = c.post(f"/shops/{SHOP_A}/human", json={"idkit": {"mock": "approve", "mock_human": "mallory"}},
                   headers=h)
    assert other.status_code == 409 and other.json() == {"detail": "shop_bound_to_other_human"}
    reader._advances = [adv(1, SHOP_A, AdvanceStatus.WRITTEN_OFF)]
    mine = c.get(f"/shops/{SHOP_A}/human", headers=h).json()
    assert mine == {"verified": True, "banned": True, "unlock": None}
    assert c.get(f"/shops/{SHOP_A}/human").json() == {"verified": True}
    assert c.post("/world/borrower/rp-context").json() == {"mock": True, "action": ACTION}
