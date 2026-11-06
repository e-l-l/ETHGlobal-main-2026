"""Simulator runner units: ledger reads, the fee/offer seam, the underwriting stream, real proving."""
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from mra_agents.models import Offer
from mra_agents.sim_runner import Prover, Simulator, offer_terms, standing_toml

FIELDS = ["shopId", "principal", "totalOwed", "repaid", "principalRepaid", "holdbackBps", "tier", "lastSaleAt",
          "status", "credentialClaimed", "pendingCommitment", "windowStart", "windowRepaid"]


class Call:
    def __init__(self, value): self.value = value
    def call(self): return self.value


class Fns:
    def __init__(self, **values): self.values = values
    def __getattr__(self, name):
        value = self.values[name]
        return lambda *args: Call(value(*args) if callable(value) else value)


def _chain(advances):
    """advances: {id: (principal, totalOwed, repaid, principalRepaid, tier, status)}"""
    def get(i):
        p, owed, rep, prep, tier, status = advances[i]
        return (b"", p, owed, rep, prep, 1000, tier, 0, status, False, 0, 0, 0)
    book = SimpleNamespace(
        functions=Fns(tierCap=lambda i: [50, 100, 250, 500][i] * 10**6, reserve=500_000, getAdvance=get,
                      owedOf=lambda i: advances[i][1] - advances[i][2] if advances[i][5] == 1 else 0,
                      nextAdvanceId=len(advances) + 1),
        get_function_by_name=lambda _n: SimpleNamespace(abi={"outputs": [{"components": [{"name": f} for f in FIELDS]}]}))
    vault = SimpleNamespace(functions=Fns(totalAssets=10_000_000, outstanding=45_500_000))
    return SimpleNamespace(book=book, senior=vault, junior=vault, slot0=lambda: (0, 0),
                           share_price=lambda _v: 1.01, junior_price_from_tick=lambda _t: 0.99)


def test_ledger_scoped_to_the_run_and_global(monkeypatch):
    chain = _chain({1: (50_000_000, 57_500_000, 57_500_000, 50_000_000, 0, 2),
                    2: (100_000_000, 115_000_000, 11_500_000, 10_000_000, 1, 1),
                    3: (50_000_000, 57_500_000, 2_000_000, 1_739_130, 0, 3)})
    sim = Simulator(prover=object())
    monkeypatch.setattr(sim, "_devnet", lambda: chain)
    mine = sim.ledger([2])
    assert (mine["advanced"], mine["repaid"], mine["written_off"]) == (100, 11.5, 0)
    assert mine["merchant_tier"] == 1 and mine["merchant_limit"] == 100
    assert mine["outstanding"] == 45.5 and mine["tier_caps"] == [50, 100, 250, 500]
    world = sim.ledger()
    assert world["advanced"] == 200 and world["written_off"] == pytest.approx(48.26087)
    assert sim._advance(chain, 2)["left"] == 103_500_000


def test_offer_terms_is_the_only_fee_seam():
    offer = Offer(offer_id="0x" + "11" * 32, shop_id="0x" + "22" * 32, recipient="0x" + "33" * 20,
                  amount=50_000_000, factor_bps=11_500, holdback_bps=1_000, tier=0, pass_nullifier=1, expires_at=1)
    t = offer_terms(offer)
    assert t["fee_usd"] == 7.5 and t["total_owed"] == 57.5 and "flat fee" in t["summary"]
    # A future Offer without factor_bps (time-based fee) still gets described, never crashes.
    later = SimpleNamespace(amount=50_000_000, holdback_bps=1_000, tier=0,
                            model_dump=lambda: {"amount": 50_000_000, "fee_bps_per_week": 50, "fee_cap_bps": 300})
    t = offer_terms(later)
    assert t["fee_bps_per_week"] == 50 and "factor_bps" not in t


class FakeStore:
    def __init__(self): self.events = []
    def update(self, _run, fn): fn({"steps": self.events})


def _features():
    return SimpleNamespace(sales_count_30d=45, unique_payers_30d=16, days_active_30d=30, revenue_30d_usd=900.0,
                           top_payer_share_30d=.1, funded_by_shop_share=0., spike_ratio=1.0,
                           hour_of_day_entropy=.7, round_amount_share_30d=0., cold_start=False)


def _pipeline(decisions):
    calls = []
    def request_offer(*args):
        calls.append(args)
        return decisions[len(calls) - 1]
    return SimpleNamespace(
        request_offer=request_offer, calls=calls,
        settings=SimpleNamespace(anthropic_model="fallback"),
        judge=SimpleNamespace(llm=SimpleNamespace(models={"OfferDraft": "uw-model", "CriticVerdict": "critic-model"})))


