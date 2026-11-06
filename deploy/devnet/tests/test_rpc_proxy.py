"""Unit tests for deploy/devnet/rpc_proxy.py (no anvil needed: a fake upstream records what gets through).

    cd agents && uv run pytest -q ../deploy/devnet/tests
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rpc_proxy as rp


class FakeAnvil:
    """Records every JSON-RPC call it receives; answers in REVERSE order to prove id re-mapping works."""

    def __init__(self) -> None:
        self.seen: list[str] = []

    async def handle(self, request: web.Request) -> web.Response:
        body = await request.json()
        calls = body if isinstance(body, list) else [body]
        out = []
        for c in calls:
            self.seen.append(c["method"])
            if c["method"] == "eth_chainId":
                out.append({"jsonrpc": "2.0", "id": c["id"], "result": "0x7a69"})
            else:
                out.append({"jsonrpc": "2.0", "id": c["id"], "result": f"ok:{c['method']}"})
        out.reverse()
        return web.json_response(out if isinstance(body, list) else out[0])


def run(coro_fn, **cfg_overrides):
    async def main():
        fake = FakeAnvil()
        up_app = web.Application()
        up_app.router.add_post("/", fake.handle)
        async with TestServer(up_app) as up:
            cfg = rp.Config(upstream_url=str(up.make_url("/")), manifest_path=None, **cfg_overrides)
            async with TestClient(TestServer(rp.create_app(cfg))) as client:
                return await coro_fn(client, fake)
    return asyncio.run(main())


def call(method, params=None, id_=1):
    return {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or []}


# ---------------------------------------------------------------------------------------------- allow / block

def test_allowed_methods_are_forwarded():
    async def t(client, fake):
        for m in ("eth_chainId", "eth_call", "eth_getLogs", "eth_sendRawTransaction", "net_version",
                  "web3_clientVersion", "eth_getTransactionReceipt", "eth_estimateGas"):
            r = await client.post("/", json=call(m, id_="abc"))
            assert r.status == 200
            body = await r.json()
            assert body["id"] == "abc" and "error" not in body, (m, body)
        return fake.seen
    seen = run(t)
    assert "eth_sendRawTransaction" in seen and "eth_call" in seen


def test_admin_and_signing_methods_never_reach_anvil():
    blocked = ["anvil_setBalance", "anvil_impersonateAccount", "anvil_setCode", "anvil_mine", "anvil_reset",
               "anvil_dumpState", "anvil_loadState", "evm_increaseTime", "evm_setNextBlockTimestamp",
               "evm_snapshot", "evm_revert", "evm_mine", "evm_setTime", "hardhat_setBalance",
               "hardhat_impersonateAccount", "debug_traceTransaction", "trace_block", "ots_getApiLevel",
               "txpool_content", "eth_sendTransaction", "eth_sign", "eth_signTypedData_v4", "eth_signTransaction",
               "personal_sign", "personal_unlockAccount", "eth_sendUnsignedTransaction", "admin_peers",
               "miner_start", "ETH_CHAINID", "eth_call "]

    async def t(client, fake):
        for m in blocked:
            r = await client.post("/", json=call(m, [1]))
            body = await r.json()
            assert body["error"]["code"] == rp.ERR_NOT_ALLOWED, (m, body)
            assert body["id"] == 1
        return fake.seen
    assert run(t) == []  # nothing forwarded


def test_eth_accounts_answered_locally_with_empty_list():
    async def t(client, fake):
        body = await (await client.post("/", json=call("eth_accounts"))).json()
        return body, fake.seen
    body, seen = run(t)
    assert body["result"] == [] and seen == []


def test_invalid_shapes():
    async def t(client, _fake):
        parse = await (await client.post("/", data=b"{not json")).json()
        no_method = await (await client.post("/", json={"jsonrpc": "2.0", "id": 7})).json()
        bad_params = await (await client.post("/", json={"jsonrpc": "2.0", "id": 8, "method": "eth_call",
                                                          "params": "x"})).json()
        empty = await (await client.post("/", json=[])).json()
        return parse, no_method, bad_params, empty
    parse, no_method, bad_params, empty = run(t)
    assert parse["error"]["code"] == rp.ERR_PARSE
    assert no_method["error"]["code"] == rp.ERR_INVALID and no_method["id"] == 7
    assert bad_params["error"]["code"] == rp.ERR_INVALID
    assert empty["error"]["code"] == rp.ERR_INVALID


# ---------------------------------------------------------------------------------------------- batches

def test_mixed_batch_keeps_order_and_ids_and_filters_blocked():
    batch = [call("eth_chainId", id_=10), call("anvil_setBalance", ["0x00", "0x1"], id_=11),
             call("eth_blockNumber", id_="x"), 5, call("evm_increaseTime", [100], id_=12),
             call("eth_getBalance", ["0x00", "latest"], id_=10)]  # duplicate client id on purpose

    async def t(client, fake):
        body = await (await client.post("/", json=batch)).json()
        return body, fake.seen
    body, seen = run(t)
    assert isinstance(body, list) and len(body) == len(batch)
    assert body[0] == {"jsonrpc": "2.0", "id": 10, "result": "0x7a69"}
    assert body[1]["error"]["code"] == rp.ERR_NOT_ALLOWED and body[1]["id"] == 11
    assert body[2]["result"] == "ok:eth_blockNumber" and body[2]["id"] == "x"
    assert body[3]["error"]["code"] == rp.ERR_INVALID
    assert body[4]["error"]["code"] == rp.ERR_NOT_ALLOWED
    assert body[5]["result"] == "ok:eth_getBalance" and body[5]["id"] == 10
    assert seen == ["eth_chainId", "eth_blockNumber", "eth_getBalance"]


def test_batch_size_cap():
    async def t(client, fake):
        r = await client.post("/", json=[call("eth_chainId", id_=i) for i in range(6)])
        return r.status, await r.json(), fake.seen
    status, body, seen = run(t, max_batch=5)
    assert status == 413 and body["error"]["code"] == rp.ERR_LIMIT and seen == []


# ---------------------------------------------------------------------------------------------- body size

def test_oversized_body_rejected_with_and_without_content_length():
    big = json.dumps(call("eth_call", [{"data": "0x" + "ab" * 4000}])).encode()

    async def t(client, fake):
        r1 = await client.post("/", data=big, headers={"Content-Type": "application/json"})

        async def chunks():  # chunked: no Content-Length header at all
            for i in range(0, len(big), 512):
                yield big[i:i + 512]
        r2 = await client.post("/", data=chunks(), headers={"Content-Type": "application/json"})
        small = await client.post("/", json=call("eth_chainId"))
        return r1.status, r2.status, small.status, fake.seen
    s1, s2, s_small, seen = run(t, max_body_bytes=4096)
    assert s1 == 413 and s2 == 413 and s_small == 200
    assert seen == ["eth_chainId"]


# ---------------------------------------------------------------------------------------------- rate limits

def test_rate_limit_per_ip_counts_batch_entries():
    async def t(client, _fake):
        hdr_a = {"X-Forwarded-For": "203.0.113.7"}
        hdr_b = {"X-Forwarded-For": "198.51.100.9"}
        r1 = await client.post("/", json=[call("eth_chainId", id_=i) for i in range(4)], headers=hdr_a)
        r2 = await client.post("/", json=call("eth_chainId"), headers=hdr_a)  # 5th token: still in burst
        r3 = await client.post("/", json=call("eth_chainId"), headers=hdr_a)  # 6th: over
        r4 = await client.post("/", json=call("eth_chainId"), headers=hdr_b)  # other IP unaffected
        return r1.status, r2.status, r3.status, (await r3.json()), r4.status
    s1, s2, s3, b3, s4 = run(t, rate_per_sec=0.001, rate_burst=5)
    assert (s1, s2, s3, s4) == (200, 200, 429, 200)
    assert b3["error"]["code"] == rp.ERR_LIMIT


def test_raw_tx_has_its_own_tighter_limit():
    async def t(client, fake):
        h = {"X-Forwarded-For": "203.0.113.8"}
        out = []
        for _ in range(3):
            out.append(await (await client.post("/", json=call("eth_sendRawTransaction", ["0x02"]),
                                                headers=h)).json())
        return out, fake.seen
    out, seen = run(t, send_per_min=0.001, send_burst=2)
    assert "result" in out[0] and "result" in out[1]
    assert out[2]["error"]["code"] == rp.ERR_LIMIT
    assert seen.count("eth_sendRawTransaction") == 2


def test_client_key_uses_rightmost_forwarded_and_buckets_ipv6():
    class R:
        def __init__(self, xff, remote="172.18.0.5"):
            self.headers = {"X-Forwarded-For": xff} if xff else {}
            self.remote = remote
    assert rp.client_key(R("1.2.3.4, 203.0.113.9"), True) == "203.0.113.9"  # spoofed left entry ignored
    assert rp.client_key(R("1.2.3.4"), False) == "172.18.0.5"
    assert rp.client_key(R("2001:db8:1:2:aaaa::1"), True) == rp.client_key(R("2001:db8:1:2:bbbb::9"), True)
    assert rp.client_key(R(None), True) == "172.18.0.5"


def test_token_bucket_refills():
    b = rp.TokenBucket(rate=1.0, burst=2)
    assert b.take("k", now=0) and b.take("k", now=0) and not b.take("k", now=0)
    assert b.take("k", now=1.01)


# ---------------------------------------------------------------------------------------------- CORS + GETs

def test_cors_preflight_and_headers():
    async def t(client, _fake):
        pre = await client.options("/", headers={"Origin": "https://example.org",
                                                 "Access-Control-Request-Method": "POST"})
        post = await client.post("/", json=call("eth_chainId"), headers={"Origin": "https://example.org"})
        return pre.status, dict(pre.headers), dict(post.headers)
    s, pre, post = run(t)
    assert s == 204 and pre["Access-Control-Allow-Origin"] == "*" and "POST" in pre["Access-Control-Allow-Methods"]
    assert post["Access-Control-Allow-Origin"] == "*"


def test_health_and_info():
    async def t(client, _fake):
        h = await (await client.get("/health")).json()
        info = await (await client.get("/")).json()
        man = await client.get("/devnet.json")
        return h, info, man.status
    h, info, man_status = run(t)
    assert h == {"ok": True, "chainId": 31337}
    assert "eth_sendRawTransaction" in info["allowed_methods"] and "anvil_setBalance" not in info["allowed_methods"]
    assert man_status == 404  # no manifest configured


def test_upstream_down_returns_jsonrpc_error():
    async def main():
        cfg = rp.Config(upstream_url="http://127.0.0.1:9/", manifest_path=None, upstream_timeout=2)
        async with TestClient(TestServer(rp.create_app(cfg))) as client:
            r = await client.post("/", json=call("eth_chainId", id_=3))
            return r.status, await r.json()
    status, body = asyncio.run(main())
    assert status == 200 and body["error"]["code"] == rp.ERR_INTERNAL and body["id"] == 3


def test_allowlist_has_no_dangerous_prefixes():
    for m in rp.ALLOWED_METHODS:
        assert m.split("_")[0] in ("eth", "net", "web3"), m
        assert m not in ("eth_sendTransaction", "eth_sign", "eth_signTransaction", "eth_signTypedData",
                         "eth_signTypedData_v4", "eth_sendUnsignedTransaction")
