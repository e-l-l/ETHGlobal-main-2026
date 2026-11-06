// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {POSEIDON2_SEPOLIA} from "../src/Constants.sol";
contract SmokeTest is Test, Deployers {
    function test_poseidon2_fixture_matches_noir_vector() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        assertEq(IPoseidon2(POSEIDON2_SEPOLIA).hash_2(1000, 2000), 0x118d5a5ecb25dafe99eb45cb196604a23d0b7c0cbd0c2be29e0787e59b7a1d8a);
    }
    function test_v4_deployers_work() public {
        deployFreshManagerAndRouters();
        assertTrue(address(manager) != address(0));
    }
}
