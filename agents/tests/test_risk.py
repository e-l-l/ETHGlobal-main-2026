"""Risk agent + keeper, offline with in-memory fakes of ChainReader / ChainWriter / Judge."""

from __future__ import annotations

import json
from fractions import Fraction

import pytest

from mra_agents import risk
from mra_agents.config import Settings
from mra_agents.keeper import Keeper
from mra_agents.models import AdvanceState, AdvanceStatus, ChainLimits, RiskProposal
from mra_agents.risk import RiskAgent, risk_signals

DAY = 86_400
NOW = 1_800_000_000
SHOP = "0x" + "ab" * 32
CAPS = (50_000_000, 100_000_000, 250_000_000, 500_000_000)
FLOORS = (50_000_000, 50_000_000, 50_000_000, 50_000_000)
MAX_EXP = 100_000_000_000
MAX_EXP_FLOOR = 1_000_000_000

# Tick deltas around the 10% threshold: ln(0.9)/ln(1.0001) = -1053.66
NO_FIRE_DT = -1053  # ratio 0.90006
FIRE_DT = -1054  # ratio 0.89997


def adv(aid, status=AdvanceStatus.ACTIVE, *, last_sale_at=NOW, opened_at=None, total_owed=115_000_000,
        repaid=0):
    return AdvanceState(advance_id=aid, shop_id=SHOP, principal=100_000_000, total_owed=total_owed,
                        repaid=repaid, holdback_bps=1000, tier=1, last_sale_at=last_sale_at, status=status,
                        credential_claimed=False, opened_at=opened_at)


class FakeReader:
    chain_id = 31337
    book_address = "0x" + "11" * 20

    def __init__(self, *, ticks=(0, 0), advances=(), exposure=0, caps=CAPS, max_exp=MAX_EXP, head_ts=NOW):
        self.ticks = {3600: ticks[0], 86400: ticks[1]}
        self._advances = list(advances)
        self._limits = ChainLimits(tier_cap=caps, tier_cap_floor=FLOORS, max_exposure=max_exp,
                                   max_exposure_floor=MAX_EXP_FLOOR, exposure=exposure)
        self.head_ts = head_ts
        self.twap_error: Exception | None = None

    def latest_block(self):
        return 100

    def block_timestamp(self, n):
        return self.head_ts

    def limits(self):
        return self._limits

    def advances(self):
        return list(self._advances)

    def junior_pool_liquidity(self):
        return 100

    def junior_oracle_observation_count(self):
        return 2

    def junior_twap_tick(self, seconds_ago):
        if self.twap_error:
            raise self.twap_error
        return self.ticks[seconds_ago]

    def sales(self, *a):
        return []

    def usdc_funders(self, *a):
        return {}

    def shop_payout(self, shop_id):
        return None


class FakeWriter:
    def __init__(self, fail_times=0):
        self.calls: list[tuple[str, list, str]] = []
        self.fail_times = fail_times

    def send(self, fn_name, args, *, signer):
        if self.fail_times:
            self.fail_times -= 1
            raise RuntimeError("rpc down")
        self.calls.append((fn_name, args, signer))
        return "0x" + f"{len(self.calls):064x}"


class FakeJudge:
    def __init__(self, proposal=None, exc=None):
        self.proposal = proposal
        self.exc = exc
        self.calls = 0

    def propose_risk(self, signals, limits):
        self.calls += 1
        json.dumps(signals)  # signals must be JSON-safe for the model
        if self.exc:
            raise self.exc
        return self.proposal

    def underwrite(self, *a):
        raise NotImplementedError

    def critique(self, *a):
        raise NotImplementedError


@pytest.fixture
def settings(tmp_path):
    return Settings(deployments_file=tmp_path / "missing.json")


def fired(reader, **kw):
    return risk_signals(reader, NOW, **kw)["triggers"]


# ================================================================ triggers


