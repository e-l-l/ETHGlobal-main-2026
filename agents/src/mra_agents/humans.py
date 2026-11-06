"""World ID binding for borrowers: one unique human behind each shop, and a ban on default.

Privacy (docs/privacy-architecture.md, "World ID binding: what we store and what we don't"):

- The merchant proves "unique human" with World ID (IDKit 4, proof of human) for WORLD_BORROWER_ACTION. World's
  verify returns a nullifier: unique per human per action, it reveals no identity. We never store it raw.
- `human_key = HMAC(server key, "world-human" || nullifier || action)`. Different label from the recovery owner key,
  so the two tables cannot be joined even by us without recomputing from a live proof.
- `shop_key = HMAC(server key, "world-shop" || shopId)`. A DB dump does not even say which shop ids are bound.
- shop -> human and human -> [shops] are AES-256-GCM ciphertexts (secretbox.py), bound to their row key (AAD).
- Never stored: the nullifier, a name, an address, a phone, anything about the person. Nothing goes onchain.
- The API answers {"verified": true}; only the shop's owner (EIP-191 signature from the onchain shop owner) can
  read `banned` and the unlock status. The nullifier never leaves the verify call.

Offer-signer red lines (pipeline.py, pure code, before any model call): `human_not_verified` (when
WORLD_BINDING_REQUIRED), `human_banned`, `human_has_open_advance` (an open advance on ANY of the human's shops).

World ID FIRST: `POST /world/borrower/check {idkit, owner}` runs the same verification before any shop exists and
answers eligible (with a ticket) or the red line that stops the person (`human_banned`, `human_has_open_advance`).
The ticket is AES-256-GCM under the same server key (secretbox.py, AAD "world-ticket:v1") over
{human_key, owner address, expiry (30 min), random id}: opaque to the client, carrying an HMAC (never the
nullifier), bound to the burner that will own the shop, and spent on its first bind (one shop per ticket).

Ban trigger: any advance on a bound shop that reads WrittenOff onchain bans that human (permanent for the hackathon;
docs mention the appeal / expiry path). writeOff is permissionless, so we derive bans from chain state
(`sync_write_offs`), called by the pipeline before every offer, by the Keeper after its tick and by status reads.
"""

from __future__ import annotations

import json
import re
import secrets
import sqlite3
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from eth_account import Account
from eth_account.messages import encode_defunct

from .models import AdvanceState, AdvanceStatus
from .secretbox import DecryptError, SecretBox

HUMAN_NOT_VERIFIED = "human_not_verified"
HUMAN_BANNED = "human_banned"
HUMAN_HAS_OPEN_ADVANCE = "human_has_open_advance"
HUMAN_CODES = (HUMAN_NOT_VERIFIED, HUMAN_BANNED, HUMAN_HAS_OPEN_ADVANCE)

MESSAGES: dict[str, dict[str, str]] = {
    HUMAN_NOT_VERIFIED: {
        "en": "Verify that you're a unique human with World ID before your first advance. We never learn who you are.",
        "es": "Verificá con World ID que sos una persona única antes de tu primer adelanto. Nunca sabemos quién sos.",
    },
    HUMAN_BANNED: {
        "en": "This World ID can't take new advances, on any shop, because an earlier advance was not repaid.",
        "es": "Este World ID no puede tomar nuevos adelantos, en ningún negocio, porque un adelanto anterior no se pagó.",
    },
    HUMAN_HAS_OPEN_ADVANCE: {
        "en": "You already have an advance open on one of your shops. Repay it first, then ask again.",
        "es": "Ya tenés un adelanto abierto en uno de tus negocios. Pagalo primero y volvé a pedir.",
    },
}

