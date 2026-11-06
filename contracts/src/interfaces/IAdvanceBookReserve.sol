// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal surface RiskHook needs from AdvanceBook.
interface IAdvanceBookReserve {
    function depositReserve(uint256 amount) external;
}
