// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    AdvanceBook, BookConfig, Limits, MandateRequest, CredentialProof, AgentPassAttestation
} from "../src/AdvanceBook.sol";
import {BusinessPassRegistry, BusinessVerified} from "../src/BusinessPassRegistry.sol";
import {Offer} from "../src/Policy.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";
import {POSEIDON2_SEPOLIA} from "../src/Constants.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// End-to-end with REAL UltraHonk proofs made by `bb` from circuits/business_pass:
///   issuer attestation -> BusinessPassRegistry.issue -> the tree root equals the circuit fixture root ->
///   drawFirst (Prover.toml) / registerMandate + drawByMandate (Mandate.toml), checked by BusinessPassVerifier.
/// Fixture inputs: agents/scripts/bizpass_fixtures.py. Regenerate with circuits/business_pass/build.sh.
contract BusinessPassE2ETest is Test {
    uint256 constant LEAF = 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43;
    uint256 constant ROOT = 0x1da5b44f817335e17c31ff665643e7c8252c28aa6a3f1f594310b3a4fd9f5851;
    uint256 constant BIZ_NULL = 0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434ef;
    uint256 constant NEXT = 0x14e0b140100db7c2ae1c31ac28831324d36ce287bdbe5fc2891301b8a440b7d6;
    uint256 constant MANDATE_CTX = 0x246fd9403177080a71c53bea7247015857943cbb7371d1e8762a7a9e1421973e;
    address constant RECIPIENT = address(0xbEEF);
    bytes32 constant OFFER_ID = bytes32(uint256(1));
    bytes32 constant SHOP = keccak256("chai-stall");
    uint256 constant SIGNER_PK = 0xA11CE;
    uint256 constant ISSUER_PK = 0x155E;
    uint256 constant ATTESTER_PK = 0xA77E5;
    uint256 constant SHOP_OWNER_PK = 0x5409;
    uint256 constant AGENT_PK = 0xA6E7;

    MockUSDC usdc;
    TrancheVault senior;
    AdvanceBook book;
    BusinessPassRegistry registry;
    IVerifier bizHonk;
    bytes drawProof;
    bytes mandateProof;

    function setUp() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        drawProof = vm.parseBytes(vm.readFile("test/fixtures/business_pass.proof.hex"));
        mandateProof = vm.parseBytes(vm.readFile("test/fixtures/business_pass_mandate.proof.hex"));
        bizHonk = IVerifier(deployCode("BusinessPassVerifier.sol:BusinessPassVerifier"));
        IVerifier honk = IVerifier(deployCode("HonkVerifier.sol:HonkVerifier"));
        registry = new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), address(this), vm.addr(ISSUER_PK), [uint16(32), 566, 404, 0]);

        usdc = new MockUSDC();
        senior = new TrancheVault(IERC20(address(usdc)), "Senior", "SNR", address(this), TrancheVault(address(0)), 0);
        TrancheVault junior = new TrancheVault(IERC20(address(usdc)), "Junior", "JNR", address(this), senior, 2000);
        book = new AdvanceBook(BookConfig(
            IERC20(address(usdc)), senior, junior, IPoseidon2(POSEIDON2_SEPOLIA), honk,
            address(this), vm.addr(SIGNER_PK), address(this),
            [uint256(50e6), 100e6, 200e6, 300e6], [uint256(50e6), 50e6, 50e6, 50e6], 100_000e6, 1_000e6, 30 days, 5e6,
            IBusinessPass(address(registry)), bizHonk, vm.addr(ATTESTER_PK)
        ));
        senior.setBook(address(book));
        junior.setBook(address(book));
        usdc.mint(address(this), 60_000e6);
        usdc.approve(address(senior), 50_000e6);
        senior.deposit(50_000e6, address(this));
        usdc.approve(address(junior), 10_000e6);
        junior.deposit(10_000e6, address(this));

        // 1. The issuer verified zkTLS offchain and signs; a relayer submits. The onchain root must equal the
        //    root the fixture proofs were made against.
        BusinessVerified memory a = BusinessVerified(uint256(keccak256("hmac(pepper, acct_123)")), LEAF, uint64(block.timestamp + 1 hours));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ISSUER_PK, registry.hashBusinessVerified(a));
        vm.prank(address(0x5E1A7));
        registry.issue(a, abi.encodePacked(r, s, v), LEAF);
        assertEq(registry.currentRoot(), ROOT, "onchain Business Pass tree != circuit fixture tree");

        vm.prank(vm.addr(SHOP_OWNER_PK));
        book.registerShop(SHOP, address(0xCAFE));
    }

    function _offer(address recipient, uint8 minBand) internal view returns (Offer memory o, bytes memory sig) {
        o = Offer(OFFER_ID, SHOP, recipient, 50e6, 50, 300, 1000, 0, BIZ_NULL, minBand, uint64(block.timestamp + 1 days));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, book.hashOffer(o));
        sig = abi.encodePacked(r, s, v);
    }

    function test_generatedVerifierAcceptsFixtureProof() public view {
        bytes32[] memory pi = new bytes32[](9);
        (pi[0], pi[1], pi[2], pi[3], pi[4]) =
            (bytes32(ROOT), bytes32(BIZ_NULL), bytes32(uint256(1)), bytes32(NEXT), bytes32(book.contextFor(RECIPIENT, OFFER_ID)));
        (pi[5], pi[6], pi[7], pi[8]) = (bytes32(uint256(32)), bytes32(uint256(566)), bytes32(uint256(404)), bytes32(0));
        assertTrue(bizHonk.verify(drawProof, pi));
    }

    function test_drawFirst_realProof_paysRecipient_fromAnySender() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT, 1);
        vm.prank(address(0x5E1A7));
        uint256 gasBefore = gasleft();
        uint256 id = book.drawFirst(o, sig, drawProof, ROOT, NEXT);
        emit log_named_uint("drawFirst gas (incl. Honk verify)", gasBefore - gasleft());
        assertEq(usdc.balanceOf(RECIPIENT), 50e6);
        assertTrue(book.passNullifierUsed(BIZ_NULL));
        assertEq(book.getAdvance(id).pendingCommitment, NEXT, "first Standing Pass commitment from the proof");
    }

    function test_drawFirst_realProof_cannotBeRedirected() public {
        (Offer memory o, bytes memory sig) = _offer(address(0xBAD), 1);
        vm.expectRevert();
        book.drawFirst(o, sig, drawProof, ROOT, NEXT);
    }

    /// The proof shows band >= 1; it cannot back an offer that demands band >= 3.
    function test_drawFirst_realProof_cannotClaimHigherBand() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT, 3);
        vm.expectRevert();
        book.drawFirst(o, sig, drawProof, ROOT, NEXT);
    }

    function test_drawFirst_realProof_cannotBeReplayed() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT, 1);
        book.drawFirst(o, sig, drawProof, ROOT, NEXT);
        vm.expectRevert();
        book.drawFirst(o, sig, drawProof, ROOT, NEXT);
    }

    function test_drawFirst_realProof_rejectsTamperedCommitment() public {
        (Offer memory o, bytes memory sig) = _offer(RECIPIENT, 1);
        vm.expectRevert();
        book.drawFirst(o, sig, drawProof, ROOT, NEXT ^ 1);
    }

    // ------------------------------------------------------------------ mandate with a real proof

    function _mandate() internal pure returns (MandateRequest memory r) {
        // Must equal MANDATE_FIXTURE in agents/scripts/bizpass_fixtures.py.
        r = MandateRequest(SHOP, vm.addr(AGENT_PK), RECIPIENT, Limits(100e6, 250e6, 30 days, 1_800_000_000), 0, 1);
    }

    function _sig(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AdvanceBook"),
                keccak256("1"),
                block.chainid,
                address(book)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _att(MandateRequest memory r, uint256 nonce) internal view returns (AgentPassAttestation memory) {
        uint64 exp = uint64(block.timestamp + 1 hours);
        bytes32 sh = keccak256(abi.encode(book.AGENT_PASS_TYPEHASH(), r.agentKey, book.hashLimits(r.limits), nonce, exp));
        return AgentPassAttestation(nonce, exp, _sig(ATTESTER_PK, sh));
    }

    function test_registerMandate_realProof_thenAutomaticDraw() public {
        vm.warp(1_800_000_000 - 30 days); // expiry must be within 180 days
        MandateRequest memory r = _mandate();
        assertEq(book.mandateContext(r), MANDATE_CTX, "context matches the circuit fixture");
        bytes32 mh = book.mandateHash(r);
        AgentPassAttestation memory att = _att(r, 1);
        vm.prank(address(0x5E1A7));
        uint256 id = book.registerMandate(r, CredentialProof(mandateProof, ROOT, BIZ_NULL, NEXT), att, _sig(SHOP_OWNER_PK, mh));
        assertTrue(book.passNullifierUsed(BIZ_NULL));

        // the draw proof (context = recipient/offer) cannot be used to register a mandate
        r.limits.maxPerPeriod = 200e6;
        bytes32 mh2 = book.mandateHash(r);
        AgentPassAttestation memory att2 = _att(r, 2);
        bytes memory os2 = _sig(SHOP_OWNER_PK, mh2);
        vm.expectRevert();
        book.registerMandate(r, CredentialProof(drawProof, ROOT, BIZ_NULL + 1, NEXT), att2, os2);

        // automatic draw: nobody taps; the managed agent signs, the relayer submits
        Offer memory o = Offer(OFFER_ID, SHOP, RECIPIENT, 50e6, 50, 300, 1000, 0, 0, 1, uint64(block.timestamp + 1 days));
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(SIGNER_PK, book.hashOffer(o));
        bytes memory sig = abi.encodePacked(rr, ss, v);
        bytes memory agentSig = _sig(AGENT_PK, keccak256(abi.encode(book.MANDATE_DRAW_TYPEHASH(), o.offerId, id)));
        vm.prank(address(0x5E1A7));
        uint256 adv = book.drawByMandate(o, sig, id, agentSig);
        assertEq(usdc.balanceOf(RECIPIENT), 50e6);
        assertEq(book.getAdvance(adv).pendingCommitment, NEXT);
    }

    /// Hard-coded fixture vs. Solidity: the fixture's mandate hash must not drift from the struct order.
    function test_mandateFixture_matchesPython() public view {
        assertEq(uint256(book.mandateHash(_mandate())) % 21888242871839275222246405745257275088548364400416034343698204186575808495617, MANDATE_CTX);
    }
}
