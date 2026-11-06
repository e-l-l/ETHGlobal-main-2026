// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {POSEIDON2_SEPOLIA, SNARK_FIELD} from "../src/Constants.sol";
import {StandingPassTree} from "../src/StandingPassTree.sol";

/// @dev Test-only concrete tree exposing `_insert`.
contract TreeHarness is StandingPassTree {
    constructor(IPoseidon2 p) StandingPassTree(p) {}

    function insert(uint256 leaf) external returns (uint256 index, uint256 newRoot) {
        return _insert(leaf);
    }

    /// @dev Test-only: jump to the end of the tree so the full case is reachable without 65536 inserts.
    function setNextLeafIndex(uint256 i) external {
        nextLeafIndex = i;
    }
}

/// @dev A hasher that is not Poseidon2.
contract WrongHasher {
    function hash_1(uint256 x) external pure returns (uint256) {
        return x;
    }

    function hash_2(uint256 x, uint256 y) external pure returns (uint256) {
        return x + y + 1;
    }

    function hash_3(uint256 x, uint256 y, uint256 z) external pure returns (uint256) {
        return x + y + z;
    }
}

contract StandingPassTreeTest is Test {
    // SPEC "Known vectors" (computed independently, verified against Noir).
    uint256 constant EMPTY_ROOT = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;
    uint256 constant ROOT_1 = 0x0730cfe06254f1d70d09db1974d720fbb8e3b8e75f1c116466d3cb850ac6b8f4;
    uint256 constant ROOT_12 = 0x0845b34d79339209303ed8f456c75d762ec77145d79d40a49941169ae85e34d3;
    uint256 constant ROOT_123 = 0x2b09a6c5ef1a0755e9c595fec30b72a4bdb1053fc8a253db86ed2147010c5a9b;

    event LeafInserted(uint256 indexed commitment, uint256 leafIndex, uint256 newRoot);

    IPoseidon2 p2 = IPoseidon2(POSEIDON2_SEPOLIA);
    TreeHarness tree;
    uint256[17] zeros; // computed here independently of the contract's constants

    function setUp() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        tree = new TreeHarness(p2);
        for (uint256 i = 0; i < 16; ++i) {
            zeros[i + 1] = p2.hash_2(zeros[i], zeros[i]);
        }
    }

    // ---------------------------------------------------------------- vectors

    function test_emptyRoot_matchesSpec() public view {
        assertEq(tree.currentRoot(), EMPTY_ROOT);
        assertTrue(tree.isKnownRoot(EMPTY_ROOT));
        assertEq(tree.nextLeafIndex(), 0);
        assertEq(zeros[16], EMPTY_ROOT, "independent zero chain");
    }

    function test_roots_matchSpecVectors() public {
        (uint256 i0, uint256 r1) = tree.insert(1);
        assertEq(i0, 0);
        assertEq(r1, ROOT_1);
        assertEq(tree.currentRoot(), ROOT_1);

        (uint256 i1, uint256 r2) = tree.insert(2);
        assertEq(i1, 1);
        assertEq(r2, ROOT_12);

        (uint256 i2, uint256 r3) = tree.insert(3);
        assertEq(i2, 2);
        assertEq(r3, ROOT_123);
        assertEq(tree.currentRoot(), ROOT_123);
        assertEq(tree.nextLeafIndex(), 3);
    }

    // ---------------------------------------------------------------- root history

    function test_historicalRoots_stayKnown() public {
        tree.insert(1);
        tree.insert(2);
        tree.insert(3);
        for (uint256 k = 4; k <= 10; ++k) {
            tree.insert(k);
        }
        assertTrue(tree.isKnownRoot(EMPTY_ROOT));
        assertTrue(tree.isKnownRoot(ROOT_1));
        assertTrue(tree.isKnownRoot(ROOT_12));
        assertTrue(tree.isKnownRoot(ROOT_123));
    }

    function test_arbitraryRoot_unknown(uint256 r) public {
        tree.insert(1);
        tree.insert(2);
        if (r != EMPTY_ROOT && r != ROOT_1 && r != ROOT_12) {
            assertFalse(tree.isKnownRoot(r));
        }
        assertFalse(tree.isKnownRoot(0));
        assertFalse(tree.isKnownRoot(ROOT_123)); // not produced yet
    }

    // ---------------------------------------------------------------- field bound

    function test_leafAtP_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(StandingPassTree.LeafOutOfField.selector, SNARK_FIELD));
        tree.insert(SNARK_FIELD);
    }

    function testFuzz_leafAboveP_reverts(uint256 leaf) public {
        leaf = bound(leaf, SNARK_FIELD, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(StandingPassTree.LeafOutOfField.selector, leaf));
        tree.insert(leaf);
        assertEq(tree.nextLeafIndex(), 0);
        assertEq(tree.currentRoot(), EMPTY_ROOT);
    }

    function test_leafPMinus1_accepted() public {
        (uint256 idx, uint256 root) = tree.insert(SNARK_FIELD - 1);
        assertEq(idx, 0);
        assertEq(root, _naiveRoot(_one(SNARK_FIELD - 1)));
    }

    // ---------------------------------------------------------------- event

    function test_event_hasIndexAndRoot() public {
        tree.insert(1);
        tree.insert(2);
        vm.expectEmit(true, false, false, true, address(tree));
        emit LeafInserted(3, 2, ROOT_123);
        tree.insert(3);
    }

    // ---------------------------------------------------------------- fuzz vs naive recompute

    function testFuzz_incrementalMatchesNaive(uint256 seed, uint256 count) public {
        count = bound(count, 1, 20);
        uint256[] memory leaves = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            leaves[i] = uint256(keccak256(abi.encode(seed, i))) % SNARK_FIELD;
        }
        uint256[] memory roots = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            (uint256 idx, uint256 root) = tree.insert(leaves[i]);
            assertEq(idx, i, "index");
            uint256[] memory prefix = new uint256[](i + 1);
            for (uint256 j = 0; j <= i; ++j) {
                prefix[j] = leaves[j];
            }
            assertEq(root, _naiveRoot(prefix), "root vs naive");
            roots[i] = root;
        }
        // every root produced along the way is still known
        for (uint256 i = 0; i < count; ++i) {
            assertTrue(tree.isKnownRoot(roots[i]));
        }
        assertEq(tree.nextLeafIndex(), count);
    }

    /// @dev Deterministic run across several subtree boundaries (crosses levels 0..5).
    function test_40Leaves_matchesNaive() public {
        uint256[] memory leaves = new uint256[](40);
        for (uint256 i = 0; i < 40; ++i) {
            leaves[i] = i + 1;
            tree.insert(leaves[i]);
        }
        assertEq(tree.currentRoot(), _naiveRoot(leaves));
    }

    // ---------------------------------------------------------------- full tree

    function test_treeFull_reverts() public {
        tree.setNextLeafIndex((1 << 16) - 1);
        (uint256 idx,) = tree.insert(7); // last slot still accepted
        assertEq(idx, (1 << 16) - 1);
        assertEq(tree.nextLeafIndex(), 1 << 16);
        vm.expectRevert(StandingPassTree.TreeFull.selector);
        tree.insert(8);
    }

    // ---------------------------------------------------------------- constructor guard

    function test_constructor_rejectsWrongHasher() public {
        WrongHasher w = new WrongHasher();
        vm.expectRevert(abi.encodeWithSelector(StandingPassTree.ZeroValueMismatch.selector, 1));
        new TreeHarness(IPoseidon2(address(w)));
    }

    // ---------------------------------------------------------------- gas

    function test_gas_insert() public {
        uint256 g = gasleft();
        tree.insert(1);
        uint256 first = g - gasleft();
        tree.insert(2);
        tree.insert(3);
        g = gasleft();
        tree.insert(4);
        uint256 fourth = g - gasleft();
        console.log("insert gas, first leaf (cold slots):", first);
        console.log("insert gas, 4th leaf:", fourth);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev Level-by-level recomputation of the depth-16 root, padding missing nodes with zeros[level].
    function _naiveRoot(uint256[] memory leaves) internal view returns (uint256) {
        uint256[] memory level = leaves;
        for (uint256 d = 0; d < 16; ++d) {
            uint256 n = (level.length + 1) / 2;
            uint256[] memory up = new uint256[](n);
            for (uint256 k = 0; k < n; ++k) {
                uint256 l = level[2 * k];
                uint256 r = 2 * k + 1 < level.length ? level[2 * k + 1] : zeros[d];
                up[k] = p2.hash_2(l, r);
            }
            level = up;
        }
        return level[0];
    }

    function _one(uint256 x) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = x;
    }
}