def _decision(verdict=None, hits=(), signed=None, result="rejected"):
    draft = SimpleNamespace(decision="offer", amount=50_000_000, factor_bps=11_500, holdback_bps=1_000,
                            est_days_normal=14, reasons_en=["steady"], model_dump=lambda **_: {"amount": 50_000_000})
    v = SimpleNamespace(verdict=verdict, summary_en="looks fine", flags=[]) if verdict else None
    return SimpleNamespace(redline_hits=list(hits), draft=None if hits else draft, verdict=v, signed_offer=signed,
                           result=result, clamp_changes=[])


def _runner(pipeline, monkeypatch):
    sim = Simulator(SimpleNamespace(get=lambda _n: pipeline), sleep=lambda _s: None, clock=lambda: 10, prover=object())
    monkeypatch.setattr(sim, "_features", lambda *_a: _features())
    ctx = {"run_id": "r", "store": FakeStore(), "i": 0, "sim_day": 0, "started": 0, "last": 0, "advances": []}
    shop = {"shop_hex": "0x" + "11" * 32, "payout": SimpleNamespace(address="0x" + "33" * 20)}
    return sim, ctx, shop


def test_send_back_reasks_and_stream_names_both_models(monkeypatch):
    offer = Offer(offer_id="0x" + "11" * 32, shop_id="0x" + "11" * 32, recipient="0x" + "33" * 20,
                  amount=50_000_000, factor_bps=11_500, holdback_bps=1_000, tier=0, pass_nullifier=1, expires_at=1)
    signed = SimpleNamespace(offer=offer, signature="0x" + "ab" * 65)
    pipeline = _pipeline([_decision("send_back"), _decision("approve", signed=signed, result="offered")])
    sim, ctx, shop = _runner(pipeline, monkeypatch)
    assert sim._underwrite(ctx, shop, tier=0, pass_nullifier=1, band=1) is signed
    kinds = [e["kind"] for e in ctx["store"].events]
    assert kinds == ["info", "redlines", "underwriter", "critic", "info", "underwriter", "critic", "offer"]
    assert len(pipeline.calls) == 2
    ev = ctx["store"].events
    assert ev[2]["data"]["model"] == "uw-model" and ev[3]["data"]["model"] == "critic-model"
    assert ev[-1]["data"]["fee_usd"] == 7.5


def test_red_lines_stop_before_any_model_and_no_retry(monkeypatch):
    pipeline = _pipeline([_decision(hits=["circular_funding"])])
    sim, ctx, shop = _runner(pipeline, monkeypatch)
    assert sim._underwrite(ctx, shop, tier=0, pass_nullifier=1, band=1) is None
    ev = ctx["store"].events
    assert [e["kind"] for e in ev] == ["info", "redlines", "underwriter", "critic", "offer"]
    assert ev[1]["data"]["flags"] == ["circular_funding"] and ev[2]["data"]["decision"] == "skipped"
    assert len(pipeline.calls) == 1 and ctx["last_hits"] == ["circular_funding"]


def test_steps_are_paced_and_budgeted():
    t = [0.0]
    slept = []
    sim = Simulator(sleep=lambda s: slept.append(s), clock=lambda: t[0], prover=object())
    ctx = {"run_id": "r", "store": FakeStore(), "i": 0, "sim_day": 0, "started": 0, "last": 0.0}
    sim._step(ctx, "info", "a", "")
    t[0] = 0.1
    sim._step(ctx, "info", "b", "")
    assert slept and 0.4 < slept[0] <= 0.6
    t[0] = sim.timeout + 1
    with pytest.raises(TimeoutError):
        sim._step(ctx, "info", "c", "")


def test_standing_toml_matches_the_circuit_inputs():
    toml = standing_toml(secret=1, count=1, path=[0] * 16, bits=[False] * 16, secret_next=2, root=3, nullifier=4,
                         tier=1, commitment_next=5, context=6)
    keys = {line.split(" = ")[0] for line in toml.splitlines() if line}
    circuit = Path(__file__).resolve().parents[2] / "circuits" / "standing_pass" / "Prover.toml"
    assert keys == {line.split(" = ")[0] for line in circuit.read_text().splitlines() if line}


def test_real_standing_pass_proof_from_artifacts():
    prover = Prover()
    if not (shutil.which("noir-execute", path=prover.path) and shutil.which("bb", path=prover.path)):
        pytest.skip("noir-execute/bb not installed")
    try:
        prover.artifacts("standing_pass")
    except Exception:  # noqa: BLE001
        pytest.skip("standing_pass not compiled")
    toml = (Path(__file__).resolve().parents[2] / "circuits" / "standing_pass" / "Prover.toml").read_text()
    proof, ms = prover.prove("standing_pass", toml, timeout=120)
    assert len(proof) > 1_000 and ms > 0
