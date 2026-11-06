#!/usr/bin/env bash
# Admin for the LOCAL Docker devnet (docs/LOCAL.md). The same commands as deploy/devnet.sh on EC2.
#
#   scripts/dev-devnet.sh status                chain head, chain time vs wall clock, containers
#   scripts/dev-devnet.sh warp 31d              evm_increaseTime + mine (units d h m s; plain number = seconds)
#   scripts/dev-devnet.sh mine [n]              mine n blocks (default 1)
#   scripts/dev-devnet.sh scene [args]          the default scene; a dry run unless --execute, e.g.
#                                                 scene --execute               every pending step
#                                                 scene --execute --step sell   one step
#                                                 scene --execute --llm         the Risk agent asks your LLM
#   scripts/dev-devnet.sh reset                 soft: pool price + caps back, a new merchant (= scene --execute --reset)
#   scripts/dev-devnet.sh manifest              the devnet's contract addresses (devnet.json)
#   scripts/dev-devnet.sh rpc <method> [args]   raw JSON-RPC through cast, e.g. rpc anvil_nodeInfo
# A full wipe is scripts/dev-down.sh --reset && scripts/dev-up.sh (the deploy is deterministic: same addresses).
set -euo pipefail
# shellcheck source=scripts/lib/dev-common.sh
. "$(dirname "$0")/lib/dev-common.sh"

ANVIL_RPC=http://127.0.0.1:8545 # inside the anvil container
SCENE=/work/agents/scripts/demo_default_scene.py
MANIFEST=/work/agents/deployments/devnet/devnet.json

cast_in() { dc exec -T anvil cast "$@" --rpc-url "$ANVIL_RPC"; }
cast_rpc() { dc exec -T anvil cast rpc --rpc-url "$ANVIL_RPC" "$@"; }
tools() { dc run --rm --no-deps "$@"; } # one-off devnet tools container in anvil's network namespace

seconds() {
  local v="$1" n unit
  [[ "$v" =~ ^([0-9]+)([dhms]?)$ ]] || { c_err "bad duration '$v' (use e.g. 31d, 2h, 90m, 3600)"; exit 2; }
  n="${BASH_REMATCH[1]}" unit="${BASH_REMATCH[2]}"
  case "$unit" in d) echo $((n * 86400)) ;; h) echo $((n * 3600)) ;; m) echo $((n * 60)) ;; *) echo "$n" ;; esac
}
utc() { date -u -d "@$1" '+%F %T UTC' 2>/dev/null || date -u -r "$1" '+%F %T UTC'; }
chain_time() { local t; t="$(cast_in block latest --field timestamp | tr -d '\r')"; printf '%s (%s)' "$t" "$(utc "$t")"; }

cmd="${1:-status}"; shift || true
case "$cmd" in
  status)
    dc ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}'
    echo
    echo "block      $(cast_in block-number)"
    echo "chain time $(chain_time)"
    echo "wall clock $(date -u '+%s') ($(utc "$(date -u '+%s')"))"
    ;;
  warp)
    [[ $# -ge 1 ]] || { c_err "usage: dev-devnet.sh warp <duration>  (e.g. 31d)"; exit 2; }
    s="$(seconds "$1")"; before="$(chain_time)"
    cast_rpc evm_increaseTime "$s" >/dev/null
    cast_rpc evm_mine >/dev/null
    c_ok "warped +${s}s: $before -> $(chain_time)"
    ;;
  mine)
    n="${1:-1}"; [[ "$n" =~ ^[0-9]+$ ]] || { c_err "usage: dev-devnet.sh mine [n]"; exit 2; }
    cast_rpc anvil_mine "$n" >/dev/null
    c_ok "mined $n block(s): head $(cast_in block-number)"
    ;;
  scene)
    tools --entrypoint /work/agents/.venv/bin/python devnet-deployer "$SCENE" "$@"
    ;;
  reset)
    [[ "${1:-}" != --hard ]] || { c_err "for a full wipe use: scripts/dev-down.sh --reset && scripts/dev-up.sh"; exit 2; }
    tools --entrypoint /work/agents/.venv/bin/python devnet-deployer "$SCENE" --execute --reset
    ;;
  manifest)
    tools -T --entrypoint cat devnet-deployer "$MANIFEST"
    ;;
  rpc)
    [[ $# -ge 1 ]] || { c_err "usage: dev-devnet.sh rpc <method> [params...]"; exit 2; }
    cast_rpc "$@"; echo
    ;;
  -h|--help|help) sed -n '2,15p' "$0" ;;
  *) c_err "unknown command: $cmd"; sed -n '2,15p' "$0"; exit 2 ;;
esac
