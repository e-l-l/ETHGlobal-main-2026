"""Write agents/deployments/<name>.json from a Foundry broadcast of Deploy.s.sol (+ DeployVerifier).

Same shape as local.json, which agents' chain.py loads:
  {"chainId", "AdvanceBook", "BusinessPassRegistry", "SeniorVault", "JuniorVault", "RiskHook", "USDC",
   "PoolManager", "HonkVerifier", "BusinessPassVerifier", "poolKey", "deployBlock"}

    python3 script/export_deployment.py --chain 11155111 --name sepolia [--pool-manager 0x...] [--usdc 0x...]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # contracts/
FEE, TICK_SPACING = 3000, 60  # must match Deploy.s.sol deployHookAndPool


def creates(run: dict) -> list[tuple[str, str]]:
    out = []
    for tx in run["transactions"]:
        if tx.get("transactionType") in ("CREATE", "CREATE2") and tx.get("contractName"):
            out.append((tx["contractName"].split(".")[0], tx["contractAddress"]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chain", type=int, required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--pool-manager", default="0xE03A1074c86CFeDd5C142C4F04F1a1536e203543")  # verified Sepolia
    ap.add_argument("--usdc", default=None, help="if not set, the MockUSDC from the broadcast is used")
    a = ap.parse_args()

    run = json.loads((HERE / f"broadcast/Deploy.s.sol/{a.chain}/run-latest.json").read_text())
    ver = json.loads((HERE / f"broadcast/DeployVerifier.s.sol/{a.chain}/run-latest.json").read_text())
    c = creates(run)
    by = {}
    for name, addr in c:
        by.setdefault(name, []).append(addr)
    vaults = by.get("TrancheVault", [])
    assert len(vaults) == 2, f"expected senior+junior TrancheVault, got {vaults}"
    senior, junior = vaults  # Deploy.s.sol creates senior first, then junior
    usdc = a.usdc or by["MockUSDC"][0]
    hook = by["RiskHook"][0]
    c0, c1 = sorted([junior, usdc], key=lambda x: int(x, 16))
    blocks = [int(r["blockNumber"], 16) for r in run.get("receipts", []) + ver.get("receipts", []) if r.get("blockNumber")]
    vc = dict((n, addr) for n, addr in creates(ver))

    out = {
        "chainId": a.chain,
        "AdvanceBook": by["AdvanceBook"][0],
        "BusinessPassRegistry": by["BusinessPassRegistry"][0],
        "SeniorVault": senior,
        "JuniorVault": junior,
        "RiskHook": hook,
        "USDC": usdc,
        "PoolManager": a.pool_manager,
        "HonkVerifier": vc.get("HonkVerifier"),
        "BusinessPassVerifier": vc.get("BusinessPassVerifier"),
        "poolKey": {"currency0": c0, "currency1": c1, "fee": FEE, "tickSpacing": TICK_SPACING, "hooks": hook},
        "deployBlock": min(blocks) if blocks else 0,
    }
    dest = HERE.parent / "agents" / "deployments" / f"{a.name}.json"
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {dest}")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
