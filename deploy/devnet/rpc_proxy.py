#!/usr/bin/env python3
"""Public JSON-RPC gateway for the devnet anvil (https://rpc.<HOST_SUFFIX>).

A raw public anvil would let anyone mint ETH (`anvil_setBalance`), impersonate any account
(`anvil_impersonateAccount`), rewrite code (`anvil_setCode`), warp time (`evm_increaseTime`), revert the chain
(`evm_revert`) or sign with the 10 unlocked dev accounts (`eth_sendTransaction`, `eth_sign*`). This proxy sits
between Caddy and anvil and forwards ONLY an explicit allowlist of standard read methods plus
`eth_sendRawTransaction` (client-signed). Everything else is answered locally with JSON-RPC error -32601 and never
reaches anvil. Admin methods stay reachable only inside the docker network (deploy/devnet.sh, over SSH).

Also:
  * per-client-IP token bucket (each call in a batch costs one token) plus a tighter bucket for raw txs
  * body size cap (413) and batch size cap
  * request ids are rewritten before forwarding and mapped back, so batch responses always line up
  * CORS `*` (plain HTTPS POST works from browsers and Anon-RPC workers), preflight answered here
  * GET /health (upstream reachable), GET /devnet.json (contract addresses), GET / (info)

Runs in the agents image (aiohttp comes with web3). Config is env-only; see `Config.from_env`.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout, web

log = logging.getLogger("rpc-proxy")

# Standard, state-safe JSON-RPC methods. Writes are possible only through eth_sendRawTransaction, i.e. signed by
# the client. eth_sendTransaction / eth_sign* / personal_* are NOT here: anvil would sign them with its unlocked
# dev accounts. Filters are per-node state but harmless (anvil expires them).
ALLOWED_METHODS: frozenset[str] = frozenset({
    # web3 / net
    "web3_clientVersion", "web3_sha3", "net_version", "net_listening", "net_peerCount",
    # chain + fee data
    "eth_chainId", "eth_blockNumber", "eth_syncing", "eth_protocolVersion", "eth_mining", "eth_hashrate",
    "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_blobBaseFee",
    # state reads
    "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount", "eth_getProof",
    "eth_call", "eth_estimateGas", "eth_createAccessList",
    # blocks / txs / receipts / logs
    "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getBlockReceipts",
    "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber",
    "eth_getUncleCountByBlockHash", "eth_getUncleCountByBlockNumber",
    "eth_getUncleByBlockHashAndIndex", "eth_getUncleByBlockNumberAndIndex",
    "eth_getTransactionByHash", "eth_getTransactionByBlockHashAndIndex",
    "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionReceipt", "eth_getLogs",
    "eth_newFilter", "eth_newBlockFilter", "eth_newPendingTransactionFilter", "eth_getFilterChanges",
    "eth_getFilterLogs", "eth_uninstallFilter",
    # the only write: a transaction the client signed itself
    "eth_sendRawTransaction",
})
# Answered here without touching anvil. eth_accounts would list the unlocked dev accounts, which invites
# wallets to use eth_sendTransaction (blocked anyway); an empty list is what a normal public RPC returns.
LOCAL_RESULTS: dict[str, Any] = {"eth_accounts": [], "eth_coinbase": "0x" + "00" * 20}
SEND_METHODS: frozenset[str] = frozenset({"eth_sendRawTransaction"})

ERR_PARSE, ERR_INVALID, ERR_NOT_ALLOWED, ERR_INTERNAL = -32700, -32600, -32601, -32603
ERR_LIMIT = -32005  # "limit exceeded" (EIP-1474)


@dataclass
class Config:
    upstream_url: str = "http://anvil:8545"
    max_body_bytes: int = 256 * 1024  # a Honk proof calldata tx is ~30-60 KB of hex
    max_batch: int = 50
    rate_per_sec: float = 15.0  # sustained calls / s / client
    rate_burst: float = 60.0
    send_per_min: float = 30.0  # eth_sendRawTransaction / min / client
    send_burst: float = 10.0
    upstream_timeout: float = 30.0
    trust_forwarded: bool = True  # only Caddy can reach this port, so X-Forwarded-For is Caddy's
    manifest_path: str | None = "/srv/devnet/devnet.json"
    public_chain_id: int = 31337

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Config:
        e = os.environ if env is None else env
        c = cls()
        c.upstream_url = e.get("UPSTREAM_URL", c.upstream_url)
        c.max_body_bytes = int(e.get("MAX_BODY_BYTES", c.max_body_bytes))
        c.max_batch = int(e.get("MAX_BATCH", c.max_batch))
        c.rate_per_sec = float(e.get("RATE_PER_SEC", c.rate_per_sec))
        c.rate_burst = float(e.get("RATE_BURST", c.rate_burst))
        c.send_per_min = float(e.get("SEND_PER_MIN", c.send_per_min))
        c.send_burst = float(e.get("SEND_BURST", c.send_burst))
        c.upstream_timeout = float(e.get("UPSTREAM_TIMEOUT", c.upstream_timeout))
        c.trust_forwarded = e.get("TRUST_FORWARDED", "1") == "1"
        c.manifest_path = e.get("MANIFEST_PATH", c.manifest_path) or None
        return c


# ---------------------------------------------------------------------------------------------- rate limiting

@dataclass
class TokenBucket:
    rate: float  # tokens per second
    burst: float
    _state: dict[str, tuple[float, float]] = field(default_factory=dict)  # key -> (tokens, last_ts)
    max_keys: int = 50_000

    def take(self, key: str, cost: float = 1.0, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        tokens, last = self._state.get(key, (self.burst, now))
        tokens = min(self.burst, tokens + (now - last) * self.rate)
        ok = tokens >= cost
        if ok:
            tokens -= cost
        self._state[key] = (tokens, now)
        if len(self._state) > self.max_keys:
            self.prune(now)
        return ok

    def prune(self, now: float) -> None:
        """Drop keys that have refilled completely (they carry no information)."""
        full_after = self.burst / self.rate if self.rate > 0 else 3600
        for k in [k for k, (_, last) in self._state.items() if now - last > full_after]:
            del self._state[k]
        if len(self._state) > self.max_keys:  # still flooded: forget everyone (fails open, briefly)
            self._state.clear()


def client_key(request: web.Request, trust_forwarded: bool) -> str:
    """Client IP for rate limiting. IPv6 is bucketed per /64 so address rotation inside a prefix doesn't help."""
    raw = None
    if trust_forwarded:
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            raw = xff.split(",")[-1].strip()  # the right-most entry is the one our own proxy (Caddy) appended
    raw = raw or request.remote or "unknown"
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return raw
    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


