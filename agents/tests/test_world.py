import base64
import json
import sqlite3
from types import SimpleNamespace

import pytest
from Crypto.Hash import SHA256
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from eth_abi import encode
from eth_account import Account
from eth_utils import keccak, to_checksum_address

from mra_agents.merchant_agents import AgentDeps, MerchantAgentService, MerchantAgentStore
from mra_agents.secretbox import SecretBox
from mra_agents.world import (
    ATTESTATION_TYPE,
    LIMITS_TYPE,
    Attester,
    IDKitVerifier,
    Limits,
    MockAgentPass,
    MockIDKit,
    OIDCAgentPass,
    RecoveryService,
    WorldError,
    agent_pass_nonce,
    limits_hash,
    recover_attestation_signer,
)

NOW = 1_800_000_000
BOOK = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f"
ATTESTER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SHOP = "0x" + "1" * 64
LIM = Limits(max_per_draw=100_000_000, max_per_period=200_000_000, period=30 * 86_400, expiry=NOW + 86_400 * 90)


# ------------------------------------------------------------ attestation EIP-712


def manual_digest(agent, lim, nonce, expiry, chain_id=31337, book=BOOK):
    """Independent re-implementation of what Solidity will do (abi.encode + keccak)."""
    lt = keccak(text=LIMITS_TYPE)
    lh = keccak(encode(["bytes32", "uint256", "uint256", "uint64", "uint64"],
                       [lt, lim.max_per_draw, lim.max_per_period, lim.period, lim.expiry]))
    at = keccak(text=ATTESTATION_TYPE)
    sh = keccak(encode(["bytes32", "address", "bytes32", "uint256", "uint64"], [at, agent, lh, nonce, expiry]))
    dt = keccak(text="EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    ds = keccak(encode(["bytes32", "bytes32", "bytes32", "uint256", "address"],
                       [dt, keccak(text="AdvanceBook"), keccak(text="1"), chain_id, book]))
    return "0x" + lh.hex(), "0x" + keccak(b"\x19\x01" + ds + sh).hex()


def test_attestation_signature_recovers_to_attester_and_matches_manual_digest():
    agent = to_checksum_address("0x" + "a1" * 20)
    att = Attester(ATTESTER_KEY, 31337, BOOK).sign(agent, LIM, 42, NOW + 3600)
    lh, digest = manual_digest(agent, LIM, 42, NOW + 3600)
    assert att["attestation"]["limitsHash"] == lh == limits_hash(LIM)
    assert att["digest"] == digest
    assert recover_attestation_signer(att["attestation"], att["signature"], 31337, BOOK) == \
        Account.from_key(ATTESTER_KEY).address == att["attester"]
    assert Account._recover_hash(bytes.fromhex(digest[2:]), signature=att["signature"]) == att["attester"]
    sig = bytes.fromhex(att["signature"][2:])
    assert len(sig) == 65 and sig[64] in (27, 28)
    # any changed field breaks it
    tampered = {**att["attestation"], "nonce": "43"}
    assert recover_attestation_signer(tampered, att["signature"], 31337, BOOK) != att["attester"]
    assert ATTESTER_KEY[2:] not in json.dumps(att)


def test_limits_validation():
    with pytest.raises(ValueError):
        Limits(max_per_draw=100_000_000, max_per_period=50_000_000, period=86_400, expiry=NOW + 10)
    with pytest.raises(ValueError):
        Limits(max_per_draw=10, max_per_period=50_000_000, period=86_400, expiry=NOW + 10)
    with pytest.raises(WorldError):
        Limits(max_per_draw=50_000_000, max_per_period=50_000_000, period=86_400, expiry=NOW).check_expiry(NOW)


# ------------------------------------------------------------ Agent Pass: mock approve / deny / expire


def service(tmp_path, verifier=None):
    store = MerchantAgentStore(tmp_path / "a.sqlite", SecretBox(bytes(range(32))), now=lambda: NOW)
    deps = AgentDeps(indexer=None, advances=list, request_offer=None, draw_by_mandate=None,
                     chain_id=31337, book_address=BOOK, settings=SimpleNamespace(attestation_ttl_seconds=3600),
                     now=lambda: NOW)
    return MerchantAgentService(store, deps, verifier or MockAgentPass(), Attester(ATTESTER_KEY, 31337, BOOK))


