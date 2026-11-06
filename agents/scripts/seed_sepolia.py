#!/usr/bin/env python3
"""Seed a small, realistic demo state on Sepolia, in real time (no time warps). DRY RUN BY DEFAULT.

Plan (each step is idempotent; progress goes to agents/data/sepolia_seed.json, mode 0600, git-ignored):
  1. shops: a fresh owner/payout key per shop ("chai-stall", "kiosco-don-pepe", and "wash-trader" unless
     --no-wash), ETH-funded by the relayer, then AdvanceBook.registerShop(keccak(label), payout) from that key
  2. payers: N honest payer wallets, ETH-funded by the relayer and MockUSDC-minted by the relayer (open mint)
  3. sales: --sales varied-cents AdvanceBook.pay per honest shop, round-robin over all honest payers.
     wash-trader: its payers get BOTH their gas ETH and their USDC from the shop's own payout address
     (USDC minted to the payout), so the circular-funding red line fires
  4. --with-business-pass: a Business Pass for chai-stall via our Python Issuer with a MOCK zkTLS claim, then
     BusinessPassRegistry.issue from the relayer (cold-start demo). A real Reclaim proof replaces the mock later:
     swap `mock_verify_zktls` for the Reclaim SDK verifier; nothing else changes.

Without --execute nothing is sent: every step is priced with eth_estimateGas (free). Steps that depend on state
that does not exist yet (a pay before the shop is registered) are estimated with eth_estimateGas state
overrides, so the numbers are live, not guesses. Keys are created and persisted to the state file before the first
send and are never printed; output shows addresses only.

    set -a; . ./.env; . scripts/sepolia.env; set +a
    uv run python scripts/seed_sepolia.py [--with-business-pass]             # dry run: plan + cost
    uv run python scripts/seed_sepolia.py --with-business-pass --execute     # sends (demo day)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import secrets
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from eth_account import Account
from eth_utils import keccak, to_checksum_address
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mra_agents import zk  # noqa: E402
from mra_agents.chain import load_abi, load_deployments  # noqa: E402
from mra_agents.issuer import BusinessClaim, Issuer  # noqa: E402

STATE_FILE = ROOT / "data" / "sepolia_seed.json"
SEPOLIA = 11155111
HONEST, WASH = ("chai-stall", "kiosco-don-pepe"), "wash-trader"
MAX_UINT = 2**256 - 1
ETHER = 10**18
# Used only when a live estimate is impossible (it reverted); flagged "static" in the table.
STATIC_GAS = {"fund": 21_000, "register": 75_000, "mint": 60_000, "approve": 50_000, "transfer": 55_000,
              "pay": 120_000, "issue": 1_500_000}


class SeedError(RuntimeError):
    pass


def shop_id(label: str) -> bytes:
    return keccak(text=label)


def _w(v: int) -> str:
    return "0x" + v.to_bytes(32, "big").hex()


def _slot(key: bytes | str, base: int) -> int:
    k = bytes.fromhex(key[2:].rjust(64, "0")) if isinstance(key, str) else key
    return int.from_bytes(keccak(k + base.to_bytes(32, "big")), "big")


def erc20_balance_slot(holder: str) -> int:  # OZ ERC20: _balances at slot 0
    return _slot(holder.lower(), 0)


def erc20_allowance_slot(owner: str, spender: str) -> int:  # _allowances at slot 1
    return int.from_bytes(keccak(bytes.fromhex(spender[2:].lower().rjust(64, "0"))
                                 + _slot(owner.lower(), 1).to_bytes(32, "big")), "big")


def merge(*overrides: dict) -> dict:
    out: dict = {}
    for o in overrides:
        for addr, v in o.items():
            e = out.setdefault(addr, {})
            for k, val in v.items():
                e[k] = {**e.get(k, {}), **val} if isinstance(val, dict) else val
    return out


# ---------------------------------------------------------------- chain access (faked in tests)

class RpcChain:
    """Read-only JSON-RPC access: fees, estimates (with state overrides), balances, a few contract reads."""

    def __init__(self, w3: Web3, dep):
        self.w3, self.dep = w3, dep
        self.chain_id = int(w3.eth.chain_id)
        self.book = w3.eth.contract(address=dep["AdvanceBook"], abi=load_abi("AdvanceBook"))
        self.registry = w3.eth.contract(address=dep["BusinessPassRegistry"], abi=load_abi("BusinessPassRegistry"))

    def _rpc(self, method: str, params: list):
        r = self.w3.provider.make_request(method, params)
        if r.get("error"):
            raise SeedError(f"{method}: {r['error'].get('message', r['error'])}")
        return r["result"]

    def fees(self) -> tuple[int, int, int]:
        """(baseFeePerGas, priority fee, latest timestamp)"""
        b = self.w3.eth.get_block("latest")
        return int(b.get("baseFeePerGas", 0)), int(self.w3.eth.max_priority_fee), int(b["timestamp"])

    def estimate(self, tx: dict, overrides: dict | None = None) -> int:
        t = {k: (hex(v) if isinstance(v, int) else v) for k, v in tx.items()}
        return int(self._rpc("eth_estimateGas", [t, "latest", overrides] if overrides else [t, "latest"]), 16)

    def balance(self, addr: str) -> int:
        return int(self.w3.eth.get_balance(addr))

    def nonce(self, addr: str) -> int:
        return int(self.w3.eth.get_transaction_count(addr, "pending"))

    def shop_owner(self, sid: bytes) -> str:
        return to_checksum_address(self.book.functions.shops(sid).call()[0])

    def registry_issuer(self) -> str:
        return to_checksum_address(self.registry.functions.issuer().call())

    def country_set(self) -> list[int]:
        return [int(c) for c in self.registry.functions.countrySet().call()]

    def shops_slot(self) -> int | None:
        """Storage slot of AdvanceBook.shops, found with ONE eth_call: override candidate slot k of a probe id
        with owner = k+1 and read shops(probe) back. Read-only; None if not found."""
        probe = keccak(text="seed-sepolia-slot-probe")
        diff = {_w(_slot(probe, k)): _w(k + 1) for k in range(64)}
        data = self.book.encode_abi("shops", [probe])
        out = self._rpc("eth_call", [{"to": self.book.address, "data": data}, "latest",
                                     {self.book.address: {"stateDiff": diff}}])
        owner = int(out[2:66] or "0", 16)
        return owner - 1 if 1 <= owner <= 64 else None

    def send_raw(self, raw: bytes) -> str:
        return "0x" + bytes(self.w3.eth.send_raw_transaction(raw)).hex().removeprefix("0x")

    def wait(self, tx_hash: str, timeout: float = 180) -> int:
        return int(self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)["status"])

    def receipt_status(self, tx_hash: str) -> int | None:
        try:
            return int(self.w3.eth.get_transaction_receipt(tx_hash)["status"])
        except Exception:  # not found / pending
            return None


class TxSender:
    """Signs and sends EIP-1559 txs from named local keys. Only constructed with --execute."""

    def __init__(self, chain: RpcChain, keys: dict[str, str]):
        self.chain = chain
        self._accounts = {n: Account.from_key(k) for n, k in keys.items()}

    def __repr__(self) -> str:
        return "TxSender(<keys hidden>)"

    def send(self, signer: str, tx: dict) -> str:
        acct = self._accounts[signer]
        full = {**tx, "from": acct.address, "chainId": self.chain.chain_id, "nonce": self.chain.nonce(acct.address),
                "type": 2}
        return self.chain.send_raw(acct.sign_transaction(full).raw_transaction)

    def wait(self, tx_hash: str) -> int:
        return self.chain.wait(tx_hash)


# ---------------------------------------------------------------- plan

@dataclass
class Step:
    id: str
    kind: str
    signer: str          # key name: relayer | shop:<label> | payer:<i> | wash-payer:<i>
    to: str
    data: str = "0x"
    value: int = 0
    note: str = ""
    fund: str | None = None   # ETH funding step: the key whose needs `value` covers
    overrides: dict = field(default_factory=dict)
    gas: int = 0
    source: str = ""

    @property
    def gas_limit(self) -> int:
        return self.gas if self.gas == 21_000 else int(self.gas * 1.2) + 10_000


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "keys": {}, "steps": {}}
    return json.loads(path.read_text())


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(state, f, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def sale_amounts(seed: int, label: str, n: int) -> list[int]:
    rng = random.Random(f"{seed}:{label}")
    if label == WASH:  # round, repetitive amounts: what a wash loop looks like
        return [(10 + (i % 3) * 5) * 10**6 for i in range(n)]
    return [rng.randrange(275, 2500) * 10_000 for _ in range(n)]  # $2.75 .. $24.99, cents


def mock_verify_zktls(claim: BusinessClaim):
    """Stand-in for the Reclaim verifier: accepts {"mock": True, "context": leaf}. Replace with the real SDK."""
    def verify(proof: dict, leaf: int) -> BusinessClaim:
        if not proof.get("mock") or proof.get("context") != leaf:
            raise ValueError("mock zkTLS proof context must equal the leaf")
        return claim
    return verify


def build_plan(cfg, state: dict, addr: dict[str, str], dep, chain, secrets_: dict) -> list[Step]:
    book, usdc = dep["AdvanceBook"], dep["USDC"]
    w3 = Web3()
    bk = w3.eth.contract(address=book, abi=load_abi("AdvanceBook"))
    tok = w3.eth.contract(address=usdc, abi=load_abi("MockUSDC"))
    shops = list(HONEST) + ([] if cfg.no_wash else [WASH])
    honest_payers = [f"payer:{i}" for i in range(cfg.payers)]
    wash_payers = [] if cfg.no_wash else [f"wash-payer:{i}" for i in range(cfg.wash_payers)]
    seed = state.setdefault("seed", cfg.seed)
    slot = secrets_.get("shops_slot")

    def bal(holder, amount):
        return {usdc: {"stateDiff": {_w(erc20_balance_slot(addr[holder])): _w(amount)}}}

    def eth(name):
        return {addr[name]: {"balance": hex(ETHER)}}

    def shop_ov(label):
        if slot is None:
            return {}
        base = _slot(shop_id(label), slot)
        a = addr[f"shop:{label}"]
        return {book: {"stateDiff": {_w(base): _w(int(a, 16)), _w(base + 1): _w(int(a, 16))}}}

    steps: list[Step] = []
    for label in shops:
        k = f"shop:{label}"
        steps.append(Step(f"fund:{k}", "fund", "relayer", addr[k], fund=k, note=f"gas for {label} owner/payout"))
        steps.append(Step(f"register:{label}", "register", k, book,
                          bk.encode_abi("registerShop", [shop_id(label), addr[k]]),
                          note=f"registerShop({label}, payout={addr[k][:10]}…)", overrides=eth(k)))
    if cfg.with_business_pass:
        steps.append(secrets_["bizpass_step"])

    sales = {label: sale_amounts(seed, label, cfg.sales) for label in HONEST}
    if not cfg.no_wash:
        sales[WASH] = sale_amounts(seed, WASH, cfg.wash_sales)
    payer_of = {}  # (label, i) -> payer key name
    spend: dict[str, int] = {}
    for j, label in enumerate(HONEST):
        for i, _ in enumerate(sales[label]):
            p = honest_payers[(i + j * 3) % len(honest_payers)]
            payer_of[(label, i)] = p
            spend[p] = spend.get(p, 0) + sales[label][i]
    for i, _ in enumerate(sales.get(WASH, [])):
        p = wash_payers[i % len(wash_payers)]
        payer_of[(WASH, i)] = p
        spend[p] = spend.get(p, 0) + sales[WASH][i]

    for p in honest_payers:
        mint = -(-(spend.get(p, 0) + 5 * 10**6) // 10**6) * 10**6  # spend + $5, whole dollars
        steps.append(Step(f"fund:{p}", "fund", "relayer", addr[p], fund=p, note="gas for an honest customer"))
        steps.append(Step(f"mint:{p}", "mint", "relayer", usdc, tok.encode_abi("mint", [addr[p], mint]),
                          note=f"mint {mint / 1e6:.0f} USDC to {p}"))
    if wash_payers:
        payout = f"shop:{WASH}"
        total = sum(spend[p] for p in wash_payers)
        steps.append(Step(f"mint:{payout}", "mint", "relayer", usdc, tok.encode_abi("mint", [addr[payout], total]),
                          note=f"mint {total / 1e6:.0f} USDC to the wash-trader PAYOUT"))
        for p in wash_payers:
            steps.append(Step(f"fund:{p}", "fund", payout, addr[p], fund=p, overrides=eth(payout),
                              note="gas from the shop's own payout (circular)"))
            steps.append(Step(f"transfer:{p}", "transfer", payout, usdc,
                              tok.encode_abi("transfer", [addr[p], spend[p]]),
                              overrides=merge(eth(payout), bal(payout, spend[p])),
                              note=f"payout -> {p}: {spend[p] / 1e6:.0f} USDC (circular funding)"))
    for p in honest_payers + wash_payers:
        steps.append(Step(f"approve:{p}", "approve", p, usdc, tok.encode_abi("approve", [book, MAX_UINT]),
                          overrides=eth(p), note="approve AdvanceBook"))
    order = sorted(payer_of, key=lambda li: (li[1], li[0]))  # interleave shops like a real market
    for label, i in order:
        p, amount = payer_of[(label, i)], sales[label][i]
        ov = merge(eth(p), {usdc: {"stateDiff": {_w(erc20_balance_slot(addr[p])): _w(amount),
                                                 _w(erc20_allowance_slot(addr[p], book)): _w(MAX_UINT)}}},
                   shop_ov(label))
        steps.append(Step(f"pay:{label}:{i}", "pay", p, book, bk.encode_abi("pay", [shop_id(label), amount]),
                          overrides=ov, note=f"{p} pays {label} ${amount / 1e6:.2f}"))
    return steps


def bizpass_step(cfg, state: dict, dep, chain, issuer_key: str | None, pepper: bytes | None, now: int,
                 persist: bool) -> tuple[Step, str | None]:
    """BusinessPassRegistry.issue for chai-stall, attested by our Issuer over a mock zkTLS claim."""
    reg = dep["BusinessPassRegistry"]
    bp = state.get("bizpass") if persist else None
    if bp is None:
        countries = [c for c in chain.country_set() if c] or [32]
        bp = {"secret": secrets.randbelow(zk.P - 1) + 1, "accountId": "mock-reclaim:chai-stall:" + secrets.token_hex(8),
              "country": countries[0], "revenueBand": cfg.band, "ageOk": 1}
        if persist:
            state["bizpass"] = bp
    step = Step("issue:bizpass:chai-stall", "issue", "relayer", reg,
                note=f"Business Pass (mock zkTLS) band {bp['revenueBand']}, country {bp['country']}")
    if not issuer_key or not pepper:
        return step, "ISSUER_PRIVATE_KEY / BUSINESS_PEPPER not set"
    issuer = Issuer(issuer_key, pepper, chain_id=chain.chain_id, registry=reg, ttl_seconds=3600,
                    verify_zktls=mock_verify_zktls(BusinessClaim(bp["accountId"], bp["country"],
                                                                 bp["revenueBand"], bp["ageOk"])))
    h = zk.h_of(bp["secret"])
    leaf = zk.business_leaf_from_h(h, bp["country"], bp["revenueBand"], bp["ageOk"])
    a = issuer.attest({"mock": True, "context": leaf}, h, bp["country"], bp["revenueBand"], bp["ageOk"], now)
    rc = Web3().eth.contract(address=reg, abi=load_abi("BusinessPassRegistry"))
    step.data = rc.encode_abi("issue", [(a["businessNullifier"], a["commitment"], a["expiresAt"]),
                                        bytes.fromhex(a["signature"][2:]), a["commitment"]])
    warn = None
    if Account.from_key(issuer_key).address != chain.registry_issuer():
        warn = "our ISSUER_PRIVATE_KEY is not BusinessPassRegistry.issuer: issue() will revert"
    return step, warn


def estimate_all(steps: list[Step], chain, addr: dict[str, str], done: set[str]) -> list[str]:
    warnings = []
    for s in steps:
        if s.id in done:
            s.source = "done"
            continue
        tx = {"from": addr[s.signer], "to": s.to, "data": s.data}
        if s.fund:
            tx["value"] = 1  # value is sized later; any nonzero value prices the same
        try:
            s.gas = chain.estimate(tx, s.overrides or None)
            s.source = "live+override" if s.overrides and len(s.overrides) > 1 else "live"
        except Exception as e:  # noqa: BLE001 - report and fall back
            s.gas, s.source = STATIC_GAS[s.kind], "static:revert"
            warnings.append(f"{s.id}: estimate reverted ({str(e)[:120]}); using static {s.gas}")
    return warnings


def size_funding(steps: list[Step], fee_cap: int, balances: dict[str, int]) -> None:
    """value of each funding step = what its recipient key must spend (gas_limit * fee_cap + values it sends)."""
    by_signer: dict[str, list[Step]] = {}
    for s in steps:
        if s.source != "done":
            by_signer.setdefault(s.signer, []).append(s)

    def need(key: str) -> int:
        total = 0
        for s in by_signer.get(key, []):
            if s.fund:
                s.value = max(0, need(s.fund) - balances.get(s.fund, 0))
            total += s.gas_limit * fee_cap + s.value
        return total

    for s in steps:  # every pending funding step, also payout -> wash payer when the payout was funded earlier
        if s.fund and s.source != "done":
            s.value = max(0, need(s.fund) - balances.get(s.fund, 0))


def relayer_outflow(steps: list[Step], fee_cap: int) -> int:
    return sum(s.gas_limit * fee_cap + s.value for s in steps if s.signer == "relayer" and s.source != "done")


# ---------------------------------------------------------------- run

def parse(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--execute", action="store_true", help="actually send transactions (default: dry run)")
    ap.add_argument("--payers", type=int, default=6)
    ap.add_argument("--sales", type=int, default=8, help="sales per honest shop")
    ap.add_argument("--wash-payers", type=int, default=2)
    ap.add_argument("--wash-sales", type=int, default=6)
    ap.add_argument("--no-wash", action="store_true")
    ap.add_argument("--with-business-pass", action="store_true")
    ap.add_argument("--band", type=int, default=2, help="mock zkTLS revenue band for chai-stall")
    ap.add_argument("--fee-cap-gwei", type=float, default=0.25,
                    help="maxFeePerGas the demo wallets are funded for (floor; live fee used if higher)")
    ap.add_argument("--max-eth", type=float, default=0.005, help="abort if the relayer would spend more")
    ap.add_argument("--sale-interval", type=float, default=0.0, help="seconds to wait between sales")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--state", type=Path, default=STATE_FILE)
    return ap.parse_args(argv)


def run(argv, *, chain, dep, relayer_key: str, issuer_key: str | None = None, pepper: bytes | None = None,
        sender_factory=None, out=print, sleep=time.sleep) -> int:
    cfg = parse(argv)
    if cfg.payers < 1 or cfg.wash_payers < 1:
        raise SeedError("need at least one payer")
    if dep.chain_id != chain.chain_id:
        raise SeedError(f"deployments are for chain {dep.chain_id}, RPC is chain {chain.chain_id}")
    state = load_state(cfg.state)
    if state.get("book", dep["AdvanceBook"]) != dep["AdvanceBook"] or state.get("chainId", chain.chain_id) != chain.chain_id:
        raise SeedError(f"{cfg.state} belongs to another deployment; move it aside to seed this one")
    execute = cfg.execute
    names = ([f"shop:{n}" for n in HONEST] + ([] if cfg.no_wash else [f"shop:{WASH}"])
             + [f"payer:{i}" for i in range(cfg.payers)]
             + ([] if cfg.no_wash else [f"wash-payer:{i}" for i in range(cfg.wash_payers)]))
    keys = dict(state["keys"]) if execute else {}
    for n in names:  # dry run: throwaway in-memory keys (only addresses are used); execute: persisted
        if n not in keys:
            keys[n] = state["keys"].get(n) or "0x" + Account.create().key.hex().removeprefix("0x")
    addr = {n: Account.from_key(k).address for n, k in keys.items()}
    try:
        addr["relayer"] = Account.from_key(relayer_key).address
    except (ValueError, TypeError):  # never chain: the message could echo key material
        raise SeedError("invalid relayer key") from None
    if execute:
        state.update(chainId=chain.chain_id, book=dep["AdvanceBook"])
        state["keys"] = {**state["keys"], **{n: keys[n] for n in names}}
        save_state(cfg.state, state)  # keys on disk BEFORE any ETH is sent to them

    base, prio, now = chain.fees()
    live_fee = base + prio
    fee_cap = int(state.get("feeCapWei") or max(2 * base + prio, int(cfg.fee_cap_gwei * 1e9)))
    extra = {"shops_slot": chain.shops_slot()}
    warnings = [] if extra["shops_slot"] is not None else ["AdvanceBook.shops slot not found: pay estimates static"]
    if cfg.with_business_pass:
        step, warn = bizpass_step(cfg, state, dep, chain, issuer_key, pepper, now, persist=execute)
        extra["bizpass_step"] = step
        if warn:
            warnings.append(warn)
    steps = build_plan(cfg, state, addr, dep, chain, extra)
    done = {sid for sid, v in state["steps"].items() if v.get("status") == "done"}
    for s in steps:  # chain truth for registrations made outside the state file
        if s.kind == "register" and s.id not in done and chain.shop_owner(shop_id(s.id.split(":", 1)[1])) == addr[s.signer]:
            done.add(s.id)
    warnings += estimate_all(steps, chain, addr, done)
    balances = {n: chain.balance(addr[n]) for n in names}
    size_funding(steps, fee_cap, balances)
    outflow = relayer_outflow(steps, fee_cap)
    if outflow > cfg.max_eth * ETHER:  # shrink the funded fee cap to fit the budget, never below the live fee
        own = sum(s.gas_limit for s in steps if s.signer == "relayer" and s.source != "done")
        funded = sum(s.gas_limit for s in steps if s.signer != "relayer" and s.source != "done")
        cap = int((cfg.max_eth * ETHER) // max(1, own + funded))
        if cap < 2 * base + prio:
            raise SeedError(f"plan needs {outflow / ETHER:.6f} ETH > --max-eth {cfg.max_eth} even at the live fee")
        out(f"note: fee cap lowered {fee_cap / 1e9:.3f} -> {cap / 1e9:.3f} gwei to fit --max-eth")
        fee_cap = cap
        size_funding(steps, fee_cap, balances)
        outflow = relayer_outflow(steps, fee_cap)

    # ---- report
    todo = [s for s in steps if s.source != "done"]
    out(f"{'EXECUTE' if execute else 'DRY RUN (no transactions)'} | chain {chain.chain_id} | book {dep['AdvanceBook']}")
    out(f"{'#':>3} {'step':<28} {'signer':<18} {'gas':>9} {'source':<13} note")
    for i, s in enumerate(steps, 1):
        v = f" +{s.value / ETHER:.6f} ETH" if s.fund and s.source != "done" else ""
        tx = state["steps"].get(s.id, {}).get("tx", "")
        gas = "-" if s.source == "done" else f"{s.gas:,}"
        out(f"{i:>3} {s.id:<28} {s.signer:<18} {gas:>9} {s.source:<13} {s.note}{v}"
            + (f" (tx {tx[:12]}…)" if s.source == "done" and tx else ""))
    total = sum(s.gas for s in todo)
    total_limit = sum(s.gas_limit for s in todo)
    out("")
    out(f"steps: {len(steps)} planned, {len(steps) - len(todo)} already done, {len(todo)} to send")
    out(f"total estimated gas: {total:,} (gas limits {total_limit:,})")
    out(f"live gas price: base {base / 1e9:.9f} + tip {prio / 1e9:.9f} = {live_fee / 1e9:.9f} gwei")
    out(f"estimated ETH burned at the live price: {total * live_fee / ETHER:.12f} ETH ({total * live_fee:,} wei)")
    out(f"worst case at the funded fee cap {fee_cap / 1e9:.3f} gwei: {total_limit * fee_cap / ETHER:.6f} ETH")
    by: dict[str, int] = {}
    for s in todo:
        by[s.signer] = by.get(s.signer, 0) + s.gas
    out("who pays: the RELAYER key pays everything; it sends its own txs and pre-funds every demo wallet")
    for signer, g in sorted(by.items(), key=lambda kv: -kv[1]):
        src = "relayer" if signer == "relayer" else ("shop:wash-trader (funded by relayer)"
                                                    if signer.startswith("wash-payer") else "relayer funding")
        out(f"  {signer:<18} {g:>10,} gas   paid from {src}")
    rbal = chain.balance(addr["relayer"])
    funding = sum(s.value for s in todo if s.signer == "relayer")
    out(f"relayer {addr['relayer']} balance {rbal / ETHER:.6f} ETH")
    out(f"  ETH sent to demo wallets: {funding / ETHER:.6f} (gas float sized at the fee cap; mostly left unspent)")
    out(f"  max relayer outflow incl. its own gas at the cap: {outflow / ETHER:.6f} ETH <= budget {cfg.max_eth} ETH")
    for w in warnings:
        out(f"WARNING: {w}")
    if not execute:
        out("dry run only: nothing was sent and no state was written. Re-run with --execute to send.")
        return 0
    if any(s.source == "static:revert" for s in todo):
        raise SeedError("some steps are predicted to revert (see warnings); nothing sent")
    if outflow > rbal:
        raise SeedError("relayer balance too low for this plan")
    if sender_factory is None:
        raise SeedError("no sender configured")

    # ---- execute
    state["feeCapWei"] = fee_cap
    save_state(cfg.state, state)
    sender = sender_factory({**{n: keys[n] for n in names}, "relayer": relayer_key})
    sent_sale = False
    for s in todo:
        rec = state["steps"].get(s.id, {})
        if rec.get("tx"):  # sent before but not confirmed: check it first
            st = chain.receipt_status(rec["tx"])
            if st == 1:
                state["steps"][s.id] = {**rec, "status": "done"}
                save_state(cfg.state, state)
                out(f"  {s.id}: confirmed earlier tx {rec['tx'][:12]}…")
                continue
        if s.kind == "pay" and sent_sale and cfg.sale_interval:
            sleep(cfg.sale_interval)
        tx = {"to": s.to, "data": s.data, "value": s.value}
        try:
            gas = chain.estimate({"from": addr[s.signer], **tx})  # real state now; no overrides
        except Exception as e:  # noqa: BLE001
            raise SeedError(f"{s.id} would revert now: {str(e)[:160]}") from None
        limit = gas if gas == 21_000 else int(gas * 1.2) + 10_000
        tx_hash = sender.send(s.signer, {**tx, "gas": limit, "maxFeePerGas": fee_cap,
                                         "maxPriorityFeePerGas": min(max(prio, 1), fee_cap)})
        state["steps"][s.id] = {"tx": tx_hash, "status": "sent", "value": s.value}
        save_state(cfg.state, state)
        status = sender.wait(tx_hash)
        if status != 1:
            raise SeedError(f"{s.id} reverted in tx {tx_hash}")
        state["steps"][s.id]["status"] = "done"
        save_state(cfg.state, state)
        sent_sale = sent_sale or s.kind == "pay"
        out(f"  {s.id}: {tx_hash}")
    out(f"SEED DONE: state in {cfg.state} (keys and the Business Pass secret live only there, mode 0600)")
    return 0


def main(argv=None) -> int:
    from mra_agents.config import Settings

    s = Settings()
    if s.chain_id != SEPOLIA:
        print("Load the Sepolia profile first: set -a; . ./.env; . scripts/sepolia.env; set +a")
        return 2
    if s.relayer_private_key is None:
        print("RELAYER_PRIVATE_KEY is not set")
        return 2
    dep = load_deployments(s.deployments_file)
    w3 = Web3(Web3.HTTPProvider(s.rpc_url, request_kwargs={"timeout": 60}))
    chain = RpcChain(w3, dep)
    try:
        return run(argv if argv is not None else sys.argv[1:], chain=chain, dep=dep,
                   relayer_key=s.relayer_private_key.get_secret_value(),
                   issuer_key=s.issuer_private_key.get_secret_value() if s.issuer_private_key else None,
                   pepper=s.business_pepper.get_secret_value().encode() if s.business_pepper else None,
                   sender_factory=lambda keys: TxSender(chain, keys))
    except SeedError as e:
        print(f"SEED ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