class TestTwapTrigger:
    def test_threshold_function_exact_boundary(self):
        assert not risk.twap_drop_fires(0.90)  # exactly 10% below: not "more than"
        assert risk.twap_drop_fires(0.8999999)
        assert not risk.twap_drop_fires(0.9000001)

    @pytest.mark.parametrize("dt,expect", [(NO_FIRE_DT, False), (FIRE_DT, True), (0, False), (5000, False)])
    def test_junior_token0(self, dt, expect):
        r = FakeReader(ticks=(10_000 + dt, 10_000))
        assert (risk.TRIGGER_TWAP in fired(r, junior_is_token0=True)) is expect

    @pytest.mark.parametrize("dt,expect", [(-NO_FIRE_DT, False), (-FIRE_DT, True), (FIRE_DT, False)])
    def test_junior_token1_inverts_direction(self, dt, expect):
        # junior is token1: pool tick RISING means junior price FALLING
        r = FakeReader(ticks=(dt, 0))
        assert (risk.TRIGGER_TWAP in fired(r, junior_is_token0=False)) is expect

    @pytest.mark.parametrize("dt,expect", [(FIRE_DT, True), (-FIRE_DT, True), (NO_FIRE_DT, False),
                                           (-NO_FIRE_DT, False)])
    def test_unknown_orientation_fails_safe_both_ways(self, dt, expect):
        assert (risk.TRIGGER_TWAP in fired(FakeReader(ticks=(dt, 0)))) is expect

    def test_ratio_value(self):
        s = risk_signals(FakeReader(ticks=(FIRE_DT, 0)), NOW, junior_is_token0=True)
        assert s["twap"]["price_ratio_1h_vs_24h"] == pytest.approx(1.0001**FIRE_DT)
        assert s["twap"]["price_ratio_1h_vs_24h"] < 0.9 < 1.0001**NO_FIRE_DT

    def test_oracle_error_recorded_not_raised(self):
        r = FakeReader()
        r.twap_error = RuntimeError("InsufficientHistory")
        s = risk_signals(r, NOW, junior_is_token0=True)
        assert risk.TRIGGER_TWAP not in s["triggers"]
        assert s["errors"] == ["twap: RuntimeError"]

    def test_orientation_from_deployments(self, tmp_path):
        j, u = "0x" + "11" * 20, "0x" + "22" * 20
        p = tmp_path / "d.json"
        p.write_text(json.dumps({"JuniorVault": j, "USDC": u, "poolKey": {"currency0": j, "currency1": u}}))
        assert risk.junior_is_token0_from_deployments(p) is True
        p.write_text(json.dumps({"JuniorVault": j, "USDC": u, "poolKey": {"currency0": u, "currency1": j}}))
        assert risk.junior_is_token0_from_deployments(p) is False
        p.write_text(json.dumps({"JuniorVault": u, "USDC": j}))  # no poolKey -> address order
        assert risk.junior_is_token0_from_deployments(p) is False
        assert risk.junior_is_token0_from_deployments(tmp_path / "nope.json") is None


