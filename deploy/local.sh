#!/usr/bin/env bash
# Backup plan: run the whole stack on a laptop with the same compose file, against a local anvil.
#
#   bash agents/scripts/devnet.sh && (cd agents && uv run python scripts/seed_demo.py)   # once, on the host
#   ./deploy/local.sh            build + up (integrations use whatever modes compose.env sets)
#   ./deploy/local.sh --mock     force every NEXT_PUBLIC_*_MODE to mock (no network needed at all)
#   ./deploy/local.sh down       stop
#
# URLs: app http://localhost:3000, API http://localhost:8787, portal http://localhost:3001
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
export COMPOSE_EXTRA_FILES="-f $DEPLOY_DIR/docker-compose.local.yml"
export HOST_SUFFIX=localhost DEPLOYMENTS_NAME=local

if [[ "${1:-}" == "--mock" ]]; then
  shift
  for m in API RPC RECLAIM WORLD AGENT_PASS PROVER; do export "NEXT_PUBLIC_${m}_MODE=mock"; done
fi
if [[ $# -gt 0 ]]; then dc "$@"; exit; fi

for f in agents app demo-portal; do
  [[ -f "$ENV_DIR/$f.env" ]] || { c_err "missing $ENV_DIR/$f.env (copy the .example and fill it)"; exit 1; }
done
[[ -f "$ENV_DIR/issuer.env" ]] || cp "$ENV_DIR/issuer.env.example" "$ENV_DIR/issuer.env"
cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 \
  || c_warn "no anvil on 127.0.0.1:8545: run 'bash agents/scripts/devnet.sh' first (the app's mock modes still work)"
[[ -f "$REPO_DIR/agents/deployments/local.json" ]] || c_warn "agents/deployments/local.json missing: run devnet.sh"

services=(agents-api agents-worker app demo-portal)
[[ -f "$REPO_DIR/issuer/Dockerfile" ]] && services+=(issuer)
dc up -d --build "${services[@]}"
dc ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'
echo
echo "app    http://localhost:3000"
echo "api    http://localhost:8787/health"
echo "portal http://localhost:3001/api/health"
