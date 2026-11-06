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

Device flow (auth.world.org `device_authorization_endpoint`): the backend starts the sign-in, holds the device_code
bound to this agent's nonce, and polls World itself, so denied / expired are observed server-side.

Real IDKit path (World ID 4.0): `POST /recovery/rp-context` signs an `rp_context` with WORLD_RP_SIGNING_KEY
(docs.world.org/world-id/idkit/signatures.md) and remembers its nonce; `POST {world_verify_base_url}/api/v4/verify/
{world_rp_id}` gets the IDKit result forwarded as-is with `environment` pinned; success needs `success: true`, all
`results[].success`, matching environment/action/nullifier, and a nonce we issued (single use). The nullifier
(per human, RP and action; decimal or 0x-hex) keys the backup. We store only HMAC(nullifier, action).

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
        if request.get("error") is not None:
            return AgentPassResult(False, "denied")
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


# OAuth error codes (RFC 6749 4.1.2.1 / OIDC Core 3.1.2.6 / RFC 8628 3.5) -> our stable reasons.
_DENIED_ERRORS = {"access_denied", "consent_required", "login_required", "interaction_required",
                  "account_selection_required"}
_EXPIRED_ERRORS = {"expired_token", "invalid_grant"}  # device code expired / auth code expired or already used
_PENDING_ERRORS = {"authorization_pending", "slow_down"}
CLOCK_SKEW = 60
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"


@dataclass
class _DeviceSession:
    device_code: str
    expected_nonce: str
    started_at: int
    expires_at: int
    interval: int
    last_poll: float = 0.0
    result: AgentPassResult | None = None


