// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AdvanceBook, BookConfig} from "../src/AdvanceBook.sol";
import {Offer} from "../src/Policy.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {POSEIDON2_SEPOLIA} from "../src/Constants.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {BusinessPassRegistry} from "../src/BusinessPassRegistry.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";

/// Test-only: lets us place arbitrary leaves so the tree matches the circuit fixture.
contract AdvanceBookTreeHarness is AdvanceBook {
    constructor(BookConfig memory c) AdvanceBook(c) {}
    function exposedInsert(uint256 leaf) external returns (uint256 index, uint256 root) {
        return _insert(leaf);
    }
}

/// End-to-end: a real UltraHonk proof made by `bb` from circuits/standing_pass (Prover.toml),
/// checked by the generated HonkVerifier, inside AdvanceBook.drawWithPass.
contract StandingPassE2ETest is Test {
    // Fixture values: circuits/standing_pass/Prover.toml (secret 123456789, count 1, leaf at index 2).
    uint256 constant LEAF = 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f;
    uint256 constant ROOT = 0x1f48c09547ea846672822b4184c0b30cb75b0697131f4f7013b02bf2bc50f155;
    uint256 constant NULLIFIER = 0x0cf89fcd279f976f879be030c4624455df2d39f63e99eb51b8f584cbe2493c84;
    uint256 constant COMMITMENT_NEXT = 0x1cb17dce3bc4b070566c6556cbb5b95cb9eaea675c1d87109c9981f14c0d8b43;
    address constant RECIPIENT = address(0xbEEF);
    bytes32 constant OFFER_ID = bytes32(uint256(1));
    bytes32 constant SHOP = keccak256("chai-stall");
    uint256 constant SIGNER_PK = 0xA11CE;

    MockUSDC usdc;
    TrancheVault senior;
    TrancheVault junior;
    AdvanceBookTreeHarness book;
    IVerifier honk;
    bytes proof;

    function setUp() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        proof = vm.parseBytes(vm.readFile("test/fixtures/standing_pass.proof.hex"));
        honk = IVerifier(deployCode("HonkVerifier.sol:HonkVerifier"));

        usdc = new MockUSDC();
        senior = new TrancheVault(IERC20(address(usdc)), "Senior", "SNR", address(this), TrancheVault(address(0)), 0);
        junior = new TrancheVault(IERC20(address(usdc)), "Junior", "JNR", address(this), senior, 2000);
        book = new AdvanceBookTreeHarness(BookConfig(
            IERC20(address(usdc)), senior, junior, IPoseidon2(POSEIDON2_SEPOLIA), honk,
            address(this), vm.addr(SIGNER_PK), address(this),
            [uint256(50e6), 100e6, 200e6, 300e6], [uint256(50e6), 50e6, 50e6, 50e6], 100_000e6, 1_000e6, 30 days, 5e6,
            IBusinessPass(address(new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), address(this), address(0x155E), [uint16(32), 566, 404, 0]))),
            new MockVerifier(), address(0xA77E5)
        ));
        senior.setBook(address(book));
        junior.setBook(address(book));
        usdc.mint(address(this), 60_000e6);
        usdc.approve(address(senior), 50_000e6);
        senior.deposit(50_000e6, address(this));
        usdc.approve(address(junior), 10_000e6);
        junior.deposit(10_000e6, address(this));

        // Rebuild the fixture tree: [0x1111, 0x2222, LEAF]. Must land on the same root the proof used.
        book.exposedInsert(0x1111);
        book.exposedInsert(0x2222);
        (, uint256 root) = book.exposedInsert(LEAF);
        assertEq(root, ROOT, "onchain tree != circuit fixture tree");

        vm.prank(address(0xCAFE));
        book.registerShop(SHOP, address(0xCAFE));
    }

    function _offer(address recipient) internal view returns (Offer memory o, bytes memory sig) {
        o = Offer(OFFER_ID, SHOP, recipient, 100e6, 50, 300, 1000, 1, 0, 0, uint64(vm.getBlockTimestamp() + 1 days));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, book.hashOffer(o));
        sig = abi.encodePacked(r, s, v);
    }

    function test_contextMatchesCircuitFixture() public view {
        assertEq(book.contextFor(RECIPIENT, OFFER_ID), 0x2da7d3844245eb02c1913f4900e2fc846502b815c06dface72203765865992b7);
    }

    function test_generatedVerifierAcceptsFixtureProof() public view {
        bytes32[] memory pi = new bytes32[](5);
        pi[0] = bytes32(ROOT); pi[1] = bytes32(NULLIFIER); pi[2] = bytes32(uint256(1));
        pi[3] = bytes32(COMMITMENT_NEXT); pi[4] = bytes32(book.contextFor(RECIPIENT, OFFER_ID));
        assertTrue(honk.verify(proof, pi));
    }

    function test_drawWithPass_realProof_paysRecipient_fromAnySender() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT);
        vm.prank(address(0x5E1A7)); // relayer, not the merchant
        uint256 gasBefore = gasleft();
        uint256 id = book.drawWithPass(o, sig, proof, ROOT, NULLIFIER, COMMITMENT_NEXT);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("drawWithPass gas (incl. Honk verify)", gasUsed);
        assertEq(usdc.balanceOf(RECIPIENT), 100e6);
        assertTrue(book.nullifierSpent(NULLIFIER));
        assertEq(id, 1);
    }

    function test_drawWithPass_realProof_cannotBeRedirected() public {
        (Offer memory o, bytes memory sig) = _offer(address(0xBAD)); // front-runner swaps the recipient
        vm.expectRevert();
        book.drawWithPass(o, sig, proof, ROOT, NULLIFIER, COMMITMENT_NEXT);
    }

    function test_drawWithPass_realProof_cannotBeReplayed() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT);
        book.drawWithPass(o, sig, proof, ROOT, NULLIFIER, COMMITMENT_NEXT);
        vm.expectRevert();
        book.drawWithPass(o, sig, proof, ROOT, NULLIFIER, COMMITMENT_NEXT);
    }

    function test_drawWithPass_realProof_rejectsTamperedCommitment() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT);
        vm.expectRevert();
        book.drawWithPass(o, sig, proof, ROOT, NULLIFIER, COMMITMENT_NEXT ^ 1);
    }
}
