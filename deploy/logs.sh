#!/usr/bin/env bash
# Follow logs. No args = all services (last 100 lines each). Examples:
#   ./deploy/logs.sh                  everything
#   ./deploy/logs.sh agents-worker    one service
#   ./deploy/logs.sh caddy app        several
#   TAIL=500 ./deploy/logs.sh agents-api
#   NOFOLLOW=1 ./deploy/logs.sh       print and exit
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
resolve_host_suffix
args=(logs --timestamps --tail "${TAIL:-100}")
[[ -n "${NOFOLLOW:-}" ]] || args+=(--follow)
dc "${args[@]}" "$@"
