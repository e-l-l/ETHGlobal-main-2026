"""HTTP interface for the devnet-only simulator (mounted under /sim by api.create_app)."""
from __future__ import annotations

import os
import re
from collections.abc import Callable
from typing import Any, NamedTuple

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from .sim import ARCHETYPES, RateLimited, SimStore, SimWorker


class RunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    archetype: str


class SimMount(NamedTuple):
    store: SimStore
    executor: Callable[[str, SimStore], None]
    ledger: Callable[[], dict[str, Any]]
    origin_regex: str
    timeout_seconds: int = 240  # hard per-run limit (the runner's own soft budget is shorter)
    isolate: bool = False  # run each scenario in a killable child process


import hashlib as _hashlib
import secrets as _secrets

_IP_SALT = _secrets.token_bytes(16)  # per process: the rate limit only needs equality, never the address


def _ip_tag(ip: str) -> str:
    """A salted hash of the client IP, so the run store never holds an IP address."""
    return _hashlib.sha256(_IP_SALT + ip.encode()).hexdigest()[:24]


def build_router(store: SimStore, executor, ledger, *, timeout_seconds: int = 240, isolate: bool = False):
    router = APIRouter(prefix='/sim')
    worker = SimWorker(store, executor, timeout_seconds=timeout_seconds, isolate=isolate)

    @router.get('/archetypes')
    def archetypes():
        return ARCHETYPES

    @router.post('/runs')
    def create(body: RunRequest, request: Request):
        try:
            run_id = store.create(body.archetype, _ip_tag(request.client.host if request.client else 'unknown'))
        except RateLimited:
            raise HTTPException(429, 'Rate limit exceeded') from None
        except ValueError:
            raise HTTPException(400, 'Unknown archetype') from None
        worker.kick()
        return {'run_id': run_id}

    @router.get('/runs/{run_id}')
    def get(run_id: str):
        result = store.get(run_id)
        if result is None:
            raise HTTPException(404, 'Not found')
        return result

    @router.get('/state')
    def state():
        try:
            return {'ledger': ledger(), 'recent': store.recent()}
        except Exception:  # noqa: BLE001 - never leak RPC errors
            raise HTTPException(502, 'Simulator state unavailable') from None

    @router.on_event('startup')
    def resume():
        worker.kick()

    return router


def mount(app, sim: SimMount) -> None:
    """Add the /sim routes plus CORS scoped to /sim (https://app.<HOST_SUFFIX> and http://localhost:*)."""
    app.include_router(build_router(sim.store, sim.executor, sim.ledger,
                                    timeout_seconds=sim.timeout_seconds, isolate=sim.isolate))

    @app.middleware('http')
    async def sim_cors(request, call_next):
        origin = request.headers.get('origin', '')
        allowed = request.url.path.startswith('/sim/') and re.fullmatch(sim.origin_regex, origin)
        if allowed and request.method == 'OPTIONS' and request.headers.get('access-control-request-method'):
            response = JSONResponse(content={}, status_code=200)
        else:
            response = await call_next(request)
        if allowed:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
            response.headers['Access-Control-Max-Age'] = '600'
            response.headers.append('Vary', 'Origin')
        return response


def origin_regex():
    suffix = os.environ.get('HOST_SUFFIX', '').strip()
    app = r'https://app\.' + re.escape(suffix) if suffix else r'(?!)'
    return rf'^(?:{app}|http://localhost(?::[0-9]+)?)$'
