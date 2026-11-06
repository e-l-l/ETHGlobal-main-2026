#!/usr/bin/env bash
# Rebuild the Business Pass circuit, two fixture proofs, and the Solidity verifier (BusinessPassVerifier).
# Toolchain (pinned pair from Aztec v6.0.0): nargo 1.0.0-rc.3 + bb 6.0.0
#   noirup -v 1.0.0-rc.3 && bbup -v 6.0.0
# Fixture inputs come from agents/scripts/bizpass_fixtures.py (Prover.toml = drawFirst, Mandate.toml =
# registerMandate). Optional: PROVER=<name> proves only <name>.toml and skips the Foundry hand-off
# (used by agents/src/mra_agents/bizpass.py for devnet proofs).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
PROVER="${PROVER:-}"

prove() {   # $1 = toml name without extension
  nargo execute -p "$1" "$1" >/dev/null   # witness target/$1.gz
  mkdir -p "target/$1"
  bb prove  -b target/business_pass.json -w "target/$1.gz" -k target/vk -o "target/$1" -t evm >/dev/null
  bb verify -k target/vk -p "target/$1/proof" -i "target/$1/public_inputs" -t evm
}

if [[ -n "$PROVER" ]]; then
  [[ -f target/business_pass.json && -f target/vk ]] || { nargo compile; bb write_vk -b target/business_pass.json -o target -t evm; }
  prove "$PROVER"
  echo "proof: target/$PROVER/proof"
  exit 0
fi

nargo test
nargo compile
bb write_vk -b target/business_pass.json -o target -t evm
prove Prover
prove Mandate
bb write_solidity_verifier -k target/vk -o target/HonkVerifier.sol -t evm
# Own contract name so it can sit next to the Standing Pass HonkVerifier in contracts/src/verifier/.
sed 's/^contract HonkVerifier is/contract BusinessPassVerifier is/' target/HonkVerifier.sol \
  > ../../contracts/src/verifier/BusinessPassVerifier.sol
printf '0x%s' "$(xxd -p target/Prover/proof | tr -d '\n')" > ../../contracts/test/fixtures/business_pass.proof.hex
printf '0x%s' "$(xxd -p target/Mandate/proof | tr -d '\n')" > ../../contracts/test/fixtures/business_pass_mandate.proof.hex
bb gates -b target/business_pass.json 2>/dev/null | grep circuit_size || true
echo "Done. Now: cd ../../contracts && forge test --match-path test/BusinessPassE2E.t.sol"
