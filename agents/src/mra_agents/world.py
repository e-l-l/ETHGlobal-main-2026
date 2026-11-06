"""World at the two human moments (docs/privacy-architecture.md section 3):

1. **Agent Pass**: a real, consenting human authorises the merchant's managed agent ONCE, with limits.
   On approval our **attester** signs an EIP-712 `AgentPassAttestation` that `AdvanceBook.registerMandate`
   checks. Denied or expired means no attestation, so no mandate and no automatic draws.
2. **IDKit credential recovery**: only the same human (same World nullifier for action
   `credential-recovery-v1`) can fetch their client-side-encrypted credential backup.

Both have a MOCK mode (`WORLD_MOCK=1`, the default) for offline demos and tests.

Real Agent Pass path (World ID OIDC, auth.world.org): the app runs the authorization-code flow with PKCE,
passing `nonce = agent_pass_nonce(agentKey, limitsHash, attestationNonce)`, so the human's approval is bound
to *this* agent key and *these* limits. Our backend exchanges the code at the token endpoint from discovery
(client_secret_post), then verifies the RS256 `id_token` against the issuer's JWKS: `iss`, `aud`, `exp`,
`nonce`, and freshness (`auth_time` or `iat` within `agent_pass_max_age_seconds`). We never store `sub`.

Real IDKit path: `POST {world_verify_base_url}/api/v4/verify/{world_app_id}` with the IDKit result
forwarded as-is; success needs `success: true`. The nullifier (per human, app and action) keys the backup.
We store only HMAC(nullifier, action), never the raw nullifier.

Signatures (EIP-712 domain: name "AdvanceBook", version "1", chainId, verifyingContract = AdvanceBook):
  Limits(uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry)
  limitsHash = keccak256(abi.encode(LIMITS_TYPEHASH, maxPerDraw, maxPerPeriod, period, expiry))
  AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import secrets
import sqlite3
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak, to_checksum_address
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from .secretbox import SecretBox

log = logging.getLogger(__name__)

UINT64_MAX = 2**64 - 1
LIMITS_TYPE = "Limits(uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry)"
LIMITS_TYPEHASH = keccak(text=LIMITS_TYPE)
ATTESTATION_FIELDS = [
    {"name": "agentKey", "type": "address"},
    {"name": "limitsHash", "type": "bytes32"},
    {"name": "nonce", "type": "uint256"},
    {"name": "expiry", "type": "uint64"},
]
ATTESTATION_TYPE = "AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)"

# Business bounds on what a merchant may authorise (the contract enforces its own caps too).
MIN_DRAW = 50_000_000
MAX_DRAW = 500_000_000
MAX_PER_PERIOD = 2_000_000_000
MIN_PERIOD = 86_400
MAX_PERIOD = 90 * 86_400
MAX_MANDATE_LIFETIME = 180 * 86_400


class WorldError(ValueError):
    """Rejected World interaction. `code` is a stable, user-showable reason (no secrets)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ------------------------------------------------------------------ limits + EIP-712


class Limits(BaseModel):
    """Mirrors the Solidity `Limits` struct. USDC base units (6 decimals); seconds."""
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)
    max_per_draw: StrictInt = Field(ge=MIN_DRAW, le=MAX_DRAW)
    max_per_period: StrictInt = Field(ge=MIN_DRAW, le=MAX_PER_PERIOD)
    period: StrictInt = Field(ge=MIN_PERIOD, le=MAX_PERIOD)
    expiry: StrictInt = Field(ge=0, le=UINT64_MAX)

    @model_validator(mode="after")
    def _consistent(self):
        if self.max_per_period < self.max_per_draw:
            raise ValueError("max_per_period must be >= max_per_draw")
        return self

    def check_expiry(self, now: int) -> None:
        if not now < self.expiry <= now + MAX_MANDATE_LIFETIME:
            raise WorldError("bad_mandate_expiry")

    def solidity(self) -> dict:
        return {"maxPerDraw": self.max_per_draw, "maxPerPeriod": self.max_per_period,
                "period": self.period, "expiry": self.expiry}