class OIDCAgentPass:
    """Real Agent Pass check via World ID OIDC (default issuer https://auth.world.org, the "World IdP").

    Two ways for the human to approve, both validated entirely server-side:

    1. Authorization code + PKCE (redirect). The app sends the OIDC `nonce` = agent_pass_nonce(...), then posts
       {"code", "code_verifier"[, "redirect_uri"]} here, or {"error": "access_denied"} if World redirected back with
       an error (that is the DENIED path; nothing reaches the token endpoint then). {"id_token"} is also accepted
       and verified the same way.
    2. Device authorization (RFC 8628; auth.world.org advertises it): `start_device()` returns a
       `verification_uri_complete` to show as a QR/link; the backend polls the token endpoint itself, so
       access_denied / expired_token are observed here, not reported by the app. The approval is bound to the agent
       key + limits because the device_code never leaves this server and is stored with that agent's nonce.

    Never stores or returns `sub`. Upstream error text is never echoed."""

    def __init__(self, *, issuer: str, client_id: str, client_secret: str | None, redirect_uri: str | None,
                 max_age: int, http_get: HttpGet = _default_get, http_post: HttpPost = _default_post,
                 now: Callable[[], float] = time.time, client_auth: str = "client_secret_post",
                 required_acr: list[str] | None = None, device_ttl_cap: int = 900):
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.__secret = client_secret
        self.redirect_uri = redirect_uri
        self.max_age = max_age
        self.http_get, self.http_post, self.now = http_get, http_post, now
        if client_auth not in ("client_secret_post", "client_secret_basic", "none"):
            raise ValueError("WORLD_AGENT_PASS_CLIENT_AUTH must be client_secret_post, client_secret_basic or none")
        self.client_auth = client_auth
        self.required_acr = [a for a in (required_acr or []) if a]
        self.device_ttl_cap = device_ttl_cap
        self._meta: dict | None = None
        self._devices: dict[str, _DeviceSession] = {}
        self._lock = threading.Lock()

    # ---------------------------------------------------------------- plumbing

    def _discovery(self) -> dict:
        if self._meta is None:
            meta = self.http_get(self.issuer + "/.well-known/openid-configuration")
            if str(meta.get("issuer", "")).rstrip("/") != self.issuer:
                raise WorldError("issuer_mismatch")
            self._meta = meta
        return self._meta

    def _client_auth(self, form: dict) -> tuple[dict, dict]:
        """Returns (form, headers) with client authentication applied."""
        form = {**form}
        headers: dict = {}
        if self.client_auth == "client_secret_basic" and self.__secret:
            from urllib.parse import quote
            raw = f"{quote(self.client_id, safe='')}:{quote(self.__secret, safe='')}".encode()
            headers["Authorization"] = "Basic " + base64.b64encode(raw).decode()
        else:
            form["client_id"] = self.client_id
            if self.client_auth == "client_secret_post" and self.__secret:
                form["client_secret"] = self.__secret
        return form, headers

    def _verify_id_token(self, meta: dict, id_token: str, *, expected_nonce: str | None,
                         not_before: int | None = None) -> AgentPassResult:
        claims = verify_rs256_jwt(id_token, self.http_get(meta["jwks_uri"]))
        return self._check_claims(claims, expected_nonce, not_before)

    # ---------------------------------------------------------------- code flow

    def verify(self, request: dict, expected_nonce: str) -> AgentPassResult:
        try:
            if "device_session" in request:
                return self._device_result(request.get("device_session"), expected_nonce)
            err = request.get("error")
            if err is not None:
                # World redirected back with ?error=...: the human declined (or the login could not complete).
                return AgentPassResult(False, "expired" if err in _EXPIRED_ERRORS else "denied")
            meta = self._discovery()
            id_token = request.get("id_token")
            if not id_token:
                code, verifier = request.get("code"), request.get("code_verifier")
                if not isinstance(code, str) or not isinstance(verifier, str):
                    return AgentPassResult(False, "invalid_request")
                redirect = request.get("redirect_uri") or self.redirect_uri
                if self.redirect_uri and redirect != self.redirect_uri:
                    return AgentPassResult(False, "invalid_request")  # only the registered redirect is accepted
                form, headers = self._client_auth({"grant_type": "authorization_code", "code": code,
                                                   "code_verifier": verifier, "redirect_uri": redirect or ""})
                status, body = self.http_post(meta["token_endpoint"], data=form, headers=headers or None)
                if status != 200:
                    e = body.get("error") if isinstance(body, dict) else None
                    if e in _DENIED_ERRORS:
                        return AgentPassResult(False, "denied")
                    if e in _EXPIRED_ERRORS:
                        return AgentPassResult(False, "expired")
                    return AgentPassResult(False, "token_exchange_failed")
                if not isinstance(body.get("id_token"), str):
                    return AgentPassResult(False, "token_exchange_failed")
                id_token = body["id_token"]
            if not isinstance(id_token, str):
                return AgentPassResult(False, "invalid_request")
            return self._verify_id_token(meta, id_token, expected_nonce=expected_nonce)
        except WorldError as e:
            return AgentPassResult(False, e.code)
        except Exception:  # noqa: BLE001 - upstream failure must never approve; never echo upstream text
            log.warning("agent pass verification failed upstream")
            return AgentPassResult(False, "upstream_error")

    def _check_claims(self, c: dict, expected_nonce: str | None, not_before: int | None = None) -> AgentPassResult:
        now = int(self.now())
        aud = c.get("aud")
        auds = aud if isinstance(aud, list) else [aud]
        if str(c.get("iss", "")).rstrip("/") != self.issuer or self.client_id not in auds:
            return AgentPassResult(False, "invalid_token")
        if c.get("azp") is not None and c.get("azp") != self.client_id:
            return AgentPassResult(False, "invalid_token")
        exp, iat = c.get("exp"), c.get("iat")
        if not _is_int(exp) or exp <= now:
            return AgentPassResult(False, "expired")
        if iat is not None and (not _is_int(iat) or iat > now + CLOCK_SKEW):
            return AgentPassResult(False, "invalid_token")
        authed = c.get("auth_time", iat)
        if not _is_int(authed) or now - authed > self.max_age:
            return AgentPassResult(False, "expired")
        if not_before is not None and authed < not_before - CLOCK_SKEW:
            return AgentPassResult(False, "expired")  # a login from before this approval request started
        if expected_nonce is not None and not secrets.compare_digest(str(c.get("nonce", "")), expected_nonce):
            return AgentPassResult(False, "nonce_mismatch")
        if self.required_acr and c.get("acr") not in self.required_acr:
            return AgentPassResult(False, "insufficient_assurance")
        if not c.get("sub"):
            return AgentPassResult(False, "invalid_token")
        return AgentPassResult(True, "approved")

    # ---------------------------------------------------------------- device flow

    def start_device(self, expected_nonce: str) -> dict:
        """Begin a device-authorization approval for one agent (bound to its agent_pass_nonce)."""
        try:
            meta = self._discovery()
            endpoint = meta.get("device_authorization_endpoint")
            if not endpoint:
                raise WorldError("device_flow_unsupported")
            form, headers = self._client_auth({"scope": "openid"})
            status, body = self.http_post(endpoint, data=form, headers=headers or None)
        except WorldError:
            raise
        except Exception:  # noqa: BLE001
            log.warning("agent pass device authorization failed upstream")
            raise WorldError("upstream_error") from None
        if status != 200 or not isinstance(body.get("device_code"), str):
            raise WorldError("upstream_error")
        now = int(self.now())
        ttl = body.get("expires_in") if _is_int(body.get("expires_in")) else 600
        interval = body.get("interval") if _is_int(body.get("interval")) else 5
        sid = secrets.token_urlsafe(24)
        with self._lock:
            for k in [k for k, d in self._devices.items() if d.expires_at + 3600 < now]:
                del self._devices[k]
            if len(self._devices) > 10_000:
                raise WorldError("rate_limited")
            self._devices[sid] = _DeviceSession(body["device_code"], expected_nonce, now,
                                                now + min(int(ttl), self.device_ttl_cap), max(1, int(interval)))
        uri = body.get("verification_uri_complete") or body.get("verification_uri")
        if not isinstance(uri, str) or not uri.startswith("https://"):
            raise WorldError("upstream_error")
        return {"device_session": sid, "verification_uri": uri,
                "user_code": body.get("user_code") if isinstance(body.get("user_code"), str) else None,
                "expires_at": now + min(int(ttl), self.device_ttl_cap), "interval": max(1, int(interval))}

    def poll_device(self, sid: object, expected_nonce: str) -> str:
        """Poll once (throttled to the server's interval). Returns "pending" or "done" (result cached)."""
        with self._lock:
            d = self._devices.get(sid) if isinstance(sid, str) else None
        if d is None:
            raise WorldError("not_found")
        if not secrets.compare_digest(d.expected_nonce, expected_nonce):
            raise WorldError("nonce_mismatch")
        if d.result is not None:
            return "done"
        now = self.now()
        if now >= d.expires_at:
            d.result = AgentPassResult(False, "expired")
            return "done"
        if now - d.last_poll < d.interval:
            return "pending"
        d.last_poll = now
        try:
            meta = self._discovery()
            form, headers = self._client_auth({"grant_type": DEVICE_GRANT, "device_code": d.device_code})
            status, body = self.http_post(meta["token_endpoint"], data=form, headers=headers or None)
            if status == 200 and isinstance(body.get("id_token"), str):
                d.result = self._verify_id_token(meta, body["id_token"], expected_nonce=None, not_before=d.started_at)
            else:
                e = body.get("error") if isinstance(body, dict) else None
                if e in _PENDING_ERRORS:
                    if e == "slow_down":
                        d.interval += 5
                    return "pending"
                d.result = AgentPassResult(False, "denied" if e in _DENIED_ERRORS else
                                           "expired" if e in _EXPIRED_ERRORS else "token_exchange_failed")
        except WorldError as e:
            d.result = AgentPassResult(False, e.code)
        except Exception:  # noqa: BLE001 - transient: keep pending, never approve
            log.warning("agent pass device poll failed upstream")
            return "pending"
        return "done"

    def _device_result(self, sid: object, expected_nonce: str) -> AgentPassResult:
        state = self.poll_device(sid, expected_nonce)
        if state == "pending":
            return AgentPassResult(False, "pending")
        with self._lock:
            d = self._devices.pop(sid)  # single use
        return d.result  # type: ignore[return-value]


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def make_agent_pass_verifier(settings) -> AgentPassVerifier:
    if settings.world_mock:
        return MockAgentPass()
    if not settings.world_agent_pass_client_id:
        raise ValueError("WORLD_AGENT_PASS_CLIENT_ID is not configured")
    secret = settings.world_agent_pass_client_secret
    return OIDCAgentPass(issuer=settings.world_agent_pass_issuer, client_id=settings.world_agent_pass_client_id,
                         client_secret=secret.get_secret_value() if secret else None,
                         redirect_uri=settings.world_agent_pass_redirect_uri,
                         max_age=settings.agent_pass_max_age_seconds,
                         client_auth=settings.world_agent_pass_client_auth,
                         required_acr=[a.strip() for a in (settings.world_agent_pass_acr or "").split(",")])


