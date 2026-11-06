// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice What AdvanceBook needs from the BusinessPassRegistry: its known roots and the allowed country set
///         that the business_pass circuit checks (public inputs 5..8).
interface IBusinessPass {
    function isKnownRoot(uint256 root) external view returns (bool);
    function countrySet() external view returns (uint16[4] memory);
}
