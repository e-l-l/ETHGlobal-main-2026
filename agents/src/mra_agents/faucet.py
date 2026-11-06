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

DRIP (optional, `{"address", "drip": true}`): the relayer tops ITSELF up with DEMO_FAUCET_DRIP_USDC test USDC
(only what it lacks), approves the JuniorVault (only if the allowance is short), estimates
`deposit(amount, receiver=address)` and, if the vault accepts, sends it, so DRIP shares land straight in the
address. A separate once-per-address claim (`faucet_drip_claims`), so a wallet that already got gas + USDC may
come back once for DRIP. If the vault refuses (the estimate reverts: junior cover / delinquency rules), the
response carries `drip_error: "drip_unavailable"` and the gas + USDC part still goes out; a refused DRIP claim is
not recorded, so it may be retried later. The DRIP part is budgeted at DEMO_FAUCET_DRIP_GAS * fee cap.
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
    {"type": "function", "name": "allowance", "stateMutability": "view",
     "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
]

_VAULT_ABI = [
    {"type": "function", "name": "deposit", "stateMutability": "nonpayable",
     "inputs": [{"name": "assets", "type": "uint256"}, {"name": "receiver", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
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
    demo_faucet_per_ip_per_day: int = 3
    demo_faucet_relayer_min_eth: float = 0.001
    demo_faucet_drip_usdc: float = 20.0
    demo_faucet_drip_gas: int = 500_000  # budgeted for mint-to-self + approve + deposit


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
    def relayer_balance(self) -> int: ...
    def estimate_eth(self, to: str, value: int) -> int: ...
    def estimate_mint(self, to: str, amount: int) -> int: ...
    def estimate_approve_from(self, owner: str) -> int: ...
    def send_eth(self, to: str, value: int, gas: int, max_fee: int, tip: int) -> str: ...
    def send_mint(self, to: str, amount: int, gas: int, max_fee: int, tip: int) -> str: ...
    def wait(self, tx_hash: str) -> bool: ...
    # DRIP (JuniorVault deposit on behalf of the address)
    def relayer_usdc(self) -> int: ...
    def relayer_allowance(self) -> int: ...
    def send_self_mint(self, amount: int, max_fee: int, tip: int) -> str: ...
    def send_vault_approve(self, amount: int, max_fee: int, tip: int) -> str: ...
    def estimate_deposit(self, amount: int, receiver: str) -> int: ...
    def send_deposit(self, amount: int, receiver: str, gas: int, max_fee: int, tip: int) -> str: ...


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
            db.execute("CREATE TABLE IF NOT EXISTS faucet_drip_claims (address TEXT PRIMARY KEY, ts INTEGER NOT NULL, "
                       "cost_wei TEXT NOT NULL, usdc INTEGER NOT NULL, tx TEXT, status TEXT NOT NULL)")

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
            rows = db.execute("SELECT cost_wei FROM faucet_claims WHERE ts > ? AND status != 'failed' UNION ALL "
                              "SELECT cost_wei FROM faucet_drip_claims WHERE ts > ? AND status != 'failed'",
                              (now - DAY, now - DAY)).fetchall()
        return sum(int(r[0]) for r in rows)

    def _claimed(self, addr: str, table: str = "faucet_claims") -> bool:
        assert table in ("faucet_claims", "faucet_drip_claims")
        with self._db() as db:
            row = db.execute(f"SELECT status FROM {table} WHERE address = ?", (addr.lower(),)).fetchone()  # noqa: S608
        return row is not None and row[0] != "failed"

    def _ip_allow(self, ip: str, now: float) -> bool:
        q = self._ips[ip]
        while q and q[0] <= now - DAY:
            q.popleft()
        return len(q) < self.cfg.demo_faucet_per_ip_per_day

    def status(self) -> dict:
        spent = self._spent_24h(int(self.now()))
        budget = int(self.cfg.demo_faucet_max_eth_per_day * ETHER)
        return {"spent_wei": str(spent), "budget_wei": str(budget),
                "budget_alarm": spent * 5 >= budget * 4}

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

    def fund(self, address: object, ip: str, drip: bool = False) -> dict:
        if not self.enabled():
            raise FaucetDisabled()
        addr = self._address(address)
        now = self.now()
        with self._lock:  # reserve under the lock; send outside it
            base = not self._claimed(addr)
            drip = bool(drip) and not self._claimed(addr, "faucet_drip_claims")
            if not base and not drip:
                raise FaucetError("already_funded", 409)
            if not self._ip_allow(ip, now):
                raise FaucetError("ip_limit", 429)
            try:
                p = self.plan(addr)
            except FaucetError:
                raise
            except Exception:  # noqa: BLE001 - RPC trouble: never leak details
                raise FaucetError("chain_unavailable", 502) from None
            if not base:
                p = Plan(0, 0, p.gas_per_tx, p.fee_cap, p.tip, 0)
            drip_usdc = round(self.cfg.demo_faucet_drip_usdc * 1_000_000) if drip else 0
            drip_cost = self.cfg.demo_faucet_drip_gas * p.fee_cap if drip else 0
            cost = p.eth_wei + p.own_cost_wei + drip_cost
            try:
                if self.chain.relayer_balance() - cost < int(self.cfg.demo_faucet_relayer_min_eth * ETHER):
                    raise FaucetError("relayer_balance_low", 503)
            except FaucetError:
                raise
            except Exception:  # noqa: BLE001 - fail closed on RPC failure
                raise FaucetError("chain_unavailable", 502) from None
            budget = int(self.cfg.demo_faucet_max_eth_per_day * ETHER)
            if self._spent_24h(int(now)) + cost > budget:
                raise FaucetError("daily_budget", 429)
            self._ips[ip].append(now)
            with self._db() as db:
                if base:
                    db.execute("INSERT OR REPLACE INTO faucet_claims VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending')",
                               (addr.lower(), int(now), str(p.eth_wei + p.own_cost_wei), str(p.eth_wei), p.usdc))
                if drip:
                    db.execute("INSERT OR REPLACE INTO faucet_drip_claims VALUES (?, ?, ?, ?, NULL, 'pending')",
                               (addr.lower(), int(now), str(drip_cost), drip_usdc))

        out: dict = {"address": addr, "eth_wei": "0", "usdc": 0, "eth_tx": None, "usdc_tx": None,
                     "gas_per_tx": p.gas_per_tx, "fee_cap_wei": str(p.fee_cap), "txs": self.cfg.demo_faucet_txs}
        if base:
            try:
                out.update(self._send_base(addr, p))
            except FaucetError:
                if drip:  # release the DRIP reservation: nothing was sent for it
                    with self._db() as db:
                        db.execute("UPDATE faucet_drip_claims SET status = 'failed' WHERE address = ?", (addr.lower(),))
                raise
        if drip:
            out.update(self._send_drip(addr, drip_usdc, p, raise_on_refusal=not base))
        return out

    def _send_drip(self, addr: str, amount: int, p: Plan, raise_on_refusal: bool) -> dict:
        """Relayer: mint itself what it lacks, approve the vault if short, then deposit(amount, receiver=addr)."""
        c, tx, status, err = self.chain, None, "failed", None
        try:
            if c.relayer_usdc() < amount and not c.wait(c.send_self_mint(amount, p.fee_cap, p.tip)):
                raise RuntimeError("mint")
            if c.relayer_allowance() < amount and not c.wait(c.send_vault_approve(2**255, p.fee_cap, p.tip)):
                raise RuntimeError("approve")
            try:
                gas = c.estimate_deposit(amount, addr)
            except Exception:  # noqa: BLE001 - the vault refuses deposits right now (cover / delinquency rule)
                err = "drip_unavailable"
            else:
                tx = c.send_deposit(amount, addr, _limit(gas), p.fee_cap, p.tip)
                ok = c.wait(tx)
                status, err = ("done", None) if ok else ("uncertain", "drip_unavailable")
        except Exception:  # noqa: BLE001 - never leak RPC / key errors
            err = "drip_unavailable"
            status = "uncertain" if tx else "failed"
        with self._db() as db:
            db.execute("UPDATE faucet_drip_claims SET status = ?, tx = ? WHERE address = ?", (status, tx, addr.lower()))
        if err:
            log.warning("faucet drip failed address=%s tx=%s", addr, tx)
            if raise_on_refusal:
                raise FaucetError(err, 503)
            return {"drip": 0, "drip_tx": None, "drip_error": err}
        log.info("faucet drip address=%s usdc=%d tx=%s", addr, amount, tx)
        return {"drip": amount, "drip_tx": tx, "drip_error": None}

    def _send_base(self, addr: str, p: Plan) -> dict:
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
                       ("done" if ok else ("uncertain" if eth_tx or usdc_tx else "failed"), eth_tx, usdc_tx, addr.lower()))
        if not ok:
            log.warning("faucet send failed address=%s eth_tx=%s usdc_tx=%s", addr, eth_tx, usdc_tx)
            raise FaucetError("send_failed", 502)
        log.info("faucet funded address=%s eth_wei=%d usdc=%d eth_tx=%s usdc_tx=%s", addr, p.eth_wei, p.usdc,
                 eth_tx, usdc_tx)
        return {"eth_wei": str(p.eth_wei), "usdc": p.usdc, "eth_tx": eth_tx, "usdc_tx": usdc_tx}


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
        jv = getattr(writer.dep, "addresses", {}).get("JuniorVault")  # Deployments is name-indexed, not a dict
        self.vault = self.w3.eth.contract(address=to_checksum_address(jv), abi=_VAULT_ABI) if jv else None

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

    def relayer_balance(self) -> int:
        return self.balance(self._acct().address)

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

    # ---- DRIP: the relayer deposits into the JuniorVault for the address
    def _vault(self):
        if self.vault is None:
            raise RuntimeError("no JuniorVault in the deployment")
        return self.vault

    def relayer_usdc(self) -> int:
        return self.usdc_balance(self._acct().address)

    def relayer_allowance(self) -> int:
        return int(self.usdc.functions.allowance(self._acct().address, self._vault().address).call())

    def _call(self, to: str, data: str, gas: int, max_fee: int, tip: int) -> str:
        return self._send({"to": to, "data": data, "value": 0, "gas": gas, "maxFeePerGas": max_fee,
                           "maxPriorityFeePerGas": tip})

    def send_self_mint(self, amount: int, max_fee: int, tip: int) -> str:
        me = self._acct().address
        gas = _limit(self.estimate_mint(me, amount))
        return self._call(self.usdc.address, self.usdc.encode_abi("mint", [me, amount]), gas, max_fee, tip)

    def send_vault_approve(self, amount: int, max_fee: int, tip: int) -> str:
        v = self._vault().address
        gas = _limit(int(self.usdc.functions.approve(v, amount).estimate_gas({"from": self._acct().address})))
        return self._call(self.usdc.address, self.usdc.encode_abi("approve", [v, amount]), gas, max_fee, tip)

    def estimate_deposit(self, amount: int, receiver: str) -> int:
        return int(self._vault().functions.deposit(amount, receiver).estimate_gas({"from": self._acct().address}))

    def send_deposit(self, amount: int, receiver: str, gas: int, max_fee: int, tip: int) -> str:
        v = self._vault()
        return self._call(v.address, v.encode_abi("deposit", [amount, receiver]), gas, max_fee, tip)


def build_faucet(writer, settings) -> DemoFaucet:
    return DemoFaucet(Web3FaucetChain(writer), FaucetSettings(), settings.chain_id, settings.db_path)