# ------------------------------------------------------------------ IDKit (credential recovery)
#
# World ID 4.0 (docs.world.org/world-id/idkit/signatures.md): every IDKit 4 request carries an `rp_context` signed by
# the RP's `signing_key`. We sign it here (WORLD_RP_SIGNING_KEY never reaches the browser) and remember the nonce, so a
# recovery verification is only accepted for a request WE issued, once.


def hash_to_field(data: bytes) -> bytes:
    """keccak256(data) >> 8, as 32 bytes big-endian (World ID's hash_to_field)."""
    return (int.from_bytes(keccak(data), "big") >> 8).to_bytes(32, "big")


def rp_signature_message(nonce: bytes, created_at: int, expires_at: int, action: str | None = None) -> bytes:
    msg = b"\x01" + nonce + created_at.to_bytes(8, "big") + expires_at.to_bytes(8, "big")
    return msg + hash_to_field(action.encode()) if action is not None else msg


def sign_rp_request(signing_key_hex: str, action: str | None, *, created_at: int, ttl: int = 300,
                    random: bytes | None = None) -> dict:
    from eth_account.messages import encode_defunct

    key = signing_key_hex[2:] if signing_key_hex.startswith(("0x", "0X")) else signing_key_hex
    if len(bytes.fromhex(key)) != 32:
        raise ValueError("WORLD_RP_SIGNING_KEY must be 32 bytes hex")
    nonce = hash_to_field(random if random is not None else secrets.token_bytes(32))
    expires_at = created_at + ttl
    msg = rp_signature_message(nonce, created_at, expires_at, action)
    signed = Account.sign_message(encode_defunct(primitive=msg), "0x" + key)  # EIP-191, v = 27/28
    return {"sig": "0x" + signed.signature.hex().removeprefix("0x"), "nonce": "0x" + nonce.hex(),
            "created_at": created_at, "expires_at": expires_at}


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

    def rp_context(self) -> dict:
        return {"mock": True, "action": self.action}


