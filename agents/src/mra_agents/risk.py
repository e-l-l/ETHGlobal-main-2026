"""Risk agent: code computes the triggers, the judge proposes, code clamps down-only, then `lowerLimits`.

Pipeline (SPEC "agents judge, code decides"):

    reader -> risk_signals() [pure code, exact thresholds]
           -> no trigger fired?  -> do nothing
           -> judge.propose_risk(signals, limits)   [model writes numbers + rationale only]
           -> enforce_down_only()                   [code: min(proposed, current), then max(floor)]
           -> nothing changes?   -> no tx
           -> writer.send("lowerLimits", [caps, maxExposure], signer="risk_manager")

Trigger thresholds (SPEC "Risk triggers"):
  * ``junior_twap_drop``  1h TWAP price is MORE than 10% below the 24h TWAP price (ratio < 0.90, strict).
  * ``write_offs_7d``     at least 2 write-offs with a write-off time in [now - 7d, now] (inclusive).
  * ``repayment_pace``    the median, over active advances, of (actual pace / estimated pace) is BELOW 0.6
                          (strict).
  * ``exposure_utilisation``  exposure / maxExposure is MORE than 80% (strict).

TWAP direction assumption
-------------------------
``reader.junior_twap_tick(s)`` returns ``RiskHook.consult(poolKey, s)``: the time-weighted mean of the
*pool* tick. In Uniswap v4 the tick prices token0 in units of token1: ``price(token0 in token1) = 1.0001**tick``.
Currencies are sorted by address, so whether the junior share token is token0 depends on the deployment
(`Deploy.s.sol` sorts ``token`` and ``junior`` by address). Both tokens have 6 decimals, and we only use a
ratio, so decimals cancel. Hence, with ``d = tick_1h - tick_24h``:

  * junior is token0  ->  junior price ratio (1h / 24h) = 1.0001**d
  * junior is token1  ->  junior price ratio (1h / 24h) = 1.0001**(-d)

``junior_is_token0`` is resolved from ``settings.deployments_file`` (``poolKey.currency0 == JuniorVault``)
when possible. If it is unknown, we FAIL SAFE: the trigger fires when EITHER orientation shows a drop of more
than 10% (|d| >= 1054 ticks). A false positive only lowers limits, which is always permitted and safe.

Fallback when the judge fails
-----------------------------
If ``judge.propose_risk`` raises or returns something that is not a well-formed ``RiskProposal`` (wrong
type, not exactly 4 caps, non-integers, negatives), we do NOT skip the safety action: we apply a fixed,
deterministic cut (``FALLBACK_CUT_BPS`` = -25%) to tier caps 2 and 3 and to maxExposure, floored like any
other proposal. The cut is deliberately simple and only ever downward, so a model outage can never block
or loosen risk controls. A *well-formed* proposal that changes nothing (or tries to raise) is honoured as
"no change": it is clamped to the current values and no tx is sent.
"""

from __future__ import annotations

import json
import logging
import math
import statistics
import time
from collections.abc import Callable, Mapping
from fractions import Fraction
from pathlib import Path
from typing import Any

from .config import Settings
from .interfaces import ChainReader, ChainWriter, Judge
from .models import AdvanceState, AdvanceStatus, ChainLimits, RiskProposal

log = logging.getLogger(__name__)

# ---- thresholds (SPEC "Risk triggers") ----
TWAP_SHORT_SECONDS = 3_600
TWAP_LONG_SECONDS = 86_400
TWAP_MAX_DROP = 0.10  # fires when ratio < 1 - 0.10
TICK_BASE = 1.0001
WRITE_OFF_WINDOW_SECONDS = 7 * 86_400
WRITE_OFF_MIN_COUNT = 2  # fires when count >= 2
PACE_MIN_RATIO = Fraction(3, 5)  # fires when median < 0.6
PACE_MIN_AGE_SECONDS = 86_400  # ignore advances younger than a day: one quiet morning is not a signal
EXPOSURE_MAX_UTILISATION = Fraction(4, 5)  # fires when exposure / maxExposure > 0.8
DEFAULT_WINDOW_SECONDS = 30 * 86_400  # AdvanceBook.defaultWindow in Deploy.s.sol; not exposed by ChainReader

