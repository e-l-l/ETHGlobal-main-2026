#!/usr/bin/env bash
# Pull, build, start, health-check, print URLs. Safe to re-run (this is also how you update).
#
#   ./deploy/deploy.sh               git pull + build + up
#   ./deploy/deploy.sh --no-pull     deploy the working tree as-is (e.g. after scp'ing a hotfix)
#   ./deploy/deploy.sh --no-build    restart with the existing images (env-only change)
#
# Env: BRANCH (default: current branch), HOST_SUFFIX (default: <public-ip-dashed>.sslip.io),
#      DEVNET=1 (or DEVNET=1 in env/compose.env) adds the public anvil devnet (see deploy/README.md).
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"

PULL=1 BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) c_err "unknown option: $arg"; exit 2 ;;
  esac
done

command -v docker >/dev/null || { c_err "docker not installed: run deploy/bootstrap-ec2.sh first"; exit 1; }
docker compose version >/dev/null 2>&1 || { c_err "docker compose plugin missing: run deploy/bootstrap-ec2.sh"; exit 1; }

# ---------------------------------------------------------------------------------------------- 1. code
if [[ $PULL == 1 ]]; then
  if [[ -d "$REPO_DIR/.git" ]]; then
    branch="${BRANCH:-$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)}"
    c_info "git pull ($branch)"
    git -C "$REPO_DIR" fetch --prune origin
    git -C "$REPO_DIR" checkout "$branch"
    git -C "$REPO_DIR" pull --ff-only origin "$branch"
    git -C "$REPO_DIR" submodule update --init --recursive
  else
    c_warn "$REPO_DIR is not a git checkout; skipping pull"
  fi
fi

# ---------------------------------------------------------------------------------------------- 2. env files
umask 077
mkdir -p "$ENV_DIR"
if [[ ! -f "$COMPOSE_ENV" ]]; then
  cp "$ENV_DIR/compose.env.example" "$COMPOSE_ENV"
  c_warn "created $COMPOSE_ENV from the template (all integrations in mock mode until you edit it)"
fi
if [[ ! -f "$ENV_DIR/demo-portal.env" ]]; then
  # The only secret we can safely generate on the box. Never printed.
  sed "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')|" \
    "$ENV_DIR/demo-portal.env.example" > "$ENV_DIR/demo-portal.env"
  c_ok "created demo-portal.env with a freshly generated SESSION_SECRET"