class TestWriteOffTrigger:
    def _wo(self, aid, ts):
        return adv(aid, AdvanceStatus.WRITTEN_OFF), ts

    @pytest.mark.parametrize("n,expect", [(1, False), (2, True), (3, True)])
    def test_count_boundary(self, n, expect):
        advs = [adv(i, AdvanceStatus.WRITTEN_OFF) for i in range(1, n + 1)]
        at = {i: NOW - DAY for i in range(1, n + 1)}
        assert (risk.TRIGGER_WRITE_OFFS in fired(FakeReader(advances=advs), written_off_at=at)) is expect

    @pytest.mark.parametrize("age,expect", [(7 * DAY - 1, True), (7 * DAY, True), (7 * DAY + 1, False)])
    def test_window_boundary(self, age, expect):
        advs = [adv(1, AdvanceStatus.WRITTEN_OFF), adv(2, AdvanceStatus.WRITTEN_OFF)]
        at = {1: NOW - DAY, 2: NOW - age}
        assert (risk.TRIGGER_WRITE_OFFS in fired(FakeReader(advances=advs), written_off_at=at)) is expect

    def test_ignores_non_written_off(self):
        advs = [adv(1, AdvanceStatus.REPAID), adv(2, AdvanceStatus.ACTIVE), adv(3, AdvanceStatus.WRITTEN_OFF)]
        at = {1: NOW, 2: NOW, 3: NOW}
        assert risk.TRIGGER_WRITE_OFFS not in fired(FakeReader(advances=advs), written_off_at=at)

    def test_missing_timestamp_uses_earliest_possible(self):
        # last sale 40 days ago, window 30d -> written off at earliest 10 days ago -> outside 7d
        advs = [adv(i, AdvanceStatus.WRITTEN_OFF, last_sale_at=NOW - 40 * DAY) for i in (1, 2)]
        assert risk.TRIGGER_WRITE_OFFS not in fired(FakeReader(advances=advs))
        advs = [adv(i, AdvanceStatus.WRITTEN_OFF, last_sale_at=NOW - 32 * DAY) for i in (1, 2)]
        assert risk.TRIGGER_WRITE_OFFS in fired(FakeReader(advances=advs))


class TestPaceTrigger:
    # expected 60 days, owed 120e6 -> expected 2e6/day. Opened 10 days ago -> on-pace repaid = 20e6.
    def _a(self, aid, repaid, opened=NOW - 10 * DAY):
        return adv(aid, total_owed=120_000_000, repaid=repaid, opened_at=opened)

    @pytest.mark.parametrize("repaid,expect", [(12_000_001, False), (12_000_000, False), (11_999_999, True)])
    def test_single_advance_boundary(self, repaid, expect):
        # 0.6 x 20e6 = 12e6 exactly
        assert (risk.TRIGGER_PACE in fired(FakeReader(advances=[self._a(1, repaid)]))) is expect

    def test_median_not_mean(self):
        # ratios 0.0, 0.5, 2.0 -> median 0.5 fires; mean 0.83 would not
        advs = [self._a(1, 0), self._a(2, 10_000_000), self._a(3, 40_000_000)]
        s = risk_signals(FakeReader(advances=advs), NOW)
        assert s["repayment_pace"]["median_ratio"] == pytest.approx(0.5)
        assert risk.TRIGGER_PACE in s["triggers"]

    def test_young_and_unknown_open_time_ignored(self):
        advs = [self._a(1, 0, opened=NOW - DAY + 1), adv(2, repaid=0, opened_at=None),
                self._a(3, 0, opened=NOW - DAY)]
        s = risk_signals(FakeReader(advances=advs), NOW)
        assert s["repayment_pace"]["n_measured"] == 1  # only the one exactly 1 day old
        assert s["repayment_pace"]["n_active"] == 3

    def test_no_active_does_not_fire(self):
        assert risk.TRIGGER_PACE not in fired(FakeReader(advances=[]))

    def test_injected_estimate(self):
        a = self._a(1, 12_000_000)  # 0.6 at 60d estimate; at 30d estimate it is 0.3
        assert risk.TRIGGER_PACE in fired(FakeReader(advances=[a]), expected_days_for=lambda _: 30)

    def test_exact_fraction(self):
        assert risk.pace_ratio(self._a(1, 12_000_000), NOW, 60) == Fraction(3, 5)


class TestExposureTrigger:
    @pytest.mark.parametrize("exp,expect", [(80_000_000_000 - 1, False), (80_000_000_000, False),
                                            (80_000_000_001, True)])
    def test_boundary(self, exp, expect):
        assert (risk.TRIGGER_EXPOSURE in fired(FakeReader(exposure=exp))) is expect

    def test_zero_max_exposure_counts_as_saturated(self):
        assert risk.exposure_fires(0, 0)


def test_quiet_market_no_triggers():
    s = risk_signals(FakeReader(ticks=(5, 0), exposure=1), NOW, junior_is_token0=True)
    assert s["triggers"] == [] and s["errors"] == []


# ================================================================ RiskAgent