# ---------------------------------------------------------------------------------------------- JSON-RPC

def rpc_error(id_: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


def classify(call: Any) -> tuple[str, Any]:
    """('forward' | 'local' | 'error', payload). For errors the payload is the error response."""
    if not isinstance(call, dict):
        return "error", rpc_error(None, ERR_INVALID, "invalid request")
    id_ = call.get("id")
    method = call.get("method")
    if not isinstance(method, str) or not method:
        return "error", rpc_error(id_, ERR_INVALID, "invalid request: missing method")
    params = call.get("params", [])
    if params is not None and not isinstance(params, (list, dict)):
        return "error", rpc_error(id_, ERR_INVALID, "invalid request: params must be an array")
    if method in LOCAL_RESULTS:
        return "local", {"jsonrpc": "2.0", "id": id_, "result": LOCAL_RESULTS[method]}
    if method not in ALLOWED_METHODS:
        return "error", rpc_error(id_, ERR_NOT_ALLOWED, f"method {method[:64]!r} is not available on the public "
                                                        "devnet RPC")
    return "forward", call


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
}


def _json(payload: Any, status: int = 200) -> web.Response:
    return web.Response(text=json.dumps(payload, separators=(",", ":")), status=status,
                        content_type="application/json", headers=CORS_HEADERS)


