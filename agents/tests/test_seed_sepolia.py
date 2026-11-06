"""Offline tests for scripts/seed_sepolia.py (fake chain + fake sender; no RPC, no keys from .env)."""

from __future__ import annotations

import importlib.util
import json
import stat
import sys
from pathlib import Path

import pytest
from eth_account import Account

from mra_agents.chain import load_deployments

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("seed_sepolia", ROOT / "scripts" / "seed_sepolia.py")
seed = importlib.util.module_from_spec(_spec)
sys.modules["seed_sepolia"] = seed
_spec.loader.exec_module(seed)

DEP = load_deployments(ROOT / "deployments" / "sepolia.json")
RELAYER = Account.create()
ISSUER = Account.create()
PEPPER = b"test-pepper"
TRANSFER_SEL = "0xa9059cbb"


class FakeChain:
    chain_id = 11155111

    def __init__(self):
        self.estimates = 0
        self.confirmed: set[str] = set()

    def fees(self):
        return 15, 2, 1_800_000_000

    def estimate(self, tx, overrides=None):
        self.estimates += 1
        return 207_391 if tx.get("value") and tx.get("data", "0x") == "0x" else 150_000

    def balance(self, addr):
        return 5 * 10**16 if addr == RELAYER.address else 0

    def shop_owner(self, sid):
        return seed.to_checksum_address("0x" + "00" * 20)

    def registry_issuer(self):
        return ISSUER.address

    def country_set(self):
        return [32, 566, 404, 0]

    def shops_slot(self):
        return 3

    def receipt_status(self, tx_hash):
        return 1 if tx_hash in self.confirmed else None


class FakeSender:
    def __init__(self, keys, *, fail_send_at=None, fail_wait_at=None):
        self.keys = keys
        self.sent: list[tuple[str, dict]] = []
        self.fail_send_at, self.fail_wait_at = fail_send_at, fail_wait_at

    def send(self, signer, tx):
        if self.fail_send_at is not None and len(self.sent) == self.fail_send_at:
            raise RuntimeError("simulated crash before send")
        self.sent.append((signer, tx))
        return "0x" + f"{len(self.sent):064x}"

    def wait(self, tx_hash):
        if self.fail_wait_at is not None and len(self.sent) == self.fail_wait_at:
            raise RuntimeError("simulated crash while waiting")
        return 1


def _run(tmp_path, *args, chain=None, sender=None, lines=None):
    lines = [] if lines is None else lines
    holder = {}

    def factory(keys):
        holder["s"] = sender(keys) if callable(sender) else sender
        return holder["s"]

    rc = seed.run(["--state", str(tmp_path / "seed.json"), *args], chain=chain or FakeChain(), dep=DEP,
                  relayer_key=RELAYER.key.hex(), issuer_key=ISSUER.key.hex(), pepper=PEPPER,
                  sender_factory=factory if sender else None, out=lines.append, sleep=lambda s: None)
    return rc, lines, holder.get("s")


def test_dry_run_sends_nothing_and_writes_nothing(tmp_path):
    def boom(keys):
        raise AssertionError("dry run must not create a sender")

    chain = FakeChain()
    rc = seed.run(["--state", str(tmp_path / "seed.json"), "--with-business-pass"], chain=chain, dep=DEP,
                  relayer_key=RELAYER.key.hex(), issuer_key=ISSUER.key.hex(), pepper=PEPPER,
                  sender_factory=boom, out=lambda *_: None)
    assert rc == 0
    assert chain.estimates > 0  # it did price the plan
    assert not (tmp_path / "seed.json").exists()


def test_execute_flag_required_to_send(tmp_path):
    sender = FakeSender({})
    rc, lines, s = _run(tmp_path, sender=sender)
    assert rc == 0 and sender.sent == [] and s is None
    assert any("dry run only" in line for line in lines)
    rc, lines, s = _run(tmp_path, "--execute", sender=lambda keys: FakeSender(keys))
    assert rc == 0 and len(s.sent) > 0
    state = json.loads((tmp_path / "seed.json").read_text())
    assert state["steps"] and all(v["status"] == "done" for v in state["steps"].values())
    assert len(state["steps"]) == len(s.sent)
    assert stat.S_IMODE((tmp_path / "seed.json").stat().st_mode) == 0o600


