"""Real (non-mock) World paths, offline: locally signed RS256 JWTs, a mocked JWKS + discovery + token endpoint, and the
World ID 4.0 RP-signature test vectors from docs.world.org/world-id/idkit/signatures.md."""
import base64
import json
from types import SimpleNamespace

import pytest
from Crypto.Hash import SHA256
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from test_merchant_agents import ATTESTER_KEY, BOOK, NOW, RECIPIENT, SHOP

from mra_agents.api import cors_origins, create_app
from mra_agents.config import Settings
from mra_agents.merchant_agents import AgentDeps, MerchantAgentService, MerchantAgentStore
from mra_agents.secretbox import SecretBox
from mra_agents.world import (
    IDKitVerifier,
    Limits,
    OIDCAgentPass,
    RecoveryService,
    WorldError,
    agent_pass_nonce,
    hash_to_field,
    limits_hash,
    make_agent_pass_verifier,
    make_recovery_verifier,
    rp_signature_message,
    sign_rp_request,
)

ISSUER = "https://auth.world.org"
CLIENT = "app_staging_123"
SECRET = "sk_test_client_secret_value"
KEY = RSA.generate(2048)
ROTATED = RSA.generate(2048)
LIM = Limits(max_per_draw=100_000_000, max_per_period=200_000_000, period=30 * 86_400, expiry=NOW + 86_400 * 90)


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def jwt(claims, key=KEY, kid="k1", alg="RS256"):
    h = _b64(json.dumps({"alg": alg, "kid": kid, "typ": "JWT"}).encode())
    p = _b64(json.dumps(claims).encode())
    return f"{h}.{p}.{_b64(pkcs1_15.new(key).sign(SHA256.new(f'{h}.{p}'.encode())))}"


