#!/usr/bin/env python3
"""Extra demo state for the PUBLIC devnet, on top of devnet.sh (deploy) + seed_demo.py (shops, sales, ghost-shop
advance). Idempotent: every step checks the chain first. DEVNET ONLY (public anvil keys, chain 31337).

  * a junior LP position: account 7 holds 2,000 USDC of junior shares (+3,000 USDC spare) -- the holder who
    panics and sells on the v4 pool in demo_default_scene.py
  * a v4 swap router (PoolSwapTest) so anyone can trade the junior/USDC pool; address written to the manifest
  * a little two-sided pool activity, so RiskHook has more than one oracle observation

    RPC_URL=http://127.0.0.1:8545 DEPLOYMENTS_FILE=deployments/devnet.json uv run python scripts/seed_devnet.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from devnet_lib import AGENTS, Devnet, role

JUNIOR_LP_DEPOSIT = 2_000 * 10**6
JUNIOR_LP_SPARE = 3_000 * 10**6


def main() -> int:
    rpc = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
    manifest = Path(os.environ.get("DEPLOYMENTS_FILE", AGENTS / "deployments" / "devnet.json"))
    d = Devnet.connect(rpc, manifest, os.environ.get("ADMIN_RPC_URL"))
    lp, owner = role("junior_lp"), role("owner")

    if d.junior.functions.balanceOf(lp.address).call() == 0:
        d.send(d.usdc.functions.mint(lp.address, JUNIOR_LP_DEPOSIT + JUNIOR_LP_SPARE), owner)
        d.send(d.usdc.functions.approve(d.addr("JuniorVault"), JUNIOR_LP_DEPOSIT), lp)
        d.send(d.junior.functions.deposit(JUNIOR_LP_DEPOSIT, lp.address), lp)
        print(f"junior LP {lp.address}: deposited {JUNIOR_LP_DEPOSIT / 1e6:,.0f} USDC into the junior tranche")
    else:
        print(f"junior LP {lp.address}: position already exists")

    router = d.ensure_swap_router()
    print(f"PoolSwapTest (v4 swap router) at {router}")

    if not d.dep.get("seededPoolActivity"):
        # Tiny round trip (about 0.3% each way), so the oracle ring has observations at distinct times.
        _, t0 = d.slot0()
        d.swap_to_tick(lp, t0 - 30, 50 * 10**6)
        d.warp(60)
        d.swap_to_tick(lp, t0, 50 * 10**6)
        d.dep["seededPoolActivity"] = True
        d.save_manifest()
        print(f"pool activity seeded; tick back at {d.slot0()[1]}")
    print(f"junior share price {d.share_price(d.junior):.6f} USDC, senior {d.share_price(d.senior):.6f} USDC")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
