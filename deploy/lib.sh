# Shared helpers for deploy/*.sh. Source it; do not run it.
# shellcheck shell=bash

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_DIR="$DEPLOY_DIR/env"
COMPOSE_ENV="$ENV_DIR/compose.env"

c_info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
c_ok()   { printf '\033[1;32m ok\033[0m %s\n' "$*"; }
c_warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
c_err()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; }

# Value of KEY in an env file (last assignment wins), inline " # comment" and surrounding spaces stripped.
# Prints the value; callers must never echo secret values, only test them.
env_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$file" | tail -n 1 | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# Public IPv4 of this EC2 instance (IMDSv2), falling back to an external echo service.
public_ip() {
  local token ip
  token="$(curl -sf -m 2 -X PUT http://169.254.169.254/latest/api/token \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)"
  if [[ -n "$token" ]]; then
    ip="$(curl -sf -m 2 -H "X-aws-ec2-metadata-token: $token" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  [[ -n "${ip:-}" ]] || ip="$(curl -sf -m 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
  printf '%s' "${ip:-}"
}

# Export HOST_SUFFIX: shell env > compose.env > <public-ip-dashed>.sslip.io
resolve_host_suffix() {
  if [[ -z "${HOST_SUFFIX:-}" ]]; then
    HOST_SUFFIX="$(env_val "$COMPOSE_ENV" HOST_SUFFIX)"
  fi
  if [[ -z "${HOST_SUFFIX:-}" ]]; then
    local ip; ip="$(public_ip)"
    if [[ -z "$ip" ]]; then
      c_err "Could not detect the public IP. Set HOST_SUFFIX in $COMPOSE_ENV (e.g. 13-233-45-67.sslip.io)."
      return 1
    fi
    HOST_SUFFIX="${ip//./-}.sslip.io"
  fi
  export HOST_SUFFIX
}

dc() {
  local envfile=()
  [[ -f "$COMPOSE_ENV" ]] && envfile=(--env-file "$COMPOSE_ENV")
  # ${arr[@]+...} keeps macOS bash 3.2 happy with an empty array under set -u
  docker compose -f "$DEPLOY_DIR/docker-compose.yml" ${COMPOSE_EXTRA_FILES:-} ${envfile[@]+"${envfile[@]}"} "$@"
}
