// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script} from "forge-std/Script.sol";
import {HonkVerifier} from "../src/verifier/HonkVerifier.sol";
import {BusinessPassVerifier} from "../src/verifier/BusinessPassVerifier.sol";

/// Deploys the two bb-generated verifiers on their own: they need solc >=0.8.27 and external library
/// linking, which `forge script` handles automatically here. Writes the addresses for DeployLocal / Deploy
/// to pick up via the VERIFIER and BIZ_VERIFIER env vars.
///   HonkVerifier          = circuits/standing_pass  (drawWithPass, tier >= 1 mandates)
///   BusinessPassVerifier  = circuits/business_pass  (drawFirst, tier-0 mandates)
contract DeployVerifier is Script {
    function run() external returns (address verifier, address bizVerifier) {
        vm.startBroadcast();
        verifier = address(new HonkVerifier());
        bizVerifier = address(new BusinessPassVerifier());
        vm.stopBroadcast();
        string memory dir = vm.envOr("DEPLOYMENTS_DIR", string("../agents/deployments"));
        vm.writeFile(string.concat(dir, "/verifier.txt"), vm.toString(verifier));
        vm.writeFile(string.concat(dir, "/biz_verifier.txt"), vm.toString(bizVerifier));
    }
}
