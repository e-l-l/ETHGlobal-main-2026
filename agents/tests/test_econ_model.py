import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("econ_model", Path(__file__).parents[1] / "scripts/econ_model.py")
econ = importlib.util.module_from_spec(spec)
spec.loader.exec_module(econ)


def test_fee_checkpoints_and_annualized_disclosure():
    r = econ.model(econ.DEFAULTS)
    assert r["merchant_cost_percent"] == {"1": 0.5, "2": 1.0, "4": 2.0, "6": 3.0}
    assert r["merchant_simple_annualized_percent"] == {"1": 26.0, "2": 26.0, "4": 26.0, "6": 26.0}
    assert r["fee_split_per_100"] == pytest.approx([0.8, 0.6, 0.4, 0.2])
    assert r["platform_protocol_revenue_per_1m_lent"] == pytest.approx(2000)


def test_lender_scenarios():
    r = econ.model(econ.DEFAULTS)
    assert r["senior_annual_return_percent"] == pytest.approx(9.6)
    assert r["drip_annual_return_percent_by_loss"] == {
        "0.25%": pytest.approx(21), "0.5%": pytest.approx(6),
        "1%": pytest.approx(-24), "2%": pytest.approx(-84),
    }


def test_invalid_fee_split_and_defaults():
    with pytest.raises(ValueError):
        econ.model({**econ.DEFAULTS, "fee_split": [0.4, 0.3, 0.2, 0.2]})
    assert econ.DEFAULTS["tier_caps"] == [50, 100, 200, 300]
    assert econ.DEFAULTS["holdback"] == 0.08
