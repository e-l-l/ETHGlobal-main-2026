#!/usr/bin/env bash
# Admin for the public devnet (anvil). Run ON THE BOX over SSH: every admin call goes to anvil inside the docker
# network; the public https://rpc.<suffix> refuses all of them.
#
#   ./deploy/devnet.sh status                  chain head, chain time, deployer state, URLs
#   ./deploy/devnet.sh manifest                print devnet.json (contract addresses)
#   ./deploy/devnet.sh warp 31d                evm_increaseTime + mine (units: d h m s; plain number = seconds)
#   ./deploy/devnet.sh mine [n]                mine n blocks (default 1)
#   ./deploy/devnet.sh scene [args]            the default scene (dry run unless --execute), e.g.
#                                                scene --execute            all pending steps
#                                                scene --execute --step sell
#                                                scene --execute --reset    pool price + caps back, new merchant
#   ./deploy/devnet.sh reset                   = scene --execute --reset (soft: keeps the chain)
#   ./deploy/devnet.sh reset --hard            wipe the chain + devnet DB, redeploy and reseed (~1-5 min)
#   ./deploy/devnet.sh rpc <method> [params]   raw admin JSON-RPC (cast rpc), e.g. rpc anvil_nodeInfo
#   ./deploy/devnet.sh logs [service]          deployer/anvil/rpc-proxy/api-devnet logs
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
export DEVNET=1 # this script always talks to the devnet profile
resolve_host_suffix >/dev/null 2>&1 || export HOST_SUFFIX="${HOST_SUFFIX:-localhost}"
ANVIL_RPC=http://127.0.0.1:8545 # inside the anvil container
SCENE=/work/agents/scripts/demo_default_scene.py

cast_rpc() { dc exec -T anvil cast rpc --rpc-url "$ANVIL_RPC" "$@"; }
cast_in() { dc exec -T anvil cast "$@" --rpc-url "$ANVIL_RPC"; }

seconds() { # 31d | 2h | 90m | 45s | 3600
  local v="$1" n unit
  [[ "$v" =~ ^([0-9]+)([dhms]?)$ ]] || { c_err "bad duration '$v' (use e.g. 31d, 2h, 90m, 3600)"; exit 2; }
  n="${BASH_REMATCH[1]}" unit="${BASH_REMATCH[2]}"
  case "$unit" in d) echo $((n * 86400)) ;; h) echo $((n * 3600)) ;; m) echo $((n * 60)) ;; *) echo "$n" ;; esac
}

chain_time() {
  local t; t="$(cast_in block latest --field timestamp)"
  printf '%s (%s)' "$t" "$(date -u -d "@$t" '+%F %T UTC' 2>/dev/null || date -u -r "$t" '+%F %T UTC')"
}

run_tools() { # one-off container from the devnet tools image, in anvil's network namespace
  dc run --rm --no-deps "$@"
}

cmd="${1:-status}"; shift || true
case "$cmd" in
  status)
    dc ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}' anvil devnet-deployer rpc-proxy agents-api-devnet
    echo
    echo "block      $(cast_in block-number)"
    echo "chain time $(chain_time)"
    echo "wall clock $(date -u '+%s (%F %T UTC)')"
    echo
    echo "public RPC   https://rpc.$HOST_SUFFIX        (contracts: https://rpc.$HOST_SUFFIX/devnet.json)"
    echo "devnet API   https://api-devnet.$HOST_SUFFIX"
    ;;
  manifest)
    dc exec -T rpc-proxy cat /srv/devnet/devnet.json
    ;;
  warp)
    [[ $# -ge 1 ]] || { c_err "usage: devnet.sh warp <duration>  (e.g. 31d)"; exit 2; }
    s="$(seconds "$1")"
    before="$(chain_time)"
    cast_rpc evm_increaseTime "$s" >/dev/null
    cast_rpc evm_mine >/dev/null
    c_ok "warped +${s}s: $before -> $(chain_time)"
    c_warn "time only moves forward, for everyone using the public devnet"
    ;;
  mine)
    n="${1:-1}"; [[ "$n" =~ ^[0-9]+$ ]] || { c_err "usage: devnet.sh mine [n]"; exit 2; }
    cast_rpc anvil_mine "$n" >/dev/null
    c_ok "mined $n block(s): head $(cast_in block-number)"
    ;;
  scene)
    run_tools --entrypoint /work/agents/.venv/bin/python devnet-deployer "$SCENE" "$@"
    ;;
  reset)
    if [[ "${1:-}" == "--hard" ]]; then
      project="${COMPOSE_PROJECT_NAME:-mra}"
      c_warn "hard reset: deleting the devnet chain, its manifest and the devnet agents DB"
      dc rm -sf anvil devnet-deployer rpc-proxy agents-api-devnet
      for v in anvil-state devnet-data agents-devnet-data; do
        docker volume rm "${project}_$v" >/dev/null 2>&1 && c_ok "removed volume ${project}_$v" || true
      done
      c_info "redeploying (anvil -> deployer -> rpc-proxy, agents-api-devnet)"
      dc up -d anvil devnet-deployer rpc-proxy agents-api-devnet
      dc ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}' anvil devnet-deployer rpc-proxy agents-api-devnet
    else
      run_tools --entrypoint /work/agents/.venv/bin/python devnet-deployer "$SCENE" --execute --reset
    fi
    ;;
  rpc)
    [[ $# -ge 1 ]] || { c_err "usage: devnet.sh rpc <method> [params...]"; exit 2; }
    cast_rpc "$@"; echo
    ;;
  logs)
    if [[ $# -eq 0 ]]; then set -- devnet-deployer anvil rpc-proxy agents-api-devnet; fi
    dc logs --timestamps --tail "${TAIL:-100}" "$@"
    ;;
  -h|--help|help)
    sed -n '2,17p' "$0"
    ;;
  *)
    c_err "unknown command: $cmd"; sed -n '2,17p' "$0"; exit 2
    ;;
esac
