# Shared helpers for scripts/dev-*.sh (local dev stack, docs/LOCAL.md). Source it; do not run it.
# Works with macOS's bash 3.2: no associative arrays, no ${var,,}, no mapfile.
# Never prints secret values: generated secrets go straight into git-ignored files with mode 600.
# shellcheck shell=bash

DEV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEV_LIB_DIR/../.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"
ENV_DIR="$DEPLOY_DIR/env"

# The dev stack: its own compose project, so its volumes never touch an EC2-style "mra" project on the same box.
export COMPOSE_PROJECT_NAME=mra-dev
export COMPOSE_PROFILES=devnet,ui
export HOST_SUFFIX="${HOST_SUFFIX:-localhost}" # docker-compose.yml requires it for Caddy (which stays off here)

if [[ -t 1 ]]; then
  c_info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
  c_ok()   { printf '\033[1;32m ok\033[0m %s\n' "$*"; }
  c_warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
  c_err()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; }
else
  c_info() { printf '==> %s\n' "$*"; }
  c_ok()   { printf ' ok %s\n' "$*"; }
  c_warn() { printf ' !! %s\n' "$*" >&2; }
  c_err()  { printf 'ERR %s\n' "$*" >&2; }
fi

have() { command -v "$1" >/dev/null 2>&1; }

# docker compose on the dev stack (base file + dev overlay).
dc() {
  docker compose -f "$DEPLOY_DIR/docker-compose.yml" -f "$DEPLOY_DIR/docker-compose.dev.yml" "$@"
}

# Run a command with a time limit, without GNU `timeout` (not on macOS by default). Returns 124 on timeout.
run_with_timeout() {
  local secs="$1"; shift
  "$@" &
  local pid=$! i=0
  while kill -0 "$pid" 2>/dev/null; do
    if [[ $i -ge $((secs * 5)) ]]; then
      kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
      return 124
    fi
    sleep 0.2; i=$((i + 1))
  done
  wait "$pid"
}

# ------------------------------------------------------------------------------------------------ secrets
# 32 random bytes as 64 hex chars (no 0x).
rand_hex() {
  if have openssl; then openssl rand -hex 32
  elif have python3; then python3 -c 'import secrets; print(secrets.token_hex(32))'
  else od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; echo
  fi
}

# About 64 URL-safe random chars (for SESSION_SECRET, which needs 32+).
rand_b64() {
  if have openssl; then openssl rand -base64 48 | tr -d '\n/+='; echo
  elif have python3; then python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
  else od -An -tx1 -N48 /dev/urandom | tr -d ' \n'; echo
  fi
}

# Value of KEY in an env file (last assignment wins; inline " # comment" and quotes stripped). Callers must never
# print secret values, only compare or test them.
env_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$file" | tail -n 1 | tr -d '\r' \
    | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# fill_template SRC DST KEY... : copy SRC to DST (mode 600), setting each listed KEY that is empty in SRC to the
# value of the environment variable FILL_<KEY>. Never overwrites DST. Values travel through the environment, not argv.
fill_template() {
  local src="$1" dst="$2"; shift 2
  if [[ -f "$dst" ]]; then
    c_ok "kept existing ${dst#"$REPO_DIR"/}"
    return 0
  fi
  [[ -f "$src" ]] || { c_err "template missing: ${src#"$REPO_DIR"/}"; return 1; }
  local keys="$*" tmp
  tmp="$(mktemp "${dst}.XXXXXX")"
  chmod 600 "$tmp"
  FILL_KEYS="$keys" awk '
    BEGIN { n = split(ENVIRON["FILL_KEYS"], ks, " ") }
    {
      line = $0; sub(/\r$/, "", line)
      for (i = 1; i <= n; i++) {
        if (line == ks[i] "=") { line = ks[i] "=" ENVIRON["FILL_" ks[i]]; break }
      }
      print line
    }' "$src" > "$tmp"
  mv "$tmp" "$dst"
  c_ok "created ${dst#"$REPO_DIR"/}${keys:+ (generated: $keys)}"
}

# write_new DST : write stdin to DST (mode 600) only if DST does not exist yet.
write_new() {
  local dst="$1" tmp
  if [[ -f "$dst" ]]; then
    c_ok "kept existing ${dst#"$REPO_DIR"/}"
    cat >/dev/null
    return 0
  fi
  tmp="$(mktemp "${dst}.XXXXXX")"
  chmod 600 "$tmp"
  cat > "$tmp"
  mv "$tmp" "$dst"
  c_ok "created ${dst#"$REPO_DIR"/}"
}

