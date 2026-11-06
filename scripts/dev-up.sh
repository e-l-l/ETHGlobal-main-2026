#!/usr/bin/env bash
# Start the whole DripMoney stack locally in Docker (docs/LOCAL.md, Path A). macOS, Linux and WSL2.
#
#   scripts/dev-up.sh               env files (if missing) -> build -> anvil + deploy + seed -> API, worker,
#                                   issuer, portal, web app in local mode -> health checks -> URLs
#   scripts/dev-up.sh --mock        only the web app, in mock mode (UI only, no chain)
#   scripts/dev-up.sh --no-app      everything except the web app image (run apps/web natively instead)
#   scripts/dev-up.sh --no-build    reuse the images you already built
#   scripts/dev-up.sh --reset       delete this stack's volumes first (fresh chain, fresh DB), then start
#   scripts/dev-up.sh --native-env  only create the env files for Path B (native), then exit
#
# Safe to re-run: env files are never overwritten, the chain lives on a volume, the deployer is idempotent.
# Needs no real keys: the devnet uses anvil's public keys, and the secrets it needs are generated locally.
set -euo pipefail
# shellcheck source=scripts/lib/dev-common.sh
. "$(dirname "$0")/lib/dev-common.sh"

MOCK=0 NO_APP=0 NO_BUILD=0 RESET=0 NATIVE_ENV=0
for a in "$@"; do
  case "$a" in
    --mock) MOCK=1 ;;
    --no-app) NO_APP=1 ;;
    --no-build) NO_BUILD=1 ;;
    --reset) RESET=1 ;;
    --native-env) NATIVE_ENV=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) c_err "unknown option: $a"; sed -n '2,14p' "$0"; exit 2 ;;
  esac
done

if [[ $NATIVE_ENV == 1 ]]; then
  c_info "env files for Path B (native)"
  ensure_native_env
  echo
  echo "Next: docs/LOCAL.md, 'Path B: native', one terminal per service."
  exit 0
fi

# ------------------------------------------------------------------------------------------ prerequisites
c_info "checking prerequisites (scripts/doctor.sh shows every tool)"
have docker || { c_err "docker not found. Install Docker Desktop (macOS/Windows) or Docker Engine (Linux): https://docs.docker.com/get-docker/"; exit 1; }
cv="$(docker compose version --short 2>/dev/null || true)"
[[ -n "$cv" ]] || { c_err "'docker compose' (v2) not found. Update Docker Desktop, or install the compose plugin."; exit 1; }
IFS=. read -r cv_major cv_minor _ <<<"${cv#v}"
if [[ "${cv_major:-0}" -lt 2 || ( "${cv_major:-0}" -eq 2 && "${cv_minor:-0}" -lt 24 ) ]]; then
  c_err "docker compose $cv is too old: 2.24+ is needed (env_file 'required:'). Update Docker Desktop / the compose plugin."
  exit 1
fi
if ! run_with_timeout 20 docker info >/dev/null 2>&1; then
  c_err "the Docker daemon is not answering. Start Docker Desktop (or 'sudo systemctl start docker' on Linux) and retry."
  c_err "If Docker Desktop is running but hangs, check its disk image is not full (Settings > Resources)."
  exit 1
fi
c_ok "docker compose $cv, daemon up"

mem_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
if [[ "$mem_bytes" =~ ^[0-9]+$ && "$mem_bytes" -gt 0 && "$mem_bytes" -lt 6000000000 ]]; then
  c_warn "Docker has $((mem_bytes / 1048576)) MiB of memory. Give it 6 GB or more (Docker Desktop > Settings > Resources,"
  c_warn "or memory= in %UserProfile%\\.wslconfig on Windows). The web app build alone peaks at about 2.5 GB."
fi

free_kb="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
if [[ "$free_kb" =~ ^[0-9]+$ ]]; then
  free_gb=$((free_kb / 1048576))
  if [[ $NO_BUILD == 0 && $free_gb -lt 6 && "${DEV_SKIP_DISK_CHECK:-}" != 1 ]]; then
    c_err "only ${free_gb} GB free on this disk; the images need about 10 GB. Free some space (docker system prune),"
    c_err "or run the native path (docs/LOCAL.md, Path B). DEV_SKIP_DISK_CHECK=1 skips this check."
    exit 1
  fi
  [[ $free_gb -ge 15 ]] || c_warn "${free_gb} GB free: the first build needs about 10 GB (images + build cache)."
fi

if [[ ! -f "$REPO_DIR/contracts/lib/forge-std/src/Test.sol" || ! -d "$REPO_DIR/contracts/lib/uniswap-hooks/src" ]]; then
  c_info "fetching the contracts' git submodules (forge-std, uniswap-hooks)"
  git -C "$REPO_DIR" submodule update --init --recursive
fi

# ---------------------------------------------------------------------------------------------- env files
c_info "env files (existing files are never overwritten)"
ensure_docker_env

# ------------------------------------------------------------------------------------------------- reset
if [[ $RESET == 1 ]]; then
  c_warn "--reset: removing the mra-dev containers and volumes (chain, manifest, agents DB)"
  dc down -v --remove-orphans
fi

# -------------------------------------------------------------------------------------------- mock only
if [[ $MOCK == 1 ]]; then
  export DEV_MRA_MODE=mock
  c_info "web app in mock mode (no chain, no backend)"
  build_flag=--build; [[ $NO_BUILD == 1 ]] && build_flag=--no-build
  dc up -d "$build_flag" --no-deps app
  echo
  echo "app  http://localhost:${DEV_APP_PORT:-3000}/home   (mock data; build again without --mock for local mode)"
  exit 0
