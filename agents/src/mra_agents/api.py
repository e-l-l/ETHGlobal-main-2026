"""HTTP interface for underwriting and the allow-listed relayer operations."""
from __future__ import annotations

import os
import re
import threading
import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from .models import Address, Decision, Hex32, ShopFeatures, SignedOffer

UInt = Annotated[StrictInt, Field(ge=0, lt=2**256)]
FieldElement = Annotated[StrictInt, Field(ge=0, lt=21888242871839275222246405745257275088548364400416034343698204186575808495617)]
HexBytes = Annotated[str, Field(pattern=r"^0x(?:[0-9a-fA-F]{2})+$")]
Signature = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{130}$")]
_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}(?![0-9a-fA-F])", re.IGNORECASE)

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

Band = Annotated[StrictInt, Field(ge=0, le=255)]


class OfferRequest(Input):
    """tier 0 manual draw: pass_nullifier (Business Pass first-advance nullifier) + min_revenue_band.
    tier 0 with pass_nullifier 0 = an offer for a mandate draw (the credential was spent at registerMandate)."""
    shop_id: Hex32
    tier: Annotated[StrictInt, Field(ge=0, le=3)]
    recipient: Address
    pass_nullifier: FieldElement = 0
    min_revenue_band: Band = 0

    @model_validator(mode="after")
    def policy(self):
        if self.tier > 0 and (self.pass_nullifier != 0 or self.min_revenue_band != 0):
            raise ValueError("pass nullifier and revenue band are tier 0 only")
        return self

class OfferInput(Input):
    offer_id: Hex32
    shop_id: Hex32
    recipient: Address
    amount: UInt
    fee_rate_bps_per_week: Annotated[StrictInt, Field(ge=1, le=1000)]
    fee_cap_bps: Annotated[StrictInt, Field(ge=1, le=1000)]
    holdback_bps: Annotated[StrictInt, Field(ge=500, le=2000)]
    tier: Annotated[StrictInt, Field(ge=0, le=3)]
    pass_nullifier: FieldElement
    min_revenue_band: Band = 0
    expires_at: Annotated[StrictInt, Field(ge=0, lt=2**64)]

    @model_validator(mode="after")
    def policy(self):
        if self.amount not in (50_000_000, 100_000_000, 200_000_000, 300_000_000):
            raise ValueError("invalid amount")
        if self.fee_rate_bps_per_week != 50 or self.fee_cap_bps != 300:
            raise ValueError("invalid fee terms")
        if self.tier > 0 and (self.pass_nullifier != 0 or self.min_revenue_band != 0):
            raise ValueError("invalid pass nullifier")
        return self

class SignedOfferInput(Input):
    offer: OfferInput
    signature: Signature
    digest: Hex32

    def shared(self) -> SignedOffer:
        return SignedOffer.model_validate(self.model_dump())

class DrawFirst(Input):
    """Business Pass proof (circuits/business_pass), context = keccak(recipient, offerId) % P."""
    signed_offer: SignedOfferInput
    proof: HexBytes
    root: FieldElement
    commitment_next: FieldElement

    @model_validator(mode="after")
    def policy(self):
        if self.signed_offer.offer.tier != 0 or self.signed_offer.offer.pass_nullifier == 0:
            raise ValueError("first draw requires tier 0 and a pass nullifier")
        return self


class LimitsInput(Input):
    max_per_draw: UInt
    max_per_period: UInt
    period: Annotated[StrictInt, Field(ge=1, lt=2**64)]
    expiry: Annotated[StrictInt, Field(ge=1, lt=2**64)]


class RegisterMandate(Input):
    """AdvanceBook.registerMandate, relayed so the merchant's wallet never sends it.
    proof: business_pass (tier 0) or standing_pass (tier >= 1) with context = mandateHash % P."""
    shop_id: Hex32
    agent_key: Address
    recipient: Address
    limits: LimitsInput
    tier: Annotated[StrictInt, Field(ge=0, le=3)]
    band: Band = 0
    proof: HexBytes
    root: FieldElement
    nullifier: FieldElement
    commitment_next: FieldElement
    attestation_nonce: UInt
    attestation_expiry: Annotated[StrictInt, Field(ge=0, lt=2**64)]
    attestation_signature: Signature
    owner_signature: Signature