fi
[[ -f "$ENV_DIR/issuer.env" ]] || cp "$ENV_DIR/issuer.env.example" "$ENV_DIR/issuer.env"
chmod 600 "$ENV_DIR"/*.env 2>/dev/null || true

missing=0
require_keys() { # file key...
  local file="$ENV_DIR/$1"; shift
  if [[ ! -f "$file" ]]; then
    c_err "missing $file (see deploy/secrets-howto.md: scp it from your laptop or paste it with nano)"
    missing=1; return
  fi
  local k
  for k in "$@"; do
    [[ -n "$(env_val "$file" "$k")" ]] || { c_err "$(basename "$file"): $k is empty"; missing=1; }
  done
}
require_keys agents.env RPC_URL CHAIN_ID LLM_PROVIDER OFFER_SIGNER_PRIVATE_KEY RISK_MANAGER_PRIVATE_KEY \
  RELAYER_PRIVATE_KEY PAYER_HASH_KEY
require_keys demo-portal.env SESSION_SECRET
# The merchant UI (app/) is built by the frontend team; it is optional until it lands in the repo.
HAS_APP=0; [[ -f "$REPO_DIR/apps/web/Dockerfile" ]] && HAS_APP=1
[[ $HAS_APP == 1 && ! -f "$ENV_DIR/app.env" ]] && c_info "app.env not found: apps/web runs on its build-time NEXT_PUBLIC_* values (fine)"
# Public devnet: its own env file with the PUBLIC anvil keys (created from the template on first use).
DEVNET_ON=0; devnet_enabled && DEVNET_ON=1
if [[ $DEVNET_ON == 1 ]]; then
  ddev="$ENV_DIR/agents-devnet.env"
  if [[ ! -f "$ddev" ]]; then
    cp "$ENV_DIR/agents-devnet.env.example" "$ddev"
    for k in PAYER_HASH_KEY BUSINESS_PEPPER AGENT_KEY_ENCRYPTION_KEY; do
      tmp="$(mktemp "$ddev.XXXXXX")"
      sed "s|^$k=.*|$k=$(openssl rand -hex 32)|" "$ddev" > "$tmp" && mv "$tmp" "$ddev"
    done
    # Only the LLM settings travel over from the Sepolia env file; never its keys. merge-secrets prints lengths only.
    "$DEPLOY_DIR/merge-secrets.sh" "$ENV_DIR/agents.env" "$ddev" LLM_PROVIDER ANTHROPIC_API_KEY BEDROCK_API_KEY \
      BEDROCK_REGION BEDROCK_UNDERWRITER_MODEL BEDROCK_CRITIC_MODEL BEDROCK_RISK_MODEL ANTHROPIC_MODEL 2>/dev/null || true
    chmod 600 "$ddev"
    c_ok "created agents-devnet.env (public anvil keys + fresh random HMAC/pepper/encryption keys)"
  fi
  require_keys agents-devnet.env OFFER_SIGNER_PRIVATE_KEY RISK_MANAGER_PRIVATE_KEY RELAYER_PRIVATE_KEY PAYER_HASH_KEY
  # Never reuse a Sepolia key on the public devnet (compared here, never printed).
  for k in OFFER_SIGNER_PRIVATE_KEY RISK_MANAGER_PRIVATE_KEY RELAYER_PRIVATE_KEY ISSUER_PRIVATE_KEY \
           ATTESTER_PRIVATE_KEY PAYER_HASH_KEY BUSINESS_PEPPER AGENT_KEY_ENCRYPTION_KEY; do
    a="$(env_val "$ddev" "$k")"; b="$(env_val "$ENV_DIR/agents.env" "$k")"
    if [[ -n "$a" && "$a" == "$b" ]]; then
      c_err "agents-devnet.env: $k equals the one in agents.env (Sepolia). Use the devnet template value."; missing=1
    fi
  done
  if [[ ! -f "$REPO_DIR/contracts/lib/forge-std/src/Test.sol" ]]; then
    c_err "contracts/lib submodules missing (the devnet image compiles the contracts): git submodule update --init --recursive"
    missing=1
  fi
fi
[[ $missing == 0 ]] || { c_err "fix the env files above, then re-run"; exit 1; }

# Empty optional lines would override code defaults with "" (warn, don't fail).
env_files=("$ENV_DIR"/agents.env); [[ $HAS_APP == 1 ]] && env_files+=("$ENV_DIR"/app.env)
[[ $DEVNET_ON == 1 ]] && env_files+=("$ENV_DIR"/agents-devnet.env)
for f in "${env_files[@]}"; do
  empties="$(grep -E '^[A-Z][A-Z0-9_]*=[[:space:]]*(#.*)?$' "$f" | cut -d= -f1 | tr '\n' ' ' || true)"
  [[ -z "$empties" ]] || c_warn "$(basename "$f") has empty values (passed as \"\"; comment them out if unused): $empties"
done
case "$(env_val "$ENV_DIR/agents.env" LLM_PROVIDER)" in
  anthropic) [[ -n "$(env_val "$ENV_DIR/agents.env" ANTHROPIC_API_KEY)" ]] || c_warn "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty" ;;
  bedrock*)  [[ -n "$(env_val "$ENV_DIR/agents.env" BEDROCK_API_KEY)" ]] || c_warn "LLM_PROVIDER=bedrock* but BEDROCK_API_KEY is empty" ;;
esac

deployments_name="$(env_val "$COMPOSE_ENV" DEPLOYMENTS_NAME)"; deployments_name="${deployments_name:-sepolia}"
if [[ ! -f "$REPO_DIR/agents/deployments/$deployments_name.json" ]]; then
  c_err "agents/deployments/$deployments_name.json not found (contract addresses). Commit it, or scp it to the box."
  exit 1
fi

resolve_host_suffix
c_ok "HOST_SUFFIX=$HOST_SUFFIX"

# ---------------------------------------------------------------------------------------------- 3. build + up
services=(agents-api agents-worker demo-portal)
if [[ $HAS_APP == 1 ]]; then services+=(app); else c_warn "apps/web/Dockerfile not found: skipping the merchant UI (https://app.$HOST_SUFFIX will return 502)"; fi
if [[ -f "$REPO_DIR/issuer/Dockerfile" ]]; then
  services+=(issuer)
else
  c_warn "issuer/Dockerfile not found: skipping the issuer (https://issuer.$HOST_SUFFIX will return 502)"
fi

if [[ $DEVNET_ON == 1 ]]; then
  # anvil + one-shot deployer + public RPC gateway + a second agents API (reuses the agents image).
  services+=(anvil devnet-deployer rpc-proxy agents-api-devnet)
fi

if [[ $BUILD == 1 ]]; then
  # One at a time: two parallel `next build`s can exhaust RAM on a 4 GB box.
  for s in agents-api app demo-portal issuer devnet-deployer; do
    [[ " ${services[*]} " == *" $s "* ]] || continue
    c_info "build $s"
    dc build "$s"
  done
fi
c_info "pull caddy"
dc pull --quiet caddy
if [[ $DEVNET_ON == 1 ]]; then c_info "pull anvil (foundry)"; dc pull --quiet anvil; fi
c_info "up -d"
[[ $DEVNET_ON == 1 ]] && c_info "devnet: the first boot deploys + seeds the chain (1-5 min); later boots are instant"
if ! dc up -d --remove-orphans "${services[@]}" caddy; then
  c_err "compose up failed. Devnet deployer? ./deploy/logs.sh devnet-deployer (fresh chain: ./deploy/devnet.sh reset --hard)"
  exit 1
fi

# ---------------------------------------------------------------------------------------------- 4. health
c_info "waiting for container health checks (max 4 min)"
deadline=$((SECONDS + 240))
while :; do
  bad="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' | awk '$2!="running" || ($3!="" && $3!="healthy")' || true)"
  [[ -z "$bad" ]] && break
  if (( SECONDS > deadline )); then
    c_err "not healthy yet:"; echo "$bad" >&2
    c_err "inspect with: ./deploy/logs.sh <service>"
    break
  fi
  sleep 5
done
dc ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}'

c_info "public HTTPS checks (first run waits for certificates)"
check() { # name url
  local i code
  for i in $(seq 1 24); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$2" || true)"
    if [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]; then c_ok "$1 $2 -> $code"; return 0; fi
    sleep 5
  done
  c_warn "$1 $2 -> ${code:-no response} (cert still issuing? check ./deploy/logs.sh caddy)"
  return 1
}
fail=0
check "api   " "https://api.$HOST_SUFFIX/health" || fail=1
check "portal" "https://portal.$HOST_SUFFIX/api/health" || fail=1
[[ $HAS_APP == 1 ]] && { check "app   " "https://app.$HOST_SUFFIX/" || fail=1; }
if [[ $DEVNET_ON == 1 ]]; then
  check "rpc   " "https://rpc.$HOST_SUFFIX/health" || fail=1
  check "api-devnet" "https://api-devnet.$HOST_SUFFIX/health" || fail=1
  # Security self-test of the public RPC: a standard call must work, an admin call must be refused.
  rpc_post() { curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "$1" "https://rpc.$HOST_SUFFIX/" || true; }
  if [[ "$(rpc_post '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}')" == *'"0x7a69"'* ]]; then
    c_ok "rpc    eth_chainId -> 31337"
  else c_warn "rpc    eth_chainId did not return 31337"; fail=1; fi
  if [[ "$(rpc_post '{"jsonrpc":"2.0","id":1,"method":"anvil_setBalance","params":["0x0000000000000000000000000000000000000001","0x1"]}')" == *'-32601'* ]]; then
    c_ok "rpc    anvil_setBalance refused (admin methods are not public)"
  else
    c_err "rpc    anvil_setBalance was NOT refused: stop it (./deploy/compose.sh stop rpc-proxy) and investigate"; fail=1
  fi
fi
if [[ " ${services[*]} " == *" issuer "* ]]; then
  issuer_health="$(env_val "$COMPOSE_ENV" ISSUER_HEALTH_PATH)"
  check "issuer" "https://issuer.$HOST_SUFFIX${issuer_health:-/health}" || fail=1
fi

cat <<EOF

Public URLs
  Merchant app : https://app.$HOST_SUFFIX
  Agents API   : https://api.$HOST_SUFFIX   (health: /health, risk: /risk/status)
  Demo portal  : https://portal.$HOST_SUFFIX   (Reclaim login URL: /login, request URL: /api/me/summary)
  Issuer       : https://issuer.$HOST_SUFFIX
EOF
if [[ $DEVNET_ON == 1 ]]; then
  cat <<EOF
  Devnet RPC   : https://rpc.$HOST_SUFFIX   (chain 31337; contracts: /devnet.json; standard eth_* only)
  Devnet API   : https://api-devnet.$HOST_SUFFIX   (health: /health, risk: /risk/status)
  Default scene: ./deploy/devnet.sh scene   (dry run; add --execute)
EOF
fi
cat <<EOF

Logs: ./deploy/logs.sh [service]     Status: ./deploy/compose.sh ps
EOF
exit $fail
