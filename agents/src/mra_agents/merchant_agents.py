"""Managed cash-flow agents: one hosted agent per merchant, set up ONCE, then fully automatic.

Setup (docs/privacy-architecture.md section 3):
  POST /agents                 -> we generate the agent key (encrypted at rest), store limits, return the
                                  agent address + limits + the OIDC nonce for World Agent Pass
  POST /agents/{id}/agent-pass -> World Agent Pass approved -> attester signs AgentPassAttestation
  (app) AdvanceBook.registerMandate(agentKey, limits, proof..., attestation) onchain
  POST /agents/{id}/activate   -> record the mandateId (checked on chain when the contract exposes it)

Every tick (MerchantAgentRunner, nobody taps):
  1. mandate active (local status, expiry, and the chain's view when available)
  2. restock needed? 3-day average revenue fell >= RESTOCK_DROP_THRESHOLD below the 30-day average
     (and the shop sells at least RESTOCK_MIN_AVG_DAILY_USD a day), or the demo trigger flag is set
  3. no active advance on chain, and no draw of ours still in flight
  4. limits leave room for the smallest advance (per draw, per period)
  5. UnderwritingPipeline.request_offer(...)  (red lines -> Underwriter -> Critic -> clamp -> signed offer)
  6. the offer fits the limits (checked in code BEFORE any chain call)
  7. the agent key signs (offerId, mandateId); the relayer sends drawByMandate
  8. a human-readable "why I drew" entry (the offer's reasons) goes to the app's log

Agent draw signature (configurable, MANDATE_SIG_SCHEME):
  eip712 (default): domain {name "AdvanceBook", version "1", chainId, verifyingContract}
                    MandateDraw(bytes32 offerId,uint256 mandateId)
  eip191:           personal_sign(keccak256(abi.encode(bytes32 offerId, uint256 mandateId)))

Chain touchpoints are injected callables (`AgentDeps`) so they can follow the contract as it lands.
Logs carry agent ids, shop ids, offer ids and tx hashes only: never keys, signatures or recipients.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import secrets
import sqlite3
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from eth_utils import keccak, to_checksum_address

from .models import AdvanceStatus
from .secretbox import SecretBox
from .world import (
    MIN_DRAW,
    AgentPassVerifier,
    Attester,
    Limits,
    agent_pass_nonce,
    limits_hash,
)

log = logging.getLogger(__name__)

DAY = 86_400
PENDING_DRAW_SECONDS = 15 * 60  # a draw we sent counts as "active" until the chain shows it (or this passes)
EVENT_DEDUPE_SECONDS = 3_600
MANDATE_DRAW_TYPE = "MandateDraw(bytes32 offerId,uint256 mandateId)"
_HEX32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
_ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")


class AgentError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ------------------------------------------------------------------ pure rules


@dataclass(frozen=True)
class RestockCheck:
    needed: bool
    code: str  # "revenue_drop" | "demo_trigger" | "steady_sales" | "too_little_history"
    reason: str
    avg_3d_usd: float
    avg_30d_usd: float


def restock_decision(sales: list, now: int, *, drop_threshold: float, min_avg_daily_usd: float,
                     trigger: bool = False) -> RestockCheck:
    """Explainable rule. Exact integer math: needed iff avg3 <= (1 - t) * avg30, i.e.
    rev3 * 10 * 10_000 <= (10_000 - t_bps) * rev30 (both windows end now; 30d includes the last 3d)."""
    rev3 = sum(s.amount for s in sales if now - 3 * DAY < s.timestamp <= now)
    rev30 = sum(s.amount for s in sales if now - 30 * DAY < s.timestamp <= now)
    avg3, avg30 = rev3 / 3 / 1e6, rev30 / 30 / 1e6
    if trigger:
        return RestockCheck(True, "demo_trigger", "Restock requested (demo trigger).", avg3, avg30)
    if rev30 == 0 or rev30 < round(min_avg_daily_usd * 1e6) * 30:
        return RestockCheck(False, "too_little_history",
                            f"30-day sales average ${avg30:.2f}/day, below the ${min_avg_daily_usd:.2f}/day "
                            "needed to judge stock.", avg3, avg30)
    t_bps = round(drop_threshold * 10_000)
    if rev3 * 10 * 10_000 <= (10_000 - t_bps) * rev30:
        drop = 1 - avg3 / avg30
        return RestockCheck(True, "revenue_drop",
                            f"Sales over the last 3 days averaged ${avg3:.2f}/day, {drop:.0%} below your "
                            f"30-day average of ${avg30:.2f}/day: likely running low on stock.", avg3, avg30)
    return RestockCheck(False, "steady_sales",
                        f"Sales are steady (${avg3:.2f}/day vs ${avg30:.2f}/day over 30 days).", avg3, avg30)


def period_used(draws: list[tuple[int, int]], now: int, period: int) -> int:
    return sum(amount for ts, amount in draws if ts > now - period)


def limit_violations(amount: int, limits: Limits, draws: list[tuple[int, int]], now: int) -> list[str]:
    """Checked in code before ANY chain call (the contract enforces the mandate again)."""
    out = []
    if amount > limits.max_per_draw:
        out.append("over_max_per_draw")
    if period_used(draws, now, limits.period) + amount > limits.max_per_period:
        out.append("over_max_per_period")
    if now >= limits.expiry:
        out.append("mandate_expired")
    return out


# ------------------------------------------------------------------ agent draw signature


def mandate_draw_message(offer_id: str, mandate_id: int, *, scheme: str, chain_id: int, verifying_contract: str):
    if not _HEX32.match(offer_id):
        raise AgentError("bad_offer_id")
    if scheme == "eip712":
        return encode_typed_data(
            domain_data={"name": "AdvanceBook", "version": "1", "chainId": chain_id,
                         "verifyingContract": to_checksum_address(verifying_contract)},
            message_types={"MandateDraw": [{"name": "offerId", "type": "bytes32"},
                                           {"name": "mandateId", "type": "uint256"}]},
            message_data={"offerId": offer_id, "mandateId": mandate_id},
        )
    if scheme == "eip191":
        inner = keccak(abi_encode(["bytes32", "uint256"], [bytes.fromhex(offer_id[2:]), mandate_id]))
        return encode_defunct(primitive=inner)
    raise AgentError("bad_sig_scheme")


def sign_mandate_draw(private_key: str, offer_id: str, mandate_id: int, **kw) -> str:
    signed = Account.sign_message(mandate_draw_message(offer_id, mandate_id, **kw), private_key)
    return "0x" + signed.signature.hex()


# ------------------------------------------------------------------ store

_SCHEMA = """
CREATE TABLE IF NOT EXISTS merchant_agents (
    id                TEXT PRIMARY KEY,
    shop_id           TEXT NOT NULL,
    address           TEXT NOT NULL,
    key_enc           TEXT NOT NULL,     -- AES-256-GCM(agent private key), AAD = agent id; never plaintext
    limits_json       TEXT NOT NULL,
    tier              INTEGER NOT NULL,
    recipient         TEXT NOT NULL,
    attest_nonce      TEXT NOT NULL,     -- uint256 as decimal text
    attestation_json  TEXT,
    mandate_id        TEXT,              -- uint256 as decimal text
    mandate_verified  INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL,     -- pending_approval | denied | approved | active | revoked | expired
    trigger           INTEGER NOT NULL DEFAULT 0,
    manage_token_hash TEXT NOT NULL,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS merchant_agents_status ON merchant_agents (status);
CREATE TABLE IF NOT EXISTS agent_draws (
    agent_id TEXT NOT NULL, ts INTEGER NOT NULL, amount TEXT NOT NULL, offer_id TEXT NOT NULL,
    tx_hash TEXT NOT NULL, decision_id TEXT, PRIMARY KEY (agent_id, offer_id)
);
CREATE TABLE IF NOT EXISTS agent_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, ts INTEGER NOT NULL,
    action TEXT NOT NULL, code TEXT NOT NULL, summary TEXT NOT NULL, details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_events_agent ON agent_events (agent_id, seq);
"""

_PUBLIC_COLS = ("id", "shop_id", "address", "limits_json", "tier", "recipient", "attest_nonce",
                "attestation_json", "mandate_id", "mandate_verified", "status", "trigger", "created_at",
                "updated_at")


@dataclass
class AgentRecord:
    id: str
    shop_id: str
    address: str
    limits: Limits
    tier: int
    recipient: str
    attest_nonce: int
    attestation: dict | None
    mandate_id: int | None
    mandate_verified: bool
    status: str
    trigger: bool
    created_at: int
    updated_at: int

    def public(self) -> dict:
        """What the app may see. No key material, no token hash."""
        return {"id": self.id, "shop_id": self.shop_id, "agent_address": self.address,
                "limits": {"max_per_draw": self.limits.max_per_draw, "max_per_period": self.limits.max_per_period,
                           "period": self.limits.period, "expiry": self.limits.expiry},
                "limits_hash": limits_hash(self.limits), "tier": self.tier, "status": self.status,
                "mandate_id": str(self.mandate_id) if self.mandate_id is not None else None,
                "mandate_verified": self.mandate_verified, "trigger_pending": self.trigger,
                "created_at": self.created_at, "updated_at": self.updated_at}


class MerchantAgentStore:
    """sqlite; one row per managed agent. Agent private keys are only ever stored AES-GCM encrypted."""

    def __init__(self, db_path: Path | str, box: SecretBox, now: Callable[[], float] = time.time):
        self.box, self.now = box, now
        if str(db_path) != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
        with self._lock:
            self._db.executescript(_SCHEMA)

    def __repr__(self) -> str:
        return "MerchantAgentStore()"

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def create(self, shop_id: str, tier: int, recipient: str, limits: Limits) -> tuple[AgentRecord, str]:
        agent_id = uuid.uuid4().hex
        acct = Account.create()
        key_enc = self.box.encrypt(bytes(acct.key), aad=b"agent-key:" + agent_id.encode())
        token = secrets.token_urlsafe(32)
        now = int(self.now())
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO merchant_agents (id, shop_id, address, key_enc, limits_json, tier, recipient, "
                "attest_nonce, status, manage_token_hash, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)",
                (agent_id, shop_id.lower(), acct.address, key_enc, limits.model_dump_json(), tier,
                 to_checksum_address(recipient), str(secrets.randbits(128)), self._token_hash(token), now, now))
        return self.get(agent_id), token

    def get(self, agent_id: str) -> AgentRecord:
        with self._lock:
            row = self._db.execute(f"SELECT {', '.join(_PUBLIC_COLS)} FROM merchant_agents WHERE id = ?",
                                   (agent_id,)).fetchone()
        if row is None:
            raise LookupError("agent not found")
        r = dict(zip(_PUBLIC_COLS, row, strict=True))
        return AgentRecord(
            id=r["id"], shop_id=r["shop_id"], address=r["address"],
            limits=Limits.model_validate_json(r["limits_json"]), tier=r["tier"], recipient=r["recipient"],
            attest_nonce=int(r["attest_nonce"]),
            attestation=json.loads(r["attestation_json"]) if r["attestation_json"] else None,
            mandate_id=int(r["mandate_id"]) if r["mandate_id"] is not None else None,
            mandate_verified=bool(r["mandate_verified"]), status=r["status"], trigger=bool(r["trigger"]),
            created_at=r["created_at"], updated_at=r["updated_at"])

    def check_token(self, agent_id: str, token: str | None) -> bool:
        with self._lock:
            row = self._db.execute("SELECT manage_token_hash FROM merchant_agents WHERE id = ?",
                                   (agent_id,)).fetchone()
        if row is None:
            raise LookupError("agent not found")
        return bool(token) and secrets.compare_digest(row[0], self._token_hash(token))

    def active_ids(self) -> list[str]:
        with self._lock:
            return [r[0] for r in self._db.execute(
                "SELECT id FROM merchant_agents WHERE status = 'active' ORDER BY created_at")]

    def private_key(self, agent_id: str) -> str:
        """Decrypt the agent key for one signature. Callers must not keep or log it."""
        with self._lock:
            row = self._db.execute("SELECT key_enc FROM merchant_agents WHERE id = ?", (agent_id,)).fetchone()
        if row is None:
            raise LookupError("agent not found")
        return "0x" + self.box.decrypt(row[0], aad=b"agent-key:" + agent_id.encode()).hex()

    def update(self, agent_id: str, **fields: Any) -> None:
        allowed = {"status", "trigger", "mandate_id", "mandate_verified", "attestation_json"}
        if not fields or set(fields) - allowed:
            raise ValueError("bad update")
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self._lock, self._db:
            self._db.execute(f"UPDATE merchant_agents SET {cols}, updated_at = ? WHERE id = ?",
                             (*fields.values(), int(self.now()), agent_id))

    def record_draw(self, agent_id: str, ts: int, amount: int, offer_id: str, tx_hash: str,
                    decision_id: str | None) -> None:
        with self._lock, self._db:
            self._db.execute("INSERT OR REPLACE INTO agent_draws VALUES (?, ?, ?, ?, ?, ?)",
                             (agent_id, ts, str(amount), offer_id, tx_hash, decision_id))

    def draws(self, agent_id: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT ts, amount, offer_id, tx_hash, decision_id FROM agent_draws "
                                    "WHERE agent_id = ? ORDER BY ts", (agent_id,)).fetchall()
        return [{"ts": r[0], "amount": int(r[1]), "offer_id": r[2], "tx_hash": r[3], "decision_id": r[4]}
                for r in rows]

    def add_event(self, agent_id: str, action: str, code: str, summary: str, details: dict | None = None,
                  *, dedupe_seconds: int = 0) -> None:
        now = int(self.now())
        with self._lock, self._db:
            if dedupe_seconds:
                last = self._db.execute("SELECT action, code, ts FROM agent_events WHERE agent_id = ? "
                                        "ORDER BY seq DESC LIMIT 1", (agent_id,)).fetchone()
                if last and last[0] == action and last[1] == code and now - last[2] < dedupe_seconds:
                    return
            self._db.execute("INSERT INTO agent_events (agent_id, ts, action, code, summary, details_json) "
                             "VALUES (?, ?, ?, ?, ?, ?)",
                             (agent_id, now, action, code, summary, json.dumps(details or {})))

    def events(self, agent_id: str, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT ts, action, code, summary, details_json FROM agent_events "
                                    "WHERE agent_id = ? ORDER BY seq DESC LIMIT ?", (agent_id, limit)).fetchall()
        return [{"ts": r[0], "action": r[1], "code": r[2], "summary": r[3], "details": json.loads(r[4])}
                for r in rows]


# ------------------------------------------------------------------ agent


RequestOffer = Callable[[str, int, str], Any]  # (shop_id, tier, recipient) -> Decision
DrawByMandate = Callable[[Any, int, str], str]  # (signed_offer, mandate_id, agent_sig) -> tx hash
MandateReader = Callable[[int], dict | None]  # mandate_id -> {"agentKey","limitsHash","active"} | None (unknown)


@dataclass
class AgentDeps:
    indexer: Any  # .sync() / .sales_for(shop_id, since_ts)
    advances: Callable[[], list]  # reader.advances
    request_offer: RequestOffer
    draw_by_mandate: DrawByMandate
    chain_id: int
    book_address: str
    settings: Any
    mandate_reader: MandateReader | None = None
    now: Callable[[], float] = time.time


@dataclass
class TickResult:
    agent_id: str
    action: str  # idle | skipped | declined | drew | error
    code: str
    summary: str
    details: dict = field(default_factory=dict)


def _decision_reasons(d: Any) -> list[str]:
    draft = getattr(d, "draft", None)
    reasons = list(getattr(draft, "reasons_en", None) or [])
    verdict = getattr(d, "verdict", None)
    if verdict is not None and getattr(verdict, "summary_en", None):
        reasons.append(f"Critic: {verdict.summary_en}")
    return reasons


class MerchantAgent:
    def __init__(self, agent_id: str, store: MerchantAgentStore, deps: AgentDeps):
        self.agent_id, self.store, self.deps = agent_id, store, deps

    def _log(self, r: TickResult, *, dedupe: bool = True) -> TickResult:
        if r.action != "idle":
            self.store.add_event(self.agent_id, r.action, r.code, r.summary, r.details,
                                 dedupe_seconds=EVENT_DEDUPE_SECONDS if dedupe else 0)
        return r

    def tick(self) -> TickResult:
        d, s = self.deps, self.deps.settings
        a = self.store.get(self.agent_id)
        now = int(d.now())
        res = lambda action, code, summary, **det: TickResult(a.id, action, code, summary, det)

        # 1. mandate active
        if a.status != "active" or a.mandate_id is None:
            return res("idle", "mandate_inactive", "No active mandate.")
        if now >= a.limits.expiry:
            self.store.update(a.id, status="expired")
            return self._log(res("skipped", "mandate_expired", "Mandate expired; the merchant must renew it."))
        proven_band = 0
        if d.mandate_reader is not None:
            m = d.mandate_reader(a.mandate_id)
            if m is not None:
                proven_band = int(m.get("band", 0) or 0)
            if m is not None and not m.get("active", False):
                self.store.update(a.id, status="revoked")
                return self._log(res("skipped", "mandate_revoked_onchain", "Mandate is no longer active onchain."))

        # 2. restock needed?
        d.indexer.sync()
        sales = d.indexer.sales_for(a.shop_id, now - 30 * DAY)
        check = restock_decision(sales, now, drop_threshold=s.restock_drop_threshold,
                                 min_avg_daily_usd=s.restock_min_avg_daily_usd, trigger=a.trigger)
        if a.trigger:
            self.store.update(a.id, trigger=0)  # one-shot
        if not check.needed:
            return res("idle", check.code, check.reason)
        why = {"restock": check.reason, "avg_3d_usd": round(check.avg_3d_usd, 2),
               "avg_30d_usd": round(check.avg_30d_usd, 2)}

        # 3. no active advance, no draw in flight
        if any(x.shop_id.lower() == a.shop_id and x.status == AdvanceStatus.ACTIVE for x in d.advances()):
            return self._log(res("skipped", "active_advance",
                                 "Restock needed, but the shop is still repaying an advance.", **why))
        draws = self.store.draws(a.id)
        if any(now - x["ts"] < PENDING_DRAW_SECONDS for x in draws):
            return self._log(res("skipped", "draw_in_flight", "A draw was just sent; waiting for it to land.",
                                 **why))

        # 4. headroom for the smallest advance
        history = [(x["ts"], x["amount"]) for x in draws]
        if limit_violations(MIN_DRAW, a.limits, history, now):
            return self._log(res("skipped", "period_limit_reached",
                                 "Restock needed, but this period's limit is used up.", **why))

        # 5. underwrite
        # Tier-0 mandates carry the Business Pass band proven at registerMandate: pass it so a new shop is
        # underwritten on its proven revenue (cold start) and the offer's minRevenueBand matches the mandate.
        if a.tier == 0 and proven_band > 0:
            decision = d.request_offer(a.shop_id, a.tier, a.recipient, min_revenue_band=proven_band)
        else:
            decision = d.request_offer(a.shop_id, a.tier, a.recipient)
        reasons = _decision_reasons(decision)
        did = getattr(decision, "decision_id", None)
        if getattr(decision, "result", None) != "offered" or getattr(decision, "signed_offer", None) is None:
            blockers = list(getattr(decision, "redline_hits", None) or []) + \
                list(getattr(decision, "clamp_changes", None) or [])
            return self._log(res("declined", f"offer_{getattr(decision, 'result', 'error')}",
                                 "Restock needed, but no advance was offered.",
                                 reasons=reasons, blockers=blockers, decision_id=did, **why), dedupe=False)
        so = decision.signed_offer
        offer = so.offer

        # 6. limits, in code, before the chain
        bad = limit_violations(offer.amount, a.limits, history, now)
        if bad:
            return self._log(res("skipped", bad[0], "The offer is larger than the limits you set.",
                                 amount=offer.amount, decision_id=did, **why), dedupe=False)

        # 7. sign (offerId, mandateId) and send
        sig = sign_mandate_draw(self.store.private_key(a.id), offer.offer_id, a.mandate_id,
                                scheme=s.mandate_sig_scheme, chain_id=d.chain_id,
                                verifying_contract=d.book_address)
        tx = d.draw_by_mandate(so, a.mandate_id, sig)
        self.store.record_draw(a.id, now, offer.amount, offer.offer_id, tx, did)
        log.info("agent %s drew shop=%s offer=%s tx=%s", a.id, a.shop_id, offer.offer_id, tx)

        # 8. why I drew
        summary = f"Drew ${offer.amount / 1e6:.0f} to restock. {check.reason}"
        return self._log(res("drew", check.code, summary, amount=offer.amount, factor_bps=offer.factor_bps,
                             holdback_bps=offer.holdback_bps, offer_id=offer.offer_id, tx_hash=tx,
                             decision_id=did, reasons=reasons, **why), dedupe=False)


class MerchantAgentRunner:
    """Ticks every active agent on an interval. One agent's failure never stops the others."""

    def __init__(self, store: MerchantAgentStore, deps: AgentDeps, interval: float):
        self.store, self.deps, self.interval = store, deps, interval

    def tick_all(self) -> list[TickResult]:
        out = []
        for agent_id in self.store.active_ids():
            try:
                out.append(MerchantAgent(agent_id, self.store, self.deps).tick())
            except Exception as e:  # noqa: BLE001 - per-agent isolation; never log the message (may hold data)
                log.warning("agent %s tick failed: %s", agent_id, type(e).__name__)
                code = getattr(e, "code", type(e).__name__)
                self.store.add_event(agent_id, "error", str(code), "The agent hit an error and will retry.",
                                     dedupe_seconds=EVENT_DEDUPE_SECONDS)
                out.append(TickResult(agent_id, "error", str(code), "error"))
        return out

    async def run(self, stop: asyncio.Event | None = None) -> None:
        stop = stop or asyncio.Event()
        while not stop.is_set():
            await asyncio.to_thread(self.tick_all)
            try:
                await asyncio.wait_for(stop.wait(), timeout=self.interval)
            except TimeoutError:
                pass


# ------------------------------------------------------------------ chain adapters (swap when the ABI lands)


class MandateRelay:
    """Default `draw_by_mandate`: relayer key sends AdvanceBook.drawByMandate(offer, offerSig, mandateId,
    agentSig). Needs "drawByMandate" on chain.py's ALLOWED_FUNCTIONS (relayer signer)."""

    def __init__(self, writer, now: Callable[[], float] = time.time, *, min_validity_seconds: int = 15,
                 per_mandate_limit: int = 2, per_mandate_window: float = 3_600):
        self.writer, self.now, self.min_validity = writer, now, min_validity_seconds
        self.limit, self.window = per_mandate_limit, per_mandate_window
        self._hits: dict[int, list[float]] = {}
        self._lock = threading.Lock()

    def __call__(self, signed_offer, mandate_id: int, agent_sig: str) -> str:
        from .relayer import offer_tuple  # follows the models.Offer shape as it changes

        o = signed_offer.offer
        if o.expires_at < int(self.now()) + self.min_validity:
            raise AgentError("offer_expired")
        for sig in (signed_offer.signature, agent_sig):
            if not isinstance(sig, str) or not re.fullmatch(r"0x[0-9a-fA-F]{130}", sig) or \
                    int(sig[-2:], 16) not in (27, 28):
                raise AgentError("bad_signature")
        if not 0 < mandate_id < 2**256:
            raise AgentError("bad_mandate_id")
        t = self.now()
        with self._lock:
            hits = [h for h in self._hits.get(mandate_id, []) if h > t - self.window]
            if len(hits) >= self.limit:
                raise AgentError("rate_limited")
            hits.append(t)
            self._hits[mandate_id] = hits
        return self.writer.send("drawByMandate", [offer_tuple(o), bytes.fromhex(signed_offer.signature[2:]),
                                                  mandate_id, bytes.fromhex(agent_sig[2:])], signer="relayer")


def make_mandate_reader(reader) -> MandateReader | None:
    """Best-effort onchain view: uses `getMandate(uint256)` or `mandates(uint256)` if the ABI has it.
    Returns None (unverifiable) if the contract doesn't expose one yet."""
    book = getattr(reader, "book", None)
    if book is None:
        return None
    names = {f.get("name"): f for f in book.abi if f.get("type") == "function"}
    fn_abi = names.get("getMandate") or names.get("mandates")
    if fn_abi is None:
        return None
    outs = fn_abi.get("outputs", [])
    if len(outs) == 1 and outs[0].get("components"):
        outs = outs[0]["components"]
    keys = [o.get("name") for o in outs]

    def read(mandate_id: int) -> dict | None:
        val = getattr(book.functions, fn_abi["name"])(mandate_id).call()
        val = val if isinstance(val, (list, tuple)) and len(val) == len(keys) else \
            (val[0] if isinstance(val, (list, tuple)) and len(val) == 1 else val)
        m = dict(zip(keys, val, strict=False)) if isinstance(val, (list, tuple)) else {}
        agent = m.get("agentKey") or m.get("agent")
        if not agent or int(agent, 16) == 0:
            return {"active": False, "exists": False}
        revoked = bool(m.get("revoked", False))
        limits = m.get("limits")
        expiry = m.get("expiry")
        if expiry is None and isinstance(limits, (list, tuple)) and len(limits) == 4:
            expiry = limits[3]  # Limits{maxPerDraw, maxPerPeriod, period, expiry}
        active = bool(m.get("active", not revoked))
        if expiry and int(expiry) <= int(time.time()):
            active = False
        lh = m.get("limitsHash")
        return {"exists": True, "agentKey": agent, "active": active,
                "limitsHash": ("0x" + lh.hex()) if isinstance(lh, bytes) else lh,
                "band": int(m.get("band", 0) or 0)}

    return read


# ------------------------------------------------------------------ service (API-facing)


class MerchantAgentService:
    def __init__(self, store: MerchantAgentStore, deps: AgentDeps, verifier: AgentPassVerifier,
                 attester: Attester | None):
        self.store, self.deps, self.verifier, self.attester = store, deps, verifier, attester

    def create(self, shop_id: str, tier: int, recipient: str, limits: Limits) -> dict:
        if not _HEX32.match(shop_id) or not _ADDR.match(recipient) or not 0 <= tier <= 3:
            raise AgentError("invalid_request")
        limits.check_expiry(int(self.deps.now()))
        rec, token = self.store.create(shop_id, tier, recipient, limits)
        self.store.add_event(rec.id, "created", "created", "Agent created; waiting for your World Agent Pass.")
        lhash = limits_hash(rec.limits)
        return {**rec.public(), "manage_token": token,
                "agent_pass_nonce": agent_pass_nonce(rec.address, lhash, rec.attest_nonce),
                "register": {"agentKey": rec.address, "limits": {k: str(v) for k, v in rec.limits.solidity().items()},
                             "limitsHash": lhash}}

    def agent_pass(self, agent_id: str, request: dict) -> dict:
        a = self.store.get(agent_id)
        if a.status not in ("pending_approval", "denied", "approved"):
            raise AgentError("bad_state")
        now = int(self.deps.now())
        a.limits.check_expiry(now)
        lhash = limits_hash(a.limits)
        result = self.verifier.verify(request, agent_pass_nonce(a.address, lhash, a.attest_nonce))
        if not result.approved:
            if a.status != "approved":
                self.store.update(a.id, status="denied")
            self.store.add_event(a.id, "agent_pass", result.reason,
                                 "World Agent Pass was not approved; no mandate, no automatic draws.")
            return {"approved": False, "reason": result.reason, "attestation": None}
        if self.attester is None:
            raise AgentError("attester_not_configured")
        expiry = min(now + self.deps.settings.attestation_ttl_seconds, a.limits.expiry)
        att = self.attester.sign(a.address, a.limits, a.attest_nonce, expiry)
        self.store.update(a.id, status="approved", attestation_json=json.dumps(att))
        self.store.add_event(a.id, "agent_pass", "approved", "A real human approved this agent with World.")
        return {"approved": True, "reason": "approved", **att}

    def activate(self, agent_id: str, mandate_id: int) -> dict:
        a = self.store.get(agent_id)
        if a.status not in ("approved", "active"):
            raise AgentError("bad_state")
        if not 0 < mandate_id < 2**256:
            raise AgentError("bad_mandate_id")
        verified = False
        if self.deps.mandate_reader is not None:
            m = self.deps.mandate_reader(mandate_id)
            if m is not None:
                if not m.get("exists", True) or not m.get("active"):
                    raise AgentError("mandate_not_active")
                if to_checksum_address(m["agentKey"]) != a.address:
                    raise AgentError("mandate_agent_mismatch")
                if m.get("limitsHash") and str(m["limitsHash"]).lower() != limits_hash(a.limits):
                    raise AgentError("mandate_limits_mismatch")
                verified = True
        self.store.update(a.id, status="active", mandate_id=str(mandate_id), mandate_verified=int(verified))
        self.store.add_event(a.id, "activated", "activated" if verified else "activated_unverified",
                             "Mandate registered; the agent now restocks automatically within your limits.")
        return self.status(agent_id)

    def status(self, agent_id: str) -> dict:
        a = self.store.get(agent_id)
        return {**a.public(), "draws": self.store.draws(a.id), "log": self.store.events(a.id)}

    def trigger(self, agent_id: str, run_now: bool = False) -> dict:
        a = self.store.get(agent_id)
        if a.status != "active":
            raise AgentError("bad_state")
        self.store.update(a.id, trigger=1)
        out = {"triggered": True, "tick": None}
        if run_now:
            r = MerchantAgent(a.id, self.store, self.deps).tick()
            out["tick"] = {"action": r.action, "code": r.code, "summary": r.summary}
        return out

    def revoke(self, agent_id: str) -> dict:
        a = self.store.get(agent_id)
        if a.status == "revoked":
            return self.status(agent_id)
        self.store.update(a.id, status="revoked", trigger=0)
        self.store.add_event(a.id, "revoked", "revoked",
                             "Agent stopped. Revoke the mandate onchain (revokeMandate) to make it final.")
        return self.status(agent_id)


def build_runner_from_settings():  # pragma: no cover - wiring for `python -m mra_agents.merchant_agents`
    from .agents_api import build_merchant_services
    services = build_merchant_services()
    return services["runner"]


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    asyncio.run(build_runner_from_settings().run())