class Proxy:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.calls = TokenBucket(cfg.rate_per_sec, cfg.rate_burst)
        self.sends = TokenBucket(cfg.send_per_min / 60.0, cfg.send_burst)
        self.session: ClientSession | None = None
        self._id_counter = 0

    async def start(self, _app: web.Application) -> None:
        self.session = ClientSession(timeout=ClientTimeout(total=self.cfg.upstream_timeout))

    async def stop(self, _app: web.Application) -> None:
        if self.session:
            await self.session.close()

    async def _upstream(self, payload: Any) -> Any:
        assert self.session is not None
        async with self.session.post(self.cfg.upstream_url, json=payload) as r:
            return await r.json(content_type=None)

    # -- handlers
    async def options(self, _request: web.Request) -> web.Response:
        return web.Response(status=204, headers=CORS_HEADERS)

    async def rpc(self, request: web.Request) -> web.Response:
        cl = request.content_length
        if cl is not None and cl > self.cfg.max_body_bytes:
            return _json(rpc_error(None, ERR_LIMIT, "request body too large"), 413)
        try:
            body = await request.read()  # aiohttp enforces client_max_size even without Content-Length
        except web.HTTPRequestEntityTooLarge:
            return _json(rpc_error(None, ERR_LIMIT, "request body too large"), 413)
        if len(body) > self.cfg.max_body_bytes:
            return _json(rpc_error(None, ERR_LIMIT, "request body too large"), 413)
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            return _json(rpc_error(None, ERR_PARSE, "parse error"))

        is_batch = isinstance(payload, list)
        calls = payload if is_batch else [payload]
        if is_batch and not calls:
            return _json(rpc_error(None, ERR_INVALID, "empty batch"))
        if len(calls) > self.cfg.max_batch:
            return _json(rpc_error(None, ERR_LIMIT, f"batch too large (max {self.cfg.max_batch})"), 413)

        key = client_key(request, self.cfg.trust_forwarded)
        if not self.calls.take(key, float(len(calls))):
            return _json(rpc_error(None, ERR_LIMIT, "rate limit exceeded; slow down"), 429)

        results: list[Any] = [None] * len(calls)
        forward: list[tuple[int, dict]] = []
        n_sends = 0
        for i, call in enumerate(calls):
            kind, out = classify(call)
            if kind == "forward":
                forward.append((i, out))
                n_sends += out["method"] in SEND_METHODS
            else:
                results[i] = out
        if n_sends and not self.sends.take(key, float(n_sends)):
            for i, call in forward:
                if call["method"] in SEND_METHODS:
                    results[i] = rpc_error(call.get("id"), ERR_LIMIT, "transaction rate limit exceeded")
            forward = [(i, c) for i, c in forward if c["method"] not in SEND_METHODS]

        if forward:
            # Rewrite ids so the upstream answers can be matched back whatever order or ids the client used.
            sent, back = [], {}
            for i, call in forward:
                self._id_counter = (self._id_counter + 1) % 2**53
                internal = self._id_counter
                back[internal] = i
                sent.append({"jsonrpc": "2.0", "id": internal, "method": call["method"],
                             "params": call.get("params") if call.get("params") is not None else []})
            try:
                resp = await self._upstream(sent)
            except (TimeoutError, ClientError, ValueError) as e:
                log.warning("upstream error: %s", type(e).__name__)
                for i, call in forward:
                    results[i] = rpc_error(call.get("id"), ERR_INTERNAL, "upstream unavailable")
            else:
                if isinstance(resp, dict):  # some nodes answer a whole batch with one error object
                    resp = [resp] * len(sent) if "error" in resp else [resp]
                for r in resp if isinstance(resp, list) else []:
                    i = back.pop(r.get("id"), None) if isinstance(r, dict) else None
                    if i is None:
                        continue
                    out = {k: v for k, v in r.items() if k in ("jsonrpc", "result", "error")}
                    out["id"] = calls[i].get("id")
                    results[i] = out
                for internal, i in back.items():  # anything anvil did not answer
                    results[i] = rpc_error(calls[i].get("id"), ERR_INTERNAL, "no upstream response")

        return _json(results if is_batch else results[0])

    async def health(self, _request: web.Request) -> web.Response:
        try:
            r = await self._upstream({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []})
            chain_id = int(r["result"], 16)
        except Exception as e:  # noqa: BLE001
            return _json({"ok": False, "error": type(e).__name__}, 503)
        return _json({"ok": True, "chainId": chain_id})

    async def manifest(self, _request: web.Request) -> web.Response:
        p = self.cfg.manifest_path
        if not p or not Path(p).is_file():
            return _json({"error": "devnet not deployed yet"}, 404)
        return _json(json.loads(Path(p).read_text()))

    async def info(self, _request: web.Request) -> web.Response:
        return _json({
            "name": "Merchant Revenue Advance public devnet (anvil)",
            "chainId": self.cfg.public_chain_id,
            "usage": "POST JSON-RPC here. Standard eth_* reads and eth_sendRawTransaction only.",
            "contracts": "/devnet.json",
            "allowed_methods": sorted(ALLOWED_METHODS | set(LOCAL_RESULTS)),
        })


def create_app(cfg: Config | None = None) -> web.Application:
    cfg = cfg or Config.from_env()
    proxy = Proxy(cfg)
    # client_max_size bounds what aiohttp buffers even when the client lies about (or omits) Content-Length.
    app = web.Application(client_max_size=cfg.max_body_bytes)
    app.on_startup.append(proxy.start)
    app.on_cleanup.append(proxy.stop)
    app.router.add_post("/", proxy.rpc)
    app.router.add_route("OPTIONS", "/{tail:.*}", proxy.options)
    app.router.add_get("/", proxy.info)
    app.router.add_get("/health", proxy.health)
    app.router.add_get("/devnet.json", proxy.manifest)
    return app


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = Config.from_env()
    log.info("forwarding %d allowed methods to %s (rate %.0f/s burst %.0f, %d-call batches, %d-byte bodies)",
             len(ALLOWED_METHODS), cfg.upstream_url, cfg.rate_per_sec, cfg.rate_burst, cfg.max_batch,
             cfg.max_body_bytes)
    web.run_app(create_app(cfg), host="0.0.0.0", port=int(os.environ.get("PORT", "8546")),
                access_log=None, print=None)


if __name__ == "__main__":
    main()
