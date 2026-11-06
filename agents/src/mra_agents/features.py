"""Pure feature engineering: Sale events -> `ShopFeatures` (owner: claude-data).

Definitions (all deterministic, no I/O):
- Days are UTC calendar days. Day 29 (newest) is the UTC day containing `now`; day 0 is 29 days earlier.
  Only sales with `timestamp <= now` count. The 30d window is exactly those 30 buckets; 7d is the last 7
  buckets; 90d is the last 90 UTC days.
- revenue_cv_30d: population std / mean of the 30 daily buckets (0 when there is no revenue).
- trend_slope_30d: ordinary least-squares slope of the daily buckets against x = 0..29 ($/day per day).
- Payer metrics use 30d revenue shares per lowercased payer. HHI = sum(share^2).
- new_payer_share_30d: share of 30d payers whose first sale in the supplied history is in the last 7 days.
- round_amount_share_30d: share of 30d sales with amount % 1e6 == 0 (whole dollars).
- hour_of_day_entropy: Shannon entropy of 30d sale-count by UTC hour, divided by ln(24).
- spike_ratio: revenue(last 3 days) / (revenue(prior 27 days) / 9). If the prior period is empty:
  SPIKE_SENTINEL when there is recent revenue, else 0.0.
- funded_by_shop_share: 30d revenue share from payers that (a) are the payout address, (b) received USDC
  from the payout address, or (c) received USDC from a funder shared by >= 3 distinct 30d payers.
  The zero address (mints) never counts as a funder. The time window of funding is the caller's
  `since_ts` given to `ChainReader.usdc_funders`.
- top_payers_hashed: (HMAC-SHA256(hash_key, lowercased address) hex, 30d revenue share), top 5.
Raw payer addresses never appear in the output.
"""

from __future__ import annotations

import hashlib
import hmac
import math
from collections import Counter, defaultdict

from .models import SaleEvent, ShopFeatures

DAY = 86_400
WINDOW_DAYS = 30
USDC = 1_000_000
SPIKE_SENTINEL = 99.0
COMMON_FUNDER_MIN_PAYERS = 3
TOP_PAYERS = 5
ZERO_ADDRESS = "0x" + "00" * 20


def hash_payer(address: str, hash_key: bytes) -> str:
    return hmac.new(hash_key, address.lower().encode(), hashlib.sha256).hexdigest()


def coefficient_of_variation(xs: list[float]) -> float:
    if not xs:
        return 0.0
    mean = sum(xs) / len(xs)
    if mean == 0:
        return 0.0
    var = sum((x - mean) ** 2 for x in xs) / len(xs)
    return math.sqrt(var) / mean


def ols_slope(ys: list[float]) -> float:
    n = len(ys)
    if n < 2:
        return 0.0
    xbar = (n - 1) / 2
    ybar = sum(ys) / n
    num = sum((i - xbar) * (y - ybar) for i, y in enumerate(ys))
    den = sum((i - xbar) ** 2 for i in range(n))
    return num / den


def normalised_entropy(counts: list[int], k: int) -> float:
    total = sum(counts)
    if total == 0 or k < 2:
        return 0.0
    h = -sum((c / total) * math.log(c / total) for c in counts if c)
    return h / math.log(k)


def spike(daily: list[float]) -> float:
    recent = sum(daily[-3:])
    prior = sum(daily[:-3])
    if prior <= 0:
        return SPIKE_SENTINEL if recent > 0 else 0.0
    return recent / (prior / ((len(daily) - 3) / 3))