class DrawWithPass(Input):
    signed_offer: SignedOfferInput
    proof: HexBytes
    root: FieldElement
    nullifier: FieldElement
    commitment_next: FieldElement

    @model_validator(mode="after")
    def policy(self):
        if self.signed_offer.offer.tier == 0:
            raise ValueError("pass draw requires a positive tier")
        return self

class TxResponse(BaseModel):
    tx_hash: Hex32

class InsightsResponse(BaseModel):
    features: ShopFeatures
    decision: Decision | None

class HealthResponse(BaseModel):
    status: str
    faucet: dict | None = None

class FaucetRequest(Input):
    address: Address

class RiskResponse(BaseModel):
    signals: dict
    triggers: list = []
    last_tick: dict | None = None

# Fixed-window-like sliding limit, shared across all guarded routes per key.
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60

class _Limiter:
    def __init__(self):
        self.events = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, ip: str, shop: str | None):
        now = time.monotonic()
        keys = [("ip", ip)] + ([("shop", shop.lower())] if shop else [])
        with self.lock:
            # Expire inactive keys too, so arbitrary shop IDs cannot grow storage forever.
            for key, events in list(self.events.items()):
                while events and events[0] <= now - RATE_WINDOW_SECONDS:
                    events.popleft()
                if not events:
                    del self.events[key]
            if any(len(self.events[key]) >= RATE_LIMIT for key in keys):
                raise HTTPException(429, "Rate limit exceeded")
            for key in keys:
                self.events[key].append(now)


