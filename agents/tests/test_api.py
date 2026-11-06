from types import SimpleNamespace

from fastapi.testclient import TestClient
from pydantic import SecretStr

from mra_agents.api import RATE_LIMIT, create_app
from mra_agents.models import Decision, ShopFeatures

SHOP = "0x" + "1" * 64
ADDRESS = "0x" + "a" * 40
TX = "0x" + "2" * 64


def setup():
    decision = Decision(decision_id="d", created_at=1, shop_id=SHOP, tier=1, features_hash=TX,
                        redline_hits=[], draft=None, verdict=None, clamp_changes=[], result="declined")
    features = ShopFeatures(shop_id=SHOP, as_of=1, days_active_30d=7, revenue_7d_usd=1,
        revenue_30d_usd=1, revenue_90d_usd=1, avg_daily_revenue_30d_usd=1,
        daily_revenue_30d_usd=[1]*30, revenue_cv_30d=0, trend_slope_30d=0, sales_count_30d=1,
        unique_payers_30d=5, top_payer_share_30d=0.2, hhi_payers_30d=0.2,
        new_payer_share_30d=0, round_amount_share_30d=0, hour_of_day_entropy=0,
        spike_ratio=1, funded_by_shop_share=0, shop_label="payer " + ADDRESS)
    pipeline = SimpleNamespace(request_offer=lambda *args: decision,
        indexer=SimpleNamespace(sales_for=lambda *args: [], sync=lambda: 0), now=lambda: 1_800_000_000,
        settings=SimpleNamespace(payer_hash_key=SecretStr("test")), build_features=lambda *args: features)
    calls = []
    relayer = SimpleNamespace(draw_first=lambda *args: calls.append(args) or TX,
        register_mandate=lambda *args: calls.append(args) or TX,
        draw_with_pass=lambda *args: calls.append(args) or TX, claim=lambda *args: calls.append(args) or TX)
    reader = SimpleNamespace(advances=lambda: [SimpleNamespace(advance_id=1, shop_id=SHOP)],
        usdc_funders=lambda *args: {}, shop_payout=lambda *args: ADDRESS)
    store = SimpleNamespace(get=lambda id: decision if id == "d" else None,
                            latest_for_shop=lambda id: decision)
    risk = SimpleNamespace(status=lambda: {"signals": {"triggered": False}, "triggers": [], "last_tick": None})
    return TestClient(create_app(pipeline, relayer, reader, store, risk)), pipeline, calls


def signed(tier):
    return {"offer": {"offer_id": TX, "shop_id": SHOP, "recipient": ADDRESS, "amount": 50000000,
        "fee_rate_bps_per_week": 50, "fee_cap_bps": 300, "holdback_bps": 500, "tier": tier,
        "pass_nullifier": 1 if tier == 0 else 0, "min_revenue_band": 0, "expires_at": 1800000000},
        "signature": "0x" + "aa" * 65, "digest": TX}


def test_endpoints_and_privacy():
    client, _, calls = setup()
    assert client.post('/offers', json={"shop_id": SHOP, "tier": 1, "recipient": ADDRESS}).json()["decision_id"] == 'd'
    assert client.post('/relay/draw-first', json={"signed_offer": signed(0), "proof": "0xabcd", "root": 1, "commitment_next": 3}).json() == {"tx_hash": TX}
    assert calls[0][1:] == ("0xabcd", 1, 3)
    assert client.post('/relay/draw-with-pass', json={"signed_offer": signed(1), "proof": "0x1234", "root": 1, "nullifier": 2, "commitment_next": 3}).status_code == 200
    assert calls[1][1] == "0x1234"  # the relayer validates and decodes the hex itself
    mandate = {"shop_id": SHOP, "agent_key": ADDRESS, "recipient": ADDRESS,
               "limits": {"max_per_draw": 50_000_000, "max_per_period": 100_000_000, "period": 86400, "expiry": 1_800_000_000},
               "tier": 0, "band": 1, "proof": "0x01", "root": 1, "nullifier": 2, "commitment_next": 3,
               "attestation_nonce": 42, "attestation_expiry": 1_800_000_000, "attestation_signature": "0x" + "aa" * 65,
               "owner_signature": "0x" + "bb" * 65}
    assert client.post('/relay/register-mandate', json=mandate).status_code == 200
    assert calls[2][0][3] == (50_000_000, 100_000_000, 86400, 1_800_000_000) and calls[2][5] == 42
    assert client.post('/relay/claim/1').status_code == 200
    assert client.post('/relay/claim/2').status_code == 404
    assert client.get('/decisions/d').status_code == 200
    assert client.get('/decisions/missing').status_code == 404
    assert client.get("/risk/status").json() == {"signals": {"triggered": False}, "triggers": [], "last_tick": None}
    assert client.get('/health').json() == {"status": "ok"}
    import re
    insight = client.get(f'/shops/{SHOP}/insights')
    assert insight.status_code == 200
    assert not re.search(r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])', insight.text)
    assert insight.json()['features']['shop_id'] == SHOP


def test_validation_and_sanitized_errors():
    client, pipeline, _ = setup()
    for data in ({"shop_id": "bad", "tier": 1, "recipient": ADDRESS},
                 {"shop_id": SHOP, "tier": 4, "recipient": ADDRESS},
                 {"shop_id": SHOP, "tier": True, "recipient": ADDRESS},
                 {"shop_id": SHOP, "tier": 1, "recipient": ADDRESS, "pass_nullifier": 1},
                 {"shop_id": SHOP, "tier": 0, "recipient": ADDRESS, "min_revenue_band": 256}):
        assert client.post('/offers', json=data).status_code == 400
    assert client.post('/relay/draw-first', json={"signed_offer": signed(1), "proof": "0x01", "root": 1, "commitment_next": 1}).status_code == 400
    assert client.post('/relay/claim/nope').status_code == 400
    def fail(*args):
        raise RuntimeError('Traceback: secret')
    pipeline.request_offer = fail
    response = client.post('/offers', json={"shop_id": SHOP, "tier": 1, "recipient": ADDRESS})
    assert response.status_code == 502
    assert 'Traceback' not in response.text and 'secret' not in response.text


def test_rate_limit_and_cors(monkeypatch):
    monkeypatch.setenv('CORS_ALLOW_ORIGINS', 'https://allowed.example')
    client, _, _ = setup()
    for _ in range(RATE_LIMIT):
        assert client.post('/offers', json={"shop_id": SHOP, "tier": 1, "recipient": ADDRESS}).status_code == 200
    assert client.post('/relay/claim/1').status_code == 429
    assert client.get('/health', headers={"Origin": "https://allowed.example"}).headers['access-control-allow-origin'] == 'https://allowed.example'
    assert 'access-control-allow-origin' not in client.get('/health', headers={"Origin": "https://evil.example"}).headers
