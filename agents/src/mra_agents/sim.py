"""Persistent, serial execution infrastructure for the devnet simulator.

The executor is injected: this module never substitutes canned results for chain work.
"""
from __future__ import annotations

import contextlib
import json
import logging
import multiprocessing
import sqlite3
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path

ARCHETYPES = [
    {"id": "honest_kiosk", "name": "Honest kiosk", "city": "Buenos Aires", "emoji": "🏪", "blurb": "Steady sales", "expected": "Repays and claims a Standing Pass"},
    {"id": "slow_week", "name": "Slow week", "city": "Lagos", "emoji": "📉", "blurb": "Sales dip for a week", "expected": "Repayment slows without a penalty"},
    {"id": "wash_ring", "name": "Wash ring", "city": "", "emoji": "🔄", "blurb": "Circular funding and few payers", "expected": "Red lines or Critic reject"},
    {"id": "defaulter", "name": "Defaulter", "city": "", "emoji": "⚠️", "blurb": "Sales stop after drawing", "expected": "Write-off, World ID ban; the retry is stopped at the World ID check"},
    {"id": "repeat_borrower", "name": "Repeat borrower", "city": "", "emoji": "🔁", "blurb": "A returning merchant", "expected": "Standing Pass, then tier 1 at 50% of the limit"},
]


class RateLimited(Exception):
    pass


def _isolated_execute(executor, run_id: str, store: SimStore) -> None:
    """Suppress child tracebacks: provider and RPC exception text must never reach container logs."""
    try:
        executor(run_id, store)
    except BaseException:  # noqa: BLE001 - child exits quietly
        import os
        os._exit(1)


def _simulator_process(run_id: str, path: str, per_hour: int, global_cap: int) -> None:
    """Spawn a clean interpreter for the real runner, avoiding forked API/SDK locks."""
    import os
    try:
        os.environ["SIM_CHILD_PROCESS"] = "1"
        store = object.__new__(SimStore)
        store.path, store.per_hour, store.global_cap = path, per_hour, global_cap
        store.lock = threading.RLock()
        from .sim_runner import Simulator
        Simulator().run(run_id, store)
    except BaseException as exc:  # noqa: BLE001 - the child must always exit quietly
        name = type(exc).__name__
        if os.getenv("SIM_DEBUG") == "1":  # local debugging only: tracebacks may carry RPC/provider text
            import traceback
            traceback.print_exc()
        # Keep a safe exception class for diagnosis; never persist provider/RPC messages.
        try:
            store.update(run_id, lambda r: r.update(
                done_reason=r.get("done_reason") or f"Scenario failed ({name})"))
        except BaseException:  # noqa: BLE001, S110 - best effort; the parent marks the run failed anyway
            pass
        os._exit(1)


class SimStore:
    def __init__(self, path: Path | str, *, per_hour: int = 6, global_cap: int = 50,
                 recover_running: bool = True):
        self.path = str(path)
        self.per_hour, self.global_cap = per_hour, global_cap
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS sim_runs (id TEXT PRIMARY KEY, ip TEXT NOT NULL, created REAL NOT NULL, body TEXT NOT NULL)")
            # A process restart cannot safely replay partially executed transactions.
            if recover_running:
                rows = db.execute("SELECT id, body FROM sim_runs").fetchall()
                for run_id, body in rows:
                    run = json.loads(body)
                    if run['status'] == 'running':
                        run['status'], run['done_reason'] = 'failed', 'Interrupted by server restart'
                        run['steps'].append({"i": len(run['steps']), "at": time.time(), "sim_day": 0, "kind": 'error', "title": 'Run interrupted', "detail": run['done_reason'], "data": {}, "tx": None})
                        db.execute('UPDATE sim_runs SET body=? WHERE id=?', (json.dumps(run), run_id))

    @contextlib.contextmanager
    def connect(self):
        # Close explicitly: a sqlite3 connection otherwise lives until the cyclic GC runs, and the API polls this
        # store many times a second (it ran a 256-fd process out of descriptors).
        db = sqlite3.connect(self.path, timeout=30)
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, archetype: str, ip: str) -> str:
        if archetype not in {a['id'] for a in ARCHETYPES}:
            raise ValueError('Unknown archetype')
        now, run_id = time.time(), uuid.uuid4().hex
        run = {"run_id": run_id, "archetype": archetype, "status": 'queued', "ahead": 0, "started_at": None,
                   "shop": None, "steps": [], "ledger": None, "done_reason": None}
        with self.lock, self.connect() as db:
            count = db.execute('SELECT count(*) FROM sim_runs WHERE ip=? AND created>?', (ip, now - 3600)).fetchone()[0]
            total = db.execute('SELECT count(*) FROM sim_runs WHERE created>?', (now - 3600,)).fetchone()[0]
            if count >= self.per_hour or total >= self.global_cap:
                raise RateLimited()
            db.execute('INSERT INTO sim_runs VALUES (?, ?, ?, ?)', (run_id, ip, now, json.dumps(run)))
        return run_id

    def get(self, run_id: str) -> dict | None:
        with self.lock, self.connect() as db:
            rows = db.execute('SELECT id, body FROM sim_runs ORDER BY created, rowid').fetchall()
        ahead = 0
        for ident, body in rows:
            run = json.loads(body)
            if ident == run_id:
                run['ahead'] = ahead if run['status'] == 'queued' else 0
                return run
            if run['status'] in ('queued', 'running'):
                ahead += 1
        return None

    def update(self, run_id: str, fn: Callable[[dict], None]) -> None:
        with self.lock, self.connect() as db:
            row = db.execute('SELECT body FROM sim_runs WHERE id=?', (run_id,)).fetchone()
            if row is None:
                raise KeyError(run_id)
            run = json.loads(row[0])
            fn(run)
            db.execute('UPDATE sim_runs SET body=? WHERE id=?', (json.dumps(run), run_id))

    def next_queued(self) -> str | None:
        with self.lock, self.connect() as db:
            rows = db.execute('SELECT id, body FROM sim_runs ORDER BY created, rowid').fetchall()
        return next((i for i, b in rows if json.loads(b)['status'] == 'queued'), None)

    def recent(self, limit: int = 10) -> list[dict]:
        with self.lock, self.connect() as db:
            rows = db.execute('SELECT body FROM sim_runs ORDER BY created DESC, rowid DESC LIMIT ?', (limit,)).fetchall()
        return [{"id": r['run_id'], "archetype": r['archetype'], "status": r['status'], "done_reason": r['done_reason']}
                for r in (json.loads(row[0]) for row in rows)]


