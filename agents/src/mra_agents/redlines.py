"""Hard red lines (SPEC "Red lines"). Pure code, run before any model call.

Any hit means reject. `check` returns stable reason codes in a fixed order; an empty list = pass.
A non-finite float (NaN/inf) in a checked feature counts as a hit (fail closed).
"""

from __future__ import annotations

import math

from .models import ShopFeatures

MIN_UNIQUE_PAYERS_30D = 5  # reject if unique_payers_30d < 5
MAX_TOP_PAYER_SHARE_30D = 0.40  # reject if top_payer_share_30d > 0.40
MAX_FUNDED_BY_SHOP_SHARE = 0.20  # reject if funded_by_shop_share > 0.20
MIN_DAYS_ACTIVE_30D = 7  # reject if days_active_30d < 7
MAX_SPIKE_RATIO = 4.0  # reject if spike_ratio > 4.0

FEW_PAYERS = "few_payers"
PAYER_CONCENTRATION = "payer_concentration"
CIRCULAR_FUNDING = "circular_funding"
FEW_ACTIVE_DAYS = "few_active_days"
SALES_SPIKE = "sales_spike"
PAYER_VELOCITY = "payer_velocity"
MAX_FIRST_TIME_PAYERS_1H = 10

REASON_CODES: tuple[str, ...] = (FEW_PAYERS, PAYER_CONCENTRATION, CIRCULAR_FUNDING, FEW_ACTIVE_DAYS, SALES_SPIKE)

# Shown to the merchant. Plain words, no blame, a next step. Spanish is rioplatense (vos).
MESSAGES: dict[str, dict[str, str]] = {
    FEW_PAYERS: {
        "en": "In the last 30 days your sales came from fewer than 5 different customers. "
        "Keep selling through your link to more customers, then try again.",
        "es": "En los últimos 30 días tus ventas vinieron de menos de 5 clientes distintos. "
        "Seguí vendiendo con tu link a más clientes y volvé a intentar.",
    },
    PAYER_CONCENTRATION: {
        "en": "More than 40% of your sales in the last 30 days came from a single customer. "
        "We need sales spread across more customers before we can offer an advance.",
        "es": "Más del 40% de tus ventas de los últimos 30 días vino de un solo cliente. "
        "Necesitamos ventas repartidas entre más clientes para poder ofrecerte un adelanto.",
    },
    CIRCULAR_FUNDING: {
        "en": "Some of your sales were paid with money that came from your own payout account "
        "or from one shared source. We can only count sales from independent customers.",
        "es": "Algunas de tus ventas se pagaron con plata que salió de tu propia cuenta de cobro "
        "o de una misma fuente. Solo podemos contar ventas de clientes independientes.",
    },
    FEW_ACTIVE_DAYS: {
        "en": "You sold on fewer than 7 of the last 30 days. "
        "Sell through your link on more days, then try again.",
        "es": "Vendiste menos de 7 de los últimos 30 días. "
        "Vendé con tu link más días y volvé a intentar.",
    },
    SALES_SPIKE: {
        "en": "Your sales in the last 3 days were more than 4 times your usual pace. "
        "We'll look again once your sales settle. Try again in about a week.",
        "es": "Tus ventas de los últimos 3 días fueron más de 4 veces lo habitual. "
        "Lo vemos de nuevo cuando se normalicen. Probá otra vez en una semana.",
    },
}


def _over(x: float, limit: float) -> bool:
    return not math.isfinite(x) or x > limit


# Cold start: concentration is only meaningful once a shop has this many sales onchain.
MIN_SALES_FOR_CONCENTRATION = 10


def check(features: ShopFeatures) -> list[str]:
    """Return the red-line reason codes hit by `features` (empty list = pass).

    Cold start (tier 0 with a proven Business Pass band and thin onchain history): the lines that only mean
    "not enough data yet" (few payers, few active days, spike vs an empty prior period) are skipped; the
    zkTLS-proven band stands in for history. Fraud lines stay: circular funding always, and payer
    concentration once there are enough sales to measure it."""
    f = features
    cold = bool(f.cold_start and f.proven_revenue_band)
    hits: list[str] = []
    if not cold and f.unique_payers_30d < MIN_UNIQUE_PAYERS_30D:
        hits.append(FEW_PAYERS)
    if (not cold or f.sales_count_30d >= MIN_SALES_FOR_CONCENTRATION) and _over(f.top_payer_share_30d, MAX_TOP_PAYER_SHARE_30D):
        hits.append(PAYER_CONCENTRATION)
    if _over(f.funded_by_shop_share, MAX_FUNDED_BY_SHOP_SHARE):
        hits.append(CIRCULAR_FUNDING)
    if not cold and f.days_active_30d < MIN_DAYS_ACTIVE_30D:
        hits.append(FEW_ACTIVE_DAYS)
    if not cold and _over(f.spike_ratio, MAX_SPIKE_RATIO):
        hits.append(SALES_SPIKE)
    if f.first_time_payers_1h > MAX_FIRST_TIME_PAYERS_1H:
        hits.append(PAYER_VELOCITY)
    return hits


def message(code: str, lang: str = "en") -> str:
    """Human message for a reason code. Unknown lang falls back to English; unknown code to the code."""
    entry = MESSAGES.get(code)
    if entry is None:
        return code
    return entry.get(lang, entry["en"])


def messages(codes: list[str], lang: str = "en") -> list[str]:
    return [message(c, lang) for c in codes]