def limits_hash(limits: Limits) -> str:
    enc = abi_encode(["bytes32", "uint256", "uint256", "uint64", "uint64"],
                     [LIMITS_TYPEHASH, limits.max_per_draw, limits.max_per_period, limits.period, limits.expiry])
    return "0x" + keccak(enc).hex()


def _domain(chain_id: int, verifying_contract: str) -> dict:
    return {"name": "AdvanceBook", "version": "1", "chainId": chain_id,
            "verifyingContract": to_checksum_address(verifying_contract)}


def attestation_message(agent_key: str, lhash: str, nonce: int, expiry: int, chain_id: int,
                        verifying_contract: str):
    return encode_typed_data(
        domain_data=_domain(chain_id, verifying_contract),
        message_types={"AgentPassAttestation": ATTESTATION_FIELDS},
        message_data={"agentKey": to_checksum_address(agent_key), "limitsHash": lhash, "nonce": nonce,
                      "expiry": expiry},
    )


def typed_digest(message) -> str:
    return "0x" + keccak(b"\x19" + message.version + message.header + message.body).hex()


def agent_pass_nonce(agent_key: str, lhash: str, nonce: int) -> str:
    """OIDC `nonce` the app must send to World: binds the human's approval to this key + these limits."""
    enc = abi_encode(["address", "bytes32", "uint256"], [to_checksum_address(agent_key), bytes.fromhex(lhash[2:]),
                                                        nonce])
    return keccak(enc).hex()


class Attester:
    """Holds ATTESTER_PRIVATE_KEY. Signs only after an approved Agent Pass. Holds no funds."""

    def __init__(self, private_key: str, chain_id: int, verifying_contract: str):
        self.__key = private_key
        self.address = Account.from_key(private_key).address
        self.chain_id = chain_id
        self.verifying_contract = verifying_contract

    def sign(self, agent_key: str, limits: Limits, nonce: int, expiry: int) -> dict:
        lhash = limits_hash(limits)
        msg = attestation_message(agent_key, lhash, nonce, expiry, self.chain_id, self.verifying_contract)
        signed = Account.sign_message(msg, self.__key)
        return {
            "attestation": {"agentKey": to_checksum_address(agent_key), "limitsHash": lhash, "nonce": str(nonce),
                            "expiry": expiry},
            "limits": {k: str(v) if k.startswith("max") else v for k, v in limits.solidity().items()},
            "signature": "0x" + signed.signature.hex(),
            "digest": "0x" + signed.message_hash.hex(),
            "attester": self.address,
            "chain_id": self.chain_id,
            "verifying_contract": to_checksum_address(self.verifying_contract),
        }


def recover_attestation_signer(attestation: dict, signature: str, chain_id: int, verifying_contract: str) -> str:
    msg = attestation_message(attestation["agentKey"], attestation["limitsHash"], int(attestation["nonce"]),
                              int(attestation["expiry"]), chain_id, verifying_contract)
    return Account.recover_message(msg, signature=signature)


# ------------------------------------------------------------------ Agent Pass validation


@dataclass(frozen=True)
class AgentPassResult:
    approved: bool
    reason: str  # "approved" | "denied" | "expired" | "nonce_mismatch" | "invalid_token" | ...


class AgentPassVerifier(Protocol):
    def verify(self, request: dict, expected_nonce: str) -> AgentPassResult: ...


class MockAgentPass:
    """WORLD_MOCK=1: request {"mock": "approve" | "deny" | "expire"}."""

    def verify(self, request: dict, expected_nonce: str) -> AgentPassResult:
        outcome = request.get("mock")
        if outcome == "approve":
            return AgentPassResult(True, "approved")
        if outcome == "deny":
            return AgentPassResult(False, "denied")
        if outcome == "expire":
            return AgentPassResult(False, "expired")
        return AgentPassResult(False, "invalid_request")


