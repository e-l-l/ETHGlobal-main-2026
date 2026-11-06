import threading
import time

import pytest

from mra_agents.sim import RateLimited, SimStore, SimWorker


def _slow_executor(_ident, _store):
    time.sleep(3)


def test_rate_limit_and_shape(tmp_path):
    store = SimStore(tmp_path / 'sim.sqlite', per_hour=1)
    ident = store.create('honest_kiosk', 'ip')
    assert store.get(ident)['status'] == 'queued'
    assert store.recent()[0]['id'] == ident
    with pytest.raises(RateLimited):
        store.create('slow_week', 'ip')
    with pytest.raises(ValueError):
        store.create('invalid', 'other')


def test_serial_execution_and_failure(tmp_path):
    store = SimStore(tmp_path / 'sim.sqlite')
    started, release = threading.Event(), threading.Event()
    def execute(ident, db):
        started.set()
        release.wait(2)
        if db.get(ident)['archetype'] == 'wash_ring':
            raise RuntimeError('secret should never appear')
    worker = SimWorker(store, execute)
    first = store.create('honest_kiosk', 'ip')
    worker.kick()
    assert started.wait(2)
    second = store.create('wash_ring', 'ip')
    worker.kick()
    assert store.get(second)['ahead'] == 1
    release.set()
    for _ in range(200):
        if store.get(second)['status'] == 'failed':
            break
        time.sleep(.01)
    assert store.get(first)['status'] == 'done'
    assert store.get(second)['steps'][0]['kind'] == 'error'
    assert 'secret' not in str(store.get(second))


def test_restart_marks_interrupted(tmp_path):
    path = tmp_path / 'sim.sqlite'
    store = SimStore(path)
    ident = store.create('defaulter', 'ip')
    store.update(ident, lambda r: r.update(status='running'))
    assert SimStore(path).get(ident)['status'] == 'failed'


def test_isolated_worker_enforces_hard_timeout(tmp_path):
    store = SimStore(tmp_path / 'timeout.sqlite')
    worker = SimWorker(store, _slow_executor, timeout_seconds=0.1, isolate=True)
    ident = store.create('honest_kiosk', 'ip')
    worker.kick()
    for _ in range(200):
        if store.get(ident)['status'] == 'failed':
            break
        time.sleep(.01)
    assert store.get(ident)['status'] == 'failed'
    assert store.get(ident)['steps'][0]['kind'] == 'error'
    assert store.get(ident)['done_reason'].startswith('Timed out')


def test_store_closes_its_connections(tmp_path):
    import gc
    import os
    gc.disable()  # leaked sqlite connections only go away when the cyclic GC runs
    try:
        store = SimStore(tmp_path / 'fd.sqlite')
        ident = store.create('honest_kiosk', 'ip')
        before = len(os.listdir('/dev/fd'))
        for _ in range(200):
            store.get(ident)
            store.update(ident, lambda r: r['steps'].append({}))
        assert len(os.listdir('/dev/fd')) - before < 5
    finally:
        gc.enable()
