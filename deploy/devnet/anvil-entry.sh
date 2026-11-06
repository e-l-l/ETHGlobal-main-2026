#!/bin/sh
# Entrypoint of the `anvil` service (ghcr.io/foundry-rs/foundry, user foundry, /bin/sh).
#
# Persistence: --state loads $STATE on boot (if present) and dumps it on exit; --state-interval also dumps it
# every DUMP_SECONDS, so a crash or OOM loses at most that much.
#
# Clock fix: anvil does not persist its time offset. After a restart, the next block would be stamped with
# wall-clock time, i.e. BEFORE the warped chain head (the demo warps 31 days). Time going backwards breaks the
# AdvanceBook default clock and RiskHook's oracle. So on boot we move the clock to head+1 when the head is in
# the future, and only then mark the node ready (the healthcheck waits for $READY).
set -eu
STATE="${STATE:-/home/foundry/anvil-state.json}"
READY="${READY_FILE:-/tmp/anvil.ready}"
DUMP_SECONDS="${DUMP_SECONDS:-30}"
PORT="${ANVIL_PORT:-8545}"
RPC="http://127.0.0.1:$PORT"
rm -f "$READY"

anvil --host "${ANVIL_HOST:-0.0.0.0}" --port "$PORT" --chain-id 31337 \
  --state "$STATE" --state-interval "$DUMP_SECONDS" \
  ${ANVIL_EXTRA_ARGS:-} &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null; wait "$pid"; exit 0' TERM INT

i=0
until cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -lt 300 ] || { echo "anvil did not start" >&2; kill "$pid"; exit 1; }
  sleep 0.2
done
head_ts="$(cast block latest --field timestamp --rpc-url "$RPC")"
now="$(date +%s)"
if [ "$head_ts" -ge "$now" ]; then
  cast rpc --rpc-url "$RPC" evm_setTime "$((head_ts + 1))" >/dev/null
  echo "anvil: restored warped clock to head+1 ($head_ts, wall clock $now)"
fi
echo "anvil: ready at block $(cast block-number --rpc-url "$RPC")"
touch "$READY"
wait "$pid"
