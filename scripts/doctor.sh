#!/usr/bin/env bash
# Check the local toolchain against the versions DripMoni pins (docs/LOCAL.md). macOS, Linux and WSL2.
# Read-only: it installs nothing, needs no sudo, and only prints versions, paths and fix hints.
#
#   scripts/doctor.sh          everything (Path A: Docker, Path B: native)
#   scripts/doctor.sh --strict exit 1 if a REQUIRED tool is missing or off-version (for CI)
#
# Pins: Node >= 24 (package.json engines says >= 26.13; 24 works in practice), pnpm 12.16.1, uv + Python 3.12,
# Foundry v1.2.2, Noir (nargo) 1.0.0-rc.3, bb 6.0.0, Docker Compose >= 2.24.
set -uo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STRICT=0; [[ "${1:-}" == --strict ]] && STRICT=1

OS="$(uname -s)"
case "$OS" in
  Darwin) PLAT=mac ;;
  Linux) if grep -qi microsoft /proc/version 2>/dev/null; then PLAT=wsl; else PLAT=linux; fi ;;
  *) PLAT=other ;;
esac

if [[ -t 1 ]]; then G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' B=$'\033[1m' N=$'\033[0m'; else G='' Y='' R='' B='' N=''; fi
FAIL=0 WARN=0

# Installers often put tools in these dirs without updating PATH for the current shell.
EXTRA_PATHS="$HOME/.foundry/bin:$HOME/.nargo/bin:$HOME/.bb:$HOME/.local/bin:$HOME/.cargo/bin"

find_tool() { # prints the path of $1 on PATH, else in EXTRA_PATHS
  local p; p="$(command -v "$1" 2>/dev/null)" && { echo "$p"; return 0; }
  PATH="$EXTRA_PATHS" command -v "$1" 2>/dev/null
}

# version_ge A B : true if dotted version A >= B (numeric parts only; "1.0.0-rc.3" compares as 1.0.0)
version_ge() {
  local a b i x y
  IFS=. read -r -a a <<<"$(printf '%s' "$1" | sed 's/[^0-9.].*$//')"
  IFS=. read -r -a b <<<"$(printf '%s' "$2" | sed 's/[^0-9.].*$//')"
  for i in 0 1 2; do
    x="${a[$i]:-0}"; y="${b[$i]:-0}"
    [[ "$x" -gt "$y" ]] && return 0
    [[ "$x" -lt "$y" ]] && return 1
  done
  return 0
}

row() { # status name found want hint
  local st="$1" name="$2" found="$3" want="$4" hint="$5" color
  case "$st" in ok) color="$G" ;; warn) color="$Y"; WARN=$((WARN + 1)) ;; *) color="$R"; FAIL=$((FAIL + 1)) ;; esac
  printf '%s%-5s%s %-14s %-28s %-22s\n' "$color" "$st" "$N" "$name" "${found:0:28}" "$want"
  [[ "$st" == ok || -z "$hint" ]] || printf '      %sfix:%s %s\n' "$B" "$N" "$hint"
}

