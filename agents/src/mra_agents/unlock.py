"""Gradual unlock of the approved limit (the ONE place for this rule; signer-enforced via clamp.py).

The approved limit L is the onchain tier cap the shop qualifies for ($50 / $100 / $200 / $300). For one human
(World ID binding, humans.py), across all of their shops:

- The first advance at a limit level is capped at 50% of L, rounded DOWN to an allowed advance size, never below
  the $50 minimum (so tier 0, L = $50, is just $50).
- Each full week of on-time minimum repayments at that level (or higher) unlocks +25% of L. Full L after 2 weeks.
- A missed minimum freezes the unlock: weeks after the first miss on an advance never count.
- Any write-off bans the human (humans.py), so there is no level to unlock.

"On time" is the onchain v2 rule (AdvanceBook._noteRepayment): repayments accumulate in a 7-day window; once the
window's total reaches ceil(1% x (principal + accrued fee)) the default clock restarts and a new window starts. We
replay that rule from the advance's RepaymentSplit logs (chain.Web3ChainReader.repayments), so the result matches
the contract's own `lastSaleAt` restarts. A gap longer than 7 days between restarts (or since the last restart, on
an open advance) is a missed minimum.

Weeks are wall-clock weeks while current, not restart counts, so paying the minimum several times in one day earns
nothing extra. Pure functions; amounts in USDC base units.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

from pydantic import BaseModel

from .models import ALLOWED_AMOUNTS, AdvanceState, AdvanceStatus

WEEK = 7 * 86_400
BPS = 10_000
MIN_REPAY_BPS = 100  # AdvanceBook.MIN_REPAY_BPS (1%)
FIRST_PCT = 50  # first advance at a new level
STEP_PCT = 25  # per full on-time week
USDC = 1_000_000


class UnlockStep(BaseModel):
    pct: int
    amount: int  # allowed advance size available at this step (base units)
    unlocked: bool


class Unlock(BaseModel):
    tier: int
    limit: int  # L, base units
    available_now: int  # base units; 0 when L is below the minimum size
    unlocked_pct: int  # 50..100
    good_weeks: int
    frozen: bool  # the open advance at this level is behind on its minimum
    next_unlock_at: int | None  # unix seconds; None when nothing more to unlock or no advance is running
    steps: list[UnlockStep]
    reasons: list[str]

    def view(self) -> dict:
        """API shape (USD numbers, never anything about the human)."""
        return {"tier": self.tier, "limit_usd": self.limit / USDC, "available_now_usd": self.available_now / USDC,
                "unlocked_pct": self.unlocked_pct, "good_weeks": self.good_weeks, "frozen": self.frozen,
                "next_unlock_at": self.next_unlock_at,
                "steps": [{"pct": s.pct, "amount_usd": s.amount / USDC, "unlocked": s.unlocked} for s in self.steps],
                "reasons": list(self.reasons)}

    def prompt_view(self) -> dict:
        """What the Underwriter and Critic see (numbers only)."""
        return {"approved_limit": self.limit, "available_now": self.available_now,
                "unlocked_pct": self.unlocked_pct, "on_time_weeks_at_this_level": self.good_weeks,
                "rule": "first advance at a level is 50% of the limit; +25% per full week of on-time minimum "
                        "repayments; a missed minimum freezes it. Code caps the amount at available_now."}


def allowed_at_most(amount: int, limit: int) -> int:
    """Largest allowed size <= amount, never below the minimum size, never above `limit` (0 if limit < minimum)."""
    floor = min(ALLOWED_AMOUNTS)
    if limit < floor:
        return 0
    fits = [a for a in ALLOWED_AMOUNTS if a <= min(amount, limit)]
    return max(fits) if fits else floor


def _fee_at(a: AdvanceState, ts: int) -> int:
    raw = a.principal * a.fee_rate_bps_per_week * max(0, ts - a.drawn_at) // (BPS * WEEK)
    return min(raw, a.principal * a.fee_cap_bps // BPS)


def restarts(a: AdvanceState, payments: Iterable[tuple[int, int]]) -> list[int]:
    """Times the default clock restarted (minimum met), replaying AdvanceBook._noteRepayment."""
    window_start, acc, out = a.drawn_at, 0, []
    for ts, amount in sorted(payments):
        if ts < window_start + WEEK:
            acc += amount
        else:
            window_start, acc = ts, amount
        need = ((a.principal + _fee_at(a, ts)) * MIN_REPAY_BPS + BPS - 1) // BPS
        if acc >= need:
            out.append(ts)
            window_start, acc = ts, 0
    return out


def advance_weeks(a: AdvanceState, payments: Iterable[tuple[int, int]], now: int) -> tuple[int, bool, bool]:
    """(full on-time weeks, missed a minimum at some point, behind right now) for one advance."""
    marks = restarts(a, payments)
    if a.status == AdvanceStatus.REPAID:
        end = marks[-1] if marks else a.last_sale_at or a.drawn_at  # full repayment always meets the minimum
    else:
        end = now
    prev = a.drawn_at
    for t in marks:
        if t - prev > WEEK:  # a window passed without the minimum
            return max(0, (prev - a.drawn_at) // WEEK), True, False
        prev = t
    behind = a.status == AdvanceStatus.ACTIVE and end - prev > WEEK
    if behind:
        return max(0, (prev - a.drawn_at) // WEEK), True, True
    return max(0, (end - a.drawn_at) // WEEK), False, False


def _pct(weeks: int) -> int:
    return min(100, FIRST_PCT + STEP_PCT * weeks)


def compute_unlock(*, tier: int, tier_caps: Sequence[int], human_advances: Sequence[AdvanceState],
                   payments: Mapping[int, Sequence[tuple[int, int]]], now: int) -> Unlock:
    """Unlock for a human at `tier`. `human_advances`: every advance on any shop of this human (from the chain);
    `payments`: advance id -> [(timestamp, amount repaid)] (RepaymentSplit logs)."""
    limit = int(tier_caps[tier])
    level = [a for a in human_advances
             if a.tier >= tier and a.status in (AdvanceStatus.ACTIVE, AdvanceStatus.REPAID) and a.drawn_at]
    weeks, missed, frozen, running = 0, False, False, None
    for a in sorted(level, key=lambda x: (x.drawn_at, x.advance_id)):
        w, m, behind = advance_weeks(a, payments.get(a.advance_id, ()), now)
        weeks, missed, frozen = weeks + w, missed or m, frozen or behind
        if a.status == AdvanceStatus.ACTIVE and not m:
            running = a
    pct = _pct(weeks)
    available = allowed_at_most(limit * pct // 100, limit)
    steps = [UnlockStep(pct=p, amount=allowed_at_most(limit * p // 100, limit), unlocked=pct >= p)
             for p in range(FIRST_PCT, 101, STEP_PCT)]
    usd = f"${limit / USDC:,.0f}"
    if not level:
        reasons = [(f"First advance at the {usd} level: {FIRST_PCT}% now (${available / USDC:,.0f}); "
                   f"+{STEP_PCT}% of the limit for each full week of on-time minimum repayments.")]
    else:
        reasons = [(f"{weeks} full week{'s' * (weeks != 1)} of on-time minimum repayments at the {usd} level: "
                   f"{pct}% unlocked (${available / USDC:,.0f}).")]
    if frozen:
        reasons.append("Unlock frozen: the minimum repayment (1% every 7 days) was missed on the open advance.")
    elif missed:
        reasons.append("A missed minimum repayment stopped the unlock on that advance.")
    next_at = None
    if pct < 100 and running is not None and not frozen:
        w, _, _ = advance_weeks(running, payments.get(running.advance_id, ()), now)
        next_at = running.drawn_at + (w + 1) * WEEK
    elif pct < 100 and not frozen:
        reasons.append("Further unlocks accrue while you repay an advance at this level.")
    if limit < min(ALLOWED_AMOUNTS):
        reasons.append("The limit is below the smallest advance size right now.")
    return Unlock(tier=tier, limit=limit, available_now=available, unlocked_pct=pct, good_weeks=weeks,
                  frozen=frozen, next_unlock_at=next_at, steps=steps, reasons=reasons)