@pytest.mark.parametrize("outcome,approved", [("approve", True), ("deny", False), ("expire", False)])
def test_mock_agent_pass(tmp_path, outcome, approved):
    svc = service(tmp_path)
    created = svc.create(SHOP, 1, "0x" + "b" * 40, LIM)
    out = svc.agent_pass(created["id"], {"mock": outcome})
    assert out["approved"] is approved
    if approved:
        assert out["attestation"]["agentKey"] == created["agent_address"]
        assert out["attestation"]["limitsHash"] == created["limits_hash"]
        assert out["attestation"]["expiry"] == NOW + 3600
        assert recover_attestation_signer(out["attestation"], out["signature"], 31337, BOOK) == out["attester"]
        assert svc.store.get(created["id"]).status == "approved"
    else:
        assert out["attestation"] is None and out["reason"] == {"deny": "denied", "expire": "expired"}[outcome]
        assert svc.store.get(created["id"]).status == "denied"
        with pytest.raises(ValueError):
            svc.activate(created["id"], 1)  # no attestation -> no mandate


# ------------------------------------------------------------ Agent Pass: real OIDC path (fake HTTP)

RSA_KEY = RSA.generate(2048)
OTHER_KEY = RSA.generate(2048)
ISSUER = "https://auth.world.org"


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def jwt(claims, key=RSA_KEY, kid="k1"):
    h = _b64(json.dumps({"alg": "RS256", "kid": kid}).encode())
    p = _b64(json.dumps(claims).encode())
    sig = pkcs1_15.new(key).sign(SHA256.new(f"{h}.{p}".encode()))
    return f"{h}.{p}.{_b64(sig)}"