def _parse_nullifier(x: object) -> int:
    """World docs return 0x-hex; idkit-core 4.x types say decimal. Accept both, strictly."""
    if isinstance(x, str):
        if x[:2] in ("0x", "0X") and 3 <= len(x) <= 66:
            return int(x, 16)
        if x.isdigit() and len(x) <= 78:
            return int(x, 10)
    raise WorldError("invalid_request")


class IDKitVerifier:
    """Real path: forward the IDKit result to World's v4 verify endpoint (`/api/v4/verify/{rp_id}`), unchanged except
    that `environment` is pinned to ours (untrusted input must not select staging/sandbox)."""

    def __init__(self, *, app_id: str, action: str, environment: str, base_url: str,
                 http_post: HttpPost = _default_post, rp_id: str | None = None, signing_key: str | None = None,
                 rp_ttl: int = 300, now: Callable[[], float] = time.time):
        self.app_id, self.action, self.environment = app_id, action, environment
        self.rp_id = rp_id or app_id  # docs: use rp_id; app_id still accepted for backward compatibility
        self.base_url = base_url.rstrip("/")
        self.http_post = http_post
        self.__signing_key = signing_key
        self.rp_ttl, self.now = rp_ttl, now
        self._issued: dict[str, int] = {}  # nonce -> expires_at (only when we sign rp_context)
        self._lock = threading.Lock()

    def rp_context(self) -> dict:
        """What the app passes to IDKit.request({app_id, action, rp_context, environment})."""
        if not self.__signing_key:
            raise WorldError("rp_signing_not_configured")
        now = int(self.now())
        sig = sign_rp_request(self.__signing_key, self.action, created_at=now, ttl=self.rp_ttl)
        with self._lock:
            for n in [n for n, e in self._issued.items() if e + CLOCK_SKEW < now]:
                del self._issued[n]
            if len(self._issued) > 50_000:
                raise WorldError("rate_limited")
            self._issued[sig["nonce"]] = sig["expires_at"]
        return {"app_id": self.app_id, "action": self.action, "environment": self.environment,
                "rp_context": {"rp_id": self.rp_id, "nonce": sig["nonce"], "created_at": sig["created_at"],
                               "expires_at": sig["expires_at"], "signature": sig["sig"]}}

    def _consume_nonce(self, nonce: object) -> None:
        if not self.__signing_key:
            return  # legacy (3.0) config without RP signing: World's verify is the only check
        if not isinstance(nonce, str):
            raise WorldError("invalid_request")
        with self._lock:
            exp = self._issued.pop(nonce.lower(), None)
        if exp is None or exp + CLOCK_SKEW < int(self.now()):
            raise WorldError("unknown_or_used_nonce")

    def verify(self, payload: dict) -> str:
        if payload.get("action") != self.action:
            raise WorldError("wrong_action")
        if payload.get("environment", self.environment) != self.environment:
            raise WorldError("wrong_environment")
        responses = payload.get("responses")
        if not isinstance(responses, list) or not responses or not isinstance(responses[0], dict):
            raise WorldError("invalid_request")
        client_nullifier = _parse_nullifier(responses[0].get("nullifier"))
        self._consume_nonce(payload.get("nonce"))
        try:
            status, body = self.http_post(f"{self.base_url}/api/v4/verify/{self.rp_id}",
                                          json={**payload, "environment": self.environment})
        except Exception:  # noqa: BLE001 - network error: fail closed, no upstream text
            raise WorldError("upstream_error") from None
        if status != 200 or not isinstance(body, dict) or body.get("success") is not True:
            raise WorldError("verification_failed")
        if body.get("environment", self.environment) != self.environment:
            raise WorldError("wrong_environment")
        if body.get("action", self.action) != self.action:
            raise WorldError("wrong_action")
        results = body.get("results")
        if results is not None and (not isinstance(results, list) or not results or not all(
                isinstance(r, dict) and r.get("success") is True for r in results)):
            raise WorldError("verification_failed")
        # Prefer the nullifier World returns; it must agree with the one in the proof.
        trusted = body.get("nullifier") or (results[0].get("nullifier") if results else None)
        n = _parse_nullifier(trusted) if trusted is not None else client_nullifier
        if n != client_nullifier:
            raise WorldError("verification_failed")
        return "0x" + format(n, "064x")


def make_recovery_verifier(settings) -> RecoveryVerifier:
    if settings.world_mock:
        return MockIDKit(settings.world_recovery_action)
    if not settings.world_app_id:
        raise ValueError("WORLD_APP_ID is not configured")
    key = settings.world_rp_signing_key
    return IDKitVerifier(app_id=settings.world_app_id, action=settings.world_recovery_action,
                         environment=settings.world_environment, base_url=settings.world_verify_base_url,
                         rp_id=settings.world_rp_id, signing_key=key.get_secret_value() if key else None,
                         rp_ttl=settings.world_rp_signature_ttl_seconds)


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

    def rp_context(self) -> dict:
        """Signed IDKit 4 request context (or the mock marker). See IDKitVerifier.rp_context."""
        fn = getattr(self.verifier, "rp_context", None)
        if fn is None:
            raise WorldError("rp_signing_not_configured")
        return fn()

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

