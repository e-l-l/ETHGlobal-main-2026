#!/usr/bin/env bash
# Stop the local Docker stack (docs/LOCAL.md, Path A). macOS, Linux and WSL2.
#
#   scripts/dev-down.sh           stop and remove the containers. Keeps the volumes: chain, manifest, agents DB.
#   scripts/dev-down.sh --reset   ALSO delete this stack's volumes (project mra-dev only): next dev-up redeploys
#                                 and reseeds a fresh chain. Env files and built images are always kept.
set -euo pipefail
# shellcheck source=scripts/lib/dev-common.sh
. "$(dirname "$0")/lib/dev-common.sh"

RESET=0
for a in "$@"; do
  case "$a" in
    --reset) RESET=1 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) c_err "unknown option: $a"; sed -n '2,6p' "$0"; exit 2 ;;
  esac
done

have docker || { c_err "docker not found"; exit 1; }
if [[ $RESET == 1 ]]; then
  c_warn "--reset: deleting the mra-dev volumes (anvil state, devnet manifest, agents DB)"
  dc down -v --remove-orphans
  c_ok "stopped and wiped. scripts/dev-up.sh starts a fresh chain."
else
  dc down --remove-orphans
  c_ok "stopped. The chain and the DB are kept on volumes; scripts/dev-up.sh --no-build brings them back."
fi
echo "Images stay cached. To free their disk space: docker image rm mra-app:dev mra-agents:local mra-devnet-tools:local mra-issuer:local mra-demo-portal:local && docker builder prune"