OWNER_AUTH_TTL = 600  # seconds either side of now
TICKET_TTL = 30 * 60  # a pre-shop World ID check is good for 30 minutes
TICKET_AAD = b"world-ticket:v1"
MAX_TICKET_LEN = 1024
_ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SCHEMA = """
CREATE TABLE IF NOT EXISTS world_humans (
    human_key  TEXT PRIMARY KEY,   -- HMAC(server key, nullifier || action); never the raw nullifier
    shops_enc  TEXT NOT NULL,      -- AES-GCM(JSON list of shop ids), AAD = human_key
    banned     INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,               -- a code ("written_off"), never free text
    banned_at  INTEGER,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS world_shop_bindings (
    shop_key   TEXT PRIMARY KEY,   -- HMAC(server key, shop id)
    human_enc  TEXT NOT NULL,      -- AES-GCM(human_key), AAD = shop_key
    bound_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS world_tickets_used (
    ticket_key TEXT PRIMARY KEY,   -- HMAC(server key, ticket id); a used ticket binds one shop only
    shop_key   TEXT NOT NULL,      -- the shop it bound (a retry for the same shop is idempotent)
    expires_at INTEGER NOT NULL    -- rows are purged after the ticket would have expired anyway
);
"""


@dataclass(frozen=True)
class Ticket:
    """An opened eligibility ticket. Lives only in server memory; the client holds an opaque AES-GCM blob."""
    human: str
    owner: str
    expires_at: int
    id: str


def normalize_address(value: object) -> str:
    if not isinstance(value, str) or not _ADDRESS.match(value):
        raise ValueError("invalid address")
    return value.lower()


class HumanError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def owner_auth_message(shop_id: str, chain_id: int, issued_at: int) -> str:
    """The exact text the shop owner signs (EIP-191 personal_sign). The SDK builds the same string."""
    return f"DripMoni shop owner\nshop: {shop_id.lower()}\nchain: {int(chain_id)}\nissued: {int(issued_at)}"


def parse_owner_auth(authorization: str | None) -> tuple[int, str] | None:
    """`Authorization: Owner <issued_at>:<0xsignature>` -> (issued_at, signature)."""
    if not authorization or not authorization.startswith("Owner ") or len(authorization) > 300:
        return None
    issued, _, sig = authorization[6:].strip().partition(":")
    if not issued.isdigit() or len(issued) > 12 or not sig.startswith("0x") or len(sig) != 132:
        return None
    try:
        bytes.fromhex(sig[2:])
    except ValueError:
        return None
    return int(issued), sig


def recover_owner(shop_id: str, chain_id: int, issued_at: int, signature: str) -> str:
    msg = encode_defunct(text=owner_auth_message(shop_id, chain_id, issued_at))
    return Account.recover_message(msg, signature=signature)


