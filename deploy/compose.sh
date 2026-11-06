#!/usr/bin/env bash
# Thin wrapper: docker compose with this deployment's compose file, env file and HOST_SUFFIX.
#   ./deploy/compose.sh ps
#   ./deploy/compose.sh restart app
#   ./deploy/compose.sh exec agents-api sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
resolve_host_suffix
dc "$@"
