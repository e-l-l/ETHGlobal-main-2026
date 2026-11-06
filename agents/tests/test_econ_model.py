import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("econ_model", Path(__file__).parents[1] / "scripts/econ_model.py")
econ = importlib.util.module_from_spec(spec)
spec.loader.exec_module(econ)


def test_critique_break_evens():
    assert econ.break_even(0.15) == pytest.approx(0.13043478)
    assert econ.break_even(0.045) == pytest.approx(0.0430622)
    assert econ.break_even(0.09) == pytest.approx(0.0825688)


def test_cash_flow_and_waterfall():
    p = econ.DEFAULTS.copy()
    r = econ.model(p)
    assert sum(r[k] for k in ("fee_senior", "fee_junior", "fee_reserve", "fee_protocol")) == pytest.approx(
        r["annual_originations"] * (1 - p["default_rate"]) * (p["factor"] - 1))
    assert sum(r[k] for k in ("junior_loss", "reserve_loss", "senior_loss", "uncovered_loss")) == pytest.approx(r["loss"])
    assert r["gross_revenue"] - r["total_cost"] == pytest.approx(r["net_income"])
    assert r["capital"] == pytest.approx(r["outstanding"] + r["idle_cash"])


def test_cost_and_low_utilisation():
    p = econ.DEFAULTS.copy()
    a = econ.model(p)
    assert a["merchant_effective_annual_cost"][0] < a["merchant_effective_annual_cost"][1] < a["merchant_effective_annual_cost"][2]
    p["utilisation"] = 0.35
    b = econ.model(p)
    assert b["idle_cash"] > a["idle_cash"]
    assert b["senior_return"] < a["senior_return"]


def test_invalid_split():
    with pytest.raises(ValueError):
        econ.model({**econ.DEFAULTS, "fee_split": [0.5, 0.2, 0.1, 0.1]})
