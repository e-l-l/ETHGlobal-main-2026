// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev BN254 scalar field modulus. Everything entering Poseidon2 or the verifier must be < P.
uint256 constant SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
/// @dev keccak256("standing-pass.commit") % P
uint256 constant TAG_COMMIT = 0x07aae42ccc5387a3a8f54ce12274e158138cbfcff719046d9bd83fe897ce16d1;
/// @dev keccak256("standing-pass.nullifier") % P
uint256 constant TAG_NULL = 0x0f08cced1499e13a50af6f29ab9ee272a40d4e4713313e8ff11d52bfe9fb2f42;
/// @dev Sepolia deployment of zemse/poseidon2-evm (Yul). Same address used for vm.etch in tests.
address constant POSEIDON2_SEPOLIA = 0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2;
/// @dev keccak256("standing-pass.biz") % P. Business Pass leaf: Poseidon2(TAG_BIZ, h, country, revenueBand, ageOk)
///      (5 inputs; computed offchain by the merchant and checked by the issuer, never onchain).
uint256 constant TAG_BIZ = 0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8b;
/// @dev keccak256("standing-pass.biz.nullifier") % P. First-advance nullifier: hash_2(TAG_BIZ_NULL, secret).
uint256 constant TAG_BIZ_NULL = 0x075964a690d1888b50278bf8b2aed0ca04febb6b1f1c68514fe4450e85164226;
