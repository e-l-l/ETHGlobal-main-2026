// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Poseidon2 (BN254, t=4) matching noir-lang/poseidon v0.4.0 `Poseidon2::hash`.
/// Deployed on Sepolia at 0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2 (zemse/poseidon2-evm, Yul).
/// Inputs are reduced mod P by the implementation; callers must still pass values < P.
interface IPoseidon2 {
    function hash_1(uint256 x) external pure returns (uint256);
    function hash_2(uint256 x, uint256 y) external pure returns (uint256);
    function hash_3(uint256 x, uint256 y, uint256 z) external pure returns (uint256);
}