FALLBACK_CUT_BPS = 2_500  # deterministic -25% on tiers 2..3 and maxExposure when the judge fails
FALLBACK_TIERS = (2, 3)

TRIGGER_TWAP = "junior_twap_drop"
TRIGGER_WRITE_OFFS = "write_offs_7d"
TRIGGER_PACE = "repayment_pace"
TRIGGER_EXPOSURE = "exposure_utilisation"


# ---------------------------------------------------------------- pure helpers


def tick_ratio(delta_ticks: int) -> float:
    """Price ratio implied by a tick difference: 1.0001**delta."""
    return TICK_BASE ** delta_ticks


def junior_price_ratio(tick_1h: int, tick_24h: int, junior_is_token0: bool) -> float:
    """Junior price (in USDC) over 1h divided by over 24h. See module docstring for the direction."""
    d = tick_1h - tick_24h
    return tick_ratio(d if junior_is_token0 else -d)


def twap_drop_fires(ratio: float) -> bool:
    """1h TWAP more than 10% below 24h TWAP. Exactly -10% does not fire."""
    return ratio < 1.0 - TWAP_MAX_DROP


def write_offs_fire(count: int) -> bool:
    return count >= WRITE_OFF_MIN_COUNT


def pace_fires(median_ratio: Fraction | None) -> bool:
    return median_ratio is not None and median_ratio < PACE_MIN_RATIO


def exposure_fires(exposure: int, max_exposure: int) -> bool:
    """exposure / maxExposure > 0.8, in exact integer arithmetic. maxExposure == 0 counts as saturated."""
    if max_exposure <= 0:
        return exposure >= 0
    return exposure * EXPOSURE_MAX_UTILISATION.denominator > max_exposure * EXPOSURE_MAX_UTILISATION.numerator


def pace_ratio(adv: AdvanceState, now: int, expected_days: float) -> Fraction | None:
    """Compare observed payment pace to the current live payoff estimate."""
    target = adv.owed_now or max(0, adv.total_owed - adv.repaid)
    if adv.opened_at is None or target <= 0 or expected_days <= 0:
        return None
    elapsed = now - adv.opened_at
    if elapsed < PACE_MIN_AGE_SECONDS:
        return None
    expected = Fraction(expected_days).limit_denominator(10_000)
    return Fraction(adv.repaid) * expected * 86_400 / (Fraction(target + adv.repaid) * elapsed)


def junior_is_token0_from_deployments(path: Path) -> bool | None:
    """Read `poolKey.currency0` and `JuniorVault` from the devnet deployments JSON. None if unknown."""
    try:
        data = json.loads(Path(path).read_text())
        junior = str(data["JuniorVault"]).lower()
        key = data.get("poolKey") or {}
        c0 = key.get("currency0")
        c1 = key.get("currency1")
        if c0 is not None and str(c0).lower() == junior:
            return True
        if c1 is not None and str(c1).lower() == junior:
            return False
        usdc = data.get("USDC")
        if usdc:  # v4 sorts currencies by address
            return int(junior, 16) < int(str(usdc), 16)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return None


def _limits_dict(limits: ChainLimits) -> dict:
    return {
        "tier_cap": list(limits.tier_cap),
        "tier_cap_floor": list(limits.tier_cap_floor),
        "max_exposure": limits.max_exposure,
        "max_exposure_floor": limits.max_exposure_floor,
        "exposure": limits.exposure,
    }


# ---------------------------------------------------------------- signals