tilde() { case "$1" in "$HOME"/*) echo "~/${1#"$HOME"/}" ;; *) echo "$1" ;; esac; }

hint() { # mac-hint linux-hint
  case "$PLAT" in mac) echo "$1" ;; *) echo "$2" ;; esac
}

echo "${B}DripMoni doctor${N}  ($OS / $PLAT, repo $REPO_DIR)"
echo
printf '%-5s %-14s %-28s %-22s\n' "" "tool" "found" "wanted"

# ------------------------------------------------------------------------------------------------ both paths
p="$(find_tool git)"; if [[ -n "$p" ]]; then row ok git "$(git --version | awk '{print $3}')" any ""
else row FAIL git "missing" any "$(hint 'xcode-select --install  (or brew install git)' 'sudo apt install git')"; fi

if [[ -n "$p" && "$PLAT" == wsl ]]; then
  ac="$(git config --get core.autocrlf 2>/dev/null || true)"
  [[ "$ac" == true ]] && row warn "git autocrlf" "true" "input or false" \
    "git config --global core.autocrlf input   (the repo's .gitattributes keeps *.sh LF either way)"
fi

# ------------------------------------------------------------------------------------------------ Path A
echo; echo "${B}Path A (Docker)${N}"
p="$(find_tool docker)"
if [[ -z "$p" ]]; then
  row FAIL docker missing "Docker Desktop / Engine" "$(hint 'brew install --cask docker  (then open Docker.app)' 'https://docs.docker.com/engine/install/  (WSL2: install Docker Desktop on Windows, enable WSL integration)')"
else
  row ok docker "$(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//')" any ""
  cv="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
  if [[ -z "$cv" ]]; then row FAIL "compose" missing ">= 2.24" "update Docker Desktop, or install docker-compose-plugin"
  elif version_ge "$cv" 2.24; then row ok compose "$cv" ">= 2.24" ""
  else row FAIL compose "$cv" ">= 2.24" "update Docker Desktop / docker-compose-plugin"; fi
  # docker info can hang when the daemon is wedged (e.g. its disk image is full): give it 15 s.
  ( docker info --format '{{.ServerVersion}} {{.MemTotal}} {{.Architecture}}' > "${TMPDIR:-/tmp}/mra-doctor.$$" 2>/dev/null ) &
  pid=$! i=0
  while kill -0 "$pid" 2>/dev/null && [[ $i -lt 75 ]]; do sleep 0.2; i=$((i + 1)); done
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    row FAIL "daemon" "no answer in 15 s" running "restart Docker Desktop; if it keeps hanging, check its disk image is not full"
  elif [[ -s "${TMPDIR:-/tmp}/mra-doctor.$$" ]]; then
    read -r sv mem arch < "${TMPDIR:-/tmp}/mra-doctor.$$"
    row ok daemon "$sv ($arch)" running ""
    if [[ "$mem" =~ ^[0-9]+$ ]]; then
      gb=$((mem / 1073741824))
      if [[ $gb -ge 6 ]]; then row ok "docker memory" "${gb} GB" ">= 6 GB" ""
      else row warn "docker memory" "${gb} GB" ">= 6 GB" "$(hint 'Docker Desktop > Settings > Resources > Memory' 'Windows: memory=8GB under [wsl2] in %UserProfile%\.wslconfig, then wsl --shutdown')"; fi
    fi
  else
    row FAIL daemon "not running" running "$(hint 'open -a Docker' 'start Docker Desktop (WSL integration on), or: sudo systemctl start docker')"
  fi
  rm -f "${TMPDIR:-/tmp}/mra-doctor.$$"
fi
free_kb="$(df -Pk "$REPO_DIR" 2>/dev/null | awk 'NR==2 {print $4}')"
if [[ "$free_kb" =~ ^[0-9]+$ ]]; then
  gb=$((free_kb / 1048576))
  if [[ $gb -ge 15 ]]; then row ok "disk free" "${gb} GB" ">= 15 GB (A), 5 (B)" ""
  elif [[ $gb -ge 5 ]]; then row warn "disk free" "${gb} GB" ">= 15 GB (A), 5 (B)" "the Docker images need about 10 GB: use Path B, or docker system prune"
  else row FAIL "disk free" "${gb} GB" ">= 15 GB (A), 5 (B)" "free disk space first (docker system prune, old node_modules)"; fi
fi

# ------------------------------------------------------------------------------------------------ Path B
echo; echo "${B}Path B (native)${N}"
p="$(find_tool node)"
if [[ -z "$p" ]]; then row FAIL node missing ">= 24 (pin: >= 26.13)" "$(hint 'brew install node@24  (or fnm/nvm: nvm install 24)' 'curl -fsSL https://fnm.vercel.app/install | bash && fnm install 24')"
else
  nv="$("$p" --version | sed 's/^v//')"
  if version_ge "$nv" 26.13; then row ok node "$nv" ">= 24 (pin: >= 26.13)" ""
  elif version_ge "$nv" 24; then row ok node "$nv (engines wants 26.13)" ">= 24 (pin: >= 26.13)" ""
  else row FAIL node "$nv" ">= 24 (pin: >= 26.13)" "$(hint 'brew install node@24 && brew link --overwrite node@24  (or nvm use 24)' 'fnm install 24 && fnm use 24  (or nvm install 24)')"; fi
fi
p="$(find_tool pnpm)"
if [[ -z "$p" ]]; then row FAIL pnpm missing 12.16.1 "corepack enable && corepack prepare pnpm@12.16.1 --activate   (or: npm i -g pnpm@12.16.1)"
else
  pv="$("$p" --version 2>/dev/null | tail -n 1)"
  if [[ "$pv" == 12.16.1 ]]; then row ok pnpm "$pv" 12.16.1 ""
  else row warn pnpm "$pv" 12.16.1 "corepack enable && corepack prepare pnpm@12.16.1 --activate   (in the repo, corepack picks the pin from packageManager)"; fi
fi
p="$(find_tool uv)"
if [[ -z "$p" ]]; then row FAIL uv missing "any (+ Python 3.12)" "$(hint 'brew install uv' 'curl -LsSf https://astral.sh/uv/install.sh | sh')"
else
  row ok uv "$("$p" --version | awk '{print $2}')" any ""
  py="$("$p" python find 3.12 2>/dev/null || true)"
  if [[ -n "$py" ]]; then row ok "python 3.12" "$("$py" --version 2>&1 | awk '{print $2}')" "3.12 (via uv)" ""
  else row warn "python 3.12" "not installed" "3.12 (via uv)" "uv python install 3.12   (cd agents && uv sync also does it)"; fi
fi
for t in forge anvil cast; do
  p="$(find_tool $t)"
  if [[ -z "$p" ]]; then row FAIL "$t" missing 1.2.2 "curl -L https://foundry.paradigm.xyz | bash && foundryup -i v1.2.2"
  else
    v="$("$p" --version 2>/dev/null | head -n 1 | sed -E 's/.*Version: ([^ ]+).*/\1/; s/^[a-z]+ //')"
    if [[ "$v" == 1.2.2* ]]; then row ok "$t" "$v" 1.2.2 ""
    else row warn "$t" "$v" 1.2.2 "foundryup -i v1.2.2"; fi
    [[ "$p" == "$(command -v $t 2>/dev/null)" ]] || row warn "$t on PATH" "only in $(tilde "${p%/*}")" "on PATH" "export PATH=\"${p%/*}:\$PATH\"  (add it to your shell profile)"
  fi
done
p="$(find_tool nargo)"
if [[ -z "$p" ]]; then row FAIL nargo missing 1.0.0-rc.3 "curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash && noirup -v 1.0.0-rc.3"
else
  v="$("$p" --version 2>/dev/null | sed -n 's/^nargo version = //p' | head -n 1)"
  if [[ "$v" == 1.0.0-rc.3 ]]; then row ok nargo "$v" 1.0.0-rc.3 ""; else row warn nargo "${v:-?}" 1.0.0-rc.3 "noirup -v 1.0.0-rc.3"; fi
  [[ "$p" == "$(command -v nargo 2>/dev/null)" ]] || row warn "nargo on PATH" "only in $(tilde "${p%/*}")" "on PATH" "export PATH=\"\$HOME/.nargo/bin:\$PATH\"  (seed_demo.py and the scene shell out to it)"
fi
p="$(find_tool bb)"
if [[ -z "$p" ]]; then row FAIL bb missing 6.0.0 "curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash && bbup -v 6.0.0"
else
  v="$("$p" --version 2>/dev/null | head -n 1 | sed 's/^v//')"
  if [[ "$v" == 6.0.0 ]]; then row ok bb "$v" 6.0.0 ""; else row warn bb "${v:-?}" 6.0.0 "bbup -v 6.0.0"; fi
  [[ "$p" == "$(command -v bb 2>/dev/null)" ]] || row warn "bb on PATH" "only in $(tilde "${p%/*}")" "on PATH" "export PATH=\"\$HOME/.bb:\$PATH\"  (seed_demo.py and the scene shell out to it)"
fi
if [[ -f "$REPO_DIR/contracts/lib/forge-std/src/Test.sol" ]]; then row ok submodules "contracts/lib present" initialized ""
else row FAIL submodules "contracts/lib empty" initialized "git submodule update --init --recursive"; fi
for t in curl jq openssl; do
  p="$(find_tool $t)"
  if [[ -n "$p" ]]; then row ok "$t" "$("$p" --version 2>&1 | head -n 1 | sed -E 's/^(curl|OpenSSL|LibreSSL) //; s/^jq-//; s/ .*//')" "any (helper)" ""
  else row warn "$t" missing "any (helper)" "$(hint "brew install $t" "sudo apt install $t")"; fi
done

# ------------------------------------------------------------------------------------------------ ports
echo; echo "${B}Ports${N} (Path A publishes 8545 8000 8787 3000 3001; Path B uses 8545 8000 8787 3001 3000)"
busy=""
for port in 8545 8000 8787 3000 3001; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then busy="$busy $port"; fi
done
if [[ -z "$busy" ]]; then row ok ports "all free" "free" ""
else
  who=""
  if command -v lsof >/dev/null 2>&1; then
    for port in $busy; do who="$who $port:$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')"; done
  fi
  row warn ports "in use:${who:-$busy}" "free" "stop those processes, or set DEV_*_PORT (Path A) / other --port flags (Path B); see docs/LOCAL.md"
fi

echo
if [[ $FAIL -eq 0 && $WARN -eq 0 ]]; then echo "${G}All good.${N}"
else echo "${B}$FAIL missing/failing, $WARN warnings.${N} Path A needs only git + Docker; Path B needs the rest."; fi
[[ $STRICT -eq 1 && $FAIL -gt 0 ]] && exit 1
exit 0
