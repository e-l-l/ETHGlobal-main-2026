"""Orchestrate underwriting with deterministic checks before signing."""
import secrets
import time
import uuid

from .decisions import features_hash
from .models import MAX_REVENUE_BAND, AdvanceStatus, Decision, Offer

BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617
# History counts as "thin" below any of these (mirrors the red-line minimums plus a sales floor).
COLD_START_MAX_DAYS_ACTIVE = 7
COLD_START_MAX_PAYERS = 5
COLD_START_MAX_SALES = 20


def mark_cold_start(features, band: int):
    """Attach the zkTLS-proven band (enforced onchain at draw: minRevenueBand <= proven band) and flag a cold
    start when onchain history is too thin to judge. Shops with real history are judged on it as before."""
    thin = (features.days_active_30d < COLD_START_MAX_DAYS_ACTIVE
            or features.unique_payers_30d < COLD_START_MAX_PAYERS
            or features.sales_count_30d < COLD_START_MAX_SALES)
    return features.model_copy(update={"proven_revenue_band": band, "cold_start": thin})


def apply_cold_start(features, tier: int, min_revenue_band: int = 0):
    """Which thin-history shops are underwritten as a cold start instead of rejected for "not enough data".

    - tier 0 with a zkTLS-proven revenue band (Business Pass; band enforced onchain at draw).
    - tier >= 1: such an offer can only be redeemed onchain with a verified Standing Pass proof (a tier >= 1 mandate is
      registered with one; drawWithPass checks one; nullifier enforced), i.e. proof that this merchant fully repaid
      before. Moving to a fresh shop to stay unlinkable is the point of the design, so the new shop's thin history is
      not a red flag: it is judged as a cold start on the lowest proven floor. Hard red lines still apply, and the
      contract's tier cap still bounds the amount.
    """
    if tier == 0 and 0 < min_revenue_band <= MAX_REVENUE_BAND:
        return mark_cold_start(features, min_revenue_band)
    if tier >= 1:
        return mark_cold_start(features, min_revenue_band if 0 < min_revenue_band <= MAX_REVENUE_BAND else 1)
    return features


def _build_features(*args, **kwargs):
    from .features import build_features
    return build_features(*args, **kwargs)


def _redline_check(features):
    from .redlines import check
    return check(features)


def _clamp(*args, **kwargs):
    from .clamp import clamp_offer
    return clamp_offer(*args, **kwargs)


class UnderwritingPipeline:
    def __init__(self, *, reader, indexer, judge, signer, store, settings,
                 build_features=_build_features, redline_check=_redline_check, clamp=_clamp, now=time.time):
        self.reader, self.indexer, self.judge, self.signer, self.store = reader, indexer, judge, signer, store
        self.settings, self.build_features, self.redline_check, self.clamp, self.now = (
            settings, build_features, redline_check, clamp, now)

    def request_offer(self, shop_id, tier, recipient, pass_nullifier=0, min_revenue_band=0):
        """tier 0 manual draw (drawFirst): pass the Business Pass first-advance nullifier and the band the proof
        will show. Mandate draws (drawByMandate) pass neither: the credential was spent at registerMandate, so
        the offer carries pass_nullifier 0 (min_revenue_band must not exceed the mandate's proven band)."""
        now = int(self.now())
        self.indexer.sync()
        limits = self.reader.limits()
        sales = self.indexer.sales_for(shop_id, now - 90 * 86400)
        payers = list({sale.payer for sale in sales})
        funders = self.reader.usdc_funders(payers, now - 97 * 86400)
        payout = self.reader.shop_payout(shop_id)
        features = self.build_features(shop_id, sales, funders, payout, now,
                                       self.settings.payer_hash_key.get_secret_value().encode())
        features = apply_cold_start(features, tier, min_revenue_band)
        decision = Decision(decision_id=str(uuid.uuid4()), created_at=now, shop_id=shop_id, tier=tier,
                            features_hash=features_hash(features), redline_hits=[], draft=None, verdict=None,
                            clamp_changes=[], result="error", model=self.settings.anthropic_model)

        def finish(result):
            decision.result = result
            self.store.save(decision)
            return decision

        decision.redline_hits = self.redline_check(features)
        if decision.redline_hits:
            return finish("rejected")
        if (not 0 <= tier <= 3 or not 0 <= pass_nullifier < BN254_P
                or not 0 <= min_revenue_band <= MAX_REVENUE_BAND
                or (tier > 0 and (pass_nullifier != 0 or min_revenue_band != 0))):
            decision.clamp_changes = ["Invalid tier, pass nullifier or revenue band"]
            return finish("declined")
        # One active advance per shop (the contract enforces it too); decline before spending model calls.
        if any(a.shop_id.lower() == shop_id.lower() and a.status == AdvanceStatus.ACTIVE
               for a in self.reader.advances()):
            decision.clamp_changes = ["Shop already has an active advance"]
            return finish("declined")
        try:
            decision.draft = self.judge.underwrite(features, tier, limits)
            if decision.draft.decision == "decline":
                return finish("declined")
            decision.verdict = self.judge.critique(features, decision.draft)
        except Exception:  # noqa: BLE001 - any judge failure must end as 'error' and never sign
            return finish("error")
        if decision.verdict.verdict != "approve":
            return finish("rejected")
        draft, decision.clamp_changes = self.clamp(decision.draft, features, tier, limits,
                                                    self.settings.max_days_to_repay)
        if draft is None:
            return finish("declined")
        offer = Offer(offer_id="0x" + secrets.token_hex(32), shop_id=shop_id, recipient=recipient,
                      amount=draft.amount, factor_bps=draft.factor_bps, holdback_bps=draft.holdback_bps,
                      tier=tier, pass_nullifier=pass_nullifier, min_revenue_band=min_revenue_band,
                      expires_at=now + self.settings.offer_ttl_seconds)
        decision.signed_offer = self.signer.sign_offer(offer, chain_id=self.reader.chain_id,
                                                       verifying_contract=self.reader.book_address)
        return finish("offered")
