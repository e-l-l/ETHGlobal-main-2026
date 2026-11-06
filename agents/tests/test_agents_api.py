import base64
import re
from types import SimpleNamespace

from fastapi.testclient import TestClient
from test_merchant_agents import ATTESTER_KEY, BOOK, NOW, RECIPIENT, SHOP, falling_sales, offered, settings

from mra_agents import agents_api
from mra_agents.api import create_app
from mra_agents.merchant_agents import AgentDeps, MerchantAgentService, MerchantAgentStore
from mra_agents.secretbox import SecretBox
from mra_agents.world import Attester, MockAgentPass, MockIDKit, RecoveryService, recover_attestation_signer

MASTER = bytes(range(32))


def setup(tmp_path):
    store = MerchantAgentStore(tmp_path / "a.sqlite", SecretBox(MASTER), now=lambda: NOW)
    sales = falling_sales()
    draws = []
    deps = AgentDeps(indexer=SimpleNamespace(sync=lambda: 0, sales_for=lambda s, since: sales),
                     advances=list, request_offer=lambda *a: offered(),
                     draw_by_mandate=lambda so, mid, sig: draws.append(sig) or "0x" + "77" * 32,
                     chain_id=31337, book_address=BOOK, settings=settings(), now=lambda: NOW)
    merchant = MerchantAgentService(store, deps, MockAgentPass(), Attester(ATTESTER_KEY, 31337, BOOK))
    recovery = RecoveryService(MockIDKit("credential-recovery-v1"), SecretBox(MASTER), tmp_path / "r.sqlite",
                               action="credential-recovery-v1", now=lambda: NOW)
    stub = SimpleNamespace()
    app = create_app(stub, stub, stub, stub, stub, merchant=merchant, recovery=recovery)
    return TestClient(app), store, draws


LIMITS = {"max_per_draw": 100_000_000, "max_per_period": 200_000_000, "period": 2_592_000, "expiry": NOW + 86_400 * 60}


def test_full_agent_flow_and_no_secrets(tmp_path):
    client, store, draws = setup(tmp_path)
    texts = []

    def rec(r):
        texts.append(r.text)
        return r
    r = rec(client.post("/agents", json={"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS}))
    assert r.status_code == 201
    body = r.json()
    aid, token = body["id"], body["manage_token"]
    assert body["register"]["agentKey"] == body["agent_address"] and body["agent_pass_nonce"]
    auth = {"Authorization": f"Bearer {token}"}

    # auth required on every agent route
    assert client.post(f"/agents/{aid}/agent-pass", json={"mock": "approve"}).status_code == 401
    assert client.get(f"/agents/{aid}", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/agents/" + "0" * 32, headers=auth).status_code == 404

    r = rec(client.post(f"/agents/{aid}/agent-pass", json={"mock": "approve"}, headers=auth))
    att = r.json()
    assert att["approved"] and recover_attestation_signer(att["attestation"], att["signature"], 31337, BOOK) == \
        att["attester"]
    r = rec(client.post(f"/agents/{aid}/activate", json={"mandate_id": "0x07"}, headers=auth))
    assert r.json()["status"] == "active" and r.json()["mandate_id"] == "7"
    r = rec(client.post(f"/agents/{aid}/trigger", json={"run_now": True}, headers=auth))
    assert r.json()["tick"]["action"] == "drew" and len(draws) == 1
    r = rec(client.get(f"/agents/{aid}", headers=auth))
    st = r.json()
    assert st["log"][0]["action"] == "drew" and st["draws"][0]["amount"] == 100_000_000
    assert "Steady daily sales" in st["log"][0]["details"]["reasons"]
    r = rec(client.post(f"/agents/{aid}/revoke", headers=auth))
    assert r.json()["status"] == "revoked"

    # recovery
    r = rec(client.post("/recovery/verify", json={"idkit": {"mock": "approve", "mock_human": "alice"}}))
    rtok = r.json()["recovery_token"]
    ct = base64.b64encode(b"opaque-client-ciphertext").decode()
    assert client.put("/recovery/backup", json={"ciphertext": ct}).status_code == 401
    assert client.put("/recovery/backup", json={"ciphertext": ct},
                      headers={"Authorization": f"Bearer {rtok}"}).status_code == 204
    r = rec(client.get("/recovery/backup", headers={"Authorization": f"Bearer {rtok}"}))
    assert r.json() == {"ciphertext": ct}
    assert client.post("/recovery/verify", json={"idkit": {"mock": "deny"}}).json() == \
        {"detail": "verification_failed"}

    # no secrets anywhere in responses
    agent_key = store.private_key(aid)[2:]
    everything = "\n".join(texts).lower()
    for secret in (agent_key, ATTESTER_KEY[2:], MASTER.hex(), token_hash(store, aid)):
        assert secret.lower() not in everything
    assert "key_enc" not in everything and "v1:" not in everything
    assert "manage_token_hash" not in everything
    assert not re.search(r"0x[0-9a-f]{64}", "\n".join(texts[2:]).replace(att["digest"], "")
                         .replace(att["attestation"]["limitsHash"], "").replace(SHOP, "")
                         .replace("0x" + "ab" * 32, "").replace("0x" + "77" * 32, "").lower())


def token_hash(store, aid):
    return store._db.execute("SELECT manage_token_hash FROM merchant_agents WHERE id = ?", (aid,)).fetchone()[0]


def test_agent_validation(tmp_path):
    client, _, _ = setup(tmp_path)
    bad = [
        {"shop_id": "nope", "tier": 1, "recipient": RECIPIENT, "limits": LIMITS},
        {"shop_id": SHOP, "tier": 4, "recipient": RECIPIENT, "limits": LIMITS},
        {"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": {**LIMITS, "max_per_draw": 10}},
        {"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": {**LIMITS, "max_per_period": 50_000_000}},
        {"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": {**LIMITS, "expiry": NOW}},
        {"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS, "extra": 1},
    ]
    for b in bad:
        assert client.post("/agents", json=b).status_code == 400, b
    r = client.post("/agents", json={"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS})
    aid, auth = r.json()["id"], {"Authorization": f"Bearer {r.json()['manage_token']}"}
    # activate before approval, trigger before activation: rejected with stable codes
    assert client.post(f"/agents/{aid}/activate", json={"mandate_id": 1}, headers=auth).json() == \
        {"detail": "bad_state"}
    assert client.post(f"/agents/{aid}/trigger", headers=auth).status_code == 400
    assert client.post(f"/agents/{aid}/agent-pass", json={"mock": "maybe"}, headers=auth).status_code == 400
    d = client.post(f"/agents/{aid}/agent-pass", json={"mock": "deny"}, headers=auth).json()
    assert d == {"approved": False, "reason": "denied", "attestation": None}
    assert client.put("/recovery/backup", json={"ciphertext": "!!!"},
                      headers={"Authorization": "Bearer x"}).status_code == 400


def test_agent_rate_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(agents_api, "WRITE_LIMIT", 2)
    client, _, _ = setup(tmp_path)
    body = {"idkit": {"mock": "approve", "mock_human": "z"}}
    codes = [client.post("/recovery/verify", json=body).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_upstream_errors_are_sanitised(tmp_path):
    client, store, _ = setup(tmp_path)
    r = client.post("/agents", json={"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS})
    aid, auth = r.json()["id"], {"Authorization": f"Bearer {r.json()['manage_token']}"}

    def boom(*a, **k):
        raise RuntimeError("Traceback with ATTESTER secret")
    store.events = boom
    r = client.get(f"/agents/{aid}", headers=auth)
    assert r.status_code == 502 and "secret" not in r.text and "Traceback" not in r.text
