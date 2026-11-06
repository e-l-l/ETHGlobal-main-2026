"""Illustrative steady-state MCA economics; amounts are USDC and rates are fractions."""
import argparse
import json
import math
from pathlib import Path

DEFAULTS = {
    "merchants": 100, "tier_mix": [0.4, 0.3, 0.2, 0.1],
    "tier_amounts": [50, 100, 250, 500], "factor": 1.15, "holdback": 0.10,
    "speed_days": [90, 45, 25], "speed_mix": [0.25, 0.5, 0.25],
    "default_rate": 0.03, "lgd": 1.0, "fee_split": [8 / 15, 4 / 15, 0.1, 0.1],
    "junior_cover": 0.15, "utilisation": 0.75, "initial_reserve": 0.0,
    "hook_volume_per_merchant_month": 100, "hook_eligible_fraction": 0.5,
    "hook_fee": 0.003, "hook_reserve_share": 0.75,
    "sales_per_merchant_month": 1500, "checkout_fee": 0.005,
    "checkout_waived_fraction": 0.75, "llm_per_decision": 0.10,
    "decisions_per_advance": 2, "gas_per_tx": 0.02, "tx_per_advance": 8,
    "infra_per_advance": 0.10, "acquisition_per_merchant": 5,
    "monthly_opex": 10000, "selloff_price_drop": 0.4,
}


def validate(p):
    for key, length in [("tier_mix", 4), ("tier_amounts", 4), ("speed_days", 3),
                        ("speed_mix", 3), ("fee_split", 4)]:
        if len(p[key]) != length or any(not math.isfinite(x) or x < 0 for x in p[key]):
            raise ValueError(f"invalid {key}")
    for key in ("tier_mix", "speed_mix", "fee_split"):
        if not math.isclose(sum(p[key]), 1, abs_tol=1e-9):
            raise ValueError(f"{key} must sum to 1")
    for key in ("default_rate", "lgd", "junior_cover", "utilisation", "hook_eligible_fraction",
                "hook_reserve_share", "checkout_waived_fraction", "selloff_price_drop"):
        if not 0 <= p[key] <= 1:
            raise ValueError(f"{key} must be between 0 and 1")
    if p["factor"] < 1 or not 0 < p["holdback"] <= 1 or not p["utilisation"]:
        raise ValueError("factor, holdback or utilisation out of range")
    if any(x <= 0 for x in p["speed_days"]) or any(x <= 0 for x in p["tier_amounts"]):
        raise ValueError("days and amounts must be positive")
    for key in ("merchants", "initial_reserve", "hook_volume_per_merchant_month", "hook_fee",
                "sales_per_merchant_month", "checkout_fee", "llm_per_decision", "decisions_per_advance",
                "gas_per_tx", "tx_per_advance", "infra_per_advance", "acquisition_per_merchant", "monthly_opex"):
        if not math.isfinite(p[key]) or p[key] < 0:
            raise ValueError(f"{key} must be finite and nonnegative")
    if p["merchants"] <= 0 or p["hook_fee"] > 1 or p["checkout_fee"] > 1:
        raise ValueError("invalid merchants or transaction fee")


def break_even(fee_per_principal, lgd=1):
    """Probability p where (1-p)*fee - p*LGD = 0; no buffers or costs."""
    return fee_per_principal / (fee_per_principal + lgd) if fee_per_principal + lgd else 0


def merchant_cost(factor, days):
    """Effective annual IRR of equal daily payments; fractional duration uses continuous payments."""
    if factor == 1:
        return 0.0
    lo, hi = 0.0, 1.0
    def pv(r):
        return factor * (-math.expm1(-r * days)) / (r * days) if r else factor
    while pv(hi) > 1:
        hi *= 2
    for _ in range(100):
        mid = (lo + hi) / 2
        if pv(mid) > 1:
            lo = mid
        else:
            hi = mid
    return math.expm1(min(hi * 365, 700))


