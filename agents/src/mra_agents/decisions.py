"""SQLite audit records and deterministic feature fingerprints."""
import json
import sqlite3

from eth_utils import keccak

from .models import Decision


def features_hash(features):
    canonical = json.dumps(features.model_dump(mode="json"), sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False, allow_nan=False).encode("utf-8")
    return "0x" + keccak(canonical).hex()


class DecisionStore:
    def __init__(self, db_path):
        self._db = sqlite3.connect(str(db_path), check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, "
                         "created_at INTEGER NOT NULL, data TEXT NOT NULL)")
        self._db.execute("CREATE INDEX IF NOT EXISTS decisions_shop ON decisions (shop_id, created_at)")
        self._db.commit()

    def save(self, decision):
        with self._db:
            self._db.execute("INSERT INTO decisions VALUES (?, ?, ?, ?)",
                             (decision.decision_id, decision.shop_id, decision.created_at,
                              decision.model_dump_json()))

    def get(self, id):
        row = self._db.execute("SELECT data FROM decisions WHERE id = ?", (id,)).fetchone()
        return Decision.model_validate_json(row[0]) if row else None

    def latest_for_shop(self, shop_id):
        row = self._db.execute("SELECT data FROM decisions WHERE shop_id = ? "
                               "ORDER BY created_at DESC, rowid DESC LIMIT 1", (shop_id,)).fetchone()
        return Decision.model_validate_json(row[0]) if row else None
