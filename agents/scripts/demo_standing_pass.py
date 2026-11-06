#!/usr/bin/env python3
"""Demo helper: fast-forward a demo shop's open advance to FULLY REPAID with real customer pays. DRY RUN BY DEFAULT.

For the video: repaid → "Claim my Standing Pass" → higher limit, without paying by hand. The claim itself stays in
the app (it is the demo moment: the relayer inserts the leaf, the phone finds it in the whole tree and proves
privately).

What it sends (only with --execute), all from a PAYER burner, never the merchant's wallet:
  1. gas: if the payer has less than --min-eth, the relayer key (RELAYER_PRIVATE_KEY) sends it --fund-eth
  2. MockUSDC.mint(payer, total) by the payer itself (MockUSDC's mint is open; Sepolia test token only)
  3. USDC.approve(AdvanceBook, total) if the allowance is short
  4. AdvanceBook.pay(shopId, amount) x --sales, sized so the last one repays the advance exactly to Repaid
     (holdback math as in AdvanceBook.pay: rep = min(amount * holdbackBps / 1e4, totalOwed - repaid))

The payer key: $DEMO_PAYER_PRIVATE_KEY if set, else a burner created once and kept in agents/data/demo_payer.json
(mode 0600, git-ignored). Keys are never printed; output shows addresses and tx hashes only.

    cd agents; set -a; . ./.env; . scripts/sepolia.env; set +a
    uv run python scripts/demo_standing_pass.py 0x<shopId>                    # dry run: plan + cost
    uv run python scripts/demo_standing_pass.py '<pay link from My QR>'      # the link's ?shop= works too
    uv run python scripts/demo_standing_pass.py 0x<shopId> --execute         # sends
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

PAYER_FILE = ROOT / "data" / "demo_payer.json"
DEFAULT_RPC = "https://sepolia.gateway.tenderly.co"
DEFAULT_DEPLOYMENTS = ROOT / "deployments" / "sepolia.json"
STATUS = {0: "None", 1: "Active", 2: "Repaid", 3: "WrittenOff"}
# Static gas per step (Sepolia measurements, with headroom), only for the dry-run cost line.
GAS = {"fund": 210_000, "mint": 60_000, "approve": 50_000, "pay": 150_000}
CENT = 10_000  # USDC base units per cent

ERC20_ABI = [
    {"name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "a", "type": "address"}],
     "outputs": [{"type": "uint256"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}], "outputs": [{"type": "uint256"}]},
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "s", "type": "address"}, {"name": "v", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "mint", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "v", "type": "uint256"}], "outputs": []},
]


class DemoError(RuntimeError):
    pass


# ------------------------------------------------------------------ pure planning (tested offline)


def parse_shop(arg: str) -> str:
    """A bytes32 shop id, or a pay link carrying `?shop=0x...` (the merchant's My QR)."""
    s = arg.strip()
    if "://" in s:
        q = parse_qs(urlparse(s).query).get("shop", [""])[0]
        s = q
    if not re.fullmatch(r"0x[0-9a-fA-F]{64}", s):
        raise DemoError("need a bytes32 shop id (0x + 64 hex) or a pay link with ?shop=")
    return s.lower()


def repayment(amount: int, holdback_bps: int, left: int) -> int:
    """AdvanceBook.pay: the part of a sale that goes to the advance."""
    return min(amount * holdback_bps // 10_000, left)


def sale_to_repay(left: int, holdback_bps: int) -> int:
    """Smallest whole-cent sale whose holdback covers `left`."""
    need = -(-left * 10_000 // holdback_bps)
    return -(-need // CENT) * CENT


def plan_sales(left: int, holdback_bps: int, n: int, rng: random.Random | None = None) -> list[int]:
    """`n` customer sales (USDC base units, whole cents, varied so the feed looks real) that repay exactly `left`.
    The first n-1 are each a slightly uneven share; the last is the smallest sale that finishes the advance."""
    if left <= 0:
        return []
    if not 500 <= holdback_bps <= 10_000:
        raise DemoError(f"unexpected holdback {holdback_bps} bps")
    rng = rng or random.Random()
    n = max(1, n)
    total = sale_to_repay(left, holdback_bps)
    sales: list[int] = []
    remaining = left
    for _ in range(n - 1):
        share = total / n * rng.uniform(0.8, 1.0)
        amt = max(CENT, int(math.floor(share / CENT)) * CENT + rng.randrange(0, 100) * CENT)
        rep = repayment(amt, holdback_bps, remaining)
        if rep >= remaining:  # never finish early: leave the last sale to close it
            break
        sales.append(amt)
        remaining -= rep
    sales.append(sale_to_repay(remaining, holdback_bps))
    return sales


def simulate(sales: list[int], holdback_bps: int, left: int) -> int:
    """What is still owed after these sales (0 = Repaid)."""
    for amt in sales:
        left -= repayment(amt, holdback_bps, left)
    return left


@dataclass
class AdvanceState:
    advance_id: int
    total_owed: int
    repaid: int
    holdback_bps: int
    status: int
    tier: int

    @property
    def left(self) -> int:
        return self.total_owed - self.repaid


# ------------------------------------------------------------------ chain


def _key(v: str) -> str:
    v = v.strip()
    return v if v.startswith("0x") else "0x" + v


def load_payer(Account) -> object:  # noqa: N803 - eth_account class
    env = os.environ.get("DEMO_PAYER_PRIVATE_KEY")
    if env:
        return Account.from_key(_key(env))
    if PAYER_FILE.exists():
        return Account.from_key(json.loads(PAYER_FILE.read_text())["key"])
    acct = Account.create()
    PAYER_FILE.parent.mkdir(parents=True, exist_ok=True)
    PAYER_FILE.write_text(json.dumps({"address": acct.address, "key": "0x" + bytes(acct.key).hex()}))
    PAYER_FILE.chmod(0o600)
    return acct


class Demo:
    def __init__(self, rpc: str, deployments: Path):
        from web3 import Web3

        from mra_agents.chain import load_abi, load_deployments

        self.Web3 = Web3
        self.w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
        dep = load_deployments(deployments)
        self.book = self.w3.eth.contract(address=Web3.to_checksum_address(dep["AdvanceBook"]),
                                         abi=load_abi("AdvanceBook"))
        self.usdc = self.w3.eth.contract(address=Web3.to_checksum_address(dep["USDC"]), abi=ERC20_ABI)

    def advance_for(self, shop_id: str) -> AdvanceState | None:
        owner, _payout, active = self.book.functions.shops(bytes.fromhex(shop_id[2:])).call()
        if int(owner, 16) == 0:
            raise DemoError("unknown shop (not registered on this AdvanceBook)")
        if active == 0:
            return None
        a = self.book.functions.getAdvance(active).call()
        # Advance struct order: shopId, principal, totalOwed, repaid, principalRepaid, holdbackBps, tier, lastSaleAt,
        # status, credentialClaimed, pendingCommitment, windowStart, windowRepaid
        return AdvanceState(active, a[2], a[3], a[5], a[8], a[6])

    def send(self, acct, tx: dict) -> str:
        tx = {**tx, "from": acct.address, "nonce": self.w3.eth.get_transaction_count(acct.address, "pending"),
              "chainId": self.w3.eth.chain_id}
        # web3's build_transaction already put a 1x estimate in `gas`. Use 2x with a 300k floor for calls: a
        # load-balanced RPC may estimate against a block before our previous sale (pay costs more as the advance
        # changes state), and Sepolia gas is cheap; unused gas is refunded. Plain transfers are estimated too: funding
        # a never-used account costs ~207k on Sepolia now, not 21k.
        est = tx.get("gas") or self.w3.eth.estimate_gas(tx)
        tx["gas"] = max(est * 2, 300_000) if tx.get("data") else est * 2
        base = self.w3.eth.get_block("latest")["baseFeePerGas"]
        tip = max(self.w3.eth.max_priority_fee, 1)
        tx.update(maxFeePerGas=base * 2 + tip, maxPriorityFeePerGas=tip)
        signed = acct.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        r = self.w3.eth.wait_for_transaction_receipt(h, timeout=180)
        if r["status"] != 1:
            raise DemoError(f"tx reverted: 0x{bytes(h).hex()}")
        return "0x" + bytes(h).hex()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("shop", help="bytes32 shop id, or the pay link from My QR")
    ap.add_argument("--execute", action="store_true", help="send the transactions (default: dry run)")
    ap.add_argument("--sales", type=int, default=3, help="number of customer sales (default 3)")
    ap.add_argument("--rpc", default=os.environ.get("RPC_URL", DEFAULT_RPC))
    ap.add_argument("--deployments", type=Path, default=DEFAULT_DEPLOYMENTS)
    ap.add_argument("--fund-eth", type=float, default=0.0005, help="gas top-up from the relayer, ETH")
    ap.add_argument("--min-eth", type=float, default=0.0002)
    ap.add_argument("--seed", type=int, help="fix the sale amounts (repeatable demo)")
    args = ap.parse_args(argv)

    from eth_account import Account

    shop = parse_shop(args.shop)
    d = Demo(args.rpc, args.deployments)
    if d.w3.eth.chain_id != 11155111 and args.execute:
        raise DemoError("refusing to --execute off Sepolia")
    adv = d.advance_for(shop)
    if adv is None:
        print(f"shop {shop[:10]}…: no open advance (already repaid, or not drawn yet). Nothing to do.")
        return 0
    print(f"shop {shop[:10]}…  advance #{adv.advance_id}  tier {adv.tier}  status {STATUS.get(adv.status)}")
    print(f"  owed ${adv.total_owed / 1e6:.2f}, repaid ${adv.repaid / 1e6:.2f}, left ${adv.left / 1e6:.2f}, "
          f"holdback {adv.holdback_bps / 100:g}%")
    sales = plan_sales(adv.left, adv.holdback_bps, args.sales, random.Random(args.seed))
    assert simulate(sales, adv.holdback_bps, adv.left) == 0
    total = sum(sales)
    print(f"  plan: {len(sales)} sale(s) = " + " + ".join(f"${s / 1e6:.2f}" for s in sales) + f" = ${total / 1e6:.2f}")

    payer = load_payer(Account)
    eth = d.w3.eth.get_balance(payer.address)
    bal = d.usdc.functions.balanceOf(payer.address).call()
    allowance = d.usdc.functions.allowance(payer.address, d.book.address).call()
    steps = (["fund"] if eth < int(args.min_eth * 1e18) else []) + (["mint"] if bal < total else []) + \
        (["approve"] if allowance < total else []) + ["pay"] * len(sales)
    gas_price = d.w3.eth.gas_price
    cost = sum(GAS[s] for s in steps) * gas_price * 2
    print(f"  payer {payer.address}: {eth / 1e18:.6f} ETH, ${bal / 1e6:.2f} USDC")
    print(f"  steps: {', '.join(steps)}  (~{cost} wei = {cost / 1e18:.12f} ETH at {gas_price} wei/gas, x2 headroom)")
    if not args.execute:
        print("DRY RUN: nothing sent. Re-run with --execute.")
        return 0

    if "fund" in steps:
        rk = os.environ.get("RELAYER_PRIVATE_KEY")
        if not rk:
            raise DemoError("payer needs gas and RELAYER_PRIVATE_KEY is not set")
        relayer = Account.from_key(_key(rk))
        # Estimated, never a fixed 21k: funding a never-used account costs ~207k gas on Sepolia now (state creation).
        h = d.send(relayer, {"to": payer.address, "value": int(args.fund_eth * 1e18)})
        print(f"  fund   {h}")
    if "mint" in steps:
        h = d.send(payer, d.usdc.functions.mint(payer.address, total - bal).build_transaction({"from": payer.address}))
        print(f"  mint   {h}")
    if "approve" in steps:
        h = d.send(payer, d.usdc.functions.approve(d.book.address, total).build_transaction({"from": payer.address}))
        print(f"  approve {h}")
    sid = bytes.fromhex(shop[2:])
    for amt in sales:
        h = d.send(payer, d.book.functions.pay(sid, amt).build_transaction({"from": payer.address}))
        print(f"  pay ${amt / 1e6:.2f} {h}")
    a = d.book.functions.getAdvance(adv.advance_id).call()
    status = STATUS.get(a[8])
    print(f"advance #{adv.advance_id}: {status}, repaid ${a[3] / 1e6:.2f} of ${a[2] / 1e6:.2f}")
    if a[8] != 2:
        raise DemoError("advance is not Repaid yet: re-run to finish")
    print("Now open /merchant/repaid in the app and tap \"Claim my Standing Pass\".")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DemoError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(2)