def risk_signals(
    reader: ChainReader,
    now: int,
    *,
    junior_is_token0: bool | None = None,
    written_off_at: Mapping[int, int] | None = None,
    default_window: int = DEFAULT_WINDOW_SECONDS,
    expected_days_for: Callable[[AdvanceState], float | None] | None = None,
    default_expected_days: float = 60,
    min_pool_liquidity: int = 1,
) -> dict:
    """Compute every SPEC risk trigger. Pure code, JSON-safe output; ``result["triggers"]`` lists fired ones.

    A failing read never raises: it is recorded under ``errors`` and that trigger does not fire.

    ``written_off_at`` maps advance id -> write-off unix time. ChainReader has no write-off timestamp, so
    when an id is missing we use the earliest time the write-off could have happened
    (``last_sale_at + default_window``), which can undercount but never invents a recent write-off.
    ``expected_days_for`` gives the per-advance estimate (e.g. the offer's ``est_days_normal``);
    otherwise ``default_expected_days`` (the 60-day anchor rule) is used.
    """
    now = int(now)
    triggers: list[str] = []
    errors: list[str] = []
    out: dict[str, Any] = {"as_of": now}

    # -- 1. junior TWAP drop
    twap: dict[str, Any] = {"short_seconds": TWAP_SHORT_SECONDS, "long_seconds": TWAP_LONG_SECONDS,
                            "junior_is_token0": junior_is_token0, "fired": False}
    try:
        if not callable(getattr(reader, "junior_oracle_observation_count", None)) or not callable(
                getattr(reader, "junior_pool_liquidity", None)):
            raise TypeError("oracle_data_unavailable")
        observations = int(reader.junior_oracle_observation_count())
        twap["observation_count"] = observations
        if observations < 2:
            raise ValueError("insufficient_observations")
        liquidity = int(reader.junior_pool_liquidity())
        twap["liquidity"] = liquidity
        twap["min_liquidity"] = min_pool_liquidity
        if liquidity < min_pool_liquidity:
            raise ValueError("insufficient_liquidity")
        t1 = int(reader.junior_twap_tick(TWAP_SHORT_SECONDS))
        t24 = int(reader.junior_twap_tick(TWAP_LONG_SECONDS))
        d = t1 - t24
        twap.update(tick_1h=t1, tick_24h=t24, delta_ticks=d)
        if junior_is_token0 is None:
            r0 = junior_price_ratio(t1, t24, True)
            r1 = junior_price_ratio(t1, t24, False)
            ratio = min(r0, r1)
            twap["orientation"] = "unknown: fires on a move in either direction"
        else:
            ratio = junior_price_ratio(t1, t24, junior_is_token0)
            twap["orientation"] = "junior=token0" if junior_is_token0 else "junior=token1"
        twap["price_ratio_1h_vs_24h"] = ratio
        twap["fired"] = twap_drop_fires(ratio)
    except Exception as e:  # noqa: BLE001 - e.g. RiskHook InsufficientHistory right after deploy
        reason = str(e) if str(e) in ("insufficient_liquidity", "insufficient_observations", "oracle_data_unavailable") else type(e).__name__
        twap["unavailable_reason"] = reason
        errors.append(f"twap: {reason}")
    out["twap"] = twap
    if twap["fired"]:
        triggers.append(TRIGGER_TWAP)

    # -- advances (shared by 2 and 3)
    advances: list[AdvanceState] | None
    try:
        advances = list(reader.advances())
    except Exception as e:  # noqa: BLE001
        errors.append(f"advances: {type(e).__name__}")
        advances = None

    # -- 2. write-offs in the last 7 days
    wo: dict[str, Any] = {"window_seconds": WRITE_OFF_WINDOW_SECONDS, "threshold": WRITE_OFF_MIN_COUNT,
                          "count_7d": 0, "advance_ids": [], "fired": False}
    if advances is not None:
        since = now - WRITE_OFF_WINDOW_SECONDS
        known = written_off_at or {}
        for a in advances:
            if a.status != AdvanceStatus.WRITTEN_OFF:
                continue
            ts = known.get(a.advance_id, a.last_sale_at + default_window)
            if since <= ts <= now:
                wo["advance_ids"].append(a.advance_id)
        wo["count_7d"] = len(wo["advance_ids"])
        wo["fired"] = write_offs_fire(wo["count_7d"])
    out["write_offs"] = wo
    if wo["fired"]:
        triggers.append(TRIGGER_WRITE_OFFS)

    # -- 3. median repayment pace vs estimate
    pace: dict[str, Any] = {"threshold": float(PACE_MIN_RATIO), "median_ratio": None,
                            "n_measured": 0, "n_active": 0, "fired": False}
    if advances is not None:
        ratios: list[Fraction] = []
        for a in advances:
            if a.status != AdvanceStatus.ACTIVE:
                continue
            pace["n_active"] += 1
            exp_days = expected_days_for(a) if expected_days_for else None
            r = pace_ratio(a, now, exp_days if exp_days else default_expected_days)
            if r is not None:
                ratios.append(r)
        pace["n_measured"] = len(ratios)
        med = statistics.median(ratios) if ratios else None
        pace["median_ratio"] = float(med) if med is not None else None
        pace["fired"] = pace_fires(med)
    out["repayment_pace"] = pace
    if pace["fired"]:
        triggers.append(TRIGGER_PACE)

    # -- 4. exposure utilisation
    ex: dict[str, Any] = {"threshold": float(EXPOSURE_MAX_UTILISATION), "fired": False}
    try:
        limits = reader.limits()
        out["limits"] = _limits_dict(limits)
        ex.update(exposure=limits.exposure, max_exposure=limits.max_exposure,
                  utilisation=(limits.exposure / limits.max_exposure) if limits.max_exposure > 0 else math.inf)
        ex["fired"] = exposure_fires(limits.exposure, limits.max_exposure)
    except Exception as e:  # noqa: BLE001
        errors.append(f"limits: {type(e).__name__}")
    out["exposure"] = ex
    if ex["fired"]:
        triggers.append(TRIGGER_EXPOSURE)

    out["triggers"] = triggers
    out["errors"] = errors
    return out