def funded_payers(payers: set[str], funders: dict[str, list[str]], payout: str | None) -> set[str]:
    """Lowercased payers whose USDC came from the payout address or a common funder (>= 3 payers)."""
    payout_l = payout.lower() if payout else None
    by_payer: dict[str, set[str]] = defaultdict(set)
    for addr, srcs in funders.items():
        a = addr.lower()
        if a not in payers:
            continue
        for s in srcs:
            s_l = s.lower()
            if s_l != ZERO_ADDRESS and s_l != a:
                by_payer[a].add(s_l)
    fan_out: Counter[str] = Counter()
    for srcs in by_payer.values():
        fan_out.update(srcs)
    common = {f for f, n in fan_out.items() if n >= COMMON_FUNDER_MIN_PAYERS}
    flagged = set()
    for p in payers:
        srcs = by_payer.get(p, set())
        if (payout_l and (p == payout_l or payout_l in srcs)) or (srcs & common):
            flagged.add(p)
    return flagged


def build_features(shop_id: str, sales: list[SaleEvent], funders: dict[str, list[str]],
                   payout: str | None, now: int, hash_key: bytes, shop_label: str | None = None) -> ShopFeatures:
    shop_l = shop_id.lower()
    today = now // DAY
    first_day = today - (WINDOW_DAYS - 1)

    # dedupe, restrict to this shop and to the past
    uniq: dict[tuple[str, int], SaleEvent] = {}
    for s in sales:
        if s.shop_id.lower() == shop_l and s.timestamp <= now:
            uniq[(s.tx_hash.lower(), s.log_index)] = s
    history = sorted(uniq.values(), key=lambda s: (s.timestamp, s.block_number, s.log_index))

    first_seen: dict[str, int] = {}
    for s in history:
        first_seen.setdefault(s.payer.lower(), s.timestamp // DAY)

    daily_units = [0] * WINDOW_DAYS
    hours = [0] * 24
    by_payer: dict[str, int] = defaultdict(int)
    count_30d = round_30d = 0
    rev_90d_units = 0
    for s in history:
        d = s.timestamp // DAY
        if d > today - 90:
            rev_90d_units += s.amount
        if d < first_day:
            continue
        daily_units[d - first_day] += s.amount
        hours[(s.timestamp % DAY) // 3600] += 1
        by_payer[s.payer.lower()] += s.amount
        count_30d += 1
        if s.amount % USDC == 0:
            round_30d += 1

    daily = [u / USDC for u in daily_units]
    rev_30d_units = sum(daily_units)
    rev_30d = rev_30d_units / USDC

    shares = {p: (amt / rev_30d_units if rev_30d_units else 0.0) for p, amt in by_payer.items()}
    payers = set(by_payer)
    n_payers = len(payers)
    new_payers = sum(1 for p in payers if first_seen[p] >= today - 6)

    flagged = funded_payers(payers, funders, payout)
    funded_units = sum(by_payer[p] for p in flagged)

    hashed = sorted(((hash_payer(p, hash_key), sh) for p, sh in shares.items()), key=lambda t: (-t[1], t[0]))

    return ShopFeatures(
        shop_id=shop_id,
        as_of=now,
        days_active_30d=sum(1 for u in daily_units if u > 0),
        revenue_7d_usd=sum(daily_units[-7:]) / USDC,
        revenue_30d_usd=rev_30d,
        revenue_90d_usd=rev_90d_units / USDC,
        avg_daily_revenue_30d_usd=rev_30d / WINDOW_DAYS,
        daily_revenue_30d_usd=daily,
        revenue_cv_30d=coefficient_of_variation(daily),
        trend_slope_30d=ols_slope(daily),
        sales_count_30d=count_30d,
        unique_payers_30d=n_payers,
        top_payer_share_30d=max(shares.values(), default=0.0),
        hhi_payers_30d=sum(v * v for v in shares.values()),
        new_payer_share_30d=(new_payers / n_payers) if n_payers else 0.0,
        round_amount_share_30d=(round_30d / count_30d) if count_30d else 0.0,
        hour_of_day_entropy=normalised_entropy(hours, 24),
        spike_ratio=spike(daily),
        funded_by_shop_share=(funded_units / rev_30d_units) if rev_30d_units else 0.0,
        median_payer_wallet_age_days=None,
        top_payers_hashed=hashed[:TOP_PAYERS],
        shop_label=shop_label,
    )
