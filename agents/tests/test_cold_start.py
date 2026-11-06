"""Cold start: a new shop with a zkTLS-proven revenue band but thin onchain history (the live Sepolia demo)."""

import pytest
from test_judges import LIMITS, honest

from mra_agents import redlines
from mra_agents.clamp import clamp_offer
from mra_agents.models import BAND_MIN_MONTHLY_USD, OfferDraft, band_floor_daily_usd
from mra_agents.pipeline import mark_cold_start
from mra_agents.underwriter import build_underwriter_user, paces_usd_per_day


def thin(**over):
    """A brand-new shop: 3 sales from 2 customers over 2 days, spike sentinel from an empty prior period."""
    daily = [0.0] * 28 + [6.0, 9.0]
    base = {"days_active_30d": 2, "sales_count_30d": 3, "unique_payers_30d": 2, "top_payer_share_30d": 0.6,
            "hhi_payers_30d": 0.52, "spike_ratio": 99.0, "revenue_7d_usd": 15.0, "revenue_30d_usd": 15.0,
            "revenue_90d_usd": 15.0, "avg_daily_revenue_30d_usd": 0.5, "daily_revenue_30d_usd": daily,
            "funded_by_shop_share": 0.0, "new_payer_share_30d": 1.0, "shop_label": None}
    base.update(over)
    return honest(**base)


def test_band_floors():
    assert band_floor_daily_usd(None) == 0 and band_floor_daily_usd(0) == 0
    assert band_floor_daily_usd(2) == pytest.approx(BAND_MIN_MONTHLY_USD[2] / 30)
    assert band_floor_daily_usd(9) == band_floor_daily_usd(3)  # capped at the top band


def test_thin_history_without_band_is_rejected_as_before():
    hits = redlines.check(thin())
    assert {redlines.FEW_PAYERS, redlines.FEW_ACTIVE_DAYS, redlines.SALES_SPIKE} <= set(hits)


def test_cold_start_skips_not_enough_data_lines():
    f = mark_cold_start(thin(), band=2)
    assert f.cold_start and f.proven_revenue_band == 2
    assert redlines.check(f) == []


def test_cold_start_still_rejects_circular_funding():
    f = mark_cold_start(thin(funded_by_shop_share=0.5), band=2)
    assert redlines.check(f) == [redlines.CIRCULAR_FUNDING]


def test_cold_start_concentration_applies_once_enough_sales():
    few = mark_cold_start(thin(top_payer_share_30d=0.9), band=2)
    assert redlines.PAYER_CONCENTRATION not in redlines.check(few)  # 3 sales: too few to measure
    # 12 sales is still "thin" for the cold-start flag (< 20) but enough to measure concentration.
    many = mark_cold_start(thin(top_payer_share_30d=0.9, sales_count_30d=12), band=2)
    assert many.cold_start and redlines.PAYER_CONCENTRATION in redlines.check(many)


def test_established_shop_is_not_cold_start():
    f = mark_cold_start(honest(), band=2)
    assert f.proven_revenue_band == 2 and not f.cold_start
    assert redlines.check(f) == redlines.check(honest())


def draft(amount=50_000_000):
    return OfferDraft(decision="offer", amount=amount, factor_bps=11500, holdback_bps=1000, est_days_slow=40,
                      est_days_normal=25, est_days_busy=15, reasons_en=["a", "b"], reasons_es=["a", "b"])


def test_clamp_uses_band_floor_on_cold_start():
    no_band, why = clamp_offer(draft(), thin(), 0, LIMITS, 60)
    # $0.50/day onchain: $57.50 at 10% holdback takes 1,150 days -> nothing fits.
    assert no_band is None and any("repayment window" in c for c in why)
    cold, _ = clamp_offer(draft(), mark_cold_start(thin(), band=2), 0, LIMITS, 60)
    # Band 2 floor = $66.67/day -> $6.67/day repaid -> $57.50 in ~9 days.
    assert cold is not None and cold.amount == 50_000_000


def test_underwriter_sees_band_and_cold_start_paces():
    f = mark_cold_start(thin(), band=2)
    paces = paces_usd_per_day(f)
    floor = band_floor_daily_usd(2)
    assert paces["normal"] == pytest.approx(round(floor, 2))
    assert paces["slow"] < paces["normal"] < paces["busy"]
    user = build_underwriter_user(f, 0, LIMITS, 60)
    assert '"cold_start": true' in user.replace(" ", "").replace('":true', '": true')
    assert '"proven_revenue_band": 2' in user.replace('":2', '": 2')
    assert "2000" in user  # the proven monthly floor reaches the model


def test_managed_agent_passes_mandate_band_for_tier0(tmp_path):
    """A tier-0 mandate draw carries the band proven at registerMandate, so the pipeline cold-starts on it."""
    from test_merchant_agents import World

    w = World(tmp_path)
    seen = []
    w.deps.request_offer = lambda *a, **kw: seen.append((a, kw)) or w.decision
    aid = w.active_agent(tier=0)
    agent = w.store.get(aid).address
    w.deps.mandate_reader = lambda mid: {"exists": True, "active": True, "band": 2, "agentKey": agent}
    r = w.tick(aid)
    assert r.action == "drew"
    (args, kw), = seen
    assert args[1] == 0 and kw == {"min_revenue_band": 2}


def test_managed_agent_tier1_does_not_pass_band(tmp_path):
    from test_merchant_agents import World

    w = World(tmp_path)
    seen = []
    w.deps.request_offer = lambda *a, **kw: seen.append((a, kw)) or w.decision
    aid = w.active_agent(tier=1)
    agent = w.store.get(aid).address
    w.deps.mandate_reader = lambda mid: {"exists": True, "active": True, "band": 0, "agentKey": agent}
    w.tick(aid)
    (args, kw), = seen
    assert args[1] == 1 and kw == {}


def test_critic_sees_only_the_red_lines_the_code_enforces_on_cold_start():
    """The Critic rejected a real Sepolia cold start ("one customer over one day isn't enough") because its
    payload listed the few-payers / few-days lines that redlines.check skips for a proven band."""
    import json

    from mra_agents.critic import build_critic_user, red_lines_payload

    cold = mark_cold_start(thin(), band=2)
    lines = red_lines_payload(cold)
    assert set(lines) == {"funded_by_shop_share"}
    assert "unique_payers_30d" not in build_critic_user(cold, draft()).split('"red_lines"')[1]
    assert set(red_lines_payload(thin())) == {"unique_payers_30d", "top_payer_share_30d", "funded_by_shop_share",
                                              "days_active_30d", "spike_ratio"}
    assert json.dumps(red_lines_payload())  # no-arg form unchanged


def test_standing_pass_tier_is_a_cold_start_on_a_fresh_shop():
    """After repaying, the merchant moves to a fresh shop (unlinkable). Its thin history must not block tier 1."""
    from mra_agents.pipeline import apply_cold_start

    f = apply_cold_start(thin(), tier=1)
    assert f.cold_start and f.proven_revenue_band == 1
    assert redlines.check(f) == []


def test_standing_pass_tier_still_hits_hard_red_lines():
    from mra_agents.pipeline import apply_cold_start

    f = apply_cold_start(thin(funded_by_shop_share=0.9), tier=1)
    assert redlines.CIRCULAR_FUNDING in redlines.check(f)


def test_tier0_without_band_is_not_a_cold_start():
    from mra_agents.pipeline import apply_cold_start

    f = apply_cold_start(thin(), tier=0)
    assert not f.cold_start
    assert {redlines.FEW_PAYERS, redlines.FEW_ACTIVE_DAYS} <= set(redlines.check(f))
