#!/usr/bin/env bash
# One-time (idempotent) host setup for Amazon Linux 2023 or Ubuntu 24.04. Run as the login user
# (ec2-user / ubuntu), NOT as root; it uses sudo where needed. Safe to re-run.
#
#   scp -i key.pem deploy/bootstrap-ec2.sh ec2-user@<ip>:
#   ssh -i key.pem ec2-user@<ip> 'REPO_URL=git@github.com:<org>/ethglobal-mumbai.git BRANCH=main bash bootstrap-ec2.sh'
#
# Env:
#   REPO_URL   git URL to clone (required the first time; ignored if DEST is already a checkout)
#   BRANCH     branch to check out (default: main)
#   DEST       checkout directory (default: ~/ethglobal-mumbai)
#   SWAP_GB    swap size when RAM < 4 GB (default: 2)
#
# Network: this script opens nothing. Inbound access is controlled by the EC2 security group, which must
# allow only 22 (your IP), 80 and 443 (anywhere). See deploy/README.md. Docker publishes only Caddy's 80/443.
set -euo pipefail

BRANCH="${BRANCH:-main}"
DEST="${DEST:-$HOME/ethglobal-mumbai}"
SWAP_GB="${SWAP_GB:-2}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ok\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "run as your login user (ec2-user/ubuntu), not root; the script calls sudo itself"
[[ -r /etc/os-release ]] || die "cannot detect the OS"
# shellcheck disable=SC1091
. /etc/os-release
ARCH="$(uname -m)" # x86_64 | aarch64

# ------------------------------------------------------------------------------------------- Docker
install_docker_al2023() {
  info "Amazon Linux 2023: docker + git"
  sudo dnf install -y docker git tar gzip >/dev/null
  # AL2023 does not package the compose/buildx plugins: install the official static binaries.
  local plugdir=/usr/local/lib/docker/cli-plugins
  sudo mkdir -p "$plugdir"
  if ! docker compose version >/dev/null 2>&1; then
    info "installing docker compose plugin (latest release)"
    sudo curl -fsSL -o "$plugdir/docker-compose" \
      "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$ARCH"
    sudo chmod +x "$plugdir/docker-compose"
  fi
  if ! docker buildx version >/dev/null 2>&1; then
    info "installing docker buildx plugin (latest release)"
    local tag barch
    tag="$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
    [[ -n "$tag" ]] || die "could not look up the latest buildx release"
    barch="$([[ $ARCH == aarch64 ]] && echo arm64 || echo amd64)"
    sudo curl -fsSL -o "$plugdir/docker-buildx" \
      "https://github.com/docker/buildx/releases/download/$tag/buildx-$tag.linux-$barch"
    sudo chmod +x "$plugdir/docker-buildx"
  fi
}

install_docker_ubuntu() {
  if ! dpkg -s docker-ce docker-compose-plugin docker-buildx-plugin >/dev/null 2>&1; then
    info "Ubuntu: Docker CE from the official apt repo"
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git >/dev/null
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  fi
}

case "${ID:-}" in
  amzn)   install_docker_al2023 ;;
  ubuntu) install_docker_ubuntu ;;
  *)      die "unsupported OS '${ID:-?}': use Amazon Linux 2023 or Ubuntu 24.04" ;;
esac
sudo systemctl enable --now docker >/dev/null
if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  sudo usermod -aG docker "$USER"
  NEED_RELOGIN=1
fi
ok "$(sudo docker --version)"
ok "$(sudo docker compose version)"

# Rotate container logs host-wide too (compose also sets per-service limits).
if [[ ! -f /etc/docker/daemon.json ]]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi

# ------------------------------------------------------------------------------------------- swap
mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
if (( mem_kb < 4 * 1024 * 1024 )); then
  if swapon --show=NAME --noheadings | grep -qx /swapfile; then
    ok "swap /swapfile already active"
  else
    info "RAM $((mem_kb / 1024)) MB < 4 GB: creating ${SWAP_GB} GB /swapfile"
    [[ -f /swapfile ]] || sudo fallocate -l "${SWAP_GB}G" /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
    sudo sysctl -q -p /etc/sysctl.d/99-swappiness.conf
    ok "swap on"
  fi
else
  ok "RAM $((mem_kb / 1024)) MB: no swap needed"
fi

# ------------------------------------------------------------------------------------------- host firewall
# The security group is the real firewall. If ufw happens to be active, make sure it does not block us.
# (Docker-published ports bypass ufw anyway, and only Caddy publishes 80/443.)
if command -v ufw >/dev/null && sudo ufw status | grep -q '^Status: active'; then
  sudo ufw allow 22/tcp >/dev/null; sudo ufw allow 80/tcp >/dev/null; sudo ufw allow 443/tcp >/dev/null; sudo ufw allow 443/udp >/dev/null
  ok "ufw: 22, 80, 443 allowed"
fi

# ------------------------------------------------------------------------------------------- code
if [[ -d "$DEST/.git" ]]; then
  info "updating $DEST ($BRANCH)"
  git -C "$DEST" fetch --prune origin
  git -C "$DEST" checkout "$BRANCH"
  git -C "$DEST" pull --ff-only origin "$BRANCH"
else
  [[ -n "${REPO_URL:-}" ]] || die "REPO_URL is not set and $DEST is not a checkout. For a private repo, add a read-only deploy key first (see deploy/README.md)."
  info "cloning $REPO_URL ($BRANCH) into $DEST"
  git clone --branch "$BRANCH" --recurse-submodules "$REPO_URL" "$DEST"
fi
git -C "$DEST" submodule update --init --recursive
ok "code at $(git -C "$DEST" rev-parse --short HEAD) on $BRANCH"

mkdir -p "$DEST/deploy/env"
chmod 700 "$DEST/deploy/env"

# ------------------------------------------------------------------------------------------- next steps
token="$(curl -sf -m 2 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)"
ip="$(curl -sf -m 2 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
ip="${ip:-<public-ip>}"
cat <<EOF

Bootstrap done. Next steps:
${NEED_RELOGIN:+
  0. Log out and back in (or run: newgrp docker) so your user can run docker without sudo.
}
  1. From your LAPTOP, copy the env files (never commit them):
       scp -i <key.pem> deploy/env/{compose,agents,app,demo-portal,issuer}.env $USER@$ip:$DEST/deploy/env/
     or create them here:  cd $DEST/deploy/env && cp agents.env.example agents.env && nano agents.env
     (demo-portal.env is generated automatically with a random SESSION_SECRET if you skip it)
  2. Make sure agents/deployments/<DEPLOYMENTS_NAME>.json (default sepolia.json) exists in the checkout.
  3. Deploy:   $DEST/deploy/deploy.sh
  4. Open:     https://app.${ip//./-}.sslip.io  (attach an Elastic IP first, or the hostnames change on stop/start)
EOF