def _b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_rs256_jwt(token: str, jwks: dict) -> dict:
    """Verify an RS256 JWT against a JWKS and return its claims (signature only; claims checked by caller)."""
    from Crypto.Hash import SHA256
    from Crypto.PublicKey import RSA
    from Crypto.Signature import pkcs1_15

    try:
        h64, p64, s64 = token.split(".")
        header = json.loads(_b64url(h64))
        claims = json.loads(_b64url(p64))
        sig = _b64url(s64)
    except (ValueError, binascii.Error, json.JSONDecodeError):
        raise WorldError("invalid_token") from None
    if header.get("alg") != "RS256":
        raise WorldError("invalid_token")
    keys = [k for k in jwks.get("keys", []) if k.get("kty") == "RSA"
            and (header.get("kid") is None or k.get("kid") == header.get("kid"))]
    for k in keys:
        try:
            n = int.from_bytes(_b64url(k["n"]), "big")
            e = int.from_bytes(_b64url(k["e"]), "big")
            pkcs1_15.new(RSA.construct((n, e))).verify(SHA256.new(f"{h64}.{p64}".encode()), sig)
            return claims
        except (ValueError, KeyError, TypeError):
            continue
    raise WorldError("invalid_token")


HttpGet = Callable[[str], dict]
HttpPost = Callable[..., tuple[int, dict]]  # (url, *, data=None, json=None, headers=None) -> (status, body)


def _default_get(url: str) -> dict:
    import httpx
    r = httpx.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def _default_post(url: str, *, data=None, json=None, headers=None) -> tuple[int, dict]:
    import httpx
    r = httpx.post(url, data=data, json=json, headers=headers, timeout=10)
    try:
        body = r.json()
    except ValueError:
        body = {}
    return r.status_code, body


class OIDCAgentPass:
    """Real Agent Pass check via World ID OIDC. Request: {"code", "code_verifier", "redirect_uri"?} or
    {"id_token"} (if the app already completed the exchange; the token is verified the same way)."""

    def __init__(self, *, issuer: str, client_id: str, client_secret: str | None, redirect_uri: str | None,
                 max_age: int, http_get: HttpGet = _default_get, http_post: HttpPost = _default_post,
                 now: Callable[[], float] = time.time):
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.__secret = client_secret
        self.redirect_uri = redirect_uri
        self.max_age = max_age
        self.http_get, self.http_post, self.now = http_get, http_post, now
        self._meta: dict | None = None

    def _discovery(self) -> dict:
        if self._meta is None:
            meta = self.http_get(self.issuer + "/.well-known/openid-configuration")
            if meta.get("issuer", "").rstrip("/") != self.issuer:
                raise WorldError("issuer_mismatch")
            self._meta = meta
        return self._meta

    def verify(self, request: dict, expected_nonce: str) -> AgentPassResult:
        try:
            meta = self._discovery()
            id_token = request.get("id_token")
            if not id_token:
                code, verifier = request.get("code"), request.get("code_verifier")
                if not isinstance(code, str) or not isinstance(verifier, str):
                    return AgentPassResult(False, "invalid_request")
                form = {"grant_type": "authorization_code", "code": code, "code_verifier": verifier,
                        "redirect_uri": request.get("redirect_uri") or self.redirect_uri or "",
                        "client_id": self.client_id}
                if self.__secret:
                    form["client_secret"] = self.__secret
                status, body = self.http_post(meta["token_endpoint"], data=form)
                if status == 400 and body.get("error") in ("access_denied", "invalid_grant"):
                    return AgentPassResult(False, "denied")
                if status != 200 or not isinstance(body.get("id_token"), str):
                    return AgentPassResult(False, "token_exchange_failed")
                id_token = body["id_token"]
            if not isinstance(id_token, str):
                return AgentPassResult(False, "invalid_request")
            claims = verify_rs256_jwt(id_token, self.http_get(meta["jwks_uri"]))
            return self._check_claims(claims, expected_nonce)
        except WorldError as e:
            return AgentPassResult(False, e.code)
        except Exception:  # noqa: BLE001 - upstream failure must never approve; never echo upstream text
            log.warning("agent pass verification failed upstream")
            return AgentPassResult(False, "upstream_error")

    def _check_claims(self, c: dict, expected_nonce: str) -> AgentPassResult:
        now = int(self.now())
        aud = c.get("aud")
        auds = aud if isinstance(aud, list) else [aud]
        if str(c.get("iss", "")).rstrip("/") != self.issuer or self.client_id not in auds:
            return AgentPassResult(False, "invalid_token")
        if not isinstance(c.get("exp"), int) or c["exp"] <= now:
            return AgentPassResult(False, "expired")
        authed = c.get("auth_time", c.get("iat"))
        if not isinstance(authed, int) or now - authed > self.max_age:
            return AgentPassResult(False, "expired")
        if not secrets.compare_digest(str(c.get("nonce", "")), expected_nonce):
            return AgentPassResult(False, "nonce_mismatch")
        if not c.get("sub"):
            return AgentPassResult(False, "invalid_token")
        return AgentPassResult(True, "approved")