fi

# ---------------------------------------------------------------------------------------------- build
if [[ $NO_BUILD == 0 ]]; then
  # One image at a time: parallel Next/forge builds can run a small Docker VM out of memory.
  for svc in agents-api-devnet devnet-deployer issuer-devnet demo-portal; do
    c_info "building $svc"
    dc build "$svc"
  done
fi

# --------------------------------------------------------------------------- chain: deploy + seed (one-shot)
c_info "starting anvil and the deployer (first boot: deploy + seed, about 1-3 minutes)"
dc up -d --no-build anvil devnet-deployer
deadline=$((SECONDS + 900)); last=""
while :; do
  state="$(dc ps -a --format '{{.State}}' devnet-deployer 2>/dev/null | head -n 1)"
  [[ "$state" == exited ]] && break
  if [[ $SECONDS -ge $deadline ]]; then
    c_err "the deployer is still running after 15 minutes"; dc logs --tail 40 devnet-deployer; exit 1
  fi
  line="$(dc logs --tail 1 --no-log-prefix devnet-deployer 2>/dev/null | tail -n 1)"
  [[ -n "$line" && "$line" != "$last" ]] && { echo "   $line"; last="$line"; }
  sleep 3
done
code="$(dc ps -a --format '{{.ExitCode}}' devnet-deployer | head -n 1)"
if [[ "$code" != 0 ]]; then
  c_err "devnet-deployer exited with $code. Last lines:"
  dc logs --tail 40 devnet-deployer >&2
  c_err "A half-finished first boot cannot be resumed (seed_demo.py refuses a second run): scripts/dev-up.sh --reset"
  exit 1
fi
c_ok "devnet deployed and seeded"

# The devnet's contract addresses, for the web app's build (NEXT_PUBLIC_MRA_DEPLOYMENT). No spaces in the -c code,
# so no shell (bash or PowerShell) can split it.
DEV_MRA_DEPLOYMENT="$(dc run --rm --no-deps -T --entrypoint /work/agents/.venv/bin/python devnet-deployer -c \
  "import json;d=json.load(open('/work/agents/deployments/devnet/devnet.json'));print(json.dumps(d,separators=(',',':')))" \
  | tr -d '\r' | tail -n 1)"
[[ "$DEV_MRA_DEPLOYMENT" == "{"* ]] || { c_err "could not read the devnet manifest"; exit 1; }
export DEV_MRA_DEPLOYMENT

# ------------------------------------------------------------------------------------------- services
services=(agents-api-devnet agents-worker-devnet issuer-devnet rpc-proxy demo-portal)
if [[ $NO_APP == 0 ]]; then
  services+=(app)
  if [[ $NO_BUILD == 0 ]]; then
    c_info "building app (apps/web, local mode, about 3-6 minutes the first time)"
    dc build app
  fi
fi
c_info "starting ${services[*]}"
dc up -d --no-build "${services[@]}"

c_info "waiting for health checks (up to 5 minutes)"
deadline=$((SECONDS + 300))
while :; do
  pending=""
  while IFS='|' read -r svc health state; do
    [[ -z "$svc" ]] && continue
    if [[ "$state" != running ]]; then pending="$pending $svc($state)"
    elif [[ -n "$health" && "$health" != healthy ]]; then pending="$pending $svc($health)"
    fi
  done < <(dc ps -a --format '{{.Service}}|{{.Health}}|{{.State}}' "${services[@]}" 2>/dev/null | tr -d '\r')
  [[ -z "$pending" ]] && break
  if [[ $SECONDS -ge $deadline ]]; then
    c_err "not healthy after 5 minutes:$pending"
    c_err "logs: scripts/dev-compose.sh logs --tail 50 <service>"
    exit 1
  fi
  sleep 5
done
c_ok "all services healthy"

# ------------------------------------------------------------------------------------------ smoke checks
check() { # name url [curl args...]
  local name="$1" url="$2"; shift 2
  if have curl && curl -fsS -m 10 -o /dev/null "$@" "$url"; then c_ok "$name $url"; else c_warn "$name $url did not answer (yet)"; fi
}
echo
check "rpc   " "http://127.0.0.1:${DEV_RPC_PORT:-8545}" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
check "api   " "http://localhost:${DEV_API_PORT:-8000}/health"
check "issuer" "http://localhost:${DEV_ISSUER_PORT:-8787}/health"
check "portal" "http://localhost:${DEV_PORTAL_PORT:-3001}/api/health"
[[ $NO_APP == 1 ]] || check "app   " "http://localhost:${DEV_APP_PORT:-3000}/home"

cat <<EOF

DripMoney local stack is up (compose project mra-dev).

  web app      http://localhost:${DEV_APP_PORT:-3000}/home     $([[ $NO_APP == 1 ]] && echo "(not started: --no-app)")
  agents API   http://localhost:${DEV_API_PORT:-8000}/health
  issuer       http://localhost:${DEV_ISSUER_PORT:-8787}/health   (mock zkTLS)
  portal       http://localhost:${DEV_PORTAL_PORT:-3001}
  chain RPC    http://127.0.0.1:${DEV_RPC_PORT:-8545}      (chain id 31337)

  default scene   scripts/dev-devnet.sh scene              (dry run)   then: scripts/dev-devnet.sh scene --execute
  time warp       scripts/dev-devnet.sh warp 31d           chain status: scripts/dev-devnet.sh status
  logs            scripts/dev-compose.sh logs -f agents-api-devnet
  stop            scripts/dev-down.sh            (keeps the chain)   scripts/dev-down.sh --reset   (wipes it)

Walkthrough: docs/LOCAL.md
EOF