class HumanRegistry:
    """shop <-> human bindings and bans, encrypted at rest. Thread-safe; one sqlite file shared with the API."""

    def __init__(self, box: SecretBox, db_path: Path | str, *, action: str, now: Callable[[], float] = time.time):
        self.box, self.action, self.now = box, action, now
        self._lock = threading.Lock()
        if str(db_path) != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
        with self._lock:
            self._db.executescript(_SCHEMA)

    # ------------------------------------------------------------ keys
    def human_key(self, nullifier: str) -> str:
        n = int(nullifier, 16).to_bytes(32, "big")
        return self.box.mac(b"world-human", n + self.action.encode()).hex()

    def _shop_key(self, shop_id: str) -> str:
        return self.box.mac(b"world-shop", shop_id.lower().encode()).hex()

    # ------------------------------------------------------------ rows
    def _shops(self, human: str) -> list[str]:
        row = self._db.execute("SELECT shops_enc FROM world_humans WHERE human_key = ?", (human,)).fetchone()
        if row is None:
            return []
        return json.loads(self.box.decrypt(row[0], aad=b"world-human:" + human.encode()))

    def _human_of(self, shop_id: str) -> str | None:
        key = self._shop_key(shop_id)
        row = self._db.execute("SELECT human_enc FROM world_shop_bindings WHERE shop_key = ?", (key,)).fetchone()
        if row is None:
            return None
        try:
            return self.box.decrypt(row[0], aad=b"world-shop:" + key.encode()).decode()
        except DecryptError:
            return None

    def bind(self, shop_id: str, nullifier: str) -> None:
        """Bind `shop_id` to the human behind `nullifier`. Idempotent for the same human; a shop never moves to a
        different human (409). A banned human may still bind (the shop is then refused at offer time)."""
        self.bind_key(shop_id, self.human_key(nullifier))

    def bind_key(self, shop_id: str, human: str, *, ticket: Ticket | None = None) -> None:
        """bind() from an already-derived human_key (a pre-shop eligibility ticket). With `ticket`, it is spent in
        the same transaction: a ticket binds exactly one shop (a retry for that same shop is a no-op success)."""
        shop = shop_id.lower()
        now = int(self.now())
        with self._lock, self._db:
            if ticket is not None:
                self._spend_ticket(ticket, shop, now)
            current = self._human_of(shop)
            if current is not None and current != human:
                raise HumanError("shop_bound_to_other_human")
            shops = self._shops(human)
            if shop not in shops:
                shops.append(shop)
            enc = self.box.encrypt(json.dumps(shops).encode(), aad=b"world-human:" + human.encode())
            self._db.execute(
                "INSERT INTO world_humans (human_key, shops_enc, created_at) VALUES (?, ?, ?) "
                "ON CONFLICT(human_key) DO UPDATE SET shops_enc = excluded.shops_enc", (human, enc, now))
            if current is None:
                key = self._shop_key(shop)
                self._db.execute("INSERT INTO world_shop_bindings VALUES (?, ?, ?)",
                                 (key, self.box.encrypt(human.encode(), aad=b"world-shop:" + key.encode()), now))

    def human_for_shop(self, shop_id: str) -> str | None:
        with self._lock:
            return self._human_of(shop_id)

    def shops_of_shop(self, shop_id: str) -> list[str]:
        """Every shop bound to the same human as `shop_id` (including it); [] when unbound."""
        with self._lock:
            human = self._human_of(shop_id)
            return self._shops(human) if human else []

    def is_banned(self, human: str) -> bool:
        with self._lock:
            row = self._db.execute("SELECT banned FROM world_humans WHERE human_key = ?", (human,)).fetchone()
        return bool(row and row[0])

    def ban(self, human: str, reason: str = "written_off") -> bool:
        """Ban a human (permanent). Returns True when this call changed the state."""
        with self._lock, self._db:
            cur = self._db.execute(
                "UPDATE world_humans SET banned = 1, ban_reason = ?, banned_at = ? WHERE human_key = ? AND banned = 0",
                (reason, int(self.now()), human))
            return cur.rowcount > 0

    def sync_write_offs(self, advances: Iterable[AdvanceState]) -> int:
        """Ban the human behind every bound shop with a written-off advance. Returns how many new bans."""
        new = 0
        for shop in {a.shop_id.lower() for a in advances if a.status == AdvanceStatus.WRITTEN_OFF}:
            human = self.human_for_shop(shop)
            if human and self.ban(human):
                new += 1
        return new

    # ------------------------------------------------------------ pre-shop eligibility tickets
    def issue_ticket(self, human: str, owner: str, expires_at: int) -> str:
        """Opaque AES-GCM blob: {human_key, owner, exp, random id}. Only this server can open it. human_key is
        itself an HMAC of the nullifier, so even the plaintext gives back nothing World-linkable."""
        body = {"v": 1, "h": human, "o": normalize_address(owner), "exp": int(expires_at),
                "id": secrets.token_hex(16)}
        return self.box.encrypt(json.dumps(body, separators=(",", ":")).encode(), aad=TICKET_AAD)

    def open_ticket(self, ticket: object) -> Ticket:
        """Raise HumanError("ticket_invalid" | "ticket_expired")."""
        if not isinstance(ticket, str) or not 0 < len(ticket) <= MAX_TICKET_LEN:
            raise HumanError("ticket_invalid")
        try:
            body = json.loads(self.box.decrypt(ticket, aad=TICKET_AAD))
            t = Ticket(human=str(body["h"]), owner=normalize_address(body["o"]), expires_at=int(body["exp"]),
                       id=str(body["id"]))
        except (DecryptError, ValueError, KeyError, TypeError):
            raise HumanError("ticket_invalid") from None
        if int(self.now()) >= t.expires_at:
            raise HumanError("ticket_expired")
        return t

    def _spend_ticket(self, ticket: Ticket, shop: str, now: int) -> None:
        """Caller holds the lock and the transaction."""
        self._db.execute("DELETE FROM world_tickets_used WHERE expires_at < ?", (now,))
        key = self.box.mac(b"world-ticket", ticket.id.encode()).hex()
        shop_key = self._shop_key(shop)
        row = self._db.execute("SELECT shop_key FROM world_tickets_used WHERE ticket_key = ?", (key,)).fetchone()
        if row is not None and row[0] != shop_key:
            raise HumanError("ticket_used")
        if row is None:
            self._db.execute("INSERT INTO world_tickets_used VALUES (?, ?, ?)", (key, shop_key, ticket.expires_at))

    # ------------------------------------------------------------ the offer signer's red lines
    def eligibility(self, human: str, advances: list[AdvanceState]) -> str | None:
        """The red lines for a human (before or after any shop): HUMAN_BANNED, HUMAN_HAS_OPEN_ADVANCE (an open
        advance on ANY of their shops) or None. Syncs bans from chain state first."""
        self.sync_write_offs(advances)
        if self.is_banned(human):
            return HUMAN_BANNED
        with self._lock:
            shops = set(self._shops(human))
        if any(a.status == AdvanceStatus.ACTIVE and a.shop_id.lower() in shops for a in advances):
            return HUMAN_HAS_OPEN_ADVANCE
        return None

    def check(self, shop_id: str, advances: list[AdvanceState], *, required: bool) -> list[str]:
        """Reason codes (empty = pass). Fail closed: an undecryptable row reads as unverified."""
        human = self.human_for_shop(shop_id)
        if human is None:
            return [HUMAN_NOT_VERIFIED] if required else []
        reason = self.eligibility(human, advances)
        return [reason] if reason else []

    def human_advances(self, shop_id: str, advances: list[AdvanceState]) -> list[AdvanceState]:
        shops = set(self.shops_of_shop(shop_id)) or {shop_id.lower()}
        return [a for a in advances if a.shop_id.lower() in shops]


