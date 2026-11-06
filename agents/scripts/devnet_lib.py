"""Shared helpers for the public-devnet scripts (seed_devnet.py, demo_default_scene.py). DEVNET ONLY.

Every key here is derived from anvil's public mnemonic; these scripts refuse any chain other than 31337.
Accounts (DeployLocal.s.sol wiring): 0 owner/deployer, 1 offer signer, 2 risk manager, 3 relayer,
4 Business Pass issuer, 5 AgentPass attester, 7 = demo junior LP ("the panicking junior holder"),
8 = scene gas faucet.

Admin RPC (evm_*, anvil_*) is only used through `admin()`, which talks to ADMIN_RPC_URL (default: RPC_URL).
On the EC2 box both point at anvil inside the docker network; the public proxy would refuse these methods.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from eth_abi import encode
from eth_account import Account
from web3 import Web3

AGENTS = Path(__file__).resolve().parents[1]
REPO = AGENTS.parent
CONTRACTS_OUT = Path(os.environ.get("CONTRACTS_OUT", REPO / "contracts" / "out"))
MNEMONIC = "test test test test test test test test test test test junk"
DEVNET_CHAIN_ID = 31337
POOLS_SLOT = 6  # v4-core StateLibrary.POOLS_SLOT
MIN_TICK, MAX_TICK = -887272, 887272

Account.enable_unaudited_hdwallet_features()


def key(i: int):
    return Account.from_mnemonic(MNEMONIC, account_path=f"m/44'/60'/0'/0/{i}")


ROLES = {"owner": 0, "offer_signer": 1, "risk_manager": 2, "relayer": 3, "issuer": 4, "attester": 5,
         "junior_lp": 7, "faucet": 8}


def role(name: str):
    return key(ROLES[name])


def artifact(name: str) -> dict:
    return json.loads((CONTRACTS_OUT / f"{name}.sol" / f"{name}.json").read_text())


def abi(name: str) -> list:
    p = AGENTS / "abi" / f"{name}.json"
    if p.is_file():
        return json.loads(p.read_text())
    return artifact(name)["abi"]


ERC20_MIN = [
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]},
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "s", "type": "address"}, {"name": "v", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}], "outputs": [{"type": "uint256"}]},
]
EXTSLOAD_ABI = [{"name": "extsload", "type": "function", "stateMutability": "view",
                 "inputs": [{"name": "slot", "type": "bytes32"}], "outputs": [{"type": "bytes32"}]}]


class DevnetError(RuntimeError):
    pass


@dataclass
class Devnet:
    w3: Web3
    admin_w3: Web3
    dep: dict
    manifest_path: Path

    # ---------------------------------------------------------------- setup
    @classmethod
    def connect(cls, rpc_url: str, manifest: Path, admin_url: str | None = None) -> Devnet:
        w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 120}))
        admin_w3 = Web3(Web3.HTTPProvider(admin_url, request_kwargs={"timeout": 120})) if admin_url else w3
        if w3.eth.chain_id != DEVNET_CHAIN_ID:
            raise DevnetError(f"refusing chain {w3.eth.chain_id}: these scripts use public anvil keys (31337 only)")
        dep = json.loads(Path(manifest).read_text())
        if int(dep.get("chainId", 0)) != DEVNET_CHAIN_ID:
            raise DevnetError("deployments file is not a 31337 devnet")
        if not w3.eth.get_code(Web3.to_checksum_address(dep["AdvanceBook"])):
            raise DevnetError("AdvanceBook has no code at the manifest address: wrong chain or not deployed")
        return cls(w3, admin_w3, dep, Path(manifest))

    def addr(self, name: str) -> str:
        return Web3.to_checksum_address(self.dep[name])

    def contract(self, name: str, abi_name: str | None = None):
        return self.w3.eth.contract(address=self.addr(name), abi=abi(abi_name or name))

    @property
    def book(self):
        return self.contract("AdvanceBook")

    @property
    def usdc(self):
        return self.contract("USDC", "MockUSDC")

    @property
    def senior(self):
        return self.contract("SeniorVault", "TrancheVault")

    @property
    def junior(self):
        return self.contract("JuniorVault", "TrancheVault")

    @property
    def hook(self):
        return self.contract("RiskHook")

    def save_manifest(self) -> None:
        self.manifest_path.write_text(json.dumps(self.dep, indent=2) + "\n")

    # ---------------------------------------------------------------- admin (internal network only)
    def admin(self, method: str, params: list | None = None) -> Any:
        r = self.admin_w3.provider.make_request(method, params or [])
        if "error" in r:
            raise DevnetError(f"{method}: {r['error']}")
        return r.get("result")

    def warp(self, seconds: int) -> int:
        self.admin("evm_increaseTime", [int(seconds)])
        self.admin("evm_mine", [])
        return self.now()

    def now(self) -> int:
        return int(self.w3.eth.get_block("latest")["timestamp"])

    # ---------------------------------------------------------------- txs (signed locally)
    def send(self, fn, acct, value: int = 0) -> dict:
        tx = fn.build_transaction({
            "from": acct.address, "chainId": DEVNET_CHAIN_ID, "value": value,
            "nonce": self.w3.eth.get_transaction_count(acct.address, "pending"),
        })
        tx["gas"] = int(tx.get("gas", 500_000) * 1.25) + 20_000
        h = self.w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction)
        rc = self.w3.eth.wait_for_transaction_receipt(h, timeout=120)
        if rc["status"] != 1:
            raise DevnetError(f"tx reverted: {h.hex()}")
        return rc

    def send_eth(self, frm, to: str, value: int) -> None:
        tx = {"from": frm.address, "to": Web3.to_checksum_address(to), "value": value, "gas": 21_000,
              "chainId": DEVNET_CHAIN_ID, "nonce": self.w3.eth.get_transaction_count(frm.address, "pending"),
              "gasPrice": self.w3.eth.gas_price}
        h = self.w3.eth.send_raw_transaction(frm.sign_transaction(tx).raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(h, timeout=120)

    def deploy(self, name: str, acct, *args) -> str:
        art = artifact(name)
        c = self.w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"]["object"])
        return Web3.to_checksum_address(self.send(c.constructor(*args), acct)["contractAddress"])

    # ---------------------------------------------------------------- pool
    def pool_key(self) -> tuple:
        k = self.dep["poolKey"]
        return (Web3.to_checksum_address(k["currency0"]), Web3.to_checksum_address(k["currency1"]),
                int(k["fee"]), int(k["tickSpacing"]), Web3.to_checksum_address(k["hooks"]))

    def junior_is_token0(self) -> bool:
        return self.pool_key()[0].lower() == self.addr("JuniorVault").lower()

    def slot0(self) -> tuple[int, int]:
        """(sqrtPriceX96, tick) of the junior/USDC pool, read with PoolManager.extsload (StateLibrary layout)."""
        pool_id = Web3.keccak(encode(["address", "address", "uint24", "int24", "address"], list(self.pool_key())))
        slot = Web3.keccak(encode(["bytes32", "uint256"], [pool_id, POOLS_SLOT]))
        pm = self.w3.eth.contract(address=self.addr("PoolManager"), abi=EXTSLOAD_ABI)
        word = int.from_bytes(pm.functions.extsload(slot).call(), "big")
        sqrt_price = word & ((1 << 160) - 1)
        tick = (word >> 160) & ((1 << 24) - 1)
        if tick >= 1 << 23:
            tick -= 1 << 24
        return sqrt_price, tick

    def junior_price_from_tick(self, tick: float) -> float:
        """USDC per junior share implied by a pool tick (both tokens have 6 decimals)."""
        return 1.0001 ** (tick if self.junior_is_token0() else -tick)

    def twap_tick(self, seconds: int) -> int | None:
        try:
            return int(self.hook.functions.consult(self.pool_key(), int(seconds)).call())
        except Exception:  # noqa: BLE001 - InsufficientHistory right after deploy
            return None

    def ensure_swap_router(self) -> str:
        a = self.dep.get("PoolSwapTest")
        if a and self.w3.eth.get_code(Web3.to_checksum_address(a)):
            return Web3.to_checksum_address(a)
        a = self.deploy("PoolSwapTest", role("owner"), self.addr("PoolManager"))
        self.dep["PoolSwapTest"] = a
        try:
            self.save_manifest()
        except OSError:
            pass  # read-only manifest mount: the address is re-derived next time (deploy is cheap)
        return a

    def swap_to_tick(self, acct, target_tick: int, max_in: int) -> dict:
        """Exact-input swap that stops at `target_tick` (v4 price limit), spending at most `max_in`.
        Moving the junior price DOWN means selling junior shares, UP means buying them with USDC."""
        router_addr = self.ensure_swap_router()
        router = self.w3.eth.contract(address=router_addr, abi=artifact("PoolSwapTest")["abi"])
        _, tick_now = self.slot0()
        zero_for_one = target_tick < tick_now  # selling token0 pushes the tick down
        key0, key1 = self.pool_key()[0], self.pool_key()[1]
        token_in = key0 if zero_for_one else key1
        erc = self.w3.eth.contract(address=token_in, abi=ERC20_MIN)
        if erc.functions.allowance(acct.address, router_addr).call() < max_in:
            self.send(erc.functions.approve(router_addr, 2**256 - 1), acct)
        target_tick = max(MIN_TICK + 1, min(MAX_TICK - 1, int(target_tick)))
        limit = int(math.sqrt(1.0001 ** target_tick) * (1 << 96))
        params = (zero_for_one, -int(max_in), limit)
        return self.send(router.functions.swap(self.pool_key(), params, (False, False), b""), acct)

    # ---------------------------------------------------------------- vault views
    def share_price(self, vault) -> float:
        return vault.functions.convertToAssets(10**6).call() / 1e6
