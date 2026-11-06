"""Web3 implementations of `ChainReader` / `ChainWriter` (owner: claude-data).

Addresses come from `settings.deployments_file` (written by `scripts/devnet.sh`):
  {"chainId": 31337, "AdvanceBook": "0x..", "SeniorVault": "0x..", "JuniorVault": "0x..", "RiskHook": "0x..",
   "USDC": "0x..", "PoolManager": "0x..", "HonkVerifier": "0x..", "poolKey": {...}, "deployBlock": 0}

Pure helpers (`load_deployments`, `chunk_ranges`, `check_allowed`) are tested offline; anything that
talks to a node is covered by `@pytest.mark.anvil` tests.

Private keys are only ever held inside `eth_account` objects created on demand; they are never logged,
printed or included in exception messages.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.exceptions import ContractLogicError

from .config import Settings
from .models import (
    LATE_FEE_CAP_BPS,
    LATE_FEE_RATE_BPS_PER_WEEK,
    REPAY_WINDOW_SECONDS,
    AdvanceState,
    AdvanceStatus,
    ChainLimits,
    SaleEvent,
)

ABI_DIR = Path(__file__).resolve().parents[2] / "abi"
LOG_CHUNK_BLOCKS = 5_000
ADDRESS_BATCH = 100  # max `to` topics per Transfer query
REQUIRED_KEYS = ("AdvanceBook", "SeniorVault", "JuniorVault", "RiskHook", "USDC")
ZERO_ADDRESS = "0x" + "00" * 20

# fn name -> (contract key in deployments, named signers allowed to send it)
ALLOWED_FUNCTIONS: dict[str, tuple[str, frozenset[str]]] = {
    "drawFirst": ("AdvanceBook", frozenset({"relayer"})),
    "drawWithPass": ("AdvanceBook", frozenset({"relayer"})),
    "drawByMandate": ("AdvanceBook", frozenset({"relayer"})),
    "registerMandate": ("AdvanceBook", frozenset({"relayer"})),
    "revokeMandate": ("AdvanceBook", frozenset({"relayer"})),
    "issue": ("BusinessPassRegistry", frozenset({"relayer"})),
    "claimStandingPass": ("AdvanceBook", frozenset({"relayer"})),
    "writeOff": ("AdvanceBook", frozenset({"relayer"})),
    "lowerLimits": ("AdvanceBook", frozenset({"risk_manager"})),
    "flush": ("RiskHook", frozenset({"relayer"})),
}
SIGNER_KEY_FIELDS = {"relayer": "relayer_private_key", "risk_manager": "risk_manager_private_key"}

_STATUS = {
    0: AdvanceStatus.NONE,
    1: AdvanceStatus.ACTIVE,
    2: AdvanceStatus.REPAID,
    3: AdvanceStatus.WRITTEN_OFF,
}


class ChainError(RuntimeError):
    pass


class NotAllowedError(ChainError):
    """fn name or signer not on the allow-list."""


class TxRevertedError(ChainError):
    pass


# ---------------------------------------------------------------- pure helpers

@dataclass(frozen=True)
class Deployments:
    chain_id: int
    addresses: dict[str, str]  # checksummed
    pool_key: tuple[str, str, int, int, str] | None
    deploy_block: int
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    def __getitem__(self, name: str) -> str:
        try:
            return self.addresses[name]
        except KeyError:
            raise ChainError(f"deployments file has no address for {name!r}") from None


def load_deployments(path: Path) -> Deployments:
    """Parse and validate the deployments JSON. Raises ChainError on anything malformed."""
    try:
        raw = json.loads(Path(path).read_text())
    except (OSError, ValueError) as e:
        raise ChainError(f"cannot read deployments file {path}: {e}") from e
    if not isinstance(raw, dict):
        raise ChainError("deployments file must be a JSON object")
    missing = [k for k in REQUIRED_KEYS if k not in raw]
    if missing:
        raise ChainError(f"deployments file missing keys: {missing}")
    addresses: dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(v, str) and Web3.is_address(v):
            addresses[k] = Web3.to_checksum_address(v)
    for k in REQUIRED_KEYS:
        if k not in addresses:
            raise ChainError(f"deployments[{k!r}] is not an address")
    pk = raw.get("poolKey")
    pool_key = None
    if isinstance(pk, dict):
        try:
            pool_key = (
                Web3.to_checksum_address(pk["currency0"]),
                Web3.to_checksum_address(pk["currency1"]),
                int(pk["fee"]),
                int(pk["tickSpacing"]),
                Web3.to_checksum_address(pk["hooks"]),
            )
        except (KeyError, ValueError, TypeError) as e:
            raise ChainError(f"bad poolKey in deployments: {e}") from e
    try:
        chain_id = int(raw.get("chainId", 0))
        deploy_block = int(raw.get("deployBlock", 0))
    except (TypeError, ValueError) as e:
        raise ChainError(f"bad chainId/deployBlock: {e}") from e
    if deploy_block < 0:
        raise ChainError("deployBlock must be >= 0")
    return Deployments(chain_id, addresses, pool_key, deploy_block, raw)


def chunk_ranges(from_block: int, to_block: int, size: int = LOG_CHUNK_BLOCKS) -> Iterator[tuple[int, int]]:
    """Inclusive [start, end] block ranges of at most `size` blocks covering [from_block, to_block]."""
    if size <= 0:
        raise ValueError("size must be positive")
    start = max(0, from_block)
    while start <= to_block:
        end = min(start + size - 1, to_block)
        yield start, end
        start = end + 1


def check_allowed(fn_name: str, signer: str) -> str:
    """Return the contract key for an allow-listed (fn, signer) pair, else raise NotAllowedError."""
    entry = ALLOWED_FUNCTIONS.get(fn_name)
    if entry is None:
        raise NotAllowedError(f"function {fn_name!r} is not allow-listed")
    contract_key, signers = entry
    if signer not in signers:
        raise NotAllowedError(f"signer {signer!r} may not call {fn_name!r}")
    return contract_key


def load_abi(name: str) -> list[dict]:
    data = json.loads((ABI_DIR / f"{name}.json").read_text())
    return data["abi"] if isinstance(data, dict) else data


def _hex(b: Any) -> str:
    if isinstance(b, str):
        return b.lower() if b.startswith("0x") else "0x" + b.lower()
    return "0x" + bytes(b).hex()


def _bytes32(v: str | bytes) -> bytes:
    b = bytes.fromhex(v.removeprefix("0x")) if isinstance(v, str) else bytes(v)
    if len(b) != 32:
        raise ValueError("expected 32 bytes")
    return b


def _addr_topic(addr: str) -> str:
    return "0x" + "00" * 12 + addr.lower().removeprefix("0x")


def _topic_addr(topic: Any) -> str:
    return Web3.to_checksum_address("0x" + _hex(topic)[-40:])


def _make_w3(settings: Settings) -> Web3:
    return Web3(Web3.HTTPProvider(settings.rpc_url, request_kwargs={"timeout": 30}))


# ---------------------------------------------------------------- reader

class Web3ChainReader:
    """Implements `interfaces.ChainReader` over JSON-RPC."""

    def __init__(self, settings: Settings, w3: Web3 | None = None, deployments: Deployments | None = None):
        self.settings = settings
        self.w3 = w3 or _make_w3(settings)
        self.dep = deployments or load_deployments(settings.deployments_file)
        self.chain_id = self.dep.chain_id or settings.chain_id
        self.book_address = self.dep["AdvanceBook"]
        self.deploy_block = self.dep.deploy_block
        eth = self.w3.eth
        self.book = eth.contract(address=self.book_address, abi=load_abi("AdvanceBook"))
        self.senior = eth.contract(address=self.dep["SeniorVault"], abi=load_abi("TrancheVault"))
        self.usdc = eth.contract(address=self.dep["USDC"], abi=load_abi("MockUSDC"))
        self.hook = eth.contract(address=self.dep["RiskHook"], abi=load_abi("RiskHook"))
        self._sale_ev = self.book.events.Sale()
        self._opened_ev = self.book.events.AdvanceOpened()
        self._transfer_ev = self.usdc.events.Transfer()
        self._ts_cache: dict[int, int] = {}
        self._start_block_cache: dict[int, int] = {}
        self._opened_at: dict[int, int] = {}
        self._opened_scanned_to = self.deploy_block - 1

    # -- basics
    def latest_block(self) -> int:
        return int(self.w3.eth.block_number)

    def block_timestamp(self, block_number: int) -> int:
        ts = self._ts_cache.get(block_number)
        if ts is None:
            ts = int(self.w3.eth.get_block(block_number)["timestamp"])
            if len(self._ts_cache) > 100_000:
                self._ts_cache.clear()
            self._ts_cache[block_number] = ts
        return ts

    def _get_logs(self, address: str, topics: list, from_block: int, to_block: int) -> list:
        out: list = []
        for a, b in chunk_ranges(from_block, to_block, LOG_CHUNK_BLOCKS):
            out.extend(self.w3.eth.get_logs(
                {"address": address, "topics": topics, "fromBlock": a, "toBlock": b}))
        return out

    # -- sales
    def sales(self, shop_id: str | None, from_block: int, to_block: int) -> list[SaleEvent]:
        topic0 = _hex(self._sale_ev.topic)
        topics: list = [topic0, _hex(_bytes32(shop_id))] if shop_id else [topic0]
        result = []
        for log in self._get_logs(self.book_address, topics, from_block, to_block):
            ev = self._sale_ev.process_log(log)
            args = ev["args"]
            bn = int(log["blockNumber"])
            result.append(SaleEvent(
                shop_id=_hex(args["shopId"]),
                payer=Web3.to_checksum_address(args["payer"]),
                amount=int(args["amount"]),
                repayment=int(args["repayment"]),
                block_number=bn,
                timestamp=self.block_timestamp(bn),
                tx_hash=_hex(log["transactionHash"]),
                log_index=int(log["logIndex"]),
            ))
        result.sort(key=lambda s: (s.block_number, s.log_index))
        return result

    # -- funders
    def first_block_at_or_after(self, ts: int) -> int:
        """Smallest block with timestamp >= ts (latest+1 if none). Binary search, cached per hour bucket."""
        key = ts - ts % 3600  # round down: a slightly wider window is the safe direction
        if key in self._start_block_cache:
            return self._start_block_cache[key]
        latest = self.latest_block()
        if self.block_timestamp(latest) < key:
            return latest + 1  # not cached: the chain will grow
        lo, hi = 0, latest
        while lo < hi:
            mid = (lo + hi) // 2
            if self.block_timestamp(mid) < key:
                lo = mid + 1
            else:
                hi = mid
        self._start_block_cache[key] = lo
        return lo

    def usdc_funders(self, addresses: list[str], since_ts: int) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {a: [] for a in addresses}
        if not addresses:
            return out
        by_lower: dict[str, list[str]] = {}
        for a in addresses:
            by_lower.setdefault(a.lower(), []).append(a)
        start = self.first_block_at_or_after(since_ts)
        latest = self.latest_block()
        if start > latest:
            return out
        topic0 = _hex(self._transfer_ev.topic)
        uniq = list(by_lower)
        seen: dict[str, set[str]] = {lo: set() for lo in uniq}
        for i in range(0, len(uniq), ADDRESS_BATCH):
            batch = uniq[i:i + ADDRESS_BATCH]
            topics = [topic0, None, [_addr_topic(a) for a in batch]]
            for log in self._get_logs(self.usdc.address, topics, start, latest):
                tps = log["topics"]
                if len(tps) < 3:
                    continue
                to = _topic_addr(tps[2]).lower()
                frm = _topic_addr(tps[1])
                if to in seen and frm.lower() not in seen[to]:
                    seen[to].add(frm.lower())
                    for orig in by_lower[to]:
                        out[orig].append(frm)
        return out

    # -- state reads
    def limits(self) -> ChainLimits:
        f = self.book.functions
        caps = tuple(int(f.tierCap(i).call()) for i in range(4))
        floors = tuple(int(f.tierCapFloor(i).call()) for i in range(4))
        return ChainLimits(
            tier_cap=caps,  # type: ignore[arg-type]
            tier_cap_floor=floors,  # type: ignore[arg-type]
            max_exposure=int(f.maxExposure().call()),
            max_exposure_floor=int(f.maxExposureFloor().call()),
            exposure=int(self.senior.functions.outstanding().call()),
        )

    def _refresh_opened_at(self) -> None:
        latest = self.latest_block()
        if latest <= self._opened_scanned_to:
            return
        topics = [_hex(self._opened_ev.topic)]
        for log in self._get_logs(self.book_address, topics, self._opened_scanned_to + 1, latest):
            adv_id = int(_hex(log["topics"][1]), 16)
            self._opened_at[adv_id] = self.block_timestamp(int(log["blockNumber"]))
        self._opened_scanned_to = latest

    def advances(self) -> list[AdvanceState]:
        n = int(self.book.functions.nextAdvanceId().call())
        if n > 1:
            self._refresh_opened_at()
        out = []
        for i in range(1, n):
            a = self.book.functions.getAdvance(i).call()
            # (shopId, principal, maxOwed, repaid, principalRepaid, feePaid, drawnAt,
            #  feeRateBpsPerWeek, feeCapBps, holdbackBps, tier, lastSaleAt, status, credentialClaimed,
            #  pendingCommitment, windowStart, windowRepaid, lateSecs, lateFeePaid)
            now = self.block_timestamp(self.latest_block())
            raw_fee = int(a[1]) * int(a[7]) * max(0, now - int(a[6])) // (10_000 * 7 * 86_400)
            fee_so_far = min(int(a[1]) * int(a[8]) // 10_000, raw_fee)
            fee_due = max(0, fee_so_far - int(a[5])) if int(a[4]) < int(a[1]) else 0
            # Late fee (AdvanceBook.lateFeeOf / isBehind): only while Active and behind the minimum repayment.
            active = int(a[12]) == 1 and int(a[4]) < int(a[1])
            behind_secs = max(0, now - int(a[11]) - REPAY_WINDOW_SECONDS) if active else 0
            late_paid = int(a[18])
            late_fee = (min(int(a[1]) * LATE_FEE_CAP_BPS // 10_000,
                            int(a[1]) * LATE_FEE_RATE_BPS_PER_WEEK * (int(a[17]) + behind_secs) // (10_000 * 7 * 86_400))
                        if active else late_paid)
            owed_now = max(0, int(a[1]) - int(a[4])) + fee_due + max(0, late_fee - late_paid)
            out.append(AdvanceState(
                advance_id=i,
                shop_id=_hex(a[0]),
                principal=int(a[1]),
                total_owed=int(a[2]),
                repaid=int(a[3]),
                holdback_bps=int(a[9]),
                tier=int(a[10]),
                last_sale_at=int(a[11]),
                status=_STATUS.get(int(a[12]), AdvanceStatus.NONE),
                credential_claimed=bool(a[13]),
                opened_at=self._opened_at.get(i),
                principal_repaid=int(a[4]), fee_paid=int(a[5]), drawn_at=int(a[6]),
                fee_rate_bps_per_week=int(a[7]), fee_cap_bps=int(a[8]),
                owed_now=owed_now, fee_so_far=fee_so_far,
                minimum_repayment=(int(a[1]) + fee_so_far + 99) // 100,
                window_start=int(a[15]), window_repaid=int(a[16]),
                late_secs=int(a[17]), late_fee=late_fee, late_fee_paid=late_paid, is_behind=behind_secs > 0,
            ))
        return out

    def junior_twap_tick(self, seconds_ago: int) -> int:
        if self.dep.pool_key is None:
            raise ChainError("deployments file has no poolKey")
        return int(self.hook.functions.consult(self.dep.pool_key, int(seconds_ago)).call())

    def _junior_pool_id(self) -> bytes:
        if self.dep.pool_key is None:
            raise ChainError("deployments file has no poolKey")
        from eth_abi import encode
        c0, c1, fee, spacing, hooks = self.dep.pool_key
        return Web3.keccak(encode(["address", "address", "uint24", "int24", "address"],
                                  [Web3.to_checksum_address(c0), Web3.to_checksum_address(c1), int(fee),
                                   int(spacing), Web3.to_checksum_address(hooks)]))

    def junior_oracle_observation_count(self) -> int:
        """Populated RiskHook oracle slots for the junior/USDC pool (RiskHook.oracleState(poolId).count)."""
        _index, count, _last_tick, _initialized = self.hook.functions.oracleState(self._junior_pool_id()).call()
        return int(count)

    def junior_pool_liquidity(self) -> int:
        """In-range liquidity of the junior/USDC v4 pool via PoolManager.extsload (v4-core StateLibrary layout:
        the pools mapping is at slot 6; liquidity is the uint128 at the pool state slot + 3)."""
        state = int.from_bytes(Web3.keccak(self._junior_pool_id() + (6).to_bytes(32, "big")), "big")
        pm = self.w3.eth.contract(address=self.dep["PoolManager"], abi=[
            {"name": "extsload", "type": "function", "stateMutability": "view",
             "inputs": [{"name": "slot", "type": "bytes32"}], "outputs": [{"type": "bytes32"}]}])
        word = pm.functions.extsload((state + 3).to_bytes(32, "big")).call()
        return int.from_bytes(word, "big") & ((1 << 128) - 1)

    def shop_payout(self, shop_id: str) -> str | None:
        _owner, payout, _active = self.book.functions.shops(_bytes32(shop_id)).call()
        if not payout or int(payout, 16) == 0:
            return None
        return Web3.to_checksum_address(payout)


# ---------------------------------------------------------------- writer

class Web3ChainWriter:
    """Implements `interfaces.ChainWriter`: allow-listed fns only, named keys, gas estimate, waits, raises on revert."""

    def __init__(self, settings: Settings, w3: Web3 | None = None, deployments: Deployments | None = None,
                 receipt_timeout: float = 120.0, gas_multiplier: float = 1.2):
        self.settings = settings
        self.w3 = w3 or _make_w3(settings)
        self.dep = deployments or load_deployments(settings.deployments_file)
        self.chain_id = self.dep.chain_id or settings.chain_id
        self.receipt_timeout = receipt_timeout
        self.gas_multiplier = gas_multiplier
        self._contracts = {
            "AdvanceBook": self.w3.eth.contract(address=self.dep["AdvanceBook"], abi=load_abi("AdvanceBook")),
            "RiskHook": self.w3.eth.contract(address=self.dep["RiskHook"], abi=load_abi("RiskHook")),
        }
        if "BusinessPassRegistry" in self.dep.addresses:  # v2 deployments
            self._contracts["BusinessPassRegistry"] = self.w3.eth.contract(
                address=self.dep["BusinessPassRegistry"], abi=load_abi("BusinessPassRegistry"))
        self._lock = threading.Lock()

    def __repr__(self) -> str:  # never include settings (keys) in reprs
        return f"Web3ChainWriter(chain_id={self.chain_id})"

    def _account(self, signer: str):
        fld = SIGNER_KEY_FIELDS.get(signer)
        if fld is None:
            raise NotAllowedError(f"unknown signer {signer!r}")
        secret = getattr(self.settings, fld)
        if secret is None:
            raise ChainError(f"no key configured for signer {signer!r}")
        try:
            return self.w3.eth.account.from_key(secret.get_secret_value())
        except (ValueError, TypeError):  # never chain: the message may echo key material
            raise ChainError(f"invalid key configured for signer {signer!r}") from None

    def send(self, fn_name: str, args: list, *, signer: str) -> str:
        contract_key = check_allowed(fn_name, signer)
        contract = self._contracts.get(contract_key)
        if contract is None:
            raise ChainError(f"deployments file has no address for {contract_key!r}")
        acct = self._account(signer)
        fn = getattr(contract.functions, fn_name)(*args)
        with self._lock:
            try:
                gas = fn.estimate_gas({"from": acct.address})
            except ContractLogicError as e:
                raise TxRevertedError(f"{fn_name} would revert: {e}") from None
            tx = fn.build_transaction({
                "from": acct.address,
                "chainId": self.chain_id,
                "nonce": self.w3.eth.get_transaction_count(acct.address, "pending"),
                "gas": int(gas * self.gas_multiplier) + 10_000,
            })
            signed = acct.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.receipt_timeout)
        h = _hex(tx_hash)
        if int(receipt["status"]) != 1:
            raise TxRevertedError(f"{fn_name} reverted in tx {h}")
        return h
