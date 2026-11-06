"""Incremental, idempotent Sale-event indexer on stdlib sqlite3 (owner: claude-data).

- First sync starts at the reader's `deploy_block` (0 if the reader has none).
- Later syncs restart `REORG_MARGIN` blocks before the last synced block. Rows in the re-read range are
  replaced by what the chain now says, so logs dropped by a shallow reorg disappear.
- Rows are unique on (tx_hash, log_index); `sync()` returns how many of them are new.
- uint256 amounts are stored as TEXT (sqlite INTEGER is only 64-bit).
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from .interfaces import ChainReader
from .models import SaleEvent

REORG_MARGIN = 12
SYNC_CHUNK_BLOCKS = 50_000  # commit progress every this many blocks

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sales (
    tx_hash      TEXT NOT NULL,
    log_index    INTEGER NOT NULL,
    shop_id      TEXT NOT NULL,
    payer        TEXT NOT NULL,
    amount       TEXT NOT NULL,
    repayment    TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp    INTEGER NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS sales_shop_ts ON sales (shop_id, timestamp);
CREATE INDEX IF NOT EXISTS sales_block ON sales (block_number);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class Indexer:
    def __init__(self, reader: ChainReader, db_path: Path, reorg_margin: int = REORG_MARGIN):
        self.reader = reader
        self.db_path = Path(db_path)
        self.reorg_margin = reorg_margin
        self.deploy_block = int(getattr(reader, "deploy_block", 0) or 0)
        if str(db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
        with self._lock:
            self._db.executescript(_SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def last_synced_block(self) -> int | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM meta WHERE key = 'last_block'").fetchone()
        return int(row[0]) if row else None

    def sync(self) -> int:
        """Pull Sale events up to the chain head. Returns the number of new (tx_hash, log_index) rows."""
        with self._lock:
            latest = int(self.reader.latest_block())
            last = self.last_synced_block()
            start = self.deploy_block if last is None else max(self.deploy_block, last - self.reorg_margin + 1)
            new = 0
            a = start
            while a <= latest:
                b = min(a + SYNC_CHUNK_BLOCKS - 1, latest)
                new += self._sync_range(a, b)
                a = b + 1
            return new

    def _sync_range(self, a: int, b: int) -> int:
        events = self.reader.sales(None, a, b)
        db = self._db
        with db:  # one transaction per range: replace whatever the chain no longer says
            old = {(r[0], r[1]) for r in db.execute(
                "SELECT tx_hash, log_index FROM sales WHERE block_number BETWEEN ? AND ?", (a, b))}
            db.execute("DELETE FROM sales WHERE block_number BETWEEN ? AND ?", (a, b))
            fresh: set[tuple[str, int]] = set()
            for e in events:
                key = (e.tx_hash.lower(), e.log_index)
                fresh.add(key)
                db.execute(
                    "INSERT OR REPLACE INTO sales VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (key[0], key[1], e.shop_id.lower(), e.payer, str(e.amount), str(e.repayment),
                     e.block_number, e.timestamp),
                )
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_block', ?)", (str(b),))
        return len(fresh - old)

    def sales_for(self, shop_id: str, since_ts: int) -> list[SaleEvent]:
        with self._lock:
            rows = self._db.execute(
                "SELECT tx_hash, log_index, shop_id, payer, amount, repayment, block_number, timestamp "
                "FROM sales WHERE shop_id = ? AND timestamp >= ? ORDER BY block_number, log_index",
                (shop_id.lower(), int(since_ts)),
            ).fetchall()
        return [
            SaleEvent(tx_hash=r[0], log_index=r[1], shop_id=r[2], payer=r[3], amount=int(r[4]),
                      repayment=int(r[5]), block_number=r[6], timestamp=r[7])
            for r in rows
        ]