def hot_reader(**kw):
    return FakeReader(exposure=90_000_000_000, **kw)  # exposure trigger fires


class TestRiskAgent:
    def test_no_triggers_no_judge_no_tx(self, settings):
        w, j = FakeWriter(), FakeJudge(RiskProposal(new_tier_cap=FLOORS, new_max_exposure=0, rationale="x"))
        rec = RiskAgent(FakeReader(), w, j, settings, now=lambda: NOW).tick()
        assert rec["skipped"] == "no_triggers" and j.calls == 0 and w.calls == []

    def test_valid_cut_is_sent_by_risk_manager(self, settings):
        w = FakeWriter()
        p = RiskProposal(new_tier_cap=(50_000_000, 100_000_000, 200_000_000, 250_000_000),
                         new_max_exposure=50_000_000_000, rationale="exposure high")
        rec = RiskAgent(hot_reader(), w, FakeJudge(p), settings, now=lambda: NOW).tick()
        assert w.calls == [("lowerLimits", [[50_000_000, 100_000_000, 200_000_000, 250_000_000],
                                            50_000_000_000], "risk_manager")]
        assert rec["tx_hash"] and rec["source"] == "judge" and rec["triggers"] == ["exposure_utilisation"]

    def test_raise_proposal_is_clamped_and_never_sent(self, settings):
        """Judge tries to RAISE every limit: clamped to current -> nothing changes -> no tx."""
        w = FakeWriter()
        p = RiskProposal(new_tier_cap=(10**12,) * 4, new_max_exposure=10**15, rationale="loosen!")
        rec = RiskAgent(hot_reader(), w, FakeJudge(p), settings, now=lambda: NOW).tick()
        assert w.calls == []
        assert rec["skipped"] == "no_change"
        assert rec["enforced"]["tier_cap"] == list(CAPS) and rec["enforced"]["max_exposure"] == MAX_EXP

    def test_mixed_raise_and_below_floor(self, settings):
        """Tier 0 raised, tier 1 below floor, tier 3 legit cut, maxExposure below floor."""
        w = FakeWriter()
        p = RiskProposal(new_tier_cap=(999_000_000, 1, 250_000_000, 100_000_000), new_max_exposure=0,
                         rationale="x")
        RiskAgent(hot_reader(), w, FakeJudge(p), settings, now=lambda: NOW).tick()
        (fn, (caps, mx), signer), = w.calls
        assert fn == "lowerLimits" and caps == [50_000_000, 50_000_000, 250_000_000, 100_000_000]
        assert mx == MAX_EXP_FLOOR
        assert all(c <= cur for c, cur in zip(caps, CAPS)) and all(c >= f for c, f in zip(caps, FLOORS))
        assert signer == "risk_manager"

    def test_current_below_floor_is_not_raised(self):
        lim = ChainLimits(tier_cap=(10, 10, 10, 10), tier_cap_floor=(20, 20, 20, 20), max_exposure=5,
                          max_exposure_floor=50, exposure=0)
        p = RiskProposal(new_tier_cap=(0, 0, 0, 0), new_max_exposure=0, rationale="")
        assert risk.enforce_down_only(p, lim) == ((10, 10, 10, 10), 5)

    def test_unchanged_proposal_no_tx(self, settings):
        w = FakeWriter()
        p = RiskProposal(new_tier_cap=CAPS, new_max_exposure=MAX_EXP, rationale="hold")
        rec = RiskAgent(hot_reader(), w, FakeJudge(p), settings, now=lambda: NOW).tick()
        assert w.calls == [] and rec["skipped"] == "no_change"

    def test_judge_exception_falls_back(self, settings):
        w = FakeWriter()
        rec = RiskAgent(hot_reader(), w, FakeJudge(exc=TimeoutError()), settings, now=lambda: NOW).tick()
        assert rec["source"] == "fallback" and rec["error"] == "judge: TimeoutError"
        (fn, (caps, mx), signer), = w.calls
        assert fn == "lowerLimits" and caps == [50_000_000, 100_000_000, 187_500_000, 375_000_000]
        assert mx == 75_000_000_000 and signer == "risk_manager"

    @pytest.mark.parametrize("garbage", [
        None,
        {"new_tier_cap": [1, 2, 3, 4]},
        RiskProposal.model_construct(new_tier_cap=(1, 2, 3), new_max_exposure=1, rationale=""),
        RiskProposal.model_construct(new_tier_cap=(1, 2, 3, -4), new_max_exposure=1, rationale=""),
        RiskProposal.model_construct(new_tier_cap=(1, 2, 3, 4.5), new_max_exposure=1, rationale=""),
        RiskProposal.model_construct(new_tier_cap=(1, 2, 3, 4), new_max_exposure="lots", rationale=""),
    ])
    def test_garbage_proposal_falls_back(self, settings, garbage):
        w = FakeWriter()
        rec = RiskAgent(hot_reader(), w, FakeJudge(garbage), settings, now=lambda: NOW).tick()
        assert rec["source"] == "fallback" and len(w.calls) == 1

    def test_fallback_respects_floors(self, settings):
        r = FakeReader(exposure=10**12, caps=(50_000_000, 50_000_000, 60_000_000, 60_000_000),
                       max_exp=MAX_EXP_FLOOR + 1)
        w = FakeWriter()
        RiskAgent(r, w, FakeJudge(exc=ValueError()), settings, now=lambda: NOW).tick()
        (_, (caps, mx), _), = w.calls
        assert caps == [50_000_000, 50_000_000, 50_000_000, 50_000_000] and mx == MAX_EXP_FLOOR

    def test_fallback_at_floors_sends_nothing(self, settings):
        r = FakeReader(exposure=10**12, caps=FLOORS, max_exp=MAX_EXP_FLOOR)
        w = FakeWriter()
        rec = RiskAgent(r, w, FakeJudge(exc=ValueError()), settings, now=lambda: NOW).tick()
        assert w.calls == [] and rec["skipped"] == "no_change"

    def test_send_failure_recorded_not_raised(self, settings):
        p = RiskProposal(new_tier_cap=FLOORS, new_max_exposure=MAX_EXP_FLOOR, rationale="")
        rec = RiskAgent(hot_reader(), FakeWriter(fail_times=1), FakeJudge(p), settings, now=lambda: NOW).tick()
        assert rec["skipped"] == "send_failed" and rec["tx_hash"] is None

    def test_write_offs_observed_over_time(self, settings):
        """First tick seeds old write-offs at their earliest time (no false burst); later ones get `now`."""
        t = [NOW]
        r = FakeReader(advances=[adv(1, AdvanceStatus.WRITTEN_OFF, last_sale_at=NOW - 100 * DAY)])
        agent = RiskAgent(r, FakeWriter(), FakeJudge(exc=ValueError()), settings, now=lambda: t[0],
                          junior_is_token0=True)
        assert agent.tick()["skipped"] == "no_triggers"
        r._advances += [adv(2, AdvanceStatus.WRITTEN_OFF, last_sale_at=NOW - 100 * DAY),
                        adv(3, AdvanceStatus.WRITTEN_OFF, last_sale_at=NOW - 100 * DAY)]
        t[0] = NOW + 300
        assert agent.tick()["triggers"] == ["write_offs_7d"]


