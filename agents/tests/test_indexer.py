"""Indexer tests (fake ChainReader) + offline tests of chain.py's pure parts. Live chain tests are `anvil`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from eth_abi import encode
from web3 import Web3

from mra_agents import chain
from mra_agents.chain import (
    ChainError,
    Deployments,
    NotAllowedError,
    Web3ChainReader,
    Web3ChainWriter,
    check_allowed,
    chunk_ranges,
    load_deployments,
)
from mra_agents.config import Settings
from mra_agents.indexer import Indexer
from mra_agents.models import SaleEvent

SHOP_A = "0x" + "aa" * 32
SHOP_B = "0x" + "bb" * 32


def ev(block: int, idx: int = 0, shop: str = SHOP_A, amount: int = 1_000_000, tag: int = 0,
       payer: str = "0x" + "11" * 20) -> SaleEvent:
    return SaleEvent(shop_id=shop, payer=payer, amount=amount, repayment=0, block_number=block,
                     timestamp=1_000_000 + block * 12, tx_hash="0x" + f"{block:032x}{tag:032x}", log_index=idx)


class FakeReader:
    chain_id = 31337
    book_address = "0x" + "00" * 19 + "01"

    def __init__(self, deploy_block: int = 100):
        self.deploy_block = deploy_block
        self.head = deploy_block
        self.events: list[SaleEvent] = []
        self.calls: list[tuple[int, int]] = []

    def latest_block(self) -> int:
        return self.head

    def sales(self, shop_id, from_block, to_block):
        self.calls.append((from_block, to_block))
        return [e for e in self.events if from_block <= e.block_number <= to_block
                and (shop_id is None or e.shop_id == shop_id)]


@pytest.fixture
def db(tmp_path) -> Path:
    return tmp_path / "sub" / "idx.sqlite"


def test_first_sync_starts_at_deploy_block_and_counts(db):
    r = FakeReader(deploy_block=100)
    r.events = [ev(50), ev(101), ev(102, 0), ev(102, 1), ev(150, shop=SHOP_B)]  # block 50 predates deploy
    r.head = 160
    idx = Indexer(r, db)
    assert idx.sync() == 4
    assert r.calls[0][0] == 100 and r.calls[-1][1] == 160
    assert idx.last_synced_block() == 160
    assert [s.block_number for s in idx.sales_for(SHOP_A, 0)] == [101, 102, 102]


def test_idempotent_and_incremental_with_reorg_margin(db):
    r = FakeReader(deploy_block=0)
    r.events = [ev(b) for b in range(1, 40)]
    r.head = 40
    idx = Indexer(r, db)
    assert idx.sync() == 39
    r.calls.clear()
    assert idx.sync() == 0  # nothing new
    assert r.calls == [(29, 40)]  # re-reads the last 12 blocks
    r.events.append(ev(45))
    r.head = 50
    assert idx.sync() == 1
    assert len(idx.sales_for(SHOP_A, 0)) == 40
    # a fresh Indexer on the same file resumes and stays idempotent
    idx2 = Indexer(r, db)
    assert idx2.last_synced_block() == 50
    assert idx2.sync() == 0
    assert len(idx2.sales_for(SHOP_A, 0)) == 40


def test_reorg_replaces_recent_logs(db):
    r = FakeReader(deploy_block=0)
    r.events = [ev(b) for b in range(1, 21)]
    r.head = 20
    idx = Indexer(r, db)
    idx.sync()
    # blocks 18..20 reorged: their sales vanish, a different tx lands in block 19
    r.events = [e for e in r.events if e.block_number < 18] + [ev(19, tag=7)]
    r.head = 21
    assert idx.sync() == 1
    stored = idx.sales_for(SHOP_A, 0)
    assert [s.block_number for s in stored] == list(range(1, 18)) + [19]
    assert stored[-1].tx_hash.endswith(f"{7:032x}")


def test_reorg_outside_margin_is_not_reread(db):
    r = FakeReader(deploy_block=0)
    r.events = [ev(b) for b in range(1, 31)]
    r.head = 30
    idx = Indexer(r, db)
    idx.sync()
    r.events = [e for e in r.events if e.block_number != 5]
    idx.sync()
    assert 5 in [s.block_number for s in idx.sales_for(SHOP_A, 0)]


def test_sales_for_filters_and_roundtrips(db):
    r = FakeReader(deploy_block=0)
    huge = 2**200 + 12345
    r.events = [ev(1), ev(2, amount=huge, payer="0x" + "Ab" * 20), ev(3, shop=SHOP_B), ev(10)]
    r.head = 10
    idx = Indexer(r, db)
    idx.sync()
    got = idx.sales_for(SHOP_A.upper().replace("0X", "0x"), ev(2).timestamp)
    assert [s.block_number for s in got] == [2, 10]
    assert got[0] == r.events[1]  # exact roundtrip, incl. uint256 amount and payer case
    assert idx.sales_for(SHOP_B, 0) == [r.events[2]]
    assert idx.sales_for("0x" + "cc" * 32, 0) == []


def test_head_behind_deploy_block_is_noop(db):
    r = FakeReader(deploy_block=100)
    r.head = 50
    idx = Indexer(r, db)
    assert idx.sync() == 0 and r.calls == [] and idx.last_synced_block() is None


def test_sync_with_real_chain_helpers_chunks(db, monkeypatch):
    monkeypatch.setattr("mra_agents.indexer.SYNC_CHUNK_BLOCKS", 10)
    r = FakeReader(deploy_block=0)
    r.events = [ev(b) for b in (0, 9, 10, 25)]
    r.head = 25
    idx = Indexer(r, db)
    assert idx.sync() == 4
    assert r.calls == [(0, 9), (10, 19), (20, 25)]


# ------------------------------------------------------------------ chain.py: pure parts

ADDRS = {k: Web3.to_checksum_address("0x" + f"{i + 1:040x}") for i, k in enumerate(
    ["AdvanceBook", "SeniorVault", "JuniorVault", "RiskHook", "USDC", "PoolManager", "HonkVerifier"])}


def write_deployments(tmp_path, **over) -> Path:
    d = {"chainId": 31337, **{k: v.lower() for k, v in ADDRS.items()},
         "poolKey": {"currency0": ADDRS["USDC"], "currency1": ADDRS["JuniorVault"], "fee": 3000,
                     "tickSpacing": 60, "hooks": ADDRS["RiskHook"]},
         "deployBlock": 7}
    d.update(over)
    p = tmp_path / "local.json"
    p.write_text(json.dumps(d))
    return p


def test_load_deployments(tmp_path):
    dep = load_deployments(write_deployments(tmp_path))
    assert dep.chain_id == 31337 and dep.deploy_block == 7
    assert dep["AdvanceBook"] == ADDRS["AdvanceBook"]  # checksummed
    assert dep.pool_key == (ADDRS["USDC"], ADDRS["JuniorVault"], 3000, 60, ADDRS["RiskHook"])
    with pytest.raises(ChainError):
        dep["Nope"]


@pytest.mark.parametrize("over", [
    {"AdvanceBook": None}, {"USDC": "0x1234"}, {"poolKey": {"currency0": "x"}}, {"deployBlock": -1},
])
def test_load_deployments_rejects_bad(tmp_path, over):
    with pytest.raises(ChainError):
        load_deployments(write_deployments(tmp_path, **over))


def test_load_deployments_missing_file(tmp_path):
    with pytest.raises(ChainError):
        load_deployments(tmp_path / "missing.json")


@pytest.mark.parametrize("a,b,size", [(0, 0, 5), (0, 12_345, 5_000), (7, 7 + 4_999, 5_000), (3, 2, 10), (5, 100, 1)])
def test_chunk_ranges_cover_exactly(a, b, size):
    ranges = list(chunk_ranges(a, b, size))
    covered = [x for s, e in ranges for x in range(s, e + 1)]
    assert covered == list(range(a, b + 1))
    assert all(e - s + 1 <= size for s, e in ranges)


def test_chunk_ranges_rejects_bad_size():
    with pytest.raises(ValueError):
        list(chunk_ranges(0, 10, 0))


def test_allow_list():
    for fn in ("drawFirst", "drawWithPass", "claimStandingPass", "writeOff"):
        assert check_allowed(fn, "relayer") == "AdvanceBook"
    assert check_allowed("flush", "relayer") == "RiskHook"
    assert check_allowed("lowerLimits", "risk_manager") == "AdvanceBook"
    for fn, signer in [("setLimits", "relayer"), ("setLimits", "risk_manager"), ("transferOwnership", "relayer"),
                       ("pay", "relayer"), ("lowerLimits", "relayer"), ("drawFirst", "risk_manager"),
                       ("drawFirst", "offer_signer"), ("drawFirst", "owner")]:
        with pytest.raises(NotAllowedError):
            check_allowed(fn, signer)


def offline_settings(tmp_path, **keys) -> Settings:
    return Settings(_env_file=None, rpc_url="http://127.0.0.1:9", deployments_file=write_deployments(tmp_path),
                    **keys)


def test_writer_refuses_before_touching_network(tmp_path):
    secret = "0x" + "4c" * 32
    w = Web3ChainWriter(offline_settings(tmp_path, relayer_private_key=secret))
    with pytest.raises(NotAllowedError):
        w.send("setLimits", [[0, 0, 0, 0], 0], signer="relayer")
    with pytest.raises(NotAllowedError):
        w.send("lowerLimits", [[0, 0, 0, 0], 0], signer="relayer")
    with pytest.raises(ChainError) as e:  # risk_manager key not configured
        w.send("lowerLimits", [[0, 0, 0, 0], 0], signer="risk_manager")
    assert "4c4c" not in str(e.value) and "4c4c" not in repr(w)


def test_writer_bad_key_error_does_not_leak(tmp_path):
    w = Web3ChainWriter(offline_settings(tmp_path, relayer_private_key="0xdeadbeefdeadbeef"))
    with pytest.raises(ChainError) as e:
        w.send("flush", [], signer="relayer")
    assert "deadbeef" not in str(e.value)


# ------------------------------------------------------------------ chain.py: reader with stubbed RPC

class StubChain:
    """Minimal stand-in for eth_getLogs / eth_getBlock / eth_blockNumber."""

    def __init__(self, n_blocks: int, logs: list[dict]):
        self.n = n_blocks
        self.logs = logs
        self.get_logs_calls: list[dict] = []
        self.get_block_calls = 0

    def get_logs(self, params):
        self.get_logs_calls.append(params)
        t = params["topics"]
        out = []
        for lg in self.logs:
            if lg["address"] != params["address"] or not params["fromBlock"] <= lg["blockNumber"] <= params["toBlock"]:
                continue
            ok = True
            for i, want in enumerate(t):
                if want is None:
                    continue
                opts = want if isinstance(want, list) else [want]
                if i >= len(lg["topics"]) or "0x" + bytes(lg["topics"][i]).hex() not in opts:
                    ok = False
            if ok:
                out.append(lg)
        return out

    def get_block(self, n):
        self.get_block_calls += 1
        return {"timestamp": 1_000 + 12 * n}


def _topic_hex(x: str) -> bytes:
    return bytes.fromhex(x.removeprefix("0x").rjust(64, "0"))


@pytest.fixture
def stub_reader(tmp_path, monkeypatch):
    def make(n_blocks, logs):
        r = Web3ChainReader(offline_settings(tmp_path))
        stub = StubChain(n_blocks, logs)
        monkeypatch.setattr(r.w3.eth, "get_logs", stub.get_logs, raising=False)
        monkeypatch.setattr(r.w3.eth, "get_block", stub.get_block, raising=False)
        monkeypatch.setattr(type(r), "latest_block", lambda self: stub.n - 1)
        return r, stub
    return make


def sale_log(r: Web3ChainReader, block: int, shop: str, payer: str, amount: int, rep: int, li: int = 0) -> dict:
    return {
        "address": r.book_address, "blockNumber": block, "logIndex": li, "transactionIndex": 0,
        "transactionHash": bytes([block % 256]) * 32, "blockHash": b"\x01" * 32, "removed": False,
        "topics": [bytes(r._sale_ev.topic if isinstance(r._sale_ev.topic, bytes)
                         else bytes.fromhex(r._sale_ev.topic.removeprefix("0x"))),
                   _topic_hex(shop), _topic_hex(payer)],
        "data": encode(["uint256", "uint256"], [amount, rep]),
    }


def test_reader_sales_decodes_and_chunks(stub_reader, monkeypatch):
    monkeypatch.setattr(chain, "LOG_CHUNK_BLOCKS", 10)
    r, stub = stub_reader(40, [])
    payer = "0x" + "ab" * 20
    stub.logs = [sale_log(r, 3, SHOP_A, payer, 5_250_000, 525_000), sale_log(r, 25, SHOP_B, payer, 7, 0),
                 sale_log(r, 31, SHOP_A, payer, 1, 0, li=4)]
    got = r.sales(SHOP_A, 0, 35)
    assert [(s.block_number, s.amount, s.repayment, s.log_index) for s in got] == [(3, 5_250_000, 525_000, 0),
                                                                                  (31, 1, 0, 4)]
    assert got[0].payer == Web3.to_checksum_address(payer) and got[0].shop_id == SHOP_A
    assert got[0].timestamp == 1_000 + 36 and got[0].tx_hash == "0x" + "03" * 32
    assert [(c["fromBlock"], c["toBlock"]) for c in stub.get_logs_calls] == [(0, 9), (10, 19), (20, 29), (30, 35)]
    assert len(r.sales(None, 0, 39)) == 3


def test_reader_first_block_binary_search_is_cached(stub_reader):
    r, stub = stub_reader(10_000, [])
    ts = 1_000 + 12 * 4_321 + 5  # between blocks 4321 and 4322
    ts_bucket = ts - ts % 3600
    b = r.first_block_at_or_after(ts)
    assert r.block_timestamp(b) >= ts_bucket > r.block_timestamp(b - 1)
    calls = stub.get_block_calls
    assert r.first_block_at_or_after(ts) == b and stub.get_block_calls == calls
    assert r.first_block_at_or_after(10**12) == 10_000  # after head


def test_reader_usdc_funders(stub_reader):
    r, stub = stub_reader(100, [])
    p1, p2, other = "0x" + "a1" * 20, "0x" + "a2" * 20, "0x" + "a3" * 20
    payout, zero = "0x" + "fe" * 20, "0x" + "00" * 20
    topic = bytes.fromhex(r._transfer_ev.topic.removeprefix("0x")) if isinstance(r._transfer_ev.topic, str) \
        else bytes(r._transfer_ev.topic)

    def tr(block, frm, to):
        return {"address": r.usdc.address, "blockNumber": block, "logIndex": 0, "transactionIndex": 0,
                "transactionHash": b"\x02" * 32, "blockHash": b"\x01" * 32, "removed": False,
                "topics": [topic, _topic_hex(frm), _topic_hex(to)], "data": encode(["uint256"], [1])}

    stub.logs = [tr(1, zero, p1), tr(50, payout, p1), tr(60, payout, p1), tr(70, zero, other), tr(80, p1, p2)]
    out = r.usdc_funders([Web3.to_checksum_address(p1), p2], since_ts=1_000)
    assert set(out) == {Web3.to_checksum_address(p1), p2}
    assert [a.lower() for a in out[Web3.to_checksum_address(p1)]] == [zero, payout]  # deduped, ordered
    assert [a.lower() for a in out[p2]] == [p1]
    late = r.usdc_funders([p1], since_ts=1_000 + 12 * 99 + 3600)  # entirely after head
    assert late == {p1: []}


# ------------------------------------------------------------------ live (needs scripts/devnet.sh)

@pytest.mark.anvil
def test_live_reader_against_devnet():
    s = Settings()
    r = Web3ChainReader(s)
    assert r.latest_block() >= r.deploy_block
    lim = r.limits()
    assert len(lim.tier_cap) == 4 and lim.max_exposure >= lim.max_exposure_floor
    sales = r.sales(None, r.deploy_block, r.latest_block())
    if sales:
        payers = list({x.payer for x in sales})[:10]
        assert set(r.usdc_funders(payers, 0)) == set(payers)
        assert r.shop_payout(sales[0].shop_id) is not None
    r.advances()


@pytest.mark.anvil
def test_live_indexer_against_devnet(tmp_path):
    r = Web3ChainReader(Settings())
    idx = Indexer(r, tmp_path / "live.sqlite")
    n = idx.sync()
    assert idx.sync() == 0
    assert n >= 0


def test_deployments_dataclass_repr_hides_raw():
    d = Deployments(1, {}, None, 0, {"secret": "x"})
    assert "secret" not in repr(d)
