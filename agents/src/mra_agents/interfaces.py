"""Module boundaries. Frozen (owned by the lead). Implementations live in their owners' files;
tests use in-memory fakes of these protocols."""

from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

from .models import (
    AdvanceState,
    ChainLimits,
    CriticVerdict,
    OfferDraft,
    RiskProposal,
    SaleEvent,
    ShopFeatures,
    SignedOffer,
)

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    """Structured-output model call. Real impl: Anthropic `messages.parse`. Tests: FakeLLM."""

    def parse(self, *, system: str, user: str, schema: type[T], effort: str) -> T: ...


class Judge(Protocol):
    """Pluggable judging backend (Claude by default; e.g. TypeSafe Jev later)."""

    def underwrite(self, features: ShopFeatures, tier: int, limits: ChainLimits) -> OfferDraft: ...

    def critique(self, features: ShopFeatures, draft: OfferDraft) -> CriticVerdict: ...

    def propose_risk(self, signals: dict, limits: ChainLimits) -> RiskProposal: ...


class ChainReader(Protocol):
    chain_id: int
    book_address: str

    def latest_block(self) -> int: ...

    def limits(self) -> ChainLimits: ...

    def sales(self, shop_id: str | None, from_block: int, to_block: int) -> list[SaleEvent]: ...

    def usdc_funders(self, addresses: list[str], since_ts: int) -> dict[str, list[str]]:
        """For each payer address, the addresses that sent it USDC since `since_ts`."""
        ...

    def shop_payout(self, shop_id: str) -> str | None: ...

    def advances(self) -> list[AdvanceState]: ...

    def junior_twap_tick(self, seconds_ago: int) -> int: ...

    def block_timestamp(self, block_number: int) -> int: ...


class ChainWriter(Protocol):
    def send(self, fn_name: str, args: list, *, signer: str) -> str:
        """Send an AdvanceBook / RiskHook tx from a named key ('relayer' | 'risk_manager'). Returns tx hash."""
        ...


class Signer(Protocol):
    def sign_offer(self, offer, *, chain_id: int, verifying_contract: str) -> SignedOffer: ...
