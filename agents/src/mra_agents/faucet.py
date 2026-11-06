"""Demo faucet: `POST /demo/faucet {address}` sends a burner wallet just enough Sepolia ETH for ~10 demo txs and
mints it test USDC (MockUSDC has an open `mint`). Judges and demo phones hold no Sepolia ETH or USDC, so without
this every write in the live app fails with `wallet_required` / insufficient funds.

OFF unless `DEMO_FAUCET=1` AND the chain id (settings and the live RPC) is Sepolia 11155111 or anvil 31337.
Never on mainnet or any other chain, whatever the env says.

Sizing (live, never a hard-coded 21k transfer: on Sepolia today a transfer to a NEW account costs ~205k gas):
    gas_per_tx = max(DEMO_FAUCET_GAS_PER_TX, live estimate of the ETH transfer, live estimate of an approve
                     sent FROM the burner)
    fee_cap    = max(2 * baseFee + priorityFee, DEMO_FAUCET_FEE_CAP_GWEI)
    eth        = DEMO_FAUCET_TXS * gas_per_tx * fee_cap  - what the address already holds
Limits: once per address (persisted in sqlite), DEMO_FAUCET_PER_IP_PER_DAY per client IP (memory only, IPs are
never stored), and a global rolling-24h ETH budget DEMO_FAUCET_MAX_ETH_PER_DAY (default 0.02) that also counts
the faucet's own gas at the fee cap.

The relayer key sends these two txs directly (an ETH transfer and MockUSDC.mint): they are not AdvanceBook /
registry calls, so they deliberately do not go through chain.py's allow-listed `send`. They share the relayer
writer's lock so nonces never collide with relayed draws. Logs carry addresses and tx hashes only.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import sqlite3
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from eth_utils import to_checksum_address
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]  # agents/
FAUCET_CHAINS = frozenset({11155111, 31337})
ETHER = 10**18
GWEI = 10**9
DAY = 86_400
_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
ZERO = "0x" + "00" * 20

_MINT_ABI = [
    {"type": "function", "name": "mint", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}], "outputs": []},
    {"type": "function", "name": "approve", "stateMutability": "nonpayable",
     "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
     "outputs": [{"name": "", "type": "bool"}]},
    {"type": "function", "name": "balanceOf", "stateMutability": "view",
     "inputs": [{"name": "a", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
]


class FaucetSettings(BaseSettings):
    """Read from env / agents/.env on its own, so config.py (frozen) needs no change."""

    model_config = SettingsConfigDict(env_file=(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    demo_faucet: bool = False
    demo_faucet_max_eth_per_day: float = 0.02
    demo_faucet_usdc: float = 50.0
    demo_faucet_txs: int = 10
    demo_faucet_gas_per_tx: int = 250_000
    demo_faucet_fee_cap_gwei: float = 0.1
    demo_faucet_per_ip_per_day: int = 5


class FaucetError(RuntimeError):
    """`code` is stable and user-showable; `status` is the HTTP status the API returns."""

    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code, self.status = code, status


class FaucetDisabled(FaucetError):
    def __init__(self):
        super().__init__("not_found", 404)


class FaucetChain(Protocol):
    def chain_id(self) -> int: ...
    def fees(self) -> tuple[int, int]: ...  # (baseFeePerGas, maxPriorityFeePerGas)
    def balance(self, addr: str) -> int: ...
    def usdc_balance(self, addr: str) -> int: ...
    def estimate_eth(self, to: str, value: int) -> int: ...
    def estimate_mint(self, to: str, amount: int) -> int: ...
    def estimate_approve_from(self, owner: str) -> int: ...
    def send_eth(self, to: str, value: int, gas: int, max_fee: int, tip: int) -> str: ...
    def send_mint(self, to: str, amount: int, gas: int, max_fee: int, tip: int) -> str: ...
    def wait(self, tx_hash: str) -> bool: ...


@dataclass(frozen=True)
class Plan:
    eth_wei: int        # sent to the address (0 if it already holds enough)
    usdc: int           # minted, base units (0 if it already holds enough)
    gas_per_tx: int
    fee_cap: int
    tip: int
    own_cost_wei: int   # the faucet's own gas at the fee cap (budgeted)


class DemoFaucet:
    def __init__(self, chain: FaucetChain, cfg: FaucetSettings, settings_chain_id: int, db_path: Path | str,
                 now: Callable[[], float] = time.time):
        self.chain, self.cfg, self.settings_chain_id, self.now = chain, cfg, int(settings_chain_id), now
        self._db_path = str(db_path)
        self._lock = threading.Lock()
        self._ips: dict[str, deque[float]] = defaultdict(deque)
        self._live_chain_ok: bool | None = None
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS faucet_claims (address TEXT PRIMARY KEY, ts INTEGER NOT NULL, "
                       "cost_wei TEXT NOT NULL, eth_wei TEXT NOT NULL, usdc INTEGER NOT NULL, eth_tx TEXT, "
                       "usdc_tx TEXT, status TEXT NOT NULL)")

    def __repr__(self) -> str:
        return f"DemoFaucet(chain_id={self.settings_chain_id}, enabled={self.cfg.demo_faucet})"

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path, timeout=10, isolation_level=None)

    # ------------------------------------------------------------ gates

    def enabled(self) -> bool:
        if not self.cfg.demo_faucet or self.settings_chain_id not in FAUCET_CHAINS:
            return False
        if self._live_chain_ok is None:  # the RPC must agree: a mainnet RPC with CHAIN_ID=11155111 stays off
            try:
                self._live_chain_ok = int(self.chain.chain_id()) == self.settings_chain_id
            except Exception:  # noqa: BLE001 - unknown chain = off; retried next request
                return False
        return self._live_chain_ok

    @staticmethod
    def _address(raw: object) -> str:
        if not isinstance(raw, str) or not _ADDRESS_RE.match(raw) or raw.lower() == ZERO:
            raise FaucetError("bad_address", 400)
        return to_checksum_address(raw)

    def _spent_24h(self, now: int) -> int:
        with self._db() as db:
            rows = db.execute("SELECT cost_wei FROM faucet_claims WHERE ts > ? AND status != 'failed'",
                              (now - DAY,)).fetchall()
        return sum(int(r[0]) for r in rows)

    def _claimed(self, addr: str) -> bool:
        with self._db() as db:
            row = db.execute("SELECT status FROM faucet_claims WHERE address = ?", (addr.lower(),)).fetchone()
        return row is not None and row[0] != "failed"

    def _ip_allow(self, ip: str, now: float) -> bool:
        q = self._ips[ip]
        while q and q[0] <= now - DAY:
            q.popleft()
        return len(q) < self.cfg.demo_faucet_per_ip_per_day

    # ------------------------------------------------------------ sizing

    def plan(self, addr: str) -> Plan:
        c = self.chain
        base, tip = c.fees()
        fee_cap = max(2 * base + tip, int(self.cfg.demo_faucet_fee_cap_gwei * GWEI), 1)
        tip = max(1, min(tip, fee_cap))
        eth_gas = c.estimate_eth(addr, 1)
        gas_per_tx = max(self.cfg.demo_faucet_gas_per_tx, eth_gas, c.estimate_approve_from(addr))
        target = self.cfg.demo_faucet_txs * gas_per_tx * fee_cap
        eth = max(0, target - c.balance(addr))
        usdc_target = round(self.cfg.demo_faucet_usdc * 1_000_000)
        usdc = usdc_target if c.usdc_balance(addr) < usdc_target else 0
        own = 0
        if eth:
            own += _limit(eth_gas) * fee_cap
        if usdc:
            own += _limit(c.estimate_mint(addr, usdc)) * fee_cap
        return Plan(eth, usdc, gas_per_tx, fee_cap, tip, own)

    # ------------------------------------------------------------ fund

    def fund(self, address: object, ip: str) -> dict:
        if not self.enabled():
            raise FaucetDisabled()
        addr = self._address(address)
        now = self.now()
        with self._lock:  # reserve under the lock; send outside it
            if self._claimed(addr):
                raise FaucetError("already_funded", 409)
            if not self._ip_allow(ip, now):
                raise FaucetError("ip_limit", 429)
            try:
                p = self.plan(addr)
            except FaucetError:
                raise
            except Exception:  # noqa: BLE001 - RPC trouble: never leak details
                raise FaucetError("chain_unavailable", 502) from None
            cost = p.eth_wei + p.own_cost_wei
            budget = int(self.cfg.demo_faucet_max_eth_per_day * ETHER)
            if self._spent_24h(int(now)) + cost > budget:
                raise FaucetError("daily_budget", 429)
            self._ips[ip].append(now)
            with self._db() as db:
                db.execute("INSERT OR REPLACE INTO faucet_claims VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending')",
                           (addr.lower(), int(now), str(cost), str(p.eth_wei), p.usdc))

        eth_tx = usdc_tx = None
        try:
            if p.eth_wei:
                eth_tx = self.chain.send_eth(addr, p.eth_wei, _limit(self.chain.estimate_eth(addr, p.eth_wei)),
                                             p.fee_cap, p.tip)
            if p.usdc:
                usdc_tx = self.chain.send_mint(addr, p.usdc, _limit(self.chain.estimate_mint(addr, p.usdc)),
                                               p.fee_cap, p.tip)
            ok = all(self.chain.wait(h) for h in (eth_tx, usdc_tx) if h)
        except Exception:  # noqa: BLE001 - never leak RPC / key errors
            ok = False
        with self._db() as db:
            db.execute("UPDATE faucet_claims SET status = ?, eth_tx = ?, usdc_tx = ? WHERE address = ?",
                       ("done" if ok else "failed", eth_tx, usdc_tx, addr.lower()))
        if not ok:
            log.warning("faucet send failed address=%s eth_tx=%s usdc_tx=%s", addr, eth_tx, usdc_tx)
            raise FaucetError("send_failed", 502)
        log.info("faucet funded address=%s eth_wei=%d usdc=%d eth_tx=%s usdc_tx=%s", addr, p.eth_wei, p.usdc,
                 eth_tx, usdc_tx)
        return {"address": addr, "eth_wei": str(p.eth_wei), "usdc": p.usdc, "eth_tx": eth_tx, "usdc_tx": usdc_tx,
                "gas_per_tx": p.gas_per_tx, "fee_cap_wei": str(p.fee_cap), "txs": self.cfg.demo_faucet_txs}


def _limit(estimate: int) -> int:
    return int(estimate * 1.2) + 10_000


def client_ip(headers, fallback: str | None) -> str:
    """Rate-limit key. Caddy appends the real peer to X-Forwarded-For, so the RIGHT-most entry is trustworthy
    (anything left of it is client-supplied). IPv6 is bucketed per /64."""
    raw = (headers.get("x-forwarded-for") or "").split(",")[-1].strip() or fallback or "unknown"
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return raw
    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


class Web3FaucetChain:
    """FaucetChain over the relayer's Web3ChainWriter (same w3, same key, same nonce lock)."""

    def __init__(self, writer):
        self.writer = writer
        self.w3 = writer.w3
        self.usdc = self.w3.eth.contract(address=writer.dep["USDC"], abi=_MINT_ABI)
        self.book = writer.dep["AdvanceBook"]

    def __repr__(self) -> str:
        return "Web3FaucetChain(<relayer key hidden>)"

    def _acct(self):
        return self.writer._account("relayer")

    def chain_id(self) -> int:
        return int(self.w3.eth.chain_id)

    def fees(self) -> tuple[int, int]:
        b = self.w3.eth.get_block("latest")
        return int(b.get("baseFeePerGas", 0) or 0), int(self.w3.eth.max_priority_fee)

    def balance(self, addr: str) -> int:
        return int(self.w3.eth.get_balance(addr))

    def usdc_balance(self, addr: str) -> int:
        return int(self.usdc.functions.balanceOf(addr).call())

    def estimate_eth(self, to: str, value: int) -> int:
        return int(self.w3.eth.estimate_gas({"from": self._acct().address, "to": to, "value": value}))

    def estimate_mint(self, to: str, amount: int) -> int:
        return int(self.usdc.functions.mint(to, amount).estimate_gas({"from": self._acct().address}))

    def estimate_approve_from(self, owner: str) -> int:
        return int(self.usdc.functions.approve(self.book, 2**255).estimate_gas({"from": owner}))

    def _send(self, tx: dict) -> str:
        acct = self._acct()
        with self.writer._lock:
            full = {**tx, "from": acct.address, "chainId": self.writer.chain_id, "type": 2,
                    "nonce": self.w3.eth.get_transaction_count(acct.address, "pending")}
            h = self.w3.eth.send_raw_transaction(acct.sign_transaction(full).raw_transaction)
        return "0x" + bytes(h).hex().removeprefix("0x")

    def send_eth(self, to: str, value: int, gas: int, max_fee: int, tip: int) -> str:
        return self._send({"to": to, "value": value, "gas": gas, "maxFeePerGas": max_fee,
                           "maxPriorityFeePerGas": tip})

    def send_mint(self, to: str, amount: int, gas: int, max_fee: int, tip: int) -> str:
        data = self.usdc.encode_abi("mint", [to, amount])
        return self._send({"to": self.usdc.address, "data": data, "value": 0, "gas": gas, "maxFeePerGas": max_fee,
                           "maxPriorityFeePerGas": tip})

    def wait(self, tx_hash: str) -> bool:
        return int(self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)["status"]) == 1


def build_faucet(writer, settings) -> DemoFaucet:
    return DemoFaucet(Web3FaucetChain(writer), FaucetSettings(), settings.chain_id, settings.db_path)
