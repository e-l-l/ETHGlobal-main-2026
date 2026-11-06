"""Entry point for the agents-worker container (mounted read-only at /srv/deploy/worker_entry.py).

1. If `mra_agents.worker` exists (the intended entrypoint: Risk agent + keeper + MerchantAgentRunner),
   run it exactly like `python -m mra_agents.worker`.
2. Otherwise run a fallback loop so the demo still has a live Risk agent and keeper:
   - RiskAgent.tick() every RISK_LOOP_SECONDS (agents Settings, default 300)
   - Keeper.tick()    every KEEPER_LOOP_SECONDS (env, default 60)
   Both run sequentially on one thread, so they never race each other on nonces.
   The managed merchant agents are NOT run by the fallback (MerchantAgentRunner's API is not known here).

Never logs secrets: only counts, tx hashes and error strings from the agents package.
"""

from __future__ import annotations

import importlib.util
import logging
import os
import runpy
import signal
import sys
import time
from pathlib import Path

log = logging.getLogger("worker")
_stop = False


def _on_signal(signum, _frame):
    global _stop
    log.info("signal %s: stopping after the current tick", signum)
    _stop = True


def _heartbeat() -> None:
    path = os.environ.get("WORKER_HEARTBEAT_FILE")
    if path:
        Path(path).touch()


def _sleep(seconds: float) -> None:
    end = time.monotonic() + seconds
    while not _stop and time.monotonic() < end:
        time.sleep(min(1.0, end - time.monotonic()))


def _log_failure(what: str, e: BaseException) -> None:
    # Exception text can contain the RPC URL, and provider URLs often embed an API key: log only the type
    # unless WORKER_DEBUG=1 (then the full traceback, for a private debugging session).
    if os.environ.get("WORKER_DEBUG") == "1":
        log.exception("%s tick failed", what)
    else:
        log.error("%s tick failed: %s (set WORKER_DEBUG=1 for the traceback)", what, type(e).__name__)


def fallback() -> int:
    from mra_agents.chain import Web3ChainReader, Web3ChainWriter
    from mra_agents.config import get_settings
    from mra_agents.keeper import Keeper
    from mra_agents.llm_bedrock import make_llm
    from mra_agents.risk import RiskAgent
    from mra_agents.underwriter import ClaudeJudge

    settings = get_settings()
    reader = Web3ChainReader(settings)
    writer = Web3ChainWriter(settings)

    def chain_now() -> int:
        return reader.w3.eth.get_block("latest")["timestamp"]

    judge = ClaudeJudge(make_llm(settings), settings)
    risk = RiskAgent(reader, writer, judge, settings, now=chain_now)
    keeper = Keeper(reader, writer, settings, now=chain_now)

    risk_every = int(settings.risk_loop_seconds)
    keeper_every = int(os.environ.get("KEEPER_LOOP_SECONDS", "60") or 60)
    log.info("fallback worker: risk every %ss, keeper every %ss (merchant agents not run)", risk_every, keeper_every)

    next_risk = next_keeper = 0.0
    while not _stop:
        now = time.monotonic()
        if now >= next_risk:
            try:
                rec = risk.tick()
                log.info("risk tick: triggers=%s source=%s", rec.get("triggers"), rec.get("source"))
            except Exception as e:  # noqa: BLE001 - a bad tick must never kill the loop
                _log_failure("risk", e)
            next_risk = now + risk_every
        if now >= next_keeper:
            try:
                res = keeper.tick()
                log.info("keeper tick: txs=%d errors=%s", len(res), getattr(res, "errors", []))
            except Exception as e:  # noqa: BLE001
                _log_failure("keeper", e)
            next_keeper = now + keeper_every
        _heartbeat()
        _sleep(max(1.0, min(next_risk, next_keeper) - time.monotonic()))
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if importlib.util.find_spec("mra_agents.worker") is not None:
        log.info("running mra_agents.worker")
        sys.argv = ["mra_agents.worker", *sys.argv[1:]]
        runpy.run_module("mra_agents.worker", run_name="__main__", alter_sys=True)
        return 0
    log.warning("mra_agents.worker not found; using the deploy/ fallback loop (Risk + keeper only)")
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    return fallback()


if __name__ == "__main__":
    sys.exit(main())
