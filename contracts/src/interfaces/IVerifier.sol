// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Shape of the Barretenberg-generated UltraHonk Solidity verifier.
/// Public inputs order for standing_pass: [root, nullifier, tier, commitmentNext, context].
interface IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}
