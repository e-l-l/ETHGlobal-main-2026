#!/usr/bin/env bash
# One-shot devnet deployer (compose service `devnet-deployer`, image mra-devnet-tools). Idempotent: on every boot
# it checks what is already on the chain and only does what is missing, then exits 0.
#
#   1. deploy  agents/scripts/devnet.sh: Poseidon2 (anvil_setCode), HonkVerifier + BusinessPassVerifier,
#              then DeployLocal.s.sol (MockUSDC, BusinessPassRegistry, PoolManager, Senior/Junior vaults,
#              AdvanceBook, RiskHook via CREATE2, the junior/USDC v4 pool + liquidity)
#   2. seed    agents/scripts/seed_demo.py: chai-stall, wash-trader, ghost-shop, ~300 sales, ghost-shop advance
#   3. extras  agents/scripts/seed_devnet.py: junior LP position, v4 swap router, pool activity
#
# It shares anvil's network namespace (network_mode: service:anvil), so 127.0.0.1:8545 IS anvil and the
# existing local-only scripts run unchanged. The manifest lands in the devnet volume, mounted at
# $WORK/agents/deployments/devnet (inside the contracts' fs_permissions, so DeployLocal can write it).
set -euo pipefail
WORK="${WORK:-/work}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
OUT="${DEVNET_DIR:-$WORK/agents/deployments/devnet}"
MANIFEST="$OUT/devnet.json"
PY="$WORK/agents/.venv/bin/python"
export RPC_URL

log() { printf '[devnet-deployer] %s\n' "$*"; }
mkdir -p "$OUT"

for _ in $(seq 1 150); do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 0.2; done
[[ "$(cast chain-id --rpc-url "$RPC_URL")" == 31337 ]] || { log "anvil not reachable at $RPC_URL"; exit 1; }

# A manifest without code behind it means the chain state was lost (anvil volume removed): start over.
if [[ -f "$MANIFEST" ]]; then
  book="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["AdvanceBook"])' "$MANIFEST")"
  if [[ "$(cast code "$book" --rpc-url "$RPC_URL")" == "0x" ]]; then
    log "manifest found but AdvanceBook has no code (fresh chain): redeploying"
    rm -f "$OUT"/devnet.json "$OUT"/.seeded-* "$OUT"/scene-state.json
  fi
fi

log "1/3 deploy (skipped by devnet.sh when the manifest matches the chain)"
MANIFEST="$MANIFEST" ENV_OUT="$(mktemp)" bash "$WORK/agents/scripts/devnet.sh"

cd "$WORK/agents"
if [[ ! -f "$OUT/.seeded-demo" ]]; then
  log "2/3 seed shops and sales (seed_demo.py: a few minutes, includes one real Business Pass proof)"
  if ! DEPLOYMENTS_FILE="$MANIFEST" "$PY" scripts/seed_demo.py; then
    log "seed_demo.py failed. It refuses to run twice on one chain: run 'deploy/devnet.sh reset --hard'."
    exit 1
  fi
  date -u +%FT%TZ > "$OUT/.seeded-demo"
else
  log "2/3 seed: already done"
fi

log "3/3 extras (junior LP position, swap router, pool activity)"
DEPLOYMENTS_FILE="$MANIFEST" "$PY" scripts/seed_devnet.py
# Judge simulator (agents-api-devnet /sim): share only runtime artifacts through the devnet volume, never
# sources or build tools. The API stays the stock agents image and mounts this volume read-only.
#   contracts-out/  PoolSwapTest ABI (v4 swaps)      circuits/<c>/  compiled circuit + verification key
#   tools/          noir-execute (witness from the compiled artifact, no sources) + bb (prove/verify)
mkdir -p "$OUT/contracts-out/PoolSwapTest.sol" "$OUT/tools"
cp "$WORK/contracts/out/PoolSwapTest.sol/PoolSwapTest.json" "$OUT/contracts-out/PoolSwapTest.sol/PoolSwapTest.json"
for c in business_pass standing_pass; do
  mkdir -p "$OUT/circuits/$c"
  cp "$WORK/circuits/$c/target/$c.json" "$WORK/circuits/$c/target/vk" "$OUT/circuits/$c/"
done
for t in noir-execute bb; do
  if command -v "$t" >/dev/null; then cp "$(command -v "$t")" "$OUT/tools/$t"; else log "WARNING: $t missing: simulator proofs will fail"; fi
done
chmod -R a+rX "$OUT/contracts-out" "$OUT/circuits" "$OUT/tools"
chmod 644 "$MANIFEST"
date -u +%FT%TZ > "$OUT/.ready"
log "devnet ready: $(cast block-number --rpc-url "$RPC_URL") blocks; manifest $MANIFEST"