def message(code: str, lang: str = "en") -> str:
    entry = MESSAGES.get(code)
    return code if entry is None else entry.get(lang, entry["en"])


class HumanBindingService:
    """API-facing: owner-authenticated World ID binding and status. Never returns the nullifier."""

    def __init__(self, verifier, registry: HumanRegistry, reader, *, now: Callable[[], float] = time.time,
                 payments=None):
        self.verifier, self.registry, self.reader, self.now = verifier, registry, reader, now
        self.payments = payments  # callable(advance_ids) -> {id: [(ts, amount)]}; defaults to reader.repayments

    def rp_context(self) -> dict:
        fn = getattr(self.verifier, "rp_context", None)
        if fn is None:
            from .world import WorldError
            raise WorldError("rp_signing_not_configured")
        return fn()

    def owner_ok(self, shop_id: str, authorization: str | None) -> bool:
        parsed = parse_owner_auth(authorization)
        if parsed is None:
            return False
        issued, sig = parsed
        if abs(int(self.now()) - issued) > OWNER_AUTH_TTL:
            return False
        owner = self.reader.shop_owner(shop_id)
        if owner is None:
            raise LookupError("shop not registered")
        try:
            signer = recover_owner(shop_id, self.reader.chain_id, issued, sig)
        except Exception:  # noqa: BLE001 - malformed signature = unauthorized
            return False
        return signer.lower() == owner.lower()

    def bind(self, shop_id: str, payload: dict, authorization: str | None) -> dict:
        if not self.owner_ok(shop_id, authorization):
            raise PermissionError("unauthorized")
        nullifier = self.verifier.verify(payload)  # raises WorldError; the nullifier stays in this frame
        self.registry.bind(shop_id, nullifier)
        return {"verified": True}

    # ------------------------------------------------------------ World ID FIRST (before any business step)
    def check(self, payload: dict, owner: str) -> dict:
        """Pre-shop eligibility: verify the IDKit proof exactly as bind() does, then answer
        {"eligible": true, "ticket", "expires_at"} or {"eligible": false, "reason"}. `owner` is the wallet that will
        own the shop (the burner); the ticket only binds a shop whose onchain owner is that address."""
        owner = normalize_address(owner)
        nullifier = self.verifier.verify(payload)  # raises WorldError; the nullifier stays in this frame
        return self.check_nullifier(nullifier, owner)

    def check_nullifier(self, nullifier: str, owner: str) -> dict:
        """check() after verification (also the devnet simulator's entry when a real World verifier is set)."""
        human = self.registry.human_key(nullifier)
        reason = self.registry.eligibility(human, self.reader.advances())
        if reason is not None:
            return {"eligible": False, "reason": reason}
        expires = int(self.now()) + TICKET_TTL
        return {"eligible": True, "ticket": self.registry.issue_ticket(human, owner, expires), "expires_at": expires}

    def bind_ticket(self, shop_id: str, ticket: str, authorization: str | None) -> dict:
        """Bind with a ticket from check() instead of a second World ID scan. Owner-authenticated, and the ticket's
        owner must be the shop's onchain owner. Single use: a ticket binds one shop (retries for it are no-ops)."""
        if not self.owner_ok(shop_id, authorization):
            raise PermissionError("unauthorized")
        t = self.registry.open_ticket(ticket)
        owner = self.reader.shop_owner(shop_id)
        if owner is None:
            raise LookupError("shop not registered")
        if owner.lower() != t.owner:
            raise HumanError("ticket_owner_mismatch")
        self.registry.bind_key(shop_id, t.human, ticket=t)
        return {"verified": True}

    def status(self, shop_id: str, authorization: str | None = None, tier: int | None = None) -> dict:
        verified = self.registry.human_for_shop(shop_id) is not None
        if authorization is None or not self.owner_ok(shop_id, authorization):
            return {"verified": verified}
        if not verified:
            return {"verified": False, "banned": False, "unlock": None}
        advances = self.reader.advances()
        self.registry.sync_write_offs(advances)
        human = self.registry.human_for_shop(shop_id)
        banned = bool(human and self.registry.is_banned(human))
        mine = self.registry.human_advances(shop_id, advances)
        if tier is None:
            own = [a for a in mine if a.shop_id.lower() == shop_id.lower()]
            tier = max((a.tier for a in own), default=0)
        unlock = None if banned else unlock_for(self.reader, mine, tier, self.payments).view()
        return {"verified": True, "banned": banned, "unlock": unlock}


