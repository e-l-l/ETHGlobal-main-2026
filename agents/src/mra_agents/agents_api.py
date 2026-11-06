"""HTTP routes for managed merchant agents and World credential recovery (mounted by api.create_app).

Auth:
  * /agents/{id}/*  : `Authorization: Bearer <manage_token>` (returned ONCE by POST /agents; we store its sha256)
  * /recovery/backup: `Authorization: Bearer <recovery_token>` (from POST /recovery/verify; short-lived)
Errors: stable codes only ({"detail": "<code>"}); upstream/exception text never reaches a response.
Responses never include agent private keys, ciphertexts, token hashes, or any configured secret.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import threading
import time
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Path, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from .merchant_agents import AgentError
from .models import Address, Hex32
from .world import MAX_BACKUP_BYTES, Limits, WorldError, agent_pass_nonce, limits_hash

log = logging.getLogger(__name__)

AgentId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
WRITE_LIMIT, READ_LIMIT, WINDOW = 10, 60, 60.0
MAX_IDKIT_PAYLOAD = 32 * 1024


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LimitsIn(_In):
    max_per_draw: StrictInt
    max_per_period: StrictInt
    period: StrictInt
    expiry: StrictInt


class CreateAgentIn(_In):
    shop_id: Hex32
    tier: Annotated[StrictInt, Field(ge=0, le=3)]
    recipient: Address
    limits: LimitsIn


class AgentPassIn(_In):
    mock: Literal["approve", "deny", "expire"] | None = None
    code: Annotated[str, Field(min_length=1, max_length=2048)] | None = None
    code_verifier: Annotated[str, Field(min_length=43, max_length=128)] | None = None
    redirect_uri: Annotated[str, Field(max_length=512)] | None = None
    id_token: Annotated[str, Field(min_length=1, max_length=8192)] | None = None
    # World redirected back with ?error=... (the human declined): recorded as denied, no attestation.
    error: Annotated[str, Field(pattern=r"^[a-z_]{1,64}$")] | None = None
    # Device flow: the session from POST /agents/{id}/agent-pass/device.
    device_session: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{16,64}$")] | None = None


class ActivateIn(_In):
    mandate_id: StrictInt | Annotated[str, Field(pattern=r"^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$")]
    tx_hash: Hex32 | None = None

    def mandate_int(self) -> int:
        v = self.mandate_id
        return v if isinstance(v, int) else int(v, 16) if v.startswith("0x") else int(v)


class TriggerIn(_In):
    run_now: StrictBool = False


class RecoveryVerifyIn(_In):
    idkit: dict  # IDKit result forwarded as-is (or the mock payload in WORLD_MOCK mode)


class BackupIn(_In):
    ciphertext: Annotated[str, Field(min_length=4, max_length=(MAX_BACKUP_BYTES * 4) // 3 + 8)]


class _Limiter:
    def __init__(self):
        self.events: dict[tuple, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, keys: list[tuple], limit: int) -> None:
        now = time.monotonic()
        with self.lock:
            for k in list(self.events):
                q = self.events[k]
                while q and q[0] <= now - WINDOW:
                    q.popleft()
                if not q:
                    del self.events[k]
            if any(len(self.events[k]) >= limit for k in keys):
                raise HTTPException(429, "rate_limited")
            for k in keys:
                self.events[k].append(now)


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.startswith("Bearer ") and len(authorization) < 1024:
        return authorization[7:].strip() or None
    return None


def build_router(merchant, recovery) -> APIRouter:
    r = APIRouter()
    limiter = _Limiter()

    def limit(request: Request, kind: str, extra: str | None = None) -> None:
        ip = request.client.host if request.client else "unknown"
        keys = [(kind, "ip", ip)] + ([(kind, "key", extra)] if extra else [])
        limiter.check(keys, WRITE_LIMIT if kind == "w" else READ_LIMIT)

    def call(fn, *a, **kw):
        try:
            return fn(*a, **kw)
        except HTTPException:
            raise
        except (AgentError, WorldError) as e:
            raise HTTPException(400, e.code) from None
        except LookupError:
            raise HTTPException(404, "not_found") from None
        except ValueError:
            raise HTTPException(400, "invalid_request") from None
        except Exception as e:  # noqa: BLE001 - API boundary: never leak upstream errors
            log.warning("agents api upstream failure: %s", type(e).__name__)
            raise HTTPException(502, "upstream_failed") from None

    def auth_agent(agent_id: str, authorization: str | None) -> None:
        if not call(merchant.store.check_token, agent_id, _bearer(authorization)):
            raise HTTPException(401, "unauthorized")

    # ---------------------------------------------------------------- agents

    @r.post("/agents", status_code=201)
    def create_agent(body: CreateAgentIn, request: Request):
        limit(request, "w", body.shop_id.lower())
        try:
            limits = Limits.model_validate(body.limits.model_dump())
        except ValueError:
            raise HTTPException(400, "invalid_limits") from None
        return call(merchant.create, body.shop_id, body.tier, body.recipient, limits)

    @r.post("/agents/{agent_id}/agent-pass")
    def agent_pass(agent_id: AgentId, body: AgentPassIn, request: Request,
                   authorization: Annotated[str | None, Header()] = None):
        limit(request, "r" if body.device_session else "w", agent_id)
        auth_agent(agent_id, authorization)
        req = body.model_dump(exclude_none=True)
        if body.device_session:
            if getattr(merchant.verifier, "poll_device", None) is None:
                raise HTTPException(400, "device_flow_unsupported")
            # While the human hasn't answered, report "pending" WITHOUT recording a denial on the agent.
            if call(merchant.verifier.poll_device, body.device_session, call(expected_nonce, agent_id)) == "pending":
                return {"approved": False, "reason": "pending", "attestation": None}
        return call(merchant.agent_pass, agent_id, req)

    def expected_nonce(agent_id: str) -> str:
        a = merchant.store.get(agent_id)
        return agent_pass_nonce(a.address, limits_hash(a.limits), a.attest_nonce)

    @r.post("/agents/{agent_id}/agent-pass/device")
    def agent_pass_device(agent_id: AgentId, request: Request, authorization: Annotated[str | None, Header()] = None):
        """Start a World sign-in the backend polls itself (OIDC device flow). Show `verification_uri` as a QR/link,
        then poll POST /agents/{id}/agent-pass {"device_session"} until the reason is no longer "pending"."""
        limit(request, "w", agent_id)
        auth_agent(agent_id, authorization)
        start = getattr(merchant.verifier, "start_device", None)
        if start is None:
            raise HTTPException(400, "device_flow_unsupported")
        a = call(merchant.store.get, agent_id)
        if a.status not in ("pending_approval", "denied"):
            raise HTTPException(400, "bad_state")
        return call(start, call(expected_nonce, agent_id))

    @r.get("/agents/{agent_id}/agent-pass/device/{device_session}")
    def agent_pass_device_status(agent_id: AgentId, request: Request,
                                 device_session: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{16,64}$")],
                                 authorization: Annotated[str | None, Header()] = None):
        """Non-consuming poll: {"status": "pending" | "ready"}. When ready, POST /agents/{id}/agent-pass
        {"device_session"} records the outcome (approved -> attestation; denied/expired -> no mandate)."""
        limit(request, "r", agent_id)
        auth_agent(agent_id, authorization)
        poll = getattr(merchant.verifier, "poll_device", None)
        if poll is None:
            raise HTTPException(400, "device_flow_unsupported")
        state = call(poll, device_session, call(expected_nonce, agent_id))
        return {"status": "pending" if state == "pending" else "ready"}

    @r.post("/agents/{agent_id}/activate")
    def activate(agent_id: AgentId, body: ActivateIn, request: Request,
                 authorization: Annotated[str | None, Header()] = None):
        limit(request, "w", agent_id)
        auth_agent(agent_id, authorization)
        return call(merchant.activate, agent_id, body.mandate_int())

    @r.get("/agents/{agent_id}")
    def get_agent(agent_id: AgentId, request: Request, authorization: Annotated[str | None, Header()] = None):
        limit(request, "r", agent_id)
        auth_agent(agent_id, authorization)
        return call(merchant.status, agent_id)

    @r.post("/agents/{agent_id}/trigger")
    def trigger(agent_id: AgentId, request: Request, body: TriggerIn | None = None,
                authorization: Annotated[str | None, Header()] = None):
        limit(request, "w", agent_id)
        auth_agent(agent_id, authorization)
        return call(merchant.trigger, agent_id, bool(body and body.run_now))

    @r.post("/agents/{agent_id}/revoke")
    def revoke(agent_id: AgentId, request: Request, authorization: Annotated[str | None, Header()] = None):
        limit(request, "w", agent_id)
        auth_agent(agent_id, authorization)
        return call(merchant.revoke, agent_id)

    # ---------------------------------------------------------------- recovery

    @r.post("/recovery/rp-context")
    def recovery_rp_context(request: Request):
        """IDKit 4 request context signed with WORLD_RP_SIGNING_KEY (single-use nonce, 5 min). Mock: {"mock": true}."""
        limit(request, "w")
        return call(recovery.rp_context)

    @r.post("/recovery/verify")
    def recovery_verify(body: RecoveryVerifyIn, request: Request):
        limit(request, "w")
        if len(json.dumps(body.idkit)) > MAX_IDKIT_PAYLOAD:
            raise HTTPException(400, "invalid_request")
        return call(recovery.verify, body.idkit)

    @r.put("/recovery/backup", status_code=204)
    def put_backup(body: BackupIn, request: Request, authorization: Annotated[str | None, Header()] = None):
        limit(request, "w")
        token = _bearer(authorization)
        if not token:
            raise HTTPException(401, "unauthorized")
        try:
            blob = base64.b64decode(body.ciphertext, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(400, "invalid_request") from None
        call(recovery.put_backup, token, blob)

    @r.get("/recovery/backup")
    def get_backup(request: Request, authorization: Annotated[str | None, Header()] = None):
        limit(request, "r")
        token = _bearer(authorization)
        if not token:
            raise HTTPException(401, "unauthorized")
        blob = call(recovery.get_backup, token)
        return {"ciphertext": base64.b64encode(blob).decode()}

    return r


# -------------------------------------------------------------------- wiring


def build_merchant_services(settings=None, *, pipeline=None, reader=None, writer=None) -> dict:
    """Real services from settings. Reuses the API's pipeline/reader/writer when given."""
    from .config import get_settings
    from .merchant_agents import (
        AgentDeps,
        MandateRelay,
        MerchantAgentRunner,
        MerchantAgentService,
        MerchantAgentStore,
        make_mandate_reader,
    )
    from .secretbox import SecretBox
    from .world import Attester, RecoveryService, make_agent_pass_verifier, make_recovery_verifier

    settings = settings or get_settings()
    if settings.agent_key_encryption_key is None:
        raise ValueError("AGENT_KEY_ENCRYPTION_KEY is not configured")
    box = SecretBox.from_setting(settings.agent_key_encryption_key.get_secret_value())
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    recovery = RecoveryService(make_recovery_verifier(settings), box, settings.db_path,
                               action=settings.world_recovery_action, token_ttl=settings.recovery_token_ttl_seconds)
    if pipeline is None or reader is None or writer is None:
        from .chain import Web3ChainReader, Web3ChainWriter
        from .decisions import DecisionStore
        from .indexer import Indexer
        from .llm_bedrock import make_llm
        from .pipeline import UnderwritingPipeline
        from .signer import EIP712Signer
        from .underwriter import ClaudeJudge

        reader = reader or Web3ChainReader(settings)
        writer = writer or Web3ChainWriter(settings)
        if pipeline is None:
            if settings.offer_signer_private_key is None:
                raise ValueError("Offer signer is not configured")
            pipeline = UnderwritingPipeline(
                reader=reader, indexer=Indexer(reader, settings.db_path), judge=ClaudeJudge(make_llm(settings),
                                                                                            settings),
                signer=EIP712Signer(settings.offer_signer_private_key.get_secret_value()),
                store=DecisionStore(settings.db_path), settings=settings,
                now=lambda: reader.w3.eth.get_block("latest")["timestamp"])
    now = pipeline.now
    attester = None
    if settings.attester_private_key is not None:
        attester = Attester(settings.attester_private_key.get_secret_value(), reader.chain_id, reader.book_address)
    deps = AgentDeps(indexer=pipeline.indexer, advances=reader.advances,
                     request_offer=lambda shop, tier, recipient: pipeline.request_offer(shop, tier, recipient),
                     draw_by_mandate=MandateRelay(writer, now=now), chain_id=reader.chain_id,
                     book_address=reader.book_address, settings=settings,
                     mandate_reader=make_mandate_reader(reader), now=now)
    store = MerchantAgentStore(settings.db_path, box, now=now)
    return {"merchant": MerchantAgentService(store, deps, make_agent_pass_verifier(settings), attester),
            "recovery": recovery,
            "runner": MerchantAgentRunner(store, deps, settings.merchant_agent_interval_seconds)}


class LazyMerchantServices:
    """Built on first use from the API's own lazy services, so importing api.py never touches keys."""

    def __init__(self, base):
        self._base, self._built, self._lock = base, None, threading.Lock()

    def get(self, name: str):
        with self._lock:
            if self._built is None:
                self._built = build_merchant_services(pipeline=self._base.get("pipeline"),
                                                      reader=self._base.get("reader"),
                                                      writer=self._base.get("relayer").writer)
        return self._built[name]


class LazyProxy:
    def __init__(self, services, name):
        self._services, self._name = services, name

    def __getattr__(self, attr):
        return getattr(self._services.get(self._name), attr)