def model(p):
    validate(p)
    n = p["merchants"]
    avg = sum(a * w for a, w in zip(p["tier_amounts"], p["tier_mix"], strict=True))
    days = sum(d * w for d, w in zip(p["speed_days"], p["speed_mix"], strict=True))
    # One active advance per merchant; stationary book, recycled after average duration.
    outstanding = n * avg
    advances = n * 365 / days
    originated = advances * avg
    capital = outstanding / p["utilisation"]
    junior = p["junior_cover"] * outstanding
    senior = capital - junior
    if senior <= 0:
        raise ValueError("junior capital must be less than total capital")
    successful = originated * (1 - p["default_rate"])
    fees = successful * (p["factor"] - 1)
    sf, jf, rf, pf = [fees * x for x in p["fee_split"]]
    hook = (n * p["hook_volume_per_merchant_month"] * 12 * p["hook_eligible_fraction"]
            * p["hook_fee"])
    reserve_in = rf + hook * p["hook_reserve_share"]
    loss = originated * p["default_rate"] * p["lgd"]
    jloss = min(loss, junior + jf)
    rloss = min(max(loss - jloss, 0), p["initial_reserve"] + reserve_in)
    sloss = min(max(loss - jloss - rloss, 0), senior + sf)
    uncovered = max(loss - jloss - rloss - sloss, 0)
    checkout = n * p["sales_per_merchant_month"] * 12 * p["checkout_fee"] * (1 - p["checkout_waived_fraction"])
    revenue = pf + hook * (1 - p["hook_reserve_share"]) + checkout
    variable = advances * (p["llm_per_decision"] * p["decisions_per_advance"]
                            + p["gas_per_tx"] * p["tx_per_advance"] + p["infra_per_advance"])
    acquisition = n * p["acquisition_per_merchant"]
    cost = variable + acquisition + 12 * p["monthly_opex"]
    contribution_per_merchant = (revenue - variable - acquisition) / n
    needed = math.ceil(12 * p["monthly_opex"] / contribution_per_merchant) if contribution_per_merchant > 0 else None
    return {"average_advance": avg, "average_days": days, "annual_advances": advances,
            "annual_originations": originated, "outstanding": outstanding, "capital": capital,
            "senior_capital": senior, "junior_capital": junior, "idle_cash": capital - outstanding,
            "fee_senior": sf, "fee_junior": jf, "fee_reserve": rf, "fee_protocol": pf,
            "hook_fee_total": hook, "checkout_revenue": checkout, "gross_revenue": revenue,
            "variable_cost": variable, "acquisition_cost": acquisition, "total_cost": cost,
            "net_income": revenue - cost, "margin": (revenue - cost) / revenue if revenue else None,
            "loss": loss, "junior_loss": jloss, "reserve_loss": rloss, "senior_loss": sloss,
            "uncovered_loss": uncovered, "senior_return": (sf - sloss) / senior,
            "junior_return": (jf - jloss) / junior if junior else None,
            "reserve_growth": reserve_in - rloss, "reserve_inflow": reserve_in,
            "merchant_effective_annual_cost": [merchant_cost(p["factor"], d) for d in p["speed_days"]],
            "whole_book_break_even": break_even(p["factor"] - 1, p["lgd"]),
            "junior_unbuffered_break_even": break_even((p["factor"] - 1) * p["fee_split"][1], p["lgd"]),
            "senior_unprotected_break_even": break_even((p["factor"] - 1) * p["fee_split"][0], p["lgd"]),
            "merchants_to_break_even": needed,
            "selloff_market_value": junior * (1 - p["selloff_price_drop"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", help="JSON object or path to JSON object; CLI flags override it")
    parser.add_argument("--scenario", choices=["base", "default-spike", "correlated-defaults", "low-utilisation", "drip-selloff"], default="base")
    for key, value in DEFAULTS.items():
        parser.add_argument("--" + key.replace("_", "-"), type=json.loads if isinstance(value, list) else type(value), default=None)
    args = vars(parser.parse_args())
    preset = args.pop("preset")
    scenario = args.pop("scenario")
    p = DEFAULTS.copy()
    if preset:
        raw = preset if preset.lstrip().startswith("{") else Path(preset).read_text()
        overrides = json.loads(raw)
        if not isinstance(overrides, dict) or set(overrides) - set(p):
            parser.error("preset must be an object with known parameter names")
        p.update(overrides)
    changes = {"default-spike": {"default_rate": 0.12},
               "correlated-defaults": {"default_rate": 0.30, "lgd": 1.0},
               "low-utilisation": {"utilisation": 0.35},
               "drip-selloff": {"selloff_price_drop": 0.40, "hook_volume_per_merchant_month": 250}}
    p.update(changes.get(scenario, {}))
    p.update({k: v for k, v in args.items() if v is not None})
    try:
        result = model(p)
    except (ValueError, TypeError) as exc:
        parser.error(str(exc))
    print(json.dumps({"scenario": scenario, "inputs": p, "results": result}, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