def unlock_for(reader, human_advances: list[AdvanceState], tier: int, payments=None, now: int | None = None,
               tier_caps=None):
    """compute_unlock with chain inputs. `payments` defaults to reader.repayments (RepaymentSplit logs)."""
    from .unlock import compute_unlock
    caps = tier_caps if tier_caps is not None else reader.limits().tier_cap
    ids = [a.advance_id for a in human_advances]
    fetch = payments or getattr(reader, "repayments", None)
    pays = fetch(ids) if (fetch and ids) else {}
    if now is None:
        now = int(reader.block_timestamp(reader.latest_block())) if hasattr(reader, "latest_block") else int(time.time())
    return compute_unlock(tier=tier, tier_caps=caps, human_advances=human_advances, payments=pays, now=now)


def build_human_services(settings, reader, *, verifier=None) -> tuple[HumanRegistry, HumanBindingService]:
    """Registry + service from settings. Key: AGENT_KEY_ENCRYPTION_KEY (else PAYER_HASH_KEY, dev only)."""
    from .world import make_borrower_verifier
    raw = (settings.agent_key_encryption_key or settings.payer_hash_key).get_secret_value()
    box = SecretBox.from_setting(raw)
    registry = HumanRegistry(box, settings.db_path, action=settings.world_borrower_action)
    return registry, HumanBindingService(verifier or make_borrower_verifier(settings), registry, reader)
