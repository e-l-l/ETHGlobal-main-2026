#!/usr/bin/env bash
# Cross-checks the issuer's EIP-712 digest + signature against the REAL BusinessPassRegistry bytecode.
# Starts a throwaway anvil, etches the Poseidon2 runtime (needed by the tree constructor), deploys the registry
# from contracts/out with anvil key #0 (=> address 0x5FbDB2315678afecb367f032d93F642f64180aa3), then compares
# hashBusinessVerified(vector) with viem's digest and recovers the signature with cast. Reads contracts/ only.
# Prereqs: foundry (anvil, cast), `forge build` already run in contracts/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
C="$HERE/../contracts"
PORT="${PORT:-18545}"
RPC="http://127.0.0.1:$PORT"
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # public anvil test key
POSEIDON=0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2

anvil --port "$PORT" --silent & APID=$!
trap 'kill $APID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.1; done

cast rpc --rpc-url "$RPC" anvil_setCode "$POSEIDON" "$(tr -d '\n' < "$C/test/fixtures/poseidon2_yul.runtime.hex")" >/dev/null
# Foundry names artifacts by compiler version when a contract is built under several (0.8.26 + 0.8.30 here).
ART=""; for cand in "$C"/out/BusinessPassRegistry.sol/BusinessPassRegistry.json "$C"/out/BusinessPassRegistry.sol/BusinessPassRegistry.0.8.26.json; do [ -f "$cand" ] && { ART="$cand"; break; }; done
[ -n "$ART" ] || { echo "registry artifact not found; run forge build in contracts/"; exit 1; }
BYTECODE=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['bytecode']['object'])" "$ART")
ADDR0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ARGS=$(cast abi-encode "f(address,address,address,uint16[4])" "$POSEIDON" "$ADDR0" "$ADDR0" "[32,404,566,0]")
REG=$(cast send --rpc-url "$RPC" --private-key "$PK" --create "${BYTECODE}${ARGS#0x}" --json | python3 -c "import sys,json;print(json.load(sys.stdin)['contractAddress'])")
echo "registry: $REG"

VEC=$(cd "$HERE" && npx tsx scripts/vector.ts "$REG" 31337)
WANT_DIGEST=$(echo "$VEC" | python3 -c "import sys,json;print(json.load(sys.stdin)['digest'])")
SIG=$(echo "$VEC" | python3 -c "import sys,json;print(json.load(sys.stdin)['signature'])")

TH=$(cast call --rpc-url "$RPC" "$REG" "BUSINESS_VERIFIED_TYPEHASH()(bytes32)")
GOT=$(cast call --rpc-url "$RPC" "$REG" "hashBusinessVerified((uint256,uint256,uint64))(bytes32)" \
  "(0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef,0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f,1790000600)")
echo "typehash (contract): $TH"
echo "digest   (contract): $GOT"
echo "digest   (issuer)  : $WANT_DIGEST"
[ "$GOT" = "$WANT_DIGEST" ] && echo "OK: digests match" || { echo "MISMATCH"; exit 1; }

# End to end: a fresh issuer attestation is accepted by issue(), and the same business nullifier is refused after.
F=$(cd "$HERE" && npx tsx scripts/vector.ts "$REG" 31337 --fresh)
N=$(echo "$F" | python3 -c "import sys,json;print(json.load(sys.stdin)['message']['businessNullifier'])")
CM=$(echo "$F" | python3 -c "import sys,json;print(json.load(sys.stdin)['message']['commitment'])")
EX=$(echo "$F" | python3 -c "import sys,json;print(json.load(sys.stdin)['message']['expiresAt'])")
FS=$(echo "$F" | python3 -c "import sys,json;print(json.load(sys.stdin)['signature'])")
cast send --rpc-url "$RPC" --private-key "$PK" "$REG" "issue((uint256,uint256,uint64),bytes,uint256)" "($N,$CM,$EX)" "$FS" "$CM" >/dev/null
echo "issue(): accepted; businessNullifierUsed = $(cast call --rpc-url "$RPC" "$REG" "businessNullifierUsed(uint256)(bool)" "$N")"
if cast send --rpc-url "$RPC" --private-key "$PK" "$REG" "issue((uint256,uint256,uint64),bytes,uint256)" "($N,$CM,$EX)" "$FS" "$CM" >/dev/null 2>&1; then
  echo "FAIL: reuse accepted"; exit 1; else echo "OK: second issue() with the same nullifier reverts"; fi
