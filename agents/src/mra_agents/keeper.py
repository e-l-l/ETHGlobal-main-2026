"""Keeper: the "nothing runs itself" backstop (docs/architecture.md, "Who calls what").

Each `tick()`:
  1. `writeOff(id)` for every advance with status Active and `now >= last_sale_at + defaultWindow`
     (exactly the AdvanceBook rule), sent from the relayer key.
  2. `RiskHook.flush()` only when the hook holds USDC (> 0); flush reverts with NothingToFlush otherwise.

Idempotency: an id we already sent stays "in flight" until the reader no longer shows it Active, or until
`inflight_ttl` passes (then we retry, in case the tx was dropped). A send that raised is NOT marked in flight,
so it is retried next tick. `tick()` never raises; it returns a `KeeperResult` (a `list[str]` of tx hashes,
per the frozen signature) whose `.errors` lists what went wrong.

Time: by default the keeper uses the chain head's timestamp (`reader.block_timestamp(latest_block)`), because
the contract compares against `block.timestamp`, and an anvil demo may warp time. Inject `now` to override.

ChainReader has no getter for the hook's USDC balance or for `AdvanceBook.defaultWindow`, so both are
injected (`hook_usdc_balance`, `default_window`). Without `hook_usdc_balance` the flush step is skipped.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from .config import Settings
from .interfaces import ChainReader, ChainWriter
from .models import AdvanceStatus

log = logging.getLogger(__name__)

DEFAULT_WINDOW_SECONDS = 30 * 86_400  # Deploy.s.sol; AdvanceBook.defaultWindow() is not on ChainReader
DEFAULT_INFLIGHT_TTL = 600


class KeeperResult(list[str]):
    """Tx hashes sent this tick (a plain list[str]) plus the errors hit along the way."""

    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self.skipped: list[str] = []


class Keeper:
    def __init__(
        self,
        reader: ChainReader,
        writer: ChainWriter,
        settings: Settings,
        now: Callable[[], float] | None = None,
        *,
        hook_usdc_balance: Callable[[], int] | None = None,
        default_window: int = DEFAULT_WINDOW_SECONDS,
        inflight_ttl: int = DEFAULT_INFLIGHT_TTL,
    ):
        self.reader = reader
        self.writer = writer
        self.settings = settings
        self._now = now
        self.hook_usdc_balance = hook_usdc_balance
        self.default_window = default_window
        self.inflight_ttl = inflight_ttl
        self._inflight: dict[int, int] = {}  # advance id -> time we sent writeOff
        self._flush_sent_at: int | None = None

    def _time(self) -> int:
        if self._now is not None:
            return int(self._now())
        return int(self.reader.block_timestamp(self.reader.latest_block()))

    @staticmethod
    def eligible(last_sale_at: int, now: int, default_window: int) -> bool:
        """Mirror of AdvanceBook.writeOff: now >= lastSaleAt + defaultWindow."""
        return now >= last_sale_at + default_window

    def tick(self) -> KeeperResult:
        result = KeeperResult()
        try:
            now = self._time()
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"time: {type(e).__name__}")
            return result
        self._write_offs(now, result)
        self._flush(now, result)
        return result

    def _write_offs(self, now: int, result: KeeperResult) -> None:
        try:
            advances = list(self.reader.advances())
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"advances: {type(e).__name__}")
            return
        active = {a.advance_id for a in advances if a.status == AdvanceStatus.ACTIVE}
        for aid in list(self._inflight):  # settled (no longer Active) -> forget
            if aid not in active:
                del self._inflight[aid]
        for a in advances:
            if a.status != AdvanceStatus.ACTIVE or not self.eligible(a.last_sale_at, now, self.default_window):
                continue
            sent_at = self._inflight.get(a.advance_id)
            if sent_at is not None and now - sent_at < self.inflight_ttl:
                result.skipped.append(f"writeOff:{a.advance_id}:in_flight")
                continue
            try:
                tx = self.writer.send("writeOff", [a.advance_id], signer="relayer")
            except Exception as e:  # noqa: BLE001 - not marked in flight, retried next tick
                result.errors.append(f"writeOff:{a.advance_id}: {type(e).__name__}")
                log.warning("writeOff %s failed: %s", a.advance_id, type(e).__name__)
                continue
            self._inflight[a.advance_id] = now
            result.append(tx)
            log.info("writeOff sent advance=%s tx=%s", a.advance_id, tx)

    def _flush(self, now: int, result: KeeperResult) -> None:
        if self.hook_usdc_balance is None:
            result.skipped.append("flush:no_balance_getter")
            return
        try:
            bal = int(self.hook_usdc_balance())
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"flush_balance: {type(e).__name__}")
            return
        if bal <= 0:
            self._flush_sent_at = None
            result.skipped.append("flush:empty")
            return
        if self._flush_sent_at is not None and now - self._flush_sent_at < self.inflight_ttl:
            result.skipped.append("flush:in_flight")
            return
        try:
            tx = self.writer.send("flush", [], signer="relayer")
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"flush: {type(e).__name__}")
            return
        self._flush_sent_at = now
        result.append(tx)
        log.info("RiskHook.flush sent amount=%s tx=%s", bal, tx)