def test_resume_skips_completed_steps(tmp_path):
    with pytest.raises(RuntimeError):
        _run(tmp_path, "--execute", "--with-business-pass", sender=lambda k: FakeSender(k, fail_send_at=10))
    state1 = json.loads((tmp_path / "seed.json").read_text())
    done1 = {k: v["tx"] for k, v in state1["steps"].items() if v["status"] == "done"}
    assert len(done1) == 10
    rc, _, s = _run(tmp_path, "--execute", "--with-business-pass", sender=lambda k: FakeSender(k))
    state2 = json.loads((tmp_path / "seed.json").read_text())
    assert rc == 0 and all(v["status"] == "done" for v in state2["steps"].values())
    assert len(s.sent) == len(state2["steps"]) - 10  # nothing done is re-sent
    assert {k: state2["steps"][k]["tx"] for k in done1} == done1
    assert state2["keys"] == state1["keys"] and state2["bizpass"] == state1["bizpass"]
    rc, lines, s = _run(tmp_path, "--execute", "--with-business-pass", sender=lambda k: FakeSender(k))
    assert rc == 0 and s.sent == []  # fully seeded: a re-run is a no-op


def test_resume_confirms_a_sent_but_unconfirmed_tx_instead_of_resending(tmp_path):
    with pytest.raises(RuntimeError):
        _run(tmp_path, "--execute", sender=lambda k: FakeSender(k, fail_wait_at=3))
    state = json.loads((tmp_path / "seed.json").read_text())
    pending = [k for k, v in state["steps"].items() if v["status"] == "sent"]
    assert len(pending) == 1
    chain = FakeChain()
    chain.confirmed.add(state["steps"][pending[0]]["tx"])
    rc, _, s = _run(tmp_path, "--execute", chain=chain, sender=lambda k: FakeSender(k))
    final = json.loads((tmp_path / "seed.json").read_text())
    assert rc == 0 and final["steps"][pending[0]]["tx"] == state["steps"][pending[0]]["tx"]
    assert len(s.sent) == len(final["steps"]) - 3


def test_keys_never_in_stdout(tmp_path, capsys):
    lines: list[str] = []
    _run(tmp_path, "--with-business-pass", lines=lines)
    _run(tmp_path, "--execute", "--with-business-pass", sender=lambda k: FakeSender(k), lines=lines)
    _run(tmp_path, "--with-business-pass", lines=lines)  # dry run over a seeded state
    text = "\n".join(lines) + capsys.readouterr().out
    state = json.loads((tmp_path / "seed.json").read_text())
    secrets_ = [*state["keys"].values(), RELAYER.key.hex(), ISSUER.key.hex()]
    for k in secrets_:
        assert k.removeprefix("0x").lower() not in text.lower()
    assert str(state["bizpass"]["secret"]) not in text
    assert hex(state["bizpass"]["secret"])[2:] not in text.lower()
    assert state["bizpass"]["accountId"] not in text


def test_wash_trader_is_funded_through_its_payout(tmp_path):
    rc, _, s = _run(tmp_path, "--execute", sender=lambda k: FakeSender(k))
    state = json.loads((tmp_path / "seed.json").read_text())
    addr = {n: Account.from_key(k).address.lower() for n, k in state["keys"].items()}
    wash = {addr[n] for n in addr if n.startswith("wash-payer:")}
    payout = addr["shop:wash-trader"]
    assert len(wash) == 2

    def recipient(tx):
        if tx["data"].startswith(TRANSFER_SEL) or tx["data"].startswith("0x40c10f19"):  # transfer / mint
            return "0x" + tx["data"][34:74]
        return tx["to"].lower()

    funding = [(signer, tx) for signer, tx in s.sent if recipient(tx) in wash and tx["to"].lower() != DEP["AdvanceBook"].lower()]
    eth = [f for f in funding if f[1]["value"] > 0]
    usdc = [f for f in funding if f[1]["data"].startswith(TRANSFER_SEL)]
    assert len(eth) == 2 and len(usdc) == 2
    assert all(signer == "shop:wash-trader" for signer, _ in funding)  # ETH AND USDC come from the payout
    for signer, tx in s.sent:  # the relayer never touches a wash payer directly
        if signer == "relayer":
            assert recipient(tx) not in wash
    mints = [tx for signer, tx in s.sent if tx["data"].startswith("0x40c10f19")]
    assert any(recipient(tx) == payout for tx in mints)  # the wash money is minted to the payout itself
    # and the payout's own ETH covers what it forwards to its payers
    fund_payout = next(tx for signer, tx in s.sent if signer == "relayer" and tx["to"].lower() == payout)
    assert fund_payout["value"] > sum(tx["value"] for _, tx in eth)


def test_business_pass_step_issued_by_relayer(tmp_path):
    rc, lines, s = _run(tmp_path, "--execute", "--with-business-pass", sender=lambda k: FakeSender(k))
    reg = DEP["BusinessPassRegistry"].lower()
    issues = [(signer, tx) for signer, tx in s.sent if tx["to"].lower() == reg]
    assert len(issues) == 1 and issues[0][0] == "relayer" and len(issues[0][1]["data"]) > 10
    assert not any("WARNING" in line for line in lines)
