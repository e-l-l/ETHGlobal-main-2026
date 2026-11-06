"""Offline tests for scripts/demo_standing_pass.py: the sale plan repays exactly, and the shop argument parses."""

from __future__ import annotations

import importlib.util
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("demo_standing_pass", ROOT / "scripts" / "demo_standing_pass.py")
demo = importlib.util.module_from_spec(_spec)
sys.modules["demo_standing_pass"] = demo
_spec.loader.exec_module(demo)

SHOP = "0x" + "ab" * 32


@pytest.mark.parametrize("left", [1, 57_500_000, 57_499_999, 115_000_000, 3_333_333])
@pytest.mark.parametrize("holdback", [500, 1000, 1337, 2000])
@pytest.mark.parametrize("n", [1, 2, 3, 7])
def test_plan_repays_exactly(left, holdback, n):
    for seed in range(5):
        sales = demo.plan_sales(left, holdback, n, random.Random(seed))
        assert 1 <= len(sales) <= n
        assert all(s > 0 and s % demo.CENT == 0 for s in sales)  # whole cents
        assert demo.simulate(sales, holdback, left) == 0  # fully repaid
        assert demo.simulate(sales[:-1], holdback, left) > 0  # ...and only by the last sale
        # the last sale is the smallest that finishes it
        before = demo.simulate(sales[:-1], holdback, left)
        assert demo.repayment(sales[-1] - demo.CENT, holdback, before) < before


def test_plan_matches_contract_math_for_the_live_advance():
    # advance #3 on Sepolia: $57.50 owed at 10% → one $575.00 sale
    assert demo.plan_sales(57_500_000, 1000, 1) == [575_000_000]
    assert demo.plan_sales(0, 1000, 3) == []


def test_parse_shop():
    assert demo.parse_shop(SHOP.upper().replace("0X", "0x")) == SHOP
    assert demo.parse_shop(f"https://app.example/pay/corner-kiosk?shop={SHOP}&name=Kiosk") == SHOP
    for bad in ["0x1234", "shop_7f3a", "https://app.example/pay/x?name=y"]:
        with pytest.raises(demo.DemoError):
            demo.parse_shop(bad)


def test_bad_holdback_rejected():
    with pytest.raises(demo.DemoError):
        demo.plan_sales(1_000, 0, 1)