def _clean(value):
    """Redact address-looking text anywhere in insight data, including untrusted labels."""
    if isinstance(value, str):
        return _ADDRESS.sub("[redacted]", value)
    if isinstance(value, dict):
        return {_clean(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def cors_origins() -> list[str]:
    """CORS_ALLOW_ORIGINS from the process env, else from agents/.env (pydantic reads .env without exporting it)."""
    raw = os.getenv("CORS_ALLOW_ORIGINS")
    if raw is None:
        try:
            from .config import get_settings
            raw = get_settings().cors_allow_origins
        except Exception:  # noqa: BLE001 - a bad .env must not stop the app from importing; no CORS then
            raw = ""
    return [x.strip().rstrip("/") for x in raw.split(",") if x.strip() and x.strip() != "*"]


def create_app(pipeline, relayer, reader, store, risk, merchant=None, recovery=None, faucet=None, sim=None):
    app = FastAPI(debug=False)
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins(), allow_methods=["GET", "POST", "PUT"],
                       allow_headers=["Content-Type", "Authorization"], max_age=600)
    limiter = _Limiter()

    @app.exception_handler(RequestValidationError)
    async def invalid(_request, _exc):
        return JSONResponse(status_code=400, content={"detail": "Invalid request"})

    def invoke(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except HTTPException:
            raise
        except (KeyError, LookupError):
            raise HTTPException(404, "Not found") from None
        except ValueError:
            raise HTTPException(400, "Invalid request or policy violation") from None
        except Exception:  # noqa: BLE001 - API boundary: never leak upstream errors, map to 502
            raise HTTPException(502, "Upstream service failed") from None

    def limit(request, shop=None):
        limiter.check(request.client.host if request.client else "unknown", shop)

    @app.post("/offers", response_model=Decision)
    def offers(body: OfferRequest, request: Request):
        limit(request, body.shop_id)
        return invoke(lambda: pipeline.request_offer(body.shop_id, body.tier, body.recipient, body.pass_nullifier,
                                                     body.min_revenue_band))

    @app.post("/relay/draw-first", response_model=TxResponse)
    def draw_first(body: DrawFirst, request: Request):
        limit(request, body.signed_offer.offer.shop_id)
        return {"tx_hash": invoke(lambda: relayer.draw_first(body.signed_offer.shared(), body.proof, body.root,
                                                             body.commitment_next))}

    @app.post("/relay/draw-with-pass", response_model=TxResponse)
    def draw_pass(body: DrawWithPass, request: Request):
        limit(request, body.signed_offer.offer.shop_id)
        return {"tx_hash": invoke(lambda: relayer.draw_with_pass(body.signed_offer.shared(), body.proof, body.root, body.nullifier, body.commitment_next))}

    @app.post("/relay/register-mandate", response_model=TxResponse)
    def register_mandate(body: RegisterMandate, request: Request):
        limit(request, body.shop_id)
        lim = body.limits
        req = (bytes.fromhex(body.shop_id[2:]), body.agent_key, body.recipient,
               (lim.max_per_draw, lim.max_per_period, lim.period, lim.expiry), body.tier, body.band)
        return {"tx_hash": invoke(lambda: relayer.register_mandate(
            req, body.proof, body.root, body.nullifier, body.commitment_next, body.attestation_nonce,
            body.attestation_expiry, body.attestation_signature, body.owner_signature))}

    @app.post("/relay/claim/{advance_id}", response_model=TxResponse)
    def claim(request: Request, advance_id: Annotated[int, Path(ge=1, lt=2**256)]):
        limit(request)
        # The protocol exposes no shop ID on claim; use chain state for the shop limit.
        advances = invoke(lambda: reader.advances())
        advance = next((a for a in advances if a.advance_id == advance_id), None)
        if advance is None:
            raise HTTPException(404, "Not found")
        with limiter.lock:
            now = time.monotonic()
            key = ("shop", advance.shop_id.lower())
            events = limiter.events[key]
            while events and events[0] <= now - RATE_WINDOW_SECONDS:
                events.popleft()
            if len(events) >= RATE_LIMIT:
                raise HTTPException(429, "Rate limit exceeded")
            events.append(now)
        return {"tx_hash": invoke(lambda: relayer.claim(advance_id))}

    @app.get("/shops/{shop_id}/insights", response_model=InsightsResponse)
    def insights(shop_id: Hex32):
        def build():
            # Same clock and windows as UnderwritingPipeline, so the "why" screen shows what the judges saw.
            now = int(pipeline.now())
            pipeline.indexer.sync()
            sales = pipeline.indexer.sales_for(shop_id, now - 90 * 86400)
            funders = reader.usdc_funders(list({sale.payer for sale in sales}), now - 97 * 86400)
            features = pipeline.build_features(shop_id, sales, funders, reader.shop_payout(shop_id), now,
                                               pipeline.settings.payer_hash_key.get_secret_value().encode())
            return features, store.latest_for_shop(shop_id)
        features, decision = invoke(build)
        # Return a JSON response to preserve redaction even in optional/free text fields.
        return JSONResponse(content=_clean({"features": features.model_dump(mode="json"),
                                            "decision": decision.model_dump(mode="json") if decision else None}))

    @app.get("/decisions/{id}", response_model=Decision)
    def decision(id: str):
        result = invoke(lambda: store.get(id))
        if result is None:
            raise HTTPException(404, "Not found")
        return result

    @app.get("/risk/status", response_model=RiskResponse)
    def risk_status():
        def status():
            if hasattr(risk, "status"):
                return risk.status()  # {"signals", "triggers", "last_tick"}
            from .risk import risk_signals
            sig = risk_signals(reader, int(time.time()))
            return {"signals": sig, "triggers": sig.get("triggers", []), "last_tick": None}
        return invoke(status)

    @app.get("/health", response_model=HealthResponse, response_model_exclude_none=True)
    def health():
        result = {"status": "ok"}
        if faucet is not None:
            try:
                result["faucet"] = faucet.status()
            except Exception:  # noqa: BLE001 - expose unavailable monitoring
                result["faucet"] = {"error": "unavailable"}
        return result

    @app.post("/demo/faucet")
    def demo_faucet(body: FaucetRequest, request: Request):
        """Testnet-only burner funding (faucet.py). 404 unless DEMO_FAUCET=1 on Sepolia / anvil."""
        from .faucet import FaucetError, client_ip
        try:
            if faucet is None or not faucet.enabled():
                raise HTTPException(404, "Not found")
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 - services not configured = no faucet
            raise HTTPException(404, "Not found") from None
        limit(request)
        try:
            return faucet.fund(body.address, client_ip(request.headers, request.client.host if request.client else None))
        except FaucetError as e:
            raise HTTPException(e.status, e.code) from None
        except Exception:  # noqa: BLE001 - never leak upstream errors
            raise HTTPException(502, "Upstream service failed") from None

    if merchant is not None or recovery is not None:  # managed agents + World recovery
        from .agents_api import build_router
        app.include_router(build_router(merchant, recovery))

    if sim is not None:  # devnet only: the judge simulator (sim_api.SimMount)
        from .sim_api import mount
        mount(app, sim)

    return app


class _LazyServices:
    """Construct service dependencies on first use, never while importing this module."""
    def __init__(self):
        self._services = None
        self._lock = threading.Lock()

    def get(self, name):
        with self._lock:
            if self._services is None:
                self._services = self._build()
        return self._services[name]

    @staticmethod
    def _build():
        from .chain import Web3ChainReader, Web3ChainWriter
        from .config import get_settings
        from .decisions import DecisionStore
        from .indexer import Indexer
        from .llm_bedrock import make_llm
        from .pipeline import UnderwritingPipeline
        from .relayer import Relayer
        from .risk import RiskAgent
        from .signer import EIP712Signer
        from .underwriter import ClaudeJudge

        settings = get_settings()
        # The public simulator must never use whatever signing keys happen to be in
        # agents/.env. Derive its transaction roles from the public Anvil mnemonic.
        # This branch is devnet-only; the Sepolia API keeps its configured signers.
        if settings.chain_id == 31337 and os.getenv("SIMULATOR_ENABLED", "1") == "1":
            import sys
            from pathlib import Path
            scripts = Path(__file__).resolve().parents[2] / "scripts"
            if str(scripts) not in sys.path:
                sys.path.insert(0, str(scripts))
            from devnet_lib import role
            from pydantic import SecretStr
            settings = settings.model_copy(update={
                "offer_signer_private_key": SecretStr(role("offer_signer").key),
                "relayer_private_key": SecretStr(role("relayer").key),
                "risk_manager_private_key": SecretStr(role("risk_manager").key),
            })
        reader = Web3ChainReader(settings)
        writer = Web3ChainWriter(settings)
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        indexer = Indexer(reader, settings.db_path)  # tables: sales, meta
        store = DecisionStore(settings.db_path)  # table: decisions
        judge = ClaudeJudge(make_llm(settings), settings)
        if settings.offer_signer_private_key is None:
            raise ValueError("Offer signer is not configured")
        signer = EIP712Signer(settings.offer_signer_private_key.get_secret_value())

        # Use chain time everywhere: offer expiry and the default window are checked against
        # block.timestamp, and devnets warp their clock.
        def chain_now() -> int:
            return reader.w3.eth.get_block("latest")["timestamp"]

        pipeline = UnderwritingPipeline(reader=reader, indexer=indexer, judge=judge, signer=signer,
                                        store=store, settings=settings, now=chain_now)
        from .faucet import build_faucet
        return {"pipeline": pipeline, "relayer": Relayer(writer, settings, now=chain_now), "reader": reader,
                "store": store, "risk": RiskAgent(reader, writer, judge, settings, now=chain_now),
                "faucet": build_faucet(writer, settings)}


class _LazyProxy:
    def __init__(self, services, name):
        self._services, self._name = services, name

    def __getattr__(self, name):
        return getattr(self._services.get(self._name), name)


_services = _LazyServices()
def _merchant_proxies():
    from .agents_api import LazyMerchantServices, LazyProxy
    lazy = LazyMerchantServices(_services)
    return LazyProxy(lazy, "merchant"), LazyProxy(lazy, "recovery")


def _devnet_simulator():
    """The scenario runner is mounted only on the devnet API (CHAIN_ID=31337). The Sepolia agents-api has no
    /sim routes and no access to anvil's admin RPC."""
    if os.getenv("CHAIN_ID") != "31337" or os.getenv("SIMULATOR_ENABLED", "1") != "1":
        return None
    from .config import ROOT
    from .sim import SimStore
    from .sim_api import SimMount, origin_regex
    from .sim_runner import Simulator
    store = SimStore(os.getenv("SIM_DB_PATH", str(ROOT / "data" / "sim.sqlite")),
                     per_hour=int(os.getenv("SIM_RATE_PER_HOUR", "6")),
                     global_cap=int(os.getenv("SIM_GLOBAL_CAP", "50")),
                     recover_running=os.getenv("SIM_CHILD_PROCESS") != "1")
    runner = Simulator(_services)
    # Each run executes in a spawned child process (killable at the hard limit), driven by a worker thread,
    # so neither the event loop nor a stuck RPC/LLM call can wedge the API.
    return SimMount(store, runner.run, runner.state_ledger, origin_regex(),
                    timeout_seconds=runner.timeout + runner.hard_grace, isolate=True)


app = create_app(*(_LazyProxy(_services, name) for name in ("pipeline", "relayer", "reader", "store", "risk")),
                 *_merchant_proxies(), faucet=_LazyProxy(_services, "faucet"), sim=_devnet_simulator())
