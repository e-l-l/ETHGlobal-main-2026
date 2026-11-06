#!/usr/bin/env bash
# Rebuild the Standing Pass circuit, a fixture proof, and the Solidity verifier.
# Toolchain (pinned pair from Aztec v6.0.0): nargo 1.0.0-rc.3 + bb 6.0.0
#   noirup -v 1.0.0-rc.3 && bbup -v 6.0.0
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"

nargo test
nargo compile
nargo execute                     # witness from Prover.toml
bb write_vk -b target/standing_pass.json -o target -t evm
bb prove    -b target/standing_pass.json -w target/standing_pass.gz -k target/vk -o target -t evm
bb verify   -k target/vk -p target/proof -i target/public_inputs -t evm
bb write_solidity_verifier -k target/vk -o target/HonkVerifier.sol -t evm

# Hand off to Foundry: generated verifier + fixture proof used by test/StandingPassE2E.t.sol
cp target/HonkVerifier.sol ../../contracts/src/verifier/HonkVerifier.sol
printf '0x%s' "$(xxd -p target/proof | tr -d '\n')" > ../../contracts/test/fixtures/standing_pass.proof.hex
echo "Done. Now: cd ../../contracts && forge test --match-path test/StandingPassE2E.t.sol"