# Refuse to run the devnet with anything but the public anvil keys from the template.
check_public_keys() {
  local file="$1" template="$2" k bad=0
  [[ -f "$file" ]] || return 0
  for k in $(sed -n 's/^\([A-Z_]*_PRIVATE_KEY\)=0x.*/\1/p' "$template"); do
    if [[ -n "$(env_val "$file" "$k")" && "$(env_val "$file" "$k")" != "$(env_val "$template" "$k")" ]]; then
      c_err "${file#"$REPO_DIR"/}: $k is not the public anvil key from ${template#"$REPO_DIR"/}."
      bad=1
    fi
  done
  if [[ $bad == 1 ]]; then
    c_err "The local devnet only runs with anvil's public keys. Fix those lines (copy them from the template) and retry."
    return 1
  fi
}

# --------------------------------------------------------------------------------------------- env files
# Path A (Docker): deploy/env/{agents-devnet,issuer-devnet,demo-portal}.env
ensure_docker_env() {
  local pepper
  pepper="$(env_val "$ENV_DIR/agents-devnet.env" BUSINESS_PEPPER)"
  [[ -n "$pepper" ]] || pepper="$(env_val "$ENV_DIR/issuer-devnet.env" ISSUER_PEPPER)"
  [[ -n "$pepper" ]] || pepper="$(rand_hex)"
  FILL_PAYER_HASH_KEY="$(rand_hex)" FILL_BUSINESS_PEPPER="$pepper" FILL_AGENT_KEY_ENCRYPTION_KEY="$(rand_hex)" \
    fill_template "$ENV_DIR/agents-devnet.env.example" "$ENV_DIR/agents-devnet.env" \
      PAYER_HASH_KEY BUSINESS_PEPPER AGENT_KEY_ENCRYPTION_KEY
  FILL_ISSUER_PEPPER="$pepper" \
    fill_template "$ENV_DIR/issuer-devnet.env.example" "$ENV_DIR/issuer-devnet.env" ISSUER_PEPPER
  FILL_SESSION_SECRET="$(rand_b64)" \
    fill_template "$ENV_DIR/demo-portal.env.example" "$ENV_DIR/demo-portal.env" SESSION_SECRET
  check_public_keys "$ENV_DIR/agents-devnet.env" "$ENV_DIR/agents-devnet.env.example"
  check_public_keys "$ENV_DIR/issuer-devnet.env" "$ENV_DIR/issuer-devnet.env.example"
}

# Path B (native): agents/.env.devnet.local, issuer/.env, apps/web/.env.local, demo/portal/.env.local
DEV_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002"
ANVIL_KEY_4=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a # public anvil account 4

ensure_native_env() {
  local pepper
  pepper="$(env_val "$REPO_DIR/agents/.env.devnet.local" BUSINESS_PEPPER)"
  [[ -n "$pepper" ]] || pepper="$(env_val "$REPO_DIR/issuer/.env" ISSUER_PEPPER)"
  [[ -n "$pepper" ]] || pepper="$(rand_hex)"
  write_new "$REPO_DIR/agents/.env.devnet.local" <<EOF
# agents/.env.devnet.local: native agents API/worker on the local devnet (docs/LOCAL.md, Path B). Git-ignored.
# Load it AFTER .env.devnet (which agents/scripts/devnet.sh rewrites on every run):
#   set -a; . ./.env.devnet; . ./.env.devnet.local; set +a
# Generated once by scripts/dev-up.sh --native-env. Keep it: the encryption key protects agent keys in the DB.
CORS_ALLOW_ORIGINS=$DEV_ORIGINS
DEMO_FAUCET=1
WORLD_MOCK=1
AGENT_KEY_ENCRYPTION_KEY=$(rand_hex)
BUSINESS_PEPPER=$pepper
EOF
  write_new "$REPO_DIR/issuer/.env" <<EOF
# issuer/.env: Business Pass issuer on the LOCAL devnet (docs/LOCAL.md, Path B). Git-ignored.
# REGISTRY_ADDRESS is read from agents/deployments/local.json when you start it (see docs/LOCAL.md).
# The key is anvil's PUBLIC account 4 (the devnet issuer). Never put a real key here for local work.
ISSUER_MOCK=1
ISSUER_PRIVATE_KEY=$ANVIL_KEY_4
ISSUER_PEPPER=$pepper
CHAIN_ID=31337
CORS_ALLOW_ORIGINS=$DEV_ORIGINS
PORT=8787
EOF
  write_new "$REPO_DIR/apps/web/.env.local" <<EOF
# apps/web/.env.local: native web app against the local devnet (docs/LOCAL.md, Path B). Git-ignored.
# NEXT_PUBLIC_MRA_DEPLOYMENT (the devnet's contract addresses) is passed on the command line when you start it.
# Set NEXT_PUBLIC_MRA_MODE=mock for the UI-only mode.
NEXT_PUBLIC_MRA_MODE=local
NEXT_PUBLIC_ANON_RPC=0
EOF
  write_new "$REPO_DIR/demo/portal/.env.local" <<EOF
# demo/portal/.env.local: demo seller portal (docs/LOCAL.md). Git-ignored.
SESSION_SECRET=$(rand_b64)
EOF
}
