#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
MNEMONIC='test test test test test test test test test test test junk'
POSEIDON=0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2
# Refuse non-local RPCs before making any request.
[[ "$RPC_URL" == http://127.0.0.1:* || "$RPC_URL" == http://localhost:* ]] || { echo 'RPC must be local' >&2; exit 1; }
if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  anvil --chain-id 31337 --port "${RPC_URL##*:}" --silent >/dev/null 2>&1 &
  for _ in {1..50}; do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 0.1; done
fi
[[ "$(cast chain-id --rpc-url "$RPC_URL")" == 31337 ]] || { echo 'Expected local chain 31337' >&2; exit 1; }
# Refuse non-local RPCs: the script uses unlocked accounts and local-only keys.
[[ "$RPC_URL" == http://127.0.0.1:* || "$RPC_URL" == http://localhost:* ]] || { echo 'RPC must be local' >&2; exit 1; }
# MANIFEST / ENV_OUT let a second devnet (another port) run without touching the shared local.json/.env.devnet.
MANIFEST="${MANIFEST:-$ROOT/agents/deployments/local.json}"
ENV_OUT="${ENV_OUT:-$ROOT/agents/.env.devnet}"
DEP_DIR="$(dirname "$MANIFEST")"
mkdir -p "$DEP_DIR"
manifest="$MANIFEST"
if [[ -f "$manifest" ]] && "$ROOT/agents/.venv/bin/python" - "$manifest" "$RPC_URL" <<'PY'
import json, sys
from web3 import Web3
w = Web3(Web3.HTTPProvider(sys.argv[2]))
try:
    d = json.load(open(sys.argv[1]))
    assert d['chainId'] == w.eth.chain_id
    assert all(w.eth.get_code(Web3.to_checksum_address(d[k])) for k in ('AdvanceBook','SeniorVault','JuniorVault','RiskHook','USDC','PoolManager','HonkVerifier','BusinessPassVerifier','BusinessPassRegistry'))
except (KeyError, ValueError, AssertionError, OSError):
    sys.exit(1)
PY
then
  echo 'Existing local deployment found.'
else
  code="$(tr -d '[:space:]' < "$ROOT/contracts/test/fixtures/poseidon2_yul.runtime.hex")"
  [[ "$code" == 0x* ]] || code="0x$code"
  cast rpc --rpc-url "$RPC_URL" anvil_setCode "$POSEIDON" "$code" >/dev/null
  (cd "$ROOT/contracts" && forge build >/dev/null \
    && DEPLOYMENTS_DIR="$DEP_DIR" forge script script/DeployVerifier.s.sol:DeployVerifier --rpc-url "$RPC_URL" --mnemonics "$MNEMONIC" --broadcast >/dev/null \
    && VERIFIER="$(cat "$DEP_DIR/verifier.txt")" BIZ_VERIFIER="$(cat "$DEP_DIR/biz_verifier.txt")" DEPLOYMENTS_OUT="$MANIFEST" \
       forge script script/DeployLocal.s.sol:DeployLocal --rpc-url "$RPC_URL" --mnemonics "$MNEMONIC" --broadcast)
fi
umask 077
"$ROOT/agents/.venv/bin/python" - "$ENV_OUT" "$RPC_URL" "$MANIFEST" <<'PY'
import secrets, sys
from eth_account import Account
Account.enable_unaudited_hdwallet_features()
m = 'test test test test test test test test test test test junk'
with open(sys.argv[1], 'w') as f:
    f.write('# LOCAL ANVIL ONLY: PUBLIC TEST KEYS; NEVER USE WITH REAL FUNDS\n')
    f.write(f'RPC_URL={sys.argv[2]}\nCHAIN_ID=31337\n')
    f.write(f'DEPLOYMENTS_FILE={sys.argv[3]}\n')
    # 4 = Business Pass issuer, 5 = AgentPass attester (DeployLocal wires these addresses)
    for name, i in [('OFFER_SIGNER', 1), ('RISK_MANAGER', 2), ('RELAYER', 3), ('ISSUER', 4), ('ATTESTER', 5)]:
        key = Account.from_mnemonic(m, account_path=f"m/44'/60'/0'/0/{i}").key.hex()
        f.write(f'{name}_PRIVATE_KEY=0x{key.removeprefix("0x")}\n')
    f.write(f'PAYER_HASH_KEY={secrets.token_hex(32)}\n')
    f.write(f'BUSINESS_PEPPER={secrets.token_hex(32)}\n')
PY
"$ROOT/agents/.venv/bin/python" - "$manifest" <<'PY'
import json, sys
x = json.load(open(sys.argv[1]))
for k in ('AdvanceBook','SeniorVault','JuniorVault','RiskHook','USDC','PoolManager','HonkVerifier','BusinessPassVerifier','BusinessPassRegistry'):
    print(f'{k}: {x[k]}')
PY
