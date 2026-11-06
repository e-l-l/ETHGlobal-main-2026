#!/usr/bin/env bash
# Pull-based continuous deployment for the EC2 box (no inbound access, no secrets in GitHub).
#
# Run every 2 minutes by deploy/systemd/mra-autodeploy.timer. When origin/main has a new commit AND every GitHub
# check run on that commit has succeeded (.github/workflows/ci.yml), it runs ./deploy/deploy.sh. Otherwise it waits:
# pending checks are retried on the next tick, failed checks are skipped until a newer commit lands.
#
#   touch ~/mra/deploy/.paused     stop auto-deploys (e.g. during a live demo); rm it to resume
#   ./deploy/autodeploy.sh --now   deploy origin/main now, without waiting for CI
#   journalctl -u mra-autodeploy -n 50   or   tail -f ~/autodeploy.log
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_SLUG="${AUTODEPLOY_REPO:-e-l-l/ETHGlobal-main-2026}"
LOG="${AUTODEPLOY_LOG:-$HOME/autodeploy.log}"
LOCK="/tmp/mra-autodeploy.lock"
NOW=0; [[ "${1:-}" == "--now" ]] && NOW=1

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }

exec 9>"$LOCK"
flock -n 9 || exit 0  # a deploy is already running

cd "$REPO_DIR"
if [[ -f deploy/.paused && $NOW == 0 ]]; then exit 0; fi

git fetch -q origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
[[ "$local_sha" == "$remote_sha" ]] && exit 0

if [[ $NOW == 0 ]]; then
  # Gate on CI: all check runs for this commit completed and none failed. Public repo: no token needed.
  verdict="$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO_SLUG/commits/$remote_sha/check-runs?per_page=100" | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs: print("pending"); sys.exit()
if any(r["status"] != "completed" for r in runs): print("pending"); sys.exit()
ok = all(r["conclusion"] in ("success", "skipped", "neutral") for r in runs)
print("success" if ok else "failure")')" || verdict="pending"
  case "$verdict" in
    pending) exit 0 ;;
    failure)
      [[ "$(cat deploy/.last-failed 2>/dev/null)" == "$remote_sha" ]] || { log "skip ${remote_sha:0:7}: CI failed"; echo "$remote_sha" > deploy/.last-failed; }
      exit 0 ;;
  esac
fi

log "deploy ${local_sha:0:7} -> ${remote_sha:0:7}"
if ./deploy/deploy.sh >> "$LOG" 2>&1; then
  log "deployed ${remote_sha:0:7}"
else
  log "deploy of ${remote_sha:0:7} FAILED (see above); the previous containers keep running where compose left them"
  exit 1
fi