def make_agent_pass_verifier(settings) -> AgentPassVerifier:
    if settings.world_mock:
        return MockAgentPass()
    if not settings.world_agent_pass_client_id:
        raise ValueError("WORLD_AGENT_PASS_CLIENT_ID is not configured")
    secret = settings.world_agent_pass_client_secret
    return OIDCAgentPass(issuer=settings.world_agent_pass_issuer, client_id=settings.world_agent_pass_client_id,
                         client_secret=secret.get_secret_value() if secret else None,
                         redirect_uri=settings.world_agent_pass_redirect_uri,
                         max_age=settings.agent_pass_max_age_seconds)


# ------------------------------------------------------------------ IDKit (credential recovery)


class RecoveryVerifier(Protocol):
    def verify(self, payload: dict) -> str:
        """Return the World nullifier (0x-hex) for the recovery action, or raise WorldError."""
        ...


class MockIDKit:
    """WORLD_MOCK=1: payload {"mock": "approve" | "deny", "mock_human": "<any label>"}. The same label
    always yields the same nullifier, like the same human verifying the same action."""

    def __init__(self, action: str):
        self.action = action

    def verify(self, payload: dict) -> str:
        if payload.get("mock") != "approve":
            raise WorldError("verification_failed")
        human = payload.get("mock_human")
        if not isinstance(human, str) or not 1 <= len(human) <= 64:
            raise WorldError("invalid_request")
        return "0x" + keccak(f"mock-world:{human}:{self.action}".encode()).hex()


class IDKitVerifier:
    """Real path: forward the IDKit result to World's v4 verify endpoint, unchanged."""

    def __init__(self, *, app_id: str, action: str, environment: str, base_url: str,
                 http_post: HttpPost = _default_post):
        self.app_id, self.action, self.environment = app_id, action, environment
        self.base_url = base_url.rstrip("/")
        self.http_post = http_post

    def verify(self, payload: dict) -> str:
        if payload.get("action") != self.action:
            raise WorldError("wrong_action")
        if payload.get("environment") != self.environment:
            raise WorldError("wrong_environment")
        responses = payload.get("responses")
        if not isinstance(responses, list) or not responses or not isinstance(responses[0], dict):
            raise WorldError("invalid_request")
        nullifier = responses[0].get("nullifier")
        if not isinstance(nullifier, str) or not nullifier.startswith("0x") or not 3 <= len(nullifier) <= 66:
            raise WorldError("invalid_request")
        try:
            int(nullifier, 16)
            status, body = self.http_post(f"{self.base_url}/api/v4/verify/{self.app_id}", json=payload)
        except ValueError:
            raise WorldError("invalid_request") from None
        except Exception:  # noqa: BLE001 - network error: fail closed, no upstream text
            raise WorldError("upstream_error") from None
        if status != 200 or body.get("success") is not True:
            raise WorldError("verification_failed")
        if body.get("environment", self.environment) != self.environment:
            raise WorldError("wrong_environment")
        return "0x" + format(int(nullifier, 16), "064x")