# ================================================================ Keeper

WINDOW = 30 * DAY


class TestKeeper:
    def test_eligibility_boundary(self, settings):
        r = FakeReader(advances=[adv(1, last_sale_at=NOW - WINDOW),  # exactly at window -> eligible
                                 adv(2, last_sale_at=NOW - WINDOW + 1),  # one second before -> not
                                 adv(3, AdvanceStatus.REPAID, last_sale_at=0),
                                 adv(4, AdvanceStatus.WRITTEN_OFF, last_sale_at=0)])
        w = FakeWriter()
        out = Keeper(r, w, settings, now=lambda: NOW, default_window=WINDOW).tick()
        assert w.calls == [("writeOff", [1], "relayer")]
        assert list(out) == ["0x" + f"{1:064x}"] and out.errors == []

    def test_uses_chain_time_by_default(self, settings):
        r = FakeReader(advances=[adv(1, last_sale_at=NOW - WINDOW)], head_ts=NOW - 1)
        w = FakeWriter()
        Keeper(r, w, settings, default_window=WINDOW).tick()
        assert w.calls == []
        r.head_ts = NOW
        Keeper(r, w, settings, default_window=WINDOW).tick()
        assert w.calls == [("writeOff", [1], "relayer")]

    def test_idempotent_while_in_flight_then_retries_after_ttl(self, settings):
        t = [NOW]
        r = FakeReader(advances=[adv(1, last_sale_at=0)])
        w = FakeWriter()
        k = Keeper(r, w, settings, now=lambda: t[0], default_window=WINDOW, inflight_ttl=600)
        k.tick()
        t[0] += 60
        second = k.tick()
        assert len(w.calls) == 1 and list(second) == [] and "writeOff:1:in_flight" in second.skipped
        t[0] = NOW + 600  # tx apparently dropped: retry
        k.tick()
        assert len(w.calls) == 2

    def test_settled_ids_are_forgotten(self, settings):
        r = FakeReader(advances=[adv(1, last_sale_at=0)])
        w = FakeWriter()
        k = Keeper(r, w, settings, now=lambda: NOW, default_window=WINDOW)
        k.tick()
        r._advances = [adv(1, AdvanceStatus.WRITTEN_OFF, last_sale_at=0)]
        k.tick()
        assert len(w.calls) == 1 and k._inflight == {}

    def test_send_error_reported_and_retried(self, settings):
        r = FakeReader(advances=[adv(1, last_sale_at=0), adv(2, last_sale_at=0)])
        w = FakeWriter(fail_times=1)
        k = Keeper(r, w, settings, now=lambda: NOW, default_window=WINDOW)
        out = k.tick()
        assert out.errors == ["writeOff:1: RuntimeError"] and len(out) == 1  # id 2 still sent
        k.tick()
        assert [c[1] for c in w.calls] == [[2], [1]]

    def test_never_raises_on_reader_failure(self, settings):
        class Broken(FakeReader):
            def advances(self):
                raise ConnectionError()

        out = Keeper(Broken(), FakeWriter(), settings, now=lambda: NOW).tick()
        assert list(out) == [] and out.errors == ["advances: ConnectionError"]

    @pytest.mark.parametrize("bal,sent", [(0, False), (1, True)])
    def test_flush_only_when_balance_positive(self, settings, bal, sent):
        w = FakeWriter()
        Keeper(FakeReader(), w, settings, now=lambda: NOW, hook_usdc_balance=lambda: bal).tick()
        assert (w.calls == [("flush", [], "relayer")]) is sent

    def test_flush_not_doubled_and_skipped_without_getter(self, settings):
        w = FakeWriter()
        k = Keeper(FakeReader(), w, settings, now=lambda: NOW, hook_usdc_balance=lambda: 5)
        k.tick()
        k.tick()
        assert len(w.calls) == 1
        out = Keeper(FakeReader(), w, settings, now=lambda: NOW).tick()
        assert "flush:no_balance_getter" in out.skipped and len(w.calls) == 1


def test_status_is_read_only_and_uses_orientation():
    """GET /risk/status must never call the judge or send a tx, and must use the resolved orientation."""
    sent, judged = [], []

    class W:
        def send(self, *a, **k):
            sent.append(a)
            return "0x" + "00" * 32

    class J:
        def propose_risk(self, *a, **k):
            judged.append(a)
            raise AssertionError("judge must not be called by status()")

    reader = FakeReader()
    agent = RiskAgent(reader, W(), J(), Settings(_env_file=None), now=lambda: 10_000_000, junior_is_token0=True)
    out = agent.status()
    assert out["signals"]["twap"]["junior_is_token0"] is True
    assert sent == [] and judged == []
    assert "last_tick" in out
