// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BusinessPassRegistry, BusinessVerified} from "../src/BusinessPassRegistry.sol";
import {StandingPassTree} from "../src/StandingPassTree.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {SNARK_FIELD, POSEIDON2_SEPOLIA, TAG_BIZ} from "../src/Constants.sol";

contract BusinessPassRegistryTest is Test {
    uint256 internal constant ISSUER_PK = 0x155E;
    uint256 internal constant EMPTY_ROOT = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;
    /// Poseidon2(TAG_BIZ, hash_1(123456789), 32, 2, 1): agents/tests/test_zk.py and the Noir test agree.
    uint256 internal constant LEAF = 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43;
    uint256 internal constant ROOT_1 = 0x1da5b44f817335e17c31ff665643e7c8252c28aa6a3f1f594310b3a4fd9f5851;

    BusinessPassRegistry internal reg;
    address internal owner = makeAddr("owner");

    function setUp() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        reg = new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), owner, vm.addr(ISSUER_PK), [uint16(32), 566, 404, 0]);
    }

    function _att(uint256 bizNull, uint256 commitment) internal view returns (BusinessVerified memory) {
        return BusinessVerified(bizNull, commitment, uint64(block.timestamp + 1 hours));
    }

    /// Independent EIP-712 digest (domain "BusinessPassRegistry", "1").
    function _sign(BusinessVerified memory a, uint256 pk) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BusinessPassRegistry"),
                keccak256("1"),
                block.chainid,
                address(reg)
            )
        );
        bytes32 sh = keccak256(
            abi.encode(
                keccak256("BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)"),
                a.businessNullifier,
                a.commitment,
                a.expiresAt
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, sh)));
        return abi.encodePacked(r, s, v);
    }

    function test_tagBiz_isKeccakModP() public pure {
        assertEq(TAG_BIZ, uint256(keccak256("standing-pass.biz")) % SNARK_FIELD);
    }

    function test_issue_insertsLeaf_emitsOnlyIndexAndRoot_anySender() public {
        BusinessVerified memory a = _att(0xB12, LEAF);
        bytes memory sig = _sign(a, ISSUER_PK);
        assertEq(reg.currentRoot(), EMPTY_ROOT);

        vm.recordLogs();
        vm.prank(makeAddr("relayer"));
        uint256 idx = reg.issue(a, sig, LEAF);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(idx, 0);
        assertEq(reg.currentRoot(), ROOT_1, "root matches circuits/business_pass fixture");
        assertTrue(reg.isKnownRoot(ROOT_1) && reg.isKnownRoot(EMPTY_ROOT));
        assertTrue(reg.businessNullifierUsed(0xB12));
        // exactly two events: the tree's LeafInserted (needed to rebuild paths) and BusinessPassIssued
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], StandingPassTree.LeafInserted.selector);
        assertEq(logs[1].topics[0], BusinessPassRegistry.BusinessPassIssued.selector);
        assertEq(logs[1].topics[1], bytes32(uint256(0)));
        assertEq(abi.decode(logs[1].data, (uint256)), ROOT_1);
        for (uint256 i = 0; i < logs.length; ++i) {
            // the business nullifier never appears in events
            assertTrue(keccak256(logs[i].data) != keccak256(abi.encode(uint256(0xB12))));
            for (uint256 t = 0; t < logs[i].topics.length; ++t) assertTrue(logs[i].topics[t] != bytes32(uint256(0xB12)));
        }
    }

    function test_issue_reverts_reusedBusinessNullifier_oneBusinessOnePass() public {
        BusinessVerified memory a = _att(0xB12, LEAF);
        reg.issue(a, _sign(a, ISSUER_PK), LEAF);
        BusinessVerified memory b = _att(0xB12, LEAF + 1); // same business, new secret
        bytes memory sig = _sign(b, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.BusinessAlreadyHasPass.selector);
        reg.issue(b, sig, LEAF + 1);
        // a different business is fine (one human may own several businesses)
        BusinessVerified memory c = _att(0xB13, LEAF + 2);
        reg.issue(c, _sign(c, ISSUER_PK), LEAF + 2);
        assertEq(reg.nextLeafIndex(), 2);
    }

    function test_issue_reverts_badSignature_mismatch_expired_badCommitment() public {
        BusinessVerified memory a = _att(0xB12, LEAF);
        bytes memory wrong = _sign(a, 0xBAD);
        vm.expectRevert(BusinessPassRegistry.InvalidAttestation.selector);
        reg.issue(a, wrong, LEAF);

        bytes memory sig = _sign(a, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.CommitmentMismatch.selector);
        reg.issue(a, sig, LEAF + 1); // relayer swaps the leaf

        vm.warp(uint256(a.expiresAt) + 1);
        vm.expectRevert(abi.encodeWithSelector(BusinessPassRegistry.AttestationExpired.selector, a.expiresAt));
        reg.issue(a, sig, LEAF);
        vm.warp(a.expiresAt); // boundary: valid at expiresAt
        reg.issue(a, sig, LEAF);

        BusinessVerified memory z = _att(0xB14, 0);
        bytes memory zs = _sign(z, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.InvalidCommitment.selector);
        reg.issue(z, zs, 0);
        BusinessVerified memory n = _att(0, LEAF);
        bytes memory ns = _sign(n, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.InvalidAttestation.selector);
        reg.issue(n, ns, LEAF);
    }

    function testFuzz_issue_rejectsOutOfFieldCommitment(uint256 c) public {
        c = bound(c, SNARK_FIELD, type(uint256).max);
        BusinessVerified memory a = _att(0xB12, c);
        bytes memory sig = _sign(a, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.InvalidCommitment.selector);
        reg.issue(a, sig, c);
    }

    /// Any field element signed by the issuer lands in the tree; the attestation cannot be reused.
    function testFuzz_issue_anyFieldLeaf(uint256 c, uint256 bizNull) public {
        c = bound(c, 1, SNARK_FIELD - 1);
        bizNull = bound(bizNull, 1, type(uint256).max);
        BusinessVerified memory a = _att(bizNull, c);
        bytes memory sig = _sign(a, ISSUER_PK);
        reg.issue(a, sig, c);
        assertTrue(reg.currentRoot() != EMPTY_ROOT);
        vm.expectRevert(BusinessPassRegistry.BusinessAlreadyHasPass.selector);
        reg.issue(a, sig, c);
    }

    function test_owner_rotatesIssuer_andCountrySet() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("stranger")));
        reg.setIssuer(address(1));
        vm.startPrank(owner);
        vm.expectRevert(BusinessPassRegistry.ZeroAddress.selector);
        reg.setIssuer(address(0));
        reg.setIssuer(vm.addr(0x1557));
        reg.setCountrySet([uint16(32), 0, 0, 0]);
        vm.stopPrank();
        uint16[4] memory cs = reg.countrySet();
        assertEq(cs[0], 32);
        assertEq(cs[1], 0);
        // old issuer key is dead
        BusinessVerified memory a = _att(0xB12, LEAF);
        bytes memory oldSig = _sign(a, ISSUER_PK);
        vm.expectRevert(BusinessPassRegistry.InvalidAttestation.selector);
        reg.issue(a, oldSig, LEAF);
        reg.issue(a, _sign(a, 0x1557), LEAF);
    }

    function test_constructor_rejectsZeroIssuer() public {
        vm.expectRevert(BusinessPassRegistry.ZeroAddress.selector);
        new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), owner, address(0), [uint16(32), 0, 0, 0]);
    }
}