# ---------------------------------------------------------------- enforcement


def _valid_proposal(p: object) -> bool:
    if not isinstance(p, RiskProposal):
        return False
    vals = [*p.new_tier_cap, p.new_max_exposure]
    return len(p.new_tier_cap) == 4 and all(type(v) is int and v >= 0 for v in vals)


def fallback_proposal(limits: ChainLimits) -> RiskProposal:
    """Deterministic -25% on tiers 2..3 and maxExposure. Floors are applied by `enforce_down_only`."""
    keep = 10_000 - FALLBACK_CUT_BPS
    caps = tuple(c * keep // 10_000 if i in FALLBACK_TIERS else c for i, c in enumerate(limits.tier_cap))
    return RiskProposal(
        new_tier_cap=caps,  # type: ignore[arg-type]
        new_max_exposure=limits.max_exposure * keep // 10_000,
        rationale=f"deterministic fallback: -{FALLBACK_CUT_BPS / 100:.0f}% on tiers 2-3 and maxExposure",
    )


def _clamp(proposed: int, current: int, floor: int) -> int:
    # min(proposed, current) then max(floor) -- and never above current, even if current < floor
    # (that state would make lowerLimits revert, so we leave the value as it is).
    return min(current, max(min(proposed, current), floor))


def enforce_down_only(p: RiskProposal, limits: ChainLimits) -> tuple[tuple[int, int, int, int], int]:
    caps = tuple(_clamp(p.new_tier_cap[i], limits.tier_cap[i], limits.tier_cap_floor[i]) for i in range(4))
    max_exp = _clamp(p.new_max_exposure, limits.max_exposure, limits.max_exposure_floor)
    return caps, max_exp  # type: ignore[return-value]


# ---------------------------------------------------------------- agent


class RiskAgent:
    def __init__(
        self,
        reader: ChainReader,
        writer: ChainWriter,
        judge: Judge,
        settings: Settings,
        now: Callable[[], float] = time.time,
        *,
        junior_is_token0: bool | None = None,
        expected_days_for: Callable[[AdvanceState], float | None] | None = None,
        default_window: int = DEFAULT_WINDOW_SECONDS,
    ):
        self.reader = reader
        self.writer = writer
        self.judge = judge
        self.settings = settings
        self.now = now
        if junior_is_token0 is None:
            junior_is_token0 = junior_is_token0_from_deployments(settings.deployments_file)
        self.junior_is_token0 = junior_is_token0
        self.expected_days_for = expected_days_for
        self.default_window = default_window
        self._written_off_seen: dict[int, int] = {}
        self._seeded = False
        self.last: dict | None = None  # last tick record, for GET /risk/status

    def _observe_write_offs(self, now: int) -> None:
        """Stamp write-off times as we first see them. On the very first tick we cannot know when older
        write-offs happened, so we use the earliest possible time (last_sale_at + window) instead of `now`
        to avoid a false burst after every restart."""
        try:
            advs = self.reader.advances()
        except Exception:  # noqa: BLE001 - risk_signals records the error
            return
        for a in advs:
            if a.status == AdvanceStatus.WRITTEN_OFF and a.advance_id not in self._written_off_seen:
                self._written_off_seen[a.advance_id] = (
                    now if self._seeded else min(now, a.last_sale_at + self.default_window)
                )
        self._seeded = True

    def status(self) -> dict:
        """Read-only view for GET /risk/status: current signals (same inputs as tick) + last tick record.
        Never calls the judge and never sends a transaction."""
        now = int(self.now())
        signals = risk_signals(
            self.reader, now,
            junior_is_token0=self.junior_is_token0,
            written_off_at=self._written_off_seen,
            default_window=self.default_window,
            expected_days_for=self.expected_days_for,
            default_expected_days=self.settings.max_days_to_repay,
            min_pool_liquidity=self.settings.risk_min_pool_liquidity,
        )
        return {"signals": signals, "triggers": signals["triggers"], "last_tick": self.last}

    def tick(self) -> dict:
        now = int(self.now())
        self._observe_write_offs(now)
        signals = risk_signals(
            self.reader, now,
            junior_is_token0=self.junior_is_token0,
            written_off_at=self._written_off_seen,
            default_window=self.default_window,
            expected_days_for=self.expected_days_for,
            default_expected_days=self.settings.max_days_to_repay,
            min_pool_liquidity=self.settings.risk_min_pool_liquidity,
        )
        record: dict[str, Any] = {"at": now, "signals": signals, "triggers": signals["triggers"],
                                  "proposal": None, "source": None, "enforced": None,
                                  "tx_hash": None, "skipped": None, "error": None}
        self.last = record
        if not signals["triggers"]:
            record["skipped"] = "no_triggers"
            return record

        try:
            limits = self.reader.limits()  # re-read live right before clamping
        except Exception as e:  # noqa: BLE001
            record["skipped"] = "limits_unavailable"
            record["error"] = type(e).__name__
            return record

        source = "judge"
        try:
            proposal = self.judge.propose_risk(signals, limits)
            if not _valid_proposal(proposal):
                raise ValueError("malformed proposal")
        except Exception as e:  # noqa: BLE001 - any judge failure -> deterministic cut
            log.warning("risk judge failed (%s); using deterministic fallback", type(e).__name__)
            proposal = fallback_proposal(limits)
            source = "fallback"
            record["error"] = f"judge: {type(e).__name__}"
        record["source"] = source
        record["proposal"] = {"new_tier_cap": list(proposal.new_tier_cap),
                              "new_max_exposure": proposal.new_max_exposure,
                              "rationale": proposal.rationale}

        caps, max_exp = enforce_down_only(proposal, limits)
        record["enforced"] = {"tier_cap": list(caps), "max_exposure": max_exp,
                              "previous_tier_cap": list(limits.tier_cap),
                              "previous_max_exposure": limits.max_exposure}
        if list(caps) == list(limits.tier_cap) and max_exp == limits.max_exposure:
            record["skipped"] = "no_change"
            return record

        try:
            tx = self.writer.send("lowerLimits", [list(caps), max_exp], signer="risk_manager")
        except Exception as e:  # noqa: BLE001
            log.error("lowerLimits send failed: %s", type(e).__name__)
            record["skipped"] = "send_failed"
            record["error"] = f"send: {type(e).__name__}"
            return record
        record["tx_hash"] = tx
        log.info("lowerLimits sent tx=%s triggers=%s caps=%s maxExposure=%s source=%s",
                 tx, signals["triggers"], list(caps), max_exp, source)
        return record
