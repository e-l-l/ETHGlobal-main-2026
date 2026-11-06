// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoseidon2} from "./interfaces/IPoseidon2.sol";
import {SNARK_FIELD} from "./Constants.sol";

/// @title StandingPassTree
/// @notice Append-only Poseidon2 incremental Merkle tree (depth 16), Tornado-style filled subtrees.
/// Leaf i sits at position i (left to right), the empty leaf is 0, a parent is `hash_2(left, right)`, and
/// zeros[i+1] = hash_2(zeros[i], zeros[i]). The offchain mirror replays `LeafInserted` events to rebuild paths.
/// @dev Every root ever produced stays valid (leaves are never removed), so a proof built against an older
/// root still verifies after later inserts.
abstract contract StandingPassTree {
    uint256 public constant TREE_DEPTH = 16;
    IPoseidon2 public immutable poseidon2;
    uint256 public nextLeafIndex;
    uint256 public currentRoot;
    mapping(uint256 => bool) public isKnownRoot;

    /// @dev filledSubtrees[i] = root of the most recently completed left subtree at level i.
    uint256[16] private filledSubtrees;

    uint256 private constant MAX_LEAVES = 1 << 16;

    // zeros[i] = root of an empty subtree of height i (Poseidon2 BN254, zero leaf = 0).
    uint256 internal constant Z_0 = 0;
    uint256 internal constant Z_1 = 0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1;
    uint256 internal constant Z_2 = 0x0e34ac2c09f45a503d2908bcb12f1cbae5fa4065759c88d501c097506a8b2290;
    uint256 internal constant Z_3 = 0x21f9172d72fdcdafc312eee05cf5092980dda821da5b760a9fb8dbdf607c8a20;
    uint256 internal constant Z_4 = 0x2373ea368857ec7af97e7b470d705848e2bf93ed7bef142a490f2119bcf82d8e;
    uint256 internal constant Z_5 = 0x120157cfaaa49ce3da30f8b47879114977c24b266d58b0ac18b325d878aafddf;
    uint256 internal constant Z_6 = 0x01c28fe1059ae0237b72334700697bdf465e03df03986fe05200cadeda66bd76;
    uint256 internal constant Z_7 = 0x2d78ed82f93b61ba718b17c2dfe5b52375b4d37cbbed6f1fc98b47614b0cf21b;
    uint256 internal constant Z_8 = 0x067243231eddf4222f3911defbba7705aff06ed45960b27f6f91319196ef97e1;
    uint256 internal constant Z_9 = 0x1849b85f3c693693e732dfc4577217acc18295193bede09ce8b97ad910310972;
    uint256 internal constant Z_10 = 0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686;
    uint256 internal constant Z_11 = 0x0f320b0703439a8114f81593de99cd0b8f3b9bf854601abb5b2ea0e8a3dda4a7;
    uint256 internal constant Z_12 = 0x0d07f6e7a8a0e9199d6d92801fff867002ff5b4808962f9da2ba5ce1bdd26a73;
    uint256 internal constant Z_13 = 0x1c4954081e324939350febc2b918a293ebcdaead01be95ec02fcbe8d2c1635d1;
    uint256 internal constant Z_14 = 0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a;
    uint256 internal constant Z_15 = 0x2b9cdd484c5ba1e4d6efcc3f18734b5ac4c4a0b9102e2aeb48521a661d3feee9;
    /// @dev Empty depth-16 root (SPEC known vector).
    uint256 internal constant Z_16 = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;

    event LeafInserted(uint256 indexed commitment, uint256 leafIndex, uint256 newRoot);

    error LeafOutOfField(uint256 leaf);
    error TreeFull();
    error ZeroValueMismatch(uint256 level);

    /// @dev Recomputes the zero chain with the injected hasher and checks it against the hardcoded
    /// constants, so a wrong Poseidon2 address (or a different hash) fails at deploy, not at first proof.
    constructor(IPoseidon2 p) {
        poseidon2 = p;
        uint256 z = 0;
        for (uint256 i = 0; i < TREE_DEPTH; ++i) {
            z = p.hash_2(z, z);
            if (z != _zeros(i + 1)) revert ZeroValueMismatch(i + 1);
        }
        currentRoot = z;
        isKnownRoot[z] = true;
    }

    /// @notice Appends `leaf` at index `nextLeafIndex` and records the new root as known.
    function _insert(uint256 leaf) internal virtual returns (uint256 index, uint256 newRoot) {
        if (leaf >= SNARK_FIELD) revert LeafOutOfField(leaf);
        index = nextLeafIndex;
        if (index >= MAX_LEAVES) revert TreeFull();

        IPoseidon2 p = poseidon2;
        uint256 node = leaf;
        uint256 cur = index;
        // Only the left subtree that this insert completes needs storing: the level of the lowest zero
        // bit of `index` (all lower bits are 1, so that subtree is now full). Higher left nodes are still
        // partial and get rewritten when they complete. One SSTORE per insert instead of up to 16.
        bool stored = false;
        for (uint256 i = 0; i < TREE_DEPTH; ++i) {
            if (cur & 1 == 0) {
                if (!stored) {
                    filledSubtrees[i] = node;
                    stored = true;
                }
                node = p.hash_2(node, _zeros(i));
            } else {
                node = p.hash_2(filledSubtrees[i], node);
            }
            cur >>= 1;
        }

        newRoot = node;
        nextLeafIndex = index + 1;
        currentRoot = newRoot;
        isKnownRoot[newRoot] = true;
        emit LeafInserted(leaf, index, newRoot);
    }

    /// @dev zeros[i] for i in [0, 16].
    function _zeros(uint256 i) internal pure returns (uint256 z) {
        if (i < 8) {
            if (i < 4) {
                if (i == 0) return Z_0;
                if (i == 1) return Z_1;
                if (i == 2) return Z_2;
                return Z_3;
            }
            if (i == 4) return Z_4;
            if (i == 5) return Z_5;
            if (i == 6) return Z_6;
            return Z_7;
        }
        if (i < 12) {
            if (i == 8) return Z_8;
            if (i == 9) return Z_9;
            if (i == 10) return Z_10;
            return Z_11;
        }
        if (i == 12) return Z_12;
        if (i == 13) return Z_13;
        if (i == 14) return Z_14;
        if (i == 15) return Z_15;
        if (i == 16) return Z_16;
        revert ZeroValueMismatch(i);
    }
}