def jwks(key=KEY, kid="k1"):
    n = key.n.to_bytes((key.n.bit_length() + 7) // 8, "big")
    return {"keys": [{"kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid, "n": _b64(n), "e": _b64(key.e.to_bytes(3, "big"))}]}


# Shape of the live https://auth.world.org/.well-known/openid-configuration (fetched 2026-11-06).
DISCOVERY = {"issuer": ISSUER, "authorization_endpoint": ISSUER + "/api/v1/authorize",
             "token_endpoint": ISSUER + "/api/v1/token", "device_authorization_endpoint": ISSUER + "/api/v1/device_authorization",
             "jwks_uri": ISSUER + "/.well-known/jwks.json", "code_challenge_methods_supported": ["S256"],
             "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "private_key_jwt", "none"]}


class FakeWorld:
    """discovery + JWKS + token endpoint + device authorization endpoint."""

    def __init__(self, now):
        self.clock = now
        self.posts = []
        self.token = None  # (status, body) or callable
        self.jwks = jwks()

    def get(self, url):
        if url.endswith("/openid-configuration"):
            return DISCOVERY
        assert url == DISCOVERY["jwks_uri"]
        return self.jwks

    def post(self, url, *, data=None, json=None, headers=None):
        self.posts.append((url, data, headers))
        if url == DISCOVERY["device_authorization_endpoint"]:
            return 200, {"device_code": "dev-code-secret", "user_code": "WXYZ-1234", "verification_uri": "https://world.org/device",
                         "verification_uri_complete": "https://world.org/device?user_code=WXYZ-1234", "expires_in": 600, "interval": 5}
        t = self.token(data) if callable(self.token) else self.token
        return t


def claims(**kw):
    return {"iss": ISSUER, "aud": CLIENT, "sub": "pairwise-sub", "exp": NOW + 300, "iat": NOW - 5,
            "auth_time": NOW - 5, "nonce": "n0nce", "acr": "https://world.org/oidc/acr/orb", "amr": ["pop"], **kw}


def verifier(world=None, **kw):
    w = world or FakeWorld(NOW)
    t = {"now": NOW}
    v = OIDCAgentPass(issuer=ISSUER, client_id=CLIENT, client_secret=SECRET, redirect_uri="https://app.example/agent-pass/cb",
                      max_age=600, http_get=w.get, http_post=w.post, now=lambda: t["now"], **kw)
    return v, w, t


CODE = {"code": "auth-code", "code_verifier": "v" * 43}

# ------------------------------------------------------------ code flow


def test_code_flow_approves_and_sends_pkce_and_client_secret_post():
    v, w, _ = verifier()
    w.token = (200, {"id_token": jwt(claims()), "access_token": "x", "token_type": "Bearer"})
    assert v.verify(CODE, "n0nce").approved
    url, form, headers = w.posts[0]
    assert url == DISCOVERY["token_endpoint"]
    assert form == {"grant_type": "authorization_code", "code": "auth-code", "code_verifier": "v" * 43,
                    "redirect_uri": "https://app.example/agent-pass/cb", "client_id": CLIENT, "client_secret": SECRET}
    assert headers is None


def test_client_secret_basic():
    v, w, _ = verifier(client_auth="client_secret_basic")
    w.token = (200, {"id_token": jwt(claims())})
    assert v.verify(CODE, "n0nce").approved
    _, form, headers = w.posts[0]
    assert "client_secret" not in form and "client_id" not in form
    assert base64.b64decode(headers["Authorization"].split()[1]).decode() == f"{CLIENT}:{SECRET}"


@pytest.mark.parametrize("token,reason", [
    ((400, {"error": "access_denied"}), "denied"),
    ((400, {"error": "invalid_grant", "error_description": "code expired"}), "expired"),
    ((401, {"error": "invalid_client", "error_description": f"bad secret {SECRET}"}), "token_exchange_failed"),
    ((200, {"access_token": "no id token"}), "token_exchange_failed"),
])
def test_code_flow_token_errors(token, reason):
    v, w, _ = verifier()
    w.token = token
    r = v.verify(CODE, "n0nce")
    assert not r.approved and r.reason == reason and SECRET not in r.reason


@pytest.mark.parametrize("err", ["access_denied", "consent_required", "login_required"])
def test_redirect_error_is_denied_without_calling_world(err):
    v, w, _ = verifier()
    assert v.verify({"error": err}, "n0nce").reason == "denied"
    assert w.posts == []


def test_only_the_registered_redirect_uri():
    v, w, _ = verifier()
    w.token = (200, {"id_token": jwt(claims())})
    assert v.verify({**CODE, "redirect_uri": "https://evil.example/cb"}, "n0nce").reason == "invalid_request"
    assert v.verify({**CODE, "redirect_uri": "https://app.example/agent-pass/cb"}, "n0nce").approved


@pytest.mark.parametrize("bad,reason", [
    ({"nonce": "other"}, "nonce_mismatch"),
    ({"exp": NOW}, "expired"),
    ({"exp": True}, "expired"),  # bool is not a timestamp
    ({"auth_time": NOW - 601}, "expired"),
    ({"iat": NOW + 3600}, "invalid_token"),
    ({"aud": ["someone-else"]}, "invalid_token"),
    ({"azp": "another-client"}, "invalid_token"),
    ({"iss": "https://id.worldcoin.org"}, "invalid_token"),
    ({"sub": ""}, "invalid_token"),
])
def test_claims(bad, reason):
    v, w, _ = verifier()
    w.token = (200, {"id_token": jwt(claims(**bad))})
    r = v.verify(CODE, "n0nce")
    assert not r.approved and r.reason == reason


def test_signature_kid_alg_and_rotation():
    v, w, _ = verifier()
    assert v.verify({"id_token": jwt(claims(), key=ROTATED)}, "n0nce").reason == "invalid_token"
    assert v.verify({"id_token": jwt(claims(), kid="unknown")}, "n0nce").reason == "invalid_token"
    assert v.verify({"id_token": jwt(claims(), alg="HS256")}, "n0nce").reason == "invalid_token"
    w.jwks = jwks(ROTATED, kid="k2")  # World rotated keys: JWKS is fetched per verification
    assert v.verify({"id_token": jwt(claims(), key=ROTATED, kid="k2")}, "n0nce").approved


def test_required_acr_and_discovery_issuer_pin():
    v, w, _ = verifier(required_acr=["https://world.org/oidc/acr/orb-face"])
    w.token = (200, {"id_token": jwt(claims())})
    assert v.verify(CODE, "n0nce").reason == "insufficient_assurance"
    w2 = FakeWorld(NOW)
    w2.get = lambda url: {**DISCOVERY, "issuer": "https://evil.example"}
    v2, _, _ = verifier(w2)
    assert v2.verify(CODE, "n0nce").reason == "issuer_mismatch"


# ------------------------------------------------------------ device flow (server-side polling)


def test_device_flow_pending_then_approved_and_single_use():
    v, w, t = verifier()
    d = v.start_device("n0nce")
    assert d["verification_uri"] == "https://world.org/device?user_code=WXYZ-1234" and d["user_code"] == "WXYZ-1234"
    assert "dev-code-secret" not in json.dumps(d)  # the device_code never leaves the server
    assert w.posts[0][1] == {"scope": "openid", "client_id": CLIENT, "client_secret": SECRET}
    w.token = (400, {"error": "authorization_pending"})
    assert v.poll_device(d["device_session"], "n0nce") == "pending"
    t["now"] += 1
    assert v.poll_device(d["device_session"], "n0nce") == "pending"  # throttled: no request inside the interval
    assert len(w.posts) == 2
    t["now"] += 5
    w.token = (200, {"id_token": jwt(claims(nonce=None, auth_time=NOW + 3, iat=NOW + 3, exp=NOW + 900))})
    r = v.verify({"device_session": d["device_session"]}, "n0nce")
    assert r.approved
    assert w.posts[-1][1] == {"grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": "dev-code-secret",
                              "client_id": CLIENT, "client_secret": SECRET}
    with pytest.raises(WorldError, match="not_found"):
        v.poll_device(d["device_session"], "n0nce")


@pytest.mark.parametrize("token,reason", [
    ((400, {"error": "access_denied"}), "denied"),
    ((400, {"error": "expired_token"}), "expired"),
    ((500, {}), "token_exchange_failed"),
])
def test_device_flow_terminal_outcomes(token, reason):
    v, w, _ = verifier()
    d = v.start_device("n0nce")
    w.token = token
    r = v.verify({"device_session": d["device_session"]}, "n0nce")
    assert not r.approved and r.reason == reason


def test_device_flow_binding_expiry_and_stale_login():
    v, w, t = verifier()
    d = v.start_device("n0nce")
    with pytest.raises(WorldError, match="nonce_mismatch"):
        v.poll_device(d["device_session"], "another-agents-nonce")
    w.token = (200, {"id_token": jwt(claims(auth_time=NOW - 300))})  # a login from BEFORE the request started
    assert v.verify({"device_session": d["device_session"]}, "n0nce").reason == "expired"
    d2 = v.start_device("n0nce")
    t["now"] += 601
    assert v.verify({"device_session": d2["device_session"]}, "n0nce").reason == "expired"


# ------------------------------------------------------------ service: denied / expired create NO mandate


def service(tmp_path, v):
    store = MerchantAgentStore(tmp_path / "a.sqlite", SecretBox(bytes(range(32))), now=lambda: NOW)
    deps = AgentDeps(indexer=None, advances=list, request_offer=None, draw_by_mandate=None, chain_id=31337,
                     book_address=BOOK, settings=SimpleNamespace(attestation_ttl_seconds=3600), now=lambda: NOW)
    from mra_agents.world import Attester
    return MerchantAgentService(store, deps, v, Attester(ATTESTER_KEY, 31337, BOOK))


@pytest.mark.parametrize("request_,token,reason", [
    ({"error": "access_denied"}, None, "denied"),
    (CODE, (400, {"error": "access_denied"}), "denied"),
    (CODE, (400, {"error": "invalid_grant"}), "expired"),
    (CODE, "stale", "expired"),
    (CODE, "wrong-nonce", "nonce_mismatch"),
])
def test_real_denied_or_expired_creates_no_attestation(tmp_path, request_, token, reason):
    v, w, _ = verifier()
    svc = service(tmp_path, v)
    created = svc.create(SHOP, 1, RECIPIENT, LIM)
    if token == "stale":
        token = (200, {"id_token": jwt(claims(nonce=created["agent_pass_nonce"], auth_time=NOW - 3600))})
    elif token == "wrong-nonce":
        token = (200, {"id_token": jwt(claims(nonce="0" * 64))})
    w.token = token
    out = svc.agent_pass(created["id"], request_)
    assert out == {"approved": False, "reason": reason, "attestation": None}
    rec = svc.store.get(created["id"])
    assert rec.status == "denied" and not rec.attestation
    with pytest.raises(ValueError):
        svc.activate(created["id"], 1)


def test_real_approval_binds_attestation_to_agent_and_limits(tmp_path):
    v, w, _ = verifier()
    svc = service(tmp_path, v)
    created = svc.create(SHOP, 1, RECIPIENT, LIM)
    assert created["agent_pass_nonce"] == agent_pass_nonce(created["agent_address"], limits_hash(LIM), svc.store.get(created["id"]).attest_nonce)
    w.token = (200, {"id_token": jwt(claims(nonce=created["agent_pass_nonce"]))})
    out = svc.agent_pass(created["id"], CODE)
    assert out["approved"] and out["attestation"]["agentKey"] == created["agent_address"]
    assert out["attestation"]["limitsHash"] == created["limits_hash"]
    assert "pairwise-sub" not in json.dumps(out)  # never return or store `sub`


# ------------------------------------------------------------ API: device flow routes


def api(tmp_path, v):
    svc = service(tmp_path, v)
    rec = RecoveryService(IDKitVerifier(app_id="app_1", rp_id="rp_1", action="credential-recovery-v1", environment="production",
                                        base_url="https://developer.world.org", signing_key="0x" + "ab" * 32,
                                        http_post=lambda *a, **k: (200, {"success": True}), now=lambda: NOW),
                          SecretBox(bytes(range(32))), tmp_path / "r.sqlite", action="credential-recovery-v1", now=lambda: NOW)
    stub = SimpleNamespace()
    return TestClient(create_app(stub, stub, stub, stub, stub, merchant=svc, recovery=rec)), svc


LIMITS = {"max_per_draw": 100_000_000, "max_per_period": 200_000_000, "period": 2_592_000, "expiry": NOW + 86_400 * 60}


def test_api_device_flow_pending_does_not_deny_then_approves(tmp_path):
    v, w, t = verifier()
    client, svc = api(tmp_path, v)
    body = client.post("/agents", json={"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS}).json()
    auth = {"Authorization": f"Bearer {body['manage_token']}"}
    assert client.post(f"/agents/{body['id']}/agent-pass/device").status_code == 401
    d = client.post(f"/agents/{body['id']}/agent-pass/device", headers=auth).json()
    assert d["verification_uri"].startswith("https://") and "device_code" not in d
    w.token = (400, {"error": "authorization_pending"})
    r = client.post(f"/agents/{body['id']}/agent-pass", json={"device_session": d["device_session"]}, headers=auth).json()
    assert r == {"approved": False, "reason": "pending", "attestation": None}
    assert svc.store.get(body["id"]).status == "pending_approval"  # pending is not a denial
    status_url = f"/agents/{body['id']}/agent-pass/device/{d['device_session']}"
    t["now"] += 5
    assert client.get(status_url, headers=auth).json() == {"status": "pending"}
    t["now"] += 5
    w.token = (200, {"id_token": jwt(claims(nonce=None, auth_time=NOW + 2, iat=NOW + 2))})
    assert client.get(status_url, headers=auth).json() == {"status": "ready"}
    assert client.get(status_url, headers=auth).json() == {"status": "ready"}  # non-consuming
    r = client.post(f"/agents/{body['id']}/agent-pass", json={"device_session": d["device_session"]}, headers=auth).json()
    assert r["approved"] and r["attestation"]["agentKey"] == body["agent_address"]


def test_api_redirect_error_records_denial(tmp_path):
    v, _, _ = verifier()
    client, _svc = api(tmp_path, v)
    body = client.post("/agents", json={"shop_id": SHOP, "tier": 1, "recipient": RECIPIENT, "limits": LIMITS}).json()
    auth = {"Authorization": f"Bearer {body['manage_token']}"}
    r = client.post(f"/agents/{body['id']}/agent-pass", json={"error": "access_denied"}, headers=auth).json()
    assert r == {"approved": False, "reason": "denied", "attestation": None}
    assert client.post(f"/agents/{body['id']}/agent-pass", json={"error": "Bad Value!"}, headers=auth).status_code == 400


def test_api_rp_context_route(tmp_path):
    v, _, _ = verifier()
    client, _ = api(tmp_path, v)
    r = client.post("/recovery/rp-context").json()
    assert r["app_id"] == "app_1" and r["action"] == "credential-recovery-v1" and r["environment"] == "production"
    ctx = r["rp_context"]
    assert set(ctx) == {"rp_id", "nonce", "created_at", "expires_at", "signature"} and ctx["rp_id"] == "rp_1"
    assert ctx["expires_at"] - ctx["created_at"] == 300
    assert "ab" * 32 not in json.dumps(r)


# ------------------------------------------------------------ World ID 4.0 RP signatures (docs test vectors)

V_KEY = "0x" + "ab" * 32
V_NONCE = bytes.fromhex("008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd")


def test_hash_to_field_vectors():
    assert hash_to_field(b"").hex() == "00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4"
    assert hash_to_field(b"test_signal").hex() == "00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed"
    assert hash_to_field(bytes([1, 2, 3])).hex() == "00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92"
    assert hash_to_field(b"hello").hex() == "001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea"


def test_rp_message_vectors():
    assert rp_signature_message(V_NONCE, 1700000000, 1700000300).hex() == \
        "01008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd000000006553f100000000006553f22c"
    assert rp_signature_message(V_NONCE, 1700000000, 1700000300, "test-action").hex() == (
        "01008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd000000006553f100000000006553f22c"
        "00aa0ce59768ae5b1c52f07a9387f14f09f277422c0d2f8a268c7bad0c60a46a")


@pytest.mark.parametrize("action,sig", [
    (None, "0x14f693175773aed912852a601e9c0fd30f2afe2738d31388316232ce6f64ae9e4edbfb19d81c4229ba9c9fca78ede4b28956b7ba4415f08d957cbc1b3bdaa4021b"),
    ("test-action", "0x05594adb6c1495768a38d523d7d6ee6356b2c31231919198794ed022ade7d08f73753f83bd167067d99c9b969d28e9222315837c66af25867b041273a6d5056f1b"),
])
def test_sign_request_vectors(action, sig):
    out = sign_rp_request(V_KEY, action, created_at=1700000000, ttl=300, random=bytes(range(32)))
    assert out == {"sig": sig, "nonce": "0x" + V_NONCE.hex(), "created_at": 1700000000, "expires_at": 1700000300}
    msg = rp_signature_message(V_NONCE, 1700000000, 1700000300, action)
    assert Account.recover_message(encode_defunct(primitive=msg), signature=sig) == Account.from_key(V_KEY).address


# ------------------------------------------------------------ IDKit verify (v4 endpoint)


def idkit_verifier(responder, signing_key="0x" + "ab" * 32):
    calls = []

    def post(url, *, json=None, **_):
        calls.append((url, json))
        return responder(json)
    return IDKitVerifier(app_id="app_1", rp_id="rp_1", action="credential-recovery-v1", environment="production",
                         base_url="https://developer.world.org", http_post=post, signing_key=signing_key, now=lambda: NOW), calls


def v4_result(nonce, nullifier="12345678901234567890", env="production", action="credential-recovery-v1"):
    # IDKitResultV4 (idkit-core 4.6.0 types): nullifier is decimal there; docs examples use 0x-hex.
    return {"protocol_version": "4.0", "nonce": nonce, "action": action, "environment": env,
            "responses": [{"identifier": "proof_of_human", "signal_hash": "0x0", "proof": ["0x1", "0x2", "0x3", "0x4", "0x5"],
                           "nullifier": nullifier, "issuer_schema_id": 1, "expires_at_min": 0}]}


OK = lambda _: (200, {"success": True, "results": [{"identifier": "proof_of_human", "success": True}], "environment": "production"})


def test_idkit_v4_decimal_nullifier_rp_url_and_pinned_environment():
    v, calls = idkit_verifier(OK)
    nonce = v.rp_context()["rp_context"]["nonce"]
    payload = v4_result(nonce)
    payload.pop("environment")  # even if the client omits it, we pin ours
    assert v.verify(payload) == "0x" + format(12345678901234567890, "064x")
    url, body = calls[0]
    assert url == "https://developer.world.org/api/v4/verify/rp_1"
    assert body == {**payload, "environment": "production"}


def test_idkit_nonce_must_be_ours_and_single_use():
    v, _ = idkit_verifier(OK)
    nonce = v.rp_context()["rp_context"]["nonce"]
    v.verify(v4_result(nonce))
    with pytest.raises(WorldError, match="unknown_or_used_nonce"):
        v.verify(v4_result(nonce))  # replay
    with pytest.raises(WorldError, match="unknown_or_used_nonce"):
        v.verify(v4_result("0x" + "00" * 32))


@pytest.mark.parametrize("resp", [
    (400, {"success": False, "code": "all_verifications_failed", "detail": "x"}),
    (200, {"success": True, "environment": "staging"}),
    (200, {"success": True, "results": [{"identifier": "proof_of_human", "success": False}]}),
    (200, {"success": True, "nullifier": "0x" + "99" * 32}),  # World's nullifier disagrees with the proof's
    (200, {"success": True, "action": "another-action"}),
])
def test_idkit_rejects_bad_verify_responses(resp):
    v, _ = idkit_verifier(lambda _: resp)
    with pytest.raises(WorldError):
        v.verify(v4_result(v.rp_context()["rp_context"]["nonce"]))


def test_idkit_hex_nullifier_and_world_nullifier_agree():
    n = "0x" + "12" * 32
    v, _ = idkit_verifier(lambda _: (200, {"success": True, "results": [{"identifier": "proof_of_human", "success": True, "nullifier": n}]}))
    assert v.verify(v4_result(v.rp_context()["rp_context"]["nonce"], nullifier=n)) == n
    with pytest.raises(WorldError, match="wrong_environment"):
        v.verify(v4_result("x", env="sandbox"))
    with pytest.raises(WorldError, match="invalid_request"):
        v.verify(v4_result("x", nullifier="12ab"))  # neither 0x-hex nor decimal


def test_rp_context_needs_signing_key():
    v, _ = idkit_verifier(OK, signing_key=None)
    with pytest.raises(WorldError, match="rp_signing_not_configured"):
        v.rp_context()


# ------------------------------------------------------------ settings + CORS


def test_settings_wiring(monkeypatch):
    for k in ("WORLD_RP_SIGNING_KEY", "RP_SIGNING_KEY", "WORLD_SIGNING_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("RP_SIGNING_KEY", "0x" + "cd" * 32)  # the name docs.world.org uses
    s = Settings(_env_file=None, world_mock=False, world_app_id="app_1", world_rp_id="rp_1",
                 world_agent_pass_client_id=CLIENT, world_agent_pass_client_secret=SECRET,
                 world_agent_pass_client_auth="client_secret_basic")
    rv = make_recovery_verifier(s)
    assert isinstance(rv, IDKitVerifier) and rv.rp_id == "rp_1" and rv.rp_context()["rp_context"]["rp_id"] == "rp_1"
    av = make_agent_pass_verifier(s)
    assert isinstance(av, OIDCAgentPass) and av.issuer == ISSUER and av.client_auth == "client_secret_basic"
    assert av.required_acr == []


def test_deploy_env_aliases(monkeypatch):
    monkeypatch.setenv("WORLD_OIDC_CLIENT_ID", "app_alias")
    monkeypatch.setenv("WORLD_OIDC_CLIENT_SECRET", "sk_alias")
    monkeypatch.setenv("WORLD_OIDC_ISSUER", "https://sandbox.auth.world.org")
    s = Settings(_env_file=None)
    assert s.world_agent_pass_client_id == "app_alias" and s.world_agent_pass_issuer == "https://sandbox.auth.world.org"
    assert s.world_agent_pass_client_secret.get_secret_value() == "sk_alias"


def test_cors_from_env_and_settings(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://app.example.xyz, https://portal.example.xyz/,*")
    assert cors_origins() == ["https://app.example.xyz", "https://portal.example.xyz"]
    stub = SimpleNamespace(status=lambda: {"signals": {}, "triggers": [], "last_tick": None})
    client = TestClient(create_app(stub, stub, stub, stub, stub))
    pre = client.options("/offers", headers={"Origin": "https://portal.example.xyz", "Access-Control-Request-Method": "POST",
                                              "Access-Control-Request-Headers": "authorization,content-type"})
    assert pre.headers["access-control-allow-origin"] == "https://portal.example.xyz"
    bad = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