class SimWorker:
    """One worker per process. Executor must enforce its own operation timeouts."""
    def __init__(self, store: SimStore, executor, timeout_seconds: int = 240, isolate: bool = False):
        self.store, self.executor = store, executor
        self.lock = threading.Lock()
        self.timeout_seconds = timeout_seconds
        self.isolate = isolate

    def kick(self):
        if self.lock.acquire(blocking=False):
            threading.Thread(target=self._drain, daemon=True).start()

    def _drain(self):
        try:
            while (run_id := self.store.next_queued()) is not None:
                self.store.update(run_id, lambda r: r.update(status='running', started_at=time.time()))
                try:
                    if self.isolate:
                        bound = getattr(self.executor, "__self__", None)
                        if bound is not None and bound.__class__.__name__ == "Simulator":
                            ctx = multiprocessing.get_context("spawn")
                            target = _simulator_process
                            args = (run_id, self.store.path, self.store.per_hour, self.store.global_cap)
                        else:
                            ctx = multiprocessing.get_context("fork")
                            target = _isolated_execute
                            args = (self.executor, run_id, self.store)
                        task = ctx.Process(target=target, args=args, daemon=True)
                        task.start()
                        task.join(self.timeout_seconds)
                        if task.is_alive():
                            task.terminate()
                            task.join(5)
                            raise TimeoutError("scenario timeout")
                        if task.exitcode:
                            raise RuntimeError("scenario process failed")
                    else:
                        completed = threading.Event()
                        failure = []
                        # Bind this run's event/list: a timed-out thread must not signal the next run.
                        def invoke(run_id=run_id, completed=completed, failure=failure):
                            try:
                                self.executor(run_id, self.store)
                            except BaseException as exc:  # noqa: BLE001
                                failure.append(exc)
                            finally:
                                completed.set()
                        task = threading.Thread(target=invoke, daemon=True)
                        task.start()
                        if not completed.wait(self.timeout_seconds):
                            raise TimeoutError("scenario timeout")
                        if failure:
                            raise failure[0]
                    self.store.update(run_id, lambda r: r.update(status='done'))
                except Exception as exc:  # noqa: BLE001 - Errors must not expose keys or upstream responses.
                    fallback = (f'Timed out after {self.timeout_seconds} s' if isinstance(exc, TimeoutError)
                                else 'Scenario execution failed')
                    def fail(r, fallback=fallback):
                        reason = r.get('done_reason') or fallback
                        day = r['steps'][-1]['sim_day'] if r['steps'] else 0
                        r['steps'].append({"i": len(r['steps']), "at": time.time(), "sim_day": day, "kind": 'error', "title": 'Scenario failed', "detail": reason, "data": {}, "tx": None})
                        r.update(status='failed', done_reason=reason)
                    try:
                        self.store.update(run_id, fail)
                    except Exception:  # noqa: BLE001 - keep draining; a restart marks it interrupted
                        logging.getLogger(__name__).warning("simulator: could not record failure of run %s", run_id)
        finally:
            self.lock.release()
            # Close the race between the final empty check and a concurrent enqueue.
            if self.store.next_queued() is not None:
                self.kick()
