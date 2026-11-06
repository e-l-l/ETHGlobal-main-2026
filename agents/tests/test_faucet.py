"""Demo faucet (faucet.py + POST /demo/faucet). Offline: a fake chain, no RPC, no keys."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from mra_agents.api import create_app
from mra_agents.faucet import ETHER, GWEI, DemoFaucet, FaucetError, FaucetSettings, client_ip

A = "0x" + "11" * 20
B = "0x" + "22" * 20
C = "0x" + "33" * 20


class FakeChain:
    def __init__(self, chain_id=11155111, base=15, tip=2, eth_gas=204_600, approve_gas=128_586):
        self.cid, self.base, self.tip = chain_id, base, tip
        self.eth_gas, self.approve_gas = eth_gas, approve_gas
        self.balances: dict[str, int] = {}
        self.usdc: dict[str, int] = {}
        self.sent: list[tuple] = []
        self.fail_wait = False

    def relayer_balance(self):
        return ETHER

    def chain_id(self):
        return self.cid

    def fees(self):
        return self.base, self.tip

    def balance(self, a):
        return self.balances.get(a.lower(), 0)

    def usdc_balance(self, a):
        return self.usdc.get(a.lower(), 0)

    def estimate_eth(self, to, value):
        return self.eth_gas

    def estimate_mint(self, to, amount):
        return 140_000

    def estimate_approve_from(self, owner):
        return self.approve_gas

    def send_eth(self, to, value, gas, max_fee, tip):
        self.sent.append(("eth", to, value, gas, max_fee, tip))
        self.balances[to.lower()] = self.balance(to) + value
        return "0x" + f"{len(self.sent):064x}"

    def send_mint(self, to, amount, gas, max_fee, tip):
        self.sent.append(("mint", to, amount, gas, max_fee, tip))
        self.usdc[to.lower()] = self.usdc_balance(to) + amount
        return "0x" + f"{len(self.sent):064x}"

    def wait(self, h):
        return not self.fail_wait


def sub(tmp_path, name):
    d = tmp_path / name
    d.mkdir()
    return d


def make(tmp_path, chain=None, chain_id=11155111, clock=None, **cfg):
    chain = chain or FakeChain()
    settings = FaucetSettings(**{"demo_faucet": True, **cfg})
    t = clock or [1_000_000.0]
    return DemoFaucet(chain, settings, chain_id, tmp_path / "f.sqlite", now=lambda: t[0]), chain, t


def test_off_by_default_and_never_off_testnets(tmp_path):
    f, _, _ = make(tmp_path, demo_faucet=False)
    assert not f.enabled()
    f, _, _ = make(tmp_path, chain=FakeChain(chain_id=1), chain_id=1)
    assert not f.enabled()  # mainnet: off even with DEMO_FAUCET=1
    f, _, _ = make(tmp_path, chain=FakeChain(chain_id=1), chain_id=11155111)
    assert not f.enabled()  # env says Sepolia, but the RPC is mainnet
    f, _, _ = make(tmp_path, chain=FakeChain(chain_id=31337), chain_id=31337)
    assert f.enabled()
    f, _, _ = make(tmp_path, demo_faucet=False)
    with pytest.raises(FaucetError) as e:
        f.fund(A, "1.1.1.1")
    assert e.value.status == 404


def test_sizes_from_live_estimates_times_fee_cap(tmp_path):
    f, chain, _ = make(tmp_path)
    r = f.fund(A, "1.1.1.1")
    # fee cap: live 2*15+2 wei is below the 0.1 gwei floor; gas per tx: the 250k floor beats 204.6k / 128.6k
    assert int(r["fee_cap_wei"]) == int(0.1 * GWEI)
    assert r["gas_per_tx"] == 250_000
    assert int(r["eth_wei"]) == 10 * 250_000 * int(0.1 * GWEI)
    assert r["usdc"] == 50_000_000
    kinds = [s[0] for s in chain.sent]
    assert kinds == ["eth", "mint"]
    assert chain.sent[0][3] == int(204_600 * 1.2) + 10_000  # gas limit from the live estimate, not 21k
    # a pricier chain: the live fee and a bigger live estimate win
    f2, _, _ = make(sub(tmp_path, "x"),
                    chain=FakeChain(base=2 * GWEI, tip=GWEI, eth_gas=400_000), demo_faucet_max_eth_per_day=1)
    r2 = f2.fund(B, "2.2.2.2")
    assert int(r2["fee_cap_wei"]) == 5 * GWEI and r2["gas_per_tx"] == 400_000


def test_tops_up_only_what_is_missing(tmp_path):
    f, chain, _ = make(tmp_path)
    chain.balances[A.lower()] = 10 * ETHER
    chain.usdc[A.lower()] = 60_000_000
    r = f.fund(A, "1.1.1.1")
    assert r["eth_wei"] == "0" and r["usdc"] == 0 and chain.sent == []


def test_once_per_address_per_ip_and_daily_budget(tmp_path):
    f, _, t = make(tmp_path, demo_faucet_per_ip_per_day=2)
    f.fund(A, "1.1.1.1")
    with pytest.raises(FaucetError) as e:
        f.fund(A.upper().replace("0X", "0x"), "9.9.9.9")
    assert (e.value.code, e.value.status) == ("already_funded", 409)
    f.fund(B, "1.1.1.1")
    with pytest.raises(FaucetError) as e:
        f.fund(C, "1.1.1.1")
    assert (e.value.code, e.value.status) == ("ip_limit", 429)
    t[0] += 86_401  # a day later the IP may claim again
    f.fund(C, "1.1.1.1")

    # budget: each claim costs ~0.00025 ETH + its own gas; 0.0006 allows two
    g, _, _ = make(sub(tmp_path, "b"), demo_faucet_max_eth_per_day=0.0006)
    g.fund(A, "1.0.0.1")
    g.fund(B, "1.0.0.2")
    with pytest.raises(FaucetError) as e:
        g.fund(C, "1.0.0.3")
    assert (e.value.code, e.value.status) == ("daily_budget", 429)


def test_uncertain_send_cannot_be_retried(tmp_path):
    f, chain, _ = make(tmp_path)
    chain.fail_wait = True
    with pytest.raises(FaucetError) as e:
        f.fund(A, "1.1.1.1")
    assert e.value.code == "send_failed"
    chain.fail_wait = False
    with pytest.raises(FaucetError, match="already_funded"):
        f.fund(A, "1.1.1.2")


def test_bad_address(tmp_path):
    f, _, _ = make(tmp_path)
    for bad in ("0x123", "0x" + "00" * 20, 5, None):
        with pytest.raises(FaucetError) as e:
            f.fund(bad, "1.1.1.1")
        assert e.value.code == "bad_address"


def test_client_ip_uses_rightmost_forwarded_and_buckets_ipv6():
    assert client_ip({"x-forwarded-for": "6.6.6.6, 1.2.3.4"}, "10.0.0.1") == "1.2.3.4"
    assert client_ip({}, "10.0.0.1") == "10.0.0.1"
    assert client_ip({"x-forwarded-for": "2001:db8::1"}, None) == "2001:db8::/64"


def test_route(tmp_path):
    stub = object()
    f, _, _ = make(tmp_path)
    client = TestClient(create_app(stub, stub, stub, stub, stub, faucet=f))
    r = client.post("/demo/faucet", json={"address": A}, headers={"x-forwarded-for": "5.5.5.5"})
    assert r.status_code == 200 and r.json()["usdc"] == 50_000_000
    r = client.post("/demo/faucet", json={"address": A})
    assert r.status_code == 409 and r.json()["detail"] == "already_funded"
    assert client.post("/demo/faucet", json={"address": "nope"}).status_code == 400

    off, _, _ = make(sub(tmp_path, "off"), demo_faucet=False)
    assert TestClient(create_app(stub, stub, stub, stub, stub, faucet=off)).post(
        "/demo/faucet", json={"address": B}).status_code == 404
    assert TestClient(create_app(stub, stub, stub, stub, stub)).post(
        "/demo/faucet", json={"address": B}).status_code == 404


def test_relayer_floor_and_budget_alarm(tmp_path):
    f, chain, _ = make(tmp_path)
    chain.relayer_balance = lambda: 0
    with pytest.raises(FaucetError, match="relayer_balance_low"):
        f.fund(A, "1.1.1.1")
    chain.relayer_balance = lambda: ETHER
    f.cfg.demo_faucet_max_eth_per_day = 0.0004
    f.fund(A, "1.1.1.1")
    f.cfg.demo_faucet_max_eth_per_day = int(f.status()["spent_wei"]) / ETHER
    assert f.status()["budget_alarm"]


# ------------------------------------------------------------------ DRIP (JuniorVault deposit for the address)

class DripChain(FakeChain):
    def __init__(self, refuse=False, **kw):
        super().__init__(**kw)
        self.refuse = refuse
        self.r_usdc = 0
        self.r_allow = 0
        self.drip: dict[str, int] = {}

    def relayer_usdc(self):
        return self.r_usdc

    def relayer_allowance(self):
        return self.r_allow

    def send_self_mint(self, amount, max_fee, tip):
        self.sent.append(("self_mint", amount))
        self.r_usdc += amount
        return "0x" + f"{len(self.sent):064x}"

    def send_vault_approve(self, amount, max_fee, tip):
        self.sent.append(("approve", amount))
        self.r_allow = amount
        return "0x" + f"{len(self.sent):064x}"

    def estimate_deposit(self, amount, receiver):
        if self.refuse:
            raise RuntimeError("execution reverted: junior cover")
        return 180_000

    def send_deposit(self, amount, receiver, gas, max_fee, tip):
        self.sent.append(("deposit", amount, receiver, gas))
        self.r_usdc -= amount
        self.r_allow -= amount
        self.drip[receiver.lower()] = self.drip.get(receiver.lower(), 0) + amount
        return "0x" + f"{len(self.sent):064x}"


def test_drip_deposits_for_the_address(tmp_path):
    f, chain, _ = make(tmp_path, chain=DripChain())
    r = f.fund(A, "1.1.1.1", drip=True)
    assert r["drip"] == 20_000_000 and r["drip_error"] is None and r["drip_tx"]
    assert r["eth_tx"] and r["usdc_tx"]
    assert [s[0] for s in chain.sent] == ["eth", "mint", "self_mint", "approve", "deposit"]
    assert chain.drip[A.lower()] == 20_000_000
    assert chain.sent[-1][3] == int(180_000 * 1.2) + 10_000
    # once per address for DRIP too
    with pytest.raises(FaucetError, match="already_funded"):
        f.fund(A, "1.1.1.2", drip=True)
    # a second address: the relayer's leftover allowance is reused, only the mint is redone
    chain.sent.clear()
    f.fund(B, "1.1.1.3", drip=True)
    assert [s[0] for s in chain.sent] == ["eth", "mint", "self_mint", "deposit"]


def test_drip_after_base_claim_and_budget(tmp_path):
    f, chain, _ = make(tmp_path, chain=DripChain())
    f.fund(A, "1.1.1.1")
    chain.sent.clear()
    r = f.fund(A, "1.1.1.2", drip=True)  # came back for DRIP only
    assert r["eth_tx"] is None and r["usdc"] == 0 and r["drip"] == 20_000_000
    assert "eth" not in [s[0] for s in chain.sent]
    # the DRIP gas counts against the daily budget
    g, _, _ = make(sub(tmp_path, "b"), chain=DripChain(), demo_faucet_max_eth_per_day=0.0003)
    g.fund(A, "1.0.0.1")
    with pytest.raises(FaucetError, match="daily_budget"):
        g.fund(A, "1.0.0.2", drip=True)


def test_drip_refused_still_gives_gas_and_usdc(tmp_path):
    f, chain, _ = make(tmp_path, chain=DripChain(refuse=True))
    r = f.fund(A, "1.1.1.1", drip=True)
    assert r["eth_tx"] and r["usdc_tx"] and r["drip"] == 0 and r["drip_error"] == "drip_unavailable"
    assert "deposit" not in [s[0] for s in chain.sent]
    # DRIP alone, still refused: a clear error; once the vault accepts again, the address may retry
    with pytest.raises(FaucetError) as e:
        f.fund(A, "1.1.1.2", drip=True)
    assert (e.value.code, e.value.status) == ("drip_unavailable", 503)
    chain.refuse = False
    assert f.fund(A, "1.1.1.3", drip=True)["drip"] == 20_000_000


def test_drip_route(tmp_path):
    stub = object()
    f, _, _ = make(tmp_path, chain=DripChain())
    client = TestClient(create_app(stub, stub, stub, stub, stub, faucet=f))
    r = client.post("/demo/faucet", json={"address": A, "drip": True})
    assert r.status_code == 200 and r.json()["drip"] == 20_000_000
