"""DripMoni time-based fee economics; amounts are USD and rates are fractions."""
import argparse
import json
import math
from pathlib import Path

DEFAULTS = {
    "fee_rate_bps_per_week": 50, "fee_cap_bps": 300,
    "fee_split": [0.4, 0.3, 0.2, 0.1], "junior_cover": 0.20,
    "utilisation": 0.75, "tenor_weeks": 4,
    "loss_rates_per_cycle": [0.0025, 0.005, 0.01, 0.02],
    "tier_caps": [50, 100, 200, 300], "holdback": 0.08,
}


def fee_rate(p, weeks):
    return min(p["fee_cap_bps"], p["fee_rate_bps_per_week"] * weeks) / 10_000


def merchant_cost(p, weeks):
    """Simple annualized disclosure of the time fee; returned as percent."""
    if weeks <= 0:
        return 0.0
    return fee_rate(p, weeks) * 52 / weeks * 100


def model(p):
    if len(p["fee_split"]) != 4 or not math.isclose(sum(p["fee_split"]), 1):
        raise ValueError("fee_split must have four shares summing to one")
    if p["fee_rate_bps_per_week"] <= 0 or p["fee_cap_bps"] <= 0:
        raise ValueError("fee terms must be positive")
    if not 0 < p["utilisation"] <= 1 or p["junior_cover"] < 0:
        raise ValueError("invalid utilisation or cover")
    cycle_fee = fee_rate(p, p["tenor_weeks"])
    senior_fee, drip_fee, reserve_fee, protocol_fee = [cycle_fee * x for x in p["fee_split"]]
    # Annualized returns use the stated 4-week cycle and 12 cycles per year.
    senior_return = senior_fee * 12
    drip_returns = {}
    for loss in p["loss_rates_per_cycle"]:
        # DRIP is 20% first-loss cover per $100 of senior principal.
        drip_returns[f"{loss * 100:g}%"] = (drip_fee - loss) / p["junior_cover"] * 12 * 100
    return {
        "merchant_cost_percent": {str(w): fee_rate(p, w) * 100 for w in (1, 2, 4, 6)},
        "merchant_simple_annualized_percent": {str(w): merchant_cost(p, w) for w in (1, 2, 4, 6)},
        "fee_split_per_100": [100 * cycle_fee * x for x in p["fee_split"]],
        "fee_per_1m_lent": 1_000_000 * cycle_fee,
        "platform_protocol_revenue_per_1m_lent": 1_000_000 * protocol_fee,
        "senior_annual_return_percent": senior_return * 100,
        "drip_annual_return_percent_by_loss": drip_returns,
        "tier_caps": p["tier_caps"],
        "holdback_percent": p["holdback"] * 100,
        "utilisation_percent": p["utilisation"] * 100,
        "tenor_weeks": p["tenor_weeks"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset")
    args = parser.parse_args()
    p = DEFAULTS.copy()
    if args.preset:
        raw = args.preset if args.preset.lstrip().startswith("{") else Path(args.preset).read_text()
        p.update(json.loads(raw))
    print(json.dumps({"inputs": p, "results": model(p)}, indent=2))


if __name__ == "__main__":
    main()
