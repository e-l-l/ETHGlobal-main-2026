#!/usr/bin/env bash
# docker compose on the local dev stack (project mra-dev, deploy/docker-compose.yml + docker-compose.dev.yml).
#   scripts/dev-compose.sh ps
#   scripts/dev-compose.sh logs -f agents-api-devnet
#   scripts/dev-compose.sh restart issuer-devnet
#   scripts/dev-compose.sh exec anvil cast block latest --rpc-url http://127.0.0.1:8545
set -euo pipefail
# shellcheck source=scripts/lib/dev-common.sh
. "$(dirname "$0")/lib/dev-common.sh"
[[ $# -gt 0 ]] || { sed -n '2,6p' "$0"; exit 2; }
dc "$@"