def jwks(key=RSA_KEY):
    n = key.n.to_bytes((key.n.bit_length() + 7) // 8, "big")
    return {"keys": [{"kty": "RSA", "kid": "k1", "n": _b64(n), "e": _b64(key.e.to_bytes(3, "big"))}]}


def oidc(token_response=(200, None), claims=None, **kw):
    posts = []

    def get(url):
        if url.endswith("openid-configuration"):
            return {"issuer": ISSUER, "token_endpoint": ISSUER + "/token", "jwks_uri": ISSUER + "/jwks"}
        return jwks()

    def post(url, *, data=None, json=None, headers=None):
        posts.append((url, data))
        status, body = token_response
        return status, body if body is not None else {"id_token": jwt(claims)}
    v = OIDCAgentPass(issuer=ISSUER, client_id="app_123", client_secret="s3cr3t-client", redirect_uri="https://x/cb",
                      max_age=600, http_get=get, http_post=post, now=lambda: NOW, **kw)
    return v, posts


def claims(**kw):
    return {"iss": ISSUER, "aud": "app_123", "sub": "pairwise-sub", "exp": NOW + 300, "iat": NOW - 10,
            "auth_time": NOW - 10, "nonce": "n0nce", **kw}


def test_oidc_agent_pass_approves_valid_code_exchange():
    v, posts = oidc(claims=claims())
    r = v.verify({"code": "c", "code_verifier": "v" * 43}, "n0nce")
    assert r.approved and r.reason == "approved"
    assert posts[0][1]["grant_type"] == "authorization_code" and posts[0][1]["code_verifier"] == "v" * 43


@pytest.mark.parametrize("bad,reason", [
    ({"nonce": "other"}, "nonce_mismatch"),
    ({"exp": NOW - 1}, "expired"),
    ({"auth_time": NOW - 601}, "expired"),
    ({"aud": "someone-else"}, "invalid_token"),
    ({"iss": "https://evil"}, "invalid_token"),
])
def test_oidc_agent_pass_rejects_bad_claims(bad, reason):
    v, _ = oidc(claims=claims(**bad))
    r = v.verify({"code": "c", "code_verifier": "v" * 43}, "n0nce")
    assert not r.approved and r.reason == reason


def test_oidc_agent_pass_rejects_forged_signature_and_denial():
    v, _ = oidc()
    assert v.verify({"id_token": jwt(claims(), key=OTHER_KEY)}, "n0nce").reason == "invalid_token"
    assert v.verify({"id_token": jwt(claims())}, "n0nce").approved
    v2, _ = oidc(token_response=(400, {"error": "access_denied"}))
    assert v2.verify({"code": "c", "code_verifier": "v" * 43}, "n0nce").reason == "denied"
    v3, _ = oidc(token_response=(500, {"error": "boom s3cr3t-client"}))
    r = v3.verify({"code": "c", "code_verifier": "v" * 43}, "n0nce")
    assert not r.approved and "s3cr3t" not in r.reason
    assert v.verify({"mock": "approve"}, "n0nce").reason == "invalid_request"  # mock can't pass real mode


def test_agent_pass_nonce_binds_key_and_limits():
    a = agent_pass_nonce("0x" + "a1" * 20, limits_hash(LIM), 1)
    assert a != agent_pass_nonce("0x" + "a2" * 20, limits_hash(LIM), 1)
    assert a != agent_pass_nonce("0x" + "a1" * 20, limits_hash(LIM.model_copy(update={"period": 86_400})), 1)


# ------------------------------------------------------------ IDKit


def idkit_payload(nullifier="0x" + "12" * 32, action="credential-recovery-v1", env="production"):
    return {"protocol_version": "4", "nonce": "x", "action": action, "environment": env,
            "responses": [{"identifier": "orb", "signal_hash": "0x0", "proof": "0xabc", "nullifier": nullifier,
                           "issuer_schema_id": 1, "expires_at_min": 0}]}


def test_idkit_real_path_with_fake_http():
    calls = []
    ok = IDKitVerifier(app_id="app_1", action="credential-recovery-v1", environment="production",
                       base_url="https://developer.world.org",
                       http_post=lambda url, json=None, **k: calls.append((url, json)) or (200, {"success": True}))
    assert ok.verify(idkit_payload()) == "0x" + "12" * 32
    assert calls[0][0] == "https://developer.world.org/api/v4/verify/app_1"
    assert calls[0][1] == idkit_payload()  # forwarded as-is
    with pytest.raises(WorldError, match="wrong_action"):
        ok.verify(idkit_payload(action="other"))
    with pytest.raises(WorldError, match="wrong_environment"):
        ok.verify(idkit_payload(env="staging"))
    bad = IDKitVerifier(app_id="app_1", action="credential-recovery-v1", environment="production",
                        base_url="https://developer.world.org", http_post=lambda *a, **k: (400, {"code": "x"}))
    with pytest.raises(WorldError, match="verification_failed"):
        bad.verify(idkit_payload())


# ------------------------------------------------------------ recovery round trip


def recovery(tmp_path, now=lambda: NOW):
    return RecoveryService(MockIDKit("credential-recovery-v1"), SecretBox(bytes(range(32))), tmp_path / "r.sqlite",
                           action="credential-recovery-v1", token_ttl=600, now=now)


def test_recovery_round_trip_opaque_blob(tmp_path):
    svc = recovery(tmp_path)
    t = svc.verify({"mock": "approve", "mock_human": "alice"})
    assert t["has_backup"] is False and t["expires_at"] == NOW + 600
    # what the device uploads: already client-side encrypted (we just see opaque bytes)
    blob = b"CLIENT-SIDE-ENCRYPTED::" + bytes(range(256))
    svc.put_backup(t["recovery_token"], blob)
    # new phone, same human -> same nullifier -> same backup
    t2 = svc.verify({"mock": "approve", "mock_human": "alice"})
    assert t2["has_backup"] is True
    assert svc.get_backup(t2["recovery_token"]) == blob
    # a different human finds nothing
    with pytest.raises(LookupError):
        svc.get_backup(svc.verify({"mock": "approve", "mock_human": "mallory"})["recovery_token"])
    # stored wrapped, never as given, never keyed by the raw nullifier
    raw = (tmp_path / "r.sqlite").read_bytes()
    assert b"CLIENT-SIDE-ENCRYPTED" not in raw
    nullifier = MockIDKit("credential-recovery-v1").verify({"mock": "approve", "mock_human": "alice"})
    assert nullifier[2:].encode() not in raw
    rows = sqlite3.connect(tmp_path / "r.sqlite").execute("SELECT owner_key FROM credential_backups").fetchall()
    assert len(rows) == 1 and nullifier[2:] not in rows[0][0]


def test_recovery_backup_never_decrypted_server_side(tmp_path):
    """The service has no client key: whatever bytes arrive go back byte-for-byte, unparsed."""
    svc = recovery(tmp_path)
    tok = svc.verify({"mock": "approve", "mock_human": "bob"})["recovery_token"]
    for blob in (b"\x00\xff not json {", b"x"):
        svc.put_backup(tok, blob)
        assert svc.get_backup(tok) == blob
    assert not any("client" in name.lower() and "decrypt" in name.lower() for name in dir(svc))


def test_recovery_token_rules(tmp_path):
    clock = [NOW]
    svc = recovery(tmp_path, now=lambda: clock[0])
    with pytest.raises(WorldError, match="verification_failed"):
        svc.verify({"mock": "deny", "mock_human": "alice"})
    tok = svc.verify({"mock": "approve", "mock_human": "alice"})["recovery_token"]
    body, mac = tok.split(".")
    with pytest.raises(WorldError, match="invalid_token"):
        svc.put_backup(body + "." + mac[:-2] + "AA", b"x")
    forged = _b64(json.dumps({"o": "00" * 32, "e": NOW + 999}).encode())
    with pytest.raises(WorldError, match="invalid_token"):
        svc.put_backup(forged + "." + mac, b"x")
    with pytest.raises(WorldError, match="bad_backup_size"):
        svc.put_backup(tok, b"")
    clock[0] = NOW + 601
    with pytest.raises(WorldError, match="token_expired"):
        svc.put_backup(tok, b"x")
