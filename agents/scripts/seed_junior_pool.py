#!/usr/bin/env python3
"""Seed the JAR-J/USDC Uniswap v4 pool (the RiskHook pool) on Sepolia with liquidity. DRY RUN BY DEFAULT.

The pool was initialised at price 1 by Deploy.s.sol but holds no liquidity, so no swap can fill. This script, from
the RELAYER key (agents/.env):
  1. MockUSDC.mint(relayer, deposit + lp + buffer)            (open mint on the demo USDC)
  2. USDC.approve(JuniorVault, deposit); JuniorVault.deposit   (relayer receives JAR-J shares)
  3. JAR-J.approve(router), USDC.approve(router)               (router = Uniswap's PoolModifyLiquidityTest)
  4. PoolModifyLiquidityTest.modifyLiquidity(poolKey, [tickLower, tickUpper], L)  with L sized from the balances

Liquidity sits in [--tick-lower, --tick-upper] (default -6000..6000, i.e. price 0.55..1.82 around 1). The position
is owned by the router contract under a fixed salt, so like any PoolModifyLiquidityTest position it is test-grade
(fine for MockUSDC on a testnet).

Without --execute nothing is sent: the plan, current pool state and a gas/cost estimate are printed. With --execute
the steps are sent one by one, each waits for its receipt, and the tx hashes are printed. If the pool already has
liquidity the script stops unless --force. It refuses to spend more than --max-eth (default 0.005) on gas.

    cd agents && set -a; . ./.env; . scripts/sepolia.env; set +a
    uv run python scripts/seed_junior_pool.py                 # dry run
    uv run python scripts/seed_junior_pool.py --execute       # sends
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

from eth_account import Account
from eth_utils import keccak
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
MAX_UINT = 2**256 - 1
Q96 = 2**96
POOLS_SLOT = 6  # v4-core PoolManager: mapping(PoolId => Pool.State) _pools
# Official Uniswap v4 Sepolia periphery test router (docs.uniswap.org/contracts/v4/deployments).
DEFAULT_LIQ_ROUTER = "0x0c478023803a644c94c4ce1c1e7b9a087e411b0a"

ERC20 = [
    {"type": "function", "name": "approve", "stateMutability": "nonpayable", "inputs": [{"name": "s", "type": "address"}, {"name": "a", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"type": "function", "name": "allowance", "stateMutability": "view", "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}], "outputs": [{"type": "uint256"}]},
    {"type": "function", "name": "balanceOf", "stateMutability": "view", "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]},
    {"type": "function", "name": "mint", "stateMutability": "nonpayable", "inputs": [{"name": "to", "type": "address"}, {"name": "a", "type": "uint256"}], "outputs": []},
    {"type": "function", "name": "deposit", "stateMutability": "nonpayable", "inputs": [{"name": "assets", "type": "uint256"}, {"name": "receiver", "type": "address"}], "outputs": [{"type": "uint256"}]},
    {"type": "function", "name": "previewDeposit", "stateMutability": "view", "inputs": [{"name": "assets", "type": "uint256"}], "outputs": [{"type": "uint256"}]},
]
POOL_KEY_T = {"type": "tuple", "components": [
    {"name": "currency0", "type": "address"}, {"name": "currency1", "type": "address"}, {"name": "fee", "type": "uint24"},
    {"name": "tickSpacing", "type": "int24"}, {"name": "hooks", "type": "address"}]}
LIQ_ROUTER = [
    {"type": "function", "name": "manager", "stateMutability": "view", "inputs": [], "outputs": [{"type": "address"}]},
    {"type": "function", "name": "modifyLiquidity", "stateMutability": "payable", "inputs": [
        {"name": "key", **POOL_KEY_T},
        {"name": "params", "type": "tuple", "components": [
            {"name": "tickLower", "type": "int24"}, {"name": "tickUpper", "type": "int24"},
            {"name": "liquidityDelta", "type": "int256"}, {"name": "salt", "type": "bytes32"}]},
        {"name": "hookData", "type": "bytes"}], "outputs": [{"name": "delta", "type": "int256"}]},
]
PM = [{"type": "function", "name": "extsload", "stateMutability": "view", "inputs": [{"name": "slot", "type": "bytes32"}], "outputs": [{"type": "bytes32"}]}]
SALT = keccak(text="dripmoni.junior-pool.seed.v1")
STATIC_GAS = {"mint": 150_000, "approve": 140_000, "deposit": 200_000, "modifyLiquidity": 1_100_000}  # Sepolia (reth 2.8) prices


def sqrt_at_tick(t: int) -> float:
    return math.sqrt(1.0001**t)


def liquidity_for(amount0: int, amount1: int, sqrt_p: float, sqrt_lo: float, sqrt_hi: float) -> int:
    """v3/v4 LiquidityAmounts.getLiquidityForAmounts, price inside the range (floats; rounded down 0.1% for safety)."""
    l0 = amount0 * sqrt_p * sqrt_hi / (sqrt_hi - sqrt_p)
    l1 = amount1 / (sqrt_p - sqrt_lo)
    return int(min(l0, l1) * 0.999)


def amounts_for(liq: int, sqrt_p: float, sqrt_lo: float, sqrt_hi: float) -> tuple[int, int]:
    return math.ceil(liq * (sqrt_hi - sqrt_p) / (sqrt_p * sqrt_hi)), math.ceil(liq * (sqrt_p - sqrt_lo))


def pool_id(key: tuple) -> bytes:
    return keccak(Web3().codec.encode(["address", "address", "uint24", "int24", "address"], list(key)))


def pool_state(w3: Web3, pm_addr: str, pid: bytes) -> tuple[int, int, int]:
    pm = w3.eth.contract(address=pm_addr, abi=PM)
    base = int.from_bytes(keccak(pid + POOLS_SLOT.to_bytes(32, "big")), "big")
    s0 = int.from_bytes(pm.functions.extsload(base.to_bytes(32, "big")).call(), "big")
    liq = int.from_bytes(pm.functions.extsload((base + 3).to_bytes(32, "big")).call(), "big") & (2**128 - 1)
    sqrt_p = s0 & (2**160 - 1)
    tick = (s0 >> 160) & (2**24 - 1)
    if tick >= 2**23:
        tick -= 2**24
    return sqrt_p, tick, liq


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--deployments", default=str(ROOT / os.environ.get("DEPLOYMENTS_FILE", "deployments/sepolia.json")))
    ap.add_argument("--rpc", default=os.environ.get("RPC_URL", "https://sepolia.gateway.tenderly.co"))
    ap.add_argument("--usdc", type=float, default=2000.0, help="USDC per side of the position (also deposited for JAR-J)")
    ap.add_argument("--tick-lower", type=int, default=-6000)
    ap.add_argument("--tick-upper", type=int, default=6000)
    ap.add_argument("--max-eth", type=float, default=0.005, help="refuse if estimated gas cost exceeds this")
    ap.add_argument("--force", action="store_true", help="add liquidity even if the pool already has some")
    ap.add_argument("--execute", action="store_true", help="send the transactions (default: dry run)")
    a = ap.parse_args(argv)

    dep = json.loads(Path(a.deployments).read_text())
    w3 = Web3(Web3.HTTPProvider(a.rpc, request_kwargs={"timeout": 30}))
    if w3.eth.chain_id != dep["chainId"]:
        print(f"chain id {w3.eth.chain_id} != deployments {dep['chainId']}")
        return 2
    cs = Web3.to_checksum_address
    pk = dep["poolKey"]
    key = (cs(pk["currency0"]), cs(pk["currency1"]), int(pk["fee"]), int(pk["tickSpacing"]), cs(pk["hooks"]))
    junior_addr, usdc_addr, pm_addr = cs(dep["JuniorVault"]), cs(dep["USDC"]), cs(dep["PoolManager"])
    if key[0] != junior_addr or key[1] != usdc_addr:
        print("poolKey is not (JuniorVault, USDC); refusing")
        return 2
    router_addr = cs(dep.get("PoolModifyLiquidityTest", DEFAULT_LIQ_ROUTER))
    router = w3.eth.contract(address=router_addr, abi=LIQ_ROUTER)
    if router.functions.manager().call() != pm_addr:
        print(f"{router_addr} is not a PoolModifyLiquidityTest for this PoolManager; refusing")
        return 2
    ts = key[3]
    if a.tick_lower % ts or a.tick_upper % ts or not a.tick_lower < 0 < a.tick_upper:
        print(f"ticks must be multiples of {ts} around the current tick")
        return 2

    key_hex = os.environ.get("RELAYER_PRIVATE_KEY", "").strip()
    if not key_hex:
        print("RELAYER_PRIVATE_KEY is not set (source agents/.env)")
        return 2
    acct = Account.from_key(key_hex)
    me = acct.address
    usdc = w3.eth.contract(address=usdc_addr, abi=ERC20)
    junior = w3.eth.contract(address=junior_addr, abi=ERC20)

    pid = pool_id(key)
    sqrt_x96, tick, liq_now = pool_state(w3, pm_addr, pid)
    if sqrt_x96 == 0:
        print("pool is not initialised")
        return 2
    sqrt_p = sqrt_x96 / Q96
    sqrt_lo, sqrt_hi = sqrt_at_tick(a.tick_lower), sqrt_at_tick(a.tick_upper)
    if not sqrt_lo < sqrt_p < sqrt_hi:
        print(f"current tick {tick} is outside [{a.tick_lower}, {a.tick_upper}]")
        return 2

    side = int(a.usdc * 1e6)
    shares = junior.functions.previewDeposit(side).call()
    liq = liquidity_for(shares, side, sqrt_p, sqrt_lo, sqrt_hi)
    need0, need1 = amounts_for(liq, sqrt_p, sqrt_lo, sqrt_hi)
    mint_amt = side + need1 + 500_000  # deposit + LP side + 0.5 USDC rounding buffer
    eth = w3.eth.get_balance(me)
    gas_price = w3.eth.gas_price
    fee_cap = max(gas_price * 2, 10**9)  # a cap, not the price paid: Sepolia's base fee is ~tens of wei
    tip = max(gas_price, 1_000_000)

    print(f"pool {pid.hex()}  tick {tick}  price {sqrt_p**2:.6f}  liquidity {liq_now}")
    print(f"relayer {me}  eth {eth / 1e18:.6f}  usdc {usdc.functions.balanceOf(me).call() / 1e6:,.2f}  "
          f"jar-j {junior.functions.balanceOf(me).call() / 1e6:,.2f}")
    print(f"router PoolModifyLiquidityTest {router_addr}")
    print(f"plan: mint {mint_amt / 1e6:,.2f} USDC; deposit {side / 1e6:,.2f} USDC -> {shares / 1e6:,.4f} JAR-J; "
          f"add L={liq} in ticks [{a.tick_lower}, {a.tick_upper}] (~{need0 / 1e6:,.2f} JAR-J + {need1 / 1e6:,.2f} USDC)")
    if liq_now > 0 and not a.force:
        print("pool already has liquidity; nothing to do (use --force to add more)")
        return 0

    est_gas = STATIC_GAS["mint"] + 3 * STATIC_GAS["approve"] + STATIC_GAS["deposit"] + STATIC_GAS["modifyLiquidity"]
    est_cost = est_gas * fee_cap
    print(f"gas: ~{est_gas:,} at <= {fee_cap} wei/gas -> <= {est_cost / 1e18:.8f} ETH (cap {a.max_eth} ETH)")
    if est_cost > a.max_eth * 1e18:
        print("estimated cost exceeds --max-eth; refusing")
        return 2
    if not a.execute:
        print("dry run: nothing sent (pass --execute)")
        return 0

    nonce = w3.eth.get_transaction_count(me, "pending")
    hashes: list[tuple[str, str]] = []
    spent = 0

    def send(label: str, fn) -> None:
        nonlocal nonce, spent
        # Estimate with a bare call object (Tenderly's gateway rejects estimateGas with type/chainId fields).
        data = fn._encode_transaction_data()
        gas = w3.eth.estimate_gas({"from": me, "to": fn.address, "data": data})
        tx = {"from": me, "to": fn.address, "data": data, "value": 0, "nonce": nonce, "chainId": dep["chainId"],
              "type": 2, "maxFeePerGas": fee_cap, "maxPriorityFeePerGas": tip, "gas": int(gas * 1.25) + 10_000}
        h = w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction)
        r = w3.eth.wait_for_transaction_receipt(h, timeout=240)
        nonce += 1
        hx = "0x" + bytes(h).hex().removeprefix("0x")
        spent += r["gasUsed"] * r["effectiveGasPrice"]
        print(f"  {label:<28} {hx}  status={r['status']} gas={r['gasUsed']}")
        hashes.append((label, hx))
        if r["status"] != 1:
            raise SystemExit(f"{label} reverted")

    send("mint USDC", usdc.functions.mint(me, mint_amt))
    if usdc.functions.allowance(me, junior_addr).call() < side:
        send("approve USDC -> JuniorVault", usdc.functions.approve(junior_addr, side))
    send("deposit -> JAR-J", junior.functions.deposit(side, me))
    if junior.functions.allowance(me, router_addr).call() < need0:
        send("approve JAR-J -> router", junior.functions.approve(router_addr, MAX_UINT))
    if usdc.functions.allowance(me, router_addr).call() < need1:
        send("approve USDC -> router", usdc.functions.approve(router_addr, MAX_UINT))
    # Re-size L from the real JAR-J balance (deposit rounding) before adding.
    bal0 = junior.functions.balanceOf(me).call()
    bal1 = usdc.functions.balanceOf(me).call()
    liq = min(liq, liquidity_for(bal0, bal1, sqrt_p, sqrt_lo, sqrt_hi))
    send("modifyLiquidity (add)", router.functions.modifyLiquidity(
        key, (a.tick_lower, a.tick_upper, liq, SALT), b""))

    _, tick, liq_now = pool_state(w3, pm_addr, pid)
    print(f"done: pool liquidity {liq_now}, tick {tick}; gas spent {spent / 1e18:.8f} ETH")
    print(json.dumps({"txs": dict(hashes), "liquidity": liq_now}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
