import threading
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from mra_agents.sim import SimStore
from mra_agents.sim_api import build_router


def test_endpoints_and_queue(tmp_path):
    store = SimStore(tmp_path / 'sim.db', per_hour=2)
    started = threading.Event()
    release = threading.Event()

    def execute(run_id, db):
        started.set()
        release.wait(2)
        db.update(run_id, lambda r: r['steps'].append({
            'i': 0, 'at': time.time(), 'sim_day': 0, 'kind': 'info', 'title': 'Real executor hook', 'detail': '', 'data': {}, 'tx': None}))

    app = FastAPI()
    app.include_router(build_router(store, execute, lambda: {'reserve': 1.0}))
    with TestClient(app) as client:
        archetypes = client.get('/sim/archetypes').json()
        assert {a['id'] for a in archetypes} == {'honest_kiosk', 'slow_week', 'wash_ring', 'defaulter', 'repeat_borrower'}
        assert all(set(a) == {'id', 'name', 'city', 'emoji', 'blurb', 'expected'} for a in archetypes)
        assert client.post('/sim/runs', json={'archetype': 'invalid'}).status_code == 400
        first = client.post('/sim/runs', json={'archetype': 'honest_kiosk'}).json()['run_id']
        assert started.wait(2)
        second = client.post('/sim/runs', json={'archetype': 'wash_ring'}).json()['run_id']
        queued = client.get('/sim/runs/' + second).json()
        assert queued['status'] == 'queued' and queued['ahead'] == 1
        assert set(queued) == {'run_id', 'archetype', 'status', 'ahead', 'started_at', 'shop', 'steps', 'ledger', 'done_reason'}
        assert client.post('/sim/runs', json={'archetype': 'slow_week'}).status_code == 429
        assert client.get('/sim/runs/missing').status_code == 404
        state = client.get('/sim/state').json()
        assert state['ledger'] == {'reserve': 1.0}
        assert set(state['recent'][0]) == {'id', 'archetype', 'status', 'done_reason'}
        release.set()
        for _ in range(200):
            if store.get(second)['status'] == 'done':
                break
            time.sleep(.01)
        assert store.get(first)['steps'][0]['title'] == 'Real executor hook'
        assert store.get(second)['status'] == 'done'


def test_sim_cors_is_scoped(tmp_path, monkeypatch):
    from mra_agents.api import create_app
    from mra_agents.sim_api import SimMount, origin_regex

    monkeypatch.setenv('HOST_SUFFIX', 'example.test')
    store = SimStore(tmp_path / 'sim.db')
    app = create_app(None, None, None, None, None,
                     sim=SimMount(store, lambda *_: None, dict, origin_regex()))
    with TestClient(app) as client:
        headers = {'Origin': 'https://app.example.test', 'Access-Control-Request-Method': 'POST'}
        assert client.options('/sim/runs', headers=headers).headers['access-control-allow-origin'] == headers['Origin']
        assert 'access-control-allow-origin' not in client.get('/health', headers=headers).headers
        assert 'access-control-allow-origin' not in client.get('/sim/archetypes', headers={'Origin': 'https://evil.test'}).headers
        assert client.get('/sim/archetypes', headers={'Origin': 'http://localhost:3000'}).headers['access-control-allow-origin'] == 'http://localhost:3000'
