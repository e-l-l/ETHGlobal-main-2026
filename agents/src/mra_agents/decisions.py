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
        self._db.execute("CREATE TABLE IF NOT EXISTS cold_reservations (id TEXT PRIMARY KEY, shop TEXT, "
                         "created INTEGER, expires INTEGER, amount INTEGER)")
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

    def reserve_cold_start(self, id, shop, now, expires, amount, active, cap, count_cap, period):
        # Serialize reservations across processes. Pending offers count until expiry; active loans
        # remain charged at full principal until settled, even if partially repaid.
        self._db.execute("BEGIN IMMEDIATE")
        try:
            rows = self._db.execute("SELECT shop, created, expires, amount FROM cold_reservations").fetchall()
            cold_shops = {r[0].lower() for r in rows}
            exposure = sum(a.principal for a in active if a.shop_id.lower() in cold_shops)
            # Count both a live offer and the active advance conservatively: another signed
            # offer for the same shop could be drawn after that advance settles.
            exposure += sum(r[3] for r in rows if r[2] >= now)
            count = sum(1 for r in rows if r[1] > now - period)
            if exposure + amount > cap or count >= count_cap:
                self._db.rollback()
                return False
            self._db.execute("INSERT INTO cold_reservations VALUES (?, ?, ?, ?, ?)",
                             (id, shop, now, expires, amount))
            self._db.commit()
            return True
        except Exception:
            self._db.rollback()
            raise