def make_recovery_verifier(settings) -> RecoveryVerifier:
    if settings.world_mock:
        return MockIDKit(settings.world_recovery_action)
    if not settings.world_app_id:
        raise ValueError("WORLD_APP_ID is not configured")
    return IDKitVerifier(app_id=settings.world_app_id, action=settings.world_recovery_action,
                         environment=settings.world_environment, base_url=settings.world_verify_base_url)


MAX_BACKUP_BYTES = 64 * 1024

_BACKUP_SCHEMA = """
CREATE TABLE IF NOT EXISTS credential_backups (
    owner_key  TEXT PRIMARY KEY,   -- HMAC(server key, nullifier || action); never the raw nullifier
    blob_enc   TEXT NOT NULL,      -- server AES-GCM over the client-encrypted blob (opaque to us)
    updated_at INTEGER NOT NULL
);
"""


class RecoveryService:
    """Verify a human -> short-lived recovery token -> PUT/GET their opaque, client-encrypted backup.

    The blob is encrypted on the device before upload; we never hold that key and never parse the blob.
    We wrap it once more at rest (AES-GCM, AAD = owner key) so a DB dump alone reveals nothing either."""

    def __init__(self, verifier: RecoveryVerifier, box: SecretBox, db_path: Path | str, *, action: str,
                 token_ttl: int = 600, now: Callable[[], float] = time.time):
        self.verifier, self.box, self.action, self.token_ttl, self.now = verifier, box, action, token_ttl, now
        self._lock = threading.Lock()
        if str(db_path) != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
        with self._lock:
            self._db.executescript(_BACKUP_SCHEMA)

    def _owner_key(self, nullifier: str) -> str:
        n = int(nullifier, 16).to_bytes(32, "big")
        return self.box.mac(b"recovery-owner", n + self.action.encode()).hex()

    def verify(self, payload: dict) -> dict:
        nullifier = self.verifier.verify(payload)
        owner = self._owner_key(nullifier)
        exp = int(self.now()) + self.token_ttl
        body = base64.urlsafe_b64encode(json.dumps({"o": owner, "e": exp}).encode()).decode().rstrip("=")
        mac = base64.urlsafe_b64encode(self.box.mac(b"recovery-token", body.encode())).decode().rstrip("=")
        with self._lock:
            has = self._db.execute("SELECT 1 FROM credential_backups WHERE owner_key = ?", (owner,)).fetchone()
        return {"recovery_token": f"{body}.{mac}", "expires_at": exp, "has_backup": bool(has)}

    def _owner_from_token(self, token: str) -> str:
        try:
            body, mac = token.split(".")
            want = base64.urlsafe_b64encode(self.box.mac(b"recovery-token", body.encode())).decode().rstrip("=")
            if not secrets.compare_digest(mac, want):
                raise WorldError("invalid_token")
            data = json.loads(_b64url(body))
        except (ValueError, AttributeError, binascii.Error, json.JSONDecodeError):
            raise WorldError("invalid_token") from None
        if not isinstance(data.get("e"), int) or data["e"] <= int(self.now()):
            raise WorldError("token_expired")
        return str(data["o"])

    def put_backup(self, token: str, blob: bytes) -> None:
        owner = self._owner_from_token(token)
        if not 1 <= len(blob) <= MAX_BACKUP_BYTES:
            raise WorldError("bad_backup_size")
        enc = self.box.encrypt(blob, aad=b"backup:" + owner.encode())
        with self._lock, self._db:
            self._db.execute("INSERT OR REPLACE INTO credential_backups VALUES (?, ?, ?)",
                             (owner, enc, int(self.now())))

    def get_backup(self, token: str) -> bytes:
        owner = self._owner_from_token(token)
        with self._lock:
            row = self._db.execute("SELECT blob_enc FROM credential_backups WHERE owner_key = ?",
                                   (owner,)).fetchone()
        if row is None:
            raise LookupError("no backup")
        return self.box.decrypt(row[0], aad=b"backup:" + owner.encode())

