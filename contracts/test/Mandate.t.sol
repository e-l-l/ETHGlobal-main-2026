// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest} from "./Base.t.sol";
import {
    AdvanceBook, Limits, MandateRequest, CredentialProof, AgentPassAttestation
} from "../src/AdvanceBook.sol";
import {Offer, Policy} from "../src/Policy.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {SNARK_FIELD} from "../src/Constants.sol";

/// Managed-agent mandates: registration (owner consent + AgentPass + ZK credential), automatic draws within
/// limits, expiry, revocation. Verifiers are mocks here; test/BusinessPassE2E.t.sol uses a real proof.
contract MandateTest is BaseTest {
    uint256 internal constant SHOP_OWNER_PK = 0x5409;
    uint256 internal constant AGENT_PK = 0xA6E7;
    uint256 internal constant EMPTY_ROOT = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;
    uint256 internal constant NEXT = 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f;
    uint256 internal constant BIZ_NULL = 0x146331e1a547faff1addc3e060f70f2f29e5da10b0833b99952d7aa8276434ef;
    bytes32 internal constant SHOP = keccak256("chai-stall");
    bytes32 internal constant SHOP2 = keccak256("other-stall");
    address internal constant RCPT = address(0xbEEF);

    address internal shopOwner;
    address internal agent;
    uint256 internal offerSerial;

    function setUp() public override {
        super.setUp();
        shopOwner = vm.addr(SHOP_OWNER_PK);
        agent = vm.addr(AGENT_PK);
        _registerShop(shopOwner, SHOP, address(0xCAFE));
        vm.warp(1_700_000_000);
    }

    // ------------------------------------------------------------------ helpers

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AdvanceBook"),
                keccak256("1"),
                block.chainid,
                address(book)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _req(uint8 tier, uint8 band) internal view returns (MandateRequest memory r) {
        r = MandateRequest({
            shopId: SHOP,
            agentKey: agent,
            recipient: RCPT,
            limits: Limits({
                maxPerDraw: tier == 0 ? 50e6 : 100e6,
                maxPerPeriod: tier == 0 ? 100e6 : 150e6,
                period: 30 days,
                expiry: uint64(block.timestamp + 90 days)
            }),
            tier: tier,
            band: band
        });
    }

    /// Independent struct hash (not via book.mandateHash), so a wrong typehash or field order fails.
    function _mandateHash(MandateRequest memory r) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "Mandate(bytes32 shopId,address agentKey,address recipient,uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry,uint8 tier,uint8 band)"
                ),
                r.shopId,
                r.agentKey,
                r.recipient,
                r.limits.maxPerDraw,
                r.limits.maxPerPeriod,
                r.limits.period,
                r.limits.expiry,
                r.tier,
                r.band
            )
        );
    }

    function _ownerSig(MandateRequest memory r, uint256 pk) internal view returns (bytes memory) {
        return _sig(pk, _digest(_mandateHash(r)));
    }

    uint256 internal attNonce;

    function _limitsHash(Limits memory l) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("Limits(uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry)"),
                l.maxPerDraw, l.maxPerPeriod, l.period, l.expiry
            )
        );
    }

    /// AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry), fresh nonce each call.
    function _att(MandateRequest memory r, uint256 pk, uint64 expiry) internal returns (AgentPassAttestation memory) {
        uint256 nonce = ++attNonce;
        bytes32 sh = keccak256(
            abi.encode(
                keccak256("AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)"),
                r.agentKey, _limitsHash(r.limits), nonce, expiry
            )
        );
        return AgentPassAttestation(nonce, expiry, _sig(pk, _digest(sh)));
    }

    function _proof(uint256 nullifier) internal pure returns (CredentialProof memory) {
        return CredentialProof(hex"01", EMPTY_ROOT, nullifier, NEXT);
    }

    function _register(MandateRequest memory r, uint256 nullifier) internal returns (uint256) {
        vm.prank(address(0x5E1A7)); // relayer
        return book.registerMandate(r, _proof(nullifier), _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours)), _ownerSig(r, SHOP_OWNER_PK));
    }

    function _mOffer(uint8 tier, uint256 amount, uint256 passNullifier, uint8 minBand)
        internal
        returns (Offer memory o, bytes memory sig)
    {
        o = Offer(bytes32(++offerSerial), SHOP, RCPT, amount, 50, 300, 1000, tier, passNullifier, minBand, uint64(block.timestamp + 1 hours));
        sig = _signOffer(o, OFFER_SIGNER_PK);
    }

    function _agentSig(uint256 id, bytes32 offerId, uint256 pk) internal view returns (bytes memory) {
        return _sig(pk, _digest(keccak256(abi.encode(keccak256("MandateDraw(bytes32 offerId,uint256 mandateId)"), offerId, id))));
    }

    function _draw(uint256 id, uint8 tier, uint256 amount) internal returns (uint256) {
        (Offer memory o, bytes memory sig) = _mOffer(tier, amount, 0, 0); // mandate offers carry no nullifier
        vm.prank(address(0x5E1A7));
        return book.drawByMandate(o, sig, id, _agentSig(id, o.offerId, AGENT_PK));
    }

    function _repay(uint256 advanceId) internal {
        uint256 owed = book.owedOf(advanceId);
        _pay(address(0xC0FFEE), SHOP, owed * 10); // holdback 10%
        assertEq(uint8(book.getAdvance(advanceId).status), uint8(AdvanceBook.Status.Repaid));
    }

    // ------------------------------------------------------------------ registration

    function test_register_tier0_businessPass_exactInputs_spendsNullifier() public {
        MandateRequest memory r = _req(0, 2);
        uint256 ctx = uint256(_mandateHash(r)) % SNARK_FIELD;
        assertEq(book.mandateContext(r), ctx);
        bytes32[] memory pi = new bytes32[](9);
        (pi[0], pi[1], pi[2], pi[3], pi[4]) = (bytes32(EMPTY_ROOT), bytes32(BIZ_NULL), bytes32(uint256(2)), bytes32(NEXT), bytes32(ctx));
        (pi[5], pi[6], pi[7], pi[8]) = (bytes32(uint256(32)), bytes32(uint256(566)), bytes32(uint256(404)), bytes32(0));
        vm.expectCall(address(bizVerifier), abi.encodeCall(IVerifier.verify, (hex"01", pi)));
        vm.expectEmit(true, true, true, true, address(book));
        emit AdvanceBook.MandateRegistered(1, SHOP, agent, 0, r.limits);
        uint256 id = _register(r, BIZ_NULL);

        assertEq(id, 1);
        assertTrue(book.passNullifierUsed(BIZ_NULL));
        AdvanceBook.Mandate memory m = book.getMandate(id);
        assertEq(m.agentKey, agent);
        assertEq(m.recipient, RCPT);
        assertEq(m.band, 2);
        assertEq(m.limitsHash, _limitsHash(r.limits));
        assertEq(m.limitsHash, book.hashLimits(r.limits));
        assertEq(m.pendingCommitment, NEXT);
        assertEq(m.periodStart, block.timestamp);
    }

    function test_register_tier1_standingPass_spendsNullifier() public {
        MandateRequest memory r = _req(1, 0);
        bytes32[] memory pi = new bytes32[](5);
        (pi[0], pi[1], pi[2], pi[3], pi[4]) =
            (bytes32(EMPTY_ROOT), bytes32(uint256(777)), bytes32(uint256(1)), bytes32(NEXT), bytes32(book.mandateContext(r)));
        vm.expectCall(address(verifier), abi.encodeCall(IVerifier.verify, (hex"01", pi)));
        uint256 id = _register(r, 777);
        assertTrue(book.nullifierSpent(777));
        assertFalse(book.passNullifierUsed(777));
        assertEq(book.getMandate(id).tier, 1);
    }

    function test_register_reverts_badOwnerSig_strangerCannotMandateMyShop() public {
        MandateRequest memory r = _req(0, 1);
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory stranger = _ownerSig(r, 0xBAD);
        vm.expectRevert(AdvanceBook.InvalidMandateSignature.selector);
        book.registerMandate(r, _proof(BIZ_NULL), a, stranger);
        assertFalse(book.passNullifierUsed(BIZ_NULL));
    }

    function test_register_reverts_agentPass_wrongKey_expired_otherLimits() public {
        MandateRequest memory r = _req(0, 1);
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        AgentPassAttestation memory wrongKey = _att(r, 0xBAD, uint64(block.timestamp + 1 hours));
        vm.expectRevert(AdvanceBook.InvalidAgentPass.selector);
        book.registerMandate(r, _proof(BIZ_NULL), wrongKey, os);

        AgentPassAttestation memory expired = _att(r, ATTESTER_PK, uint64(block.timestamp - 1));
        vm.expectRevert(AdvanceBook.InvalidAgentPass.selector);
        book.registerMandate(r, _proof(BIZ_NULL), expired, os);

        // the human approved 50/100; the request claims 50/200
        AgentPassAttestation memory approved = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        r.limits.maxPerPeriod = 200e6;
        os = _ownerSig(r, SHOP_OWNER_PK);
        vm.expectRevert(AdvanceBook.InvalidAgentPass.selector);
        book.registerMandate(r, _proof(BIZ_NULL), approved, os);
    }

    function test_register_reverts_invalidLimits() public {
        for (uint256 k = 0; k < 8; ++k) {
            MandateRequest memory r = _req(0, 1);
            if (k == 0) r.limits.maxPerDraw = 0;
            else if (k == 1) r.limits.maxPerPeriod = r.limits.maxPerDraw - 1;
            else if (k == 2) r.limits.period = 0;
            else if (k == 3) r.limits.expiry = uint64(block.timestamp);
            else if (k == 4) r.limits.expiry = uint64(block.timestamp + 180 days + 1);
            else if (k == 5) r.tier = 4;
            else if (k == 6) (r.tier, r.band) = (1, 1); // a Standing Pass proves no band
            else r.agentKey = address(0);
            AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
            bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
            vm.expectRevert(AdvanceBook.InvalidMandate.selector);
            book.registerMandate(r, _proof(BIZ_NULL), a, os);
        }
        // boundary: exactly MAX_MANDATE_DURATION is fine
        MandateRequest memory ok = _req(0, 1);
        ok.limits.expiry = uint64(block.timestamp + 180 days);
        _register(ok, BIZ_NULL);
    }

    function test_register_reverts_unregisteredShop() public {
        MandateRequest memory r = _req(0, 1);
        r.shopId = SHOP2;
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopNotRegistered.selector, SHOP2));
        book.registerMandate(r, _proof(BIZ_NULL), a, os);
    }

    function test_register_reverts_replays() public {
        MandateRequest memory r = _req(0, 1);
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        book.registerMandate(r, _proof(BIZ_NULL), a, os);
        assertTrue(book.agentPassNonceUsed(a.nonce));
        // same attestation (nonce), fresh credential: the human approved ONE mandate
        vm.expectRevert(AdvanceBook.InvalidAgentPass.selector);
        book.registerMandate(r, _proof(BIZ_NULL + 1), a, os);
        // same Business Pass for another mandate: its first-advance nullifier is gone
        r.limits.maxPerPeriod = 50e6;
        a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        os = _ownerSig(r, SHOP_OWNER_PK);
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        book.registerMandate(r, _proof(BIZ_NULL), a, os);
    }

    function test_register_reverts_proofFalse_noStateChange() public {
        bizVerifier.setResult(false);
        MandateRequest memory r = _req(0, 1);
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.registerMandate(r, _proof(BIZ_NULL), a, os);
        assertFalse(book.passNullifierUsed(BIZ_NULL));
        assertEq(book.nextMandateId(), 1);
    }

    function test_register_reverts_unknownRoot() public {
        MandateRequest memory r = _req(1, 0);
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        CredentialProof memory p = _proof(777);
        p.root = 12345;
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.UnknownRoot.selector, 12345));
        book.registerMandate(r, p, a, os);
    }

    // ------------------------------------------------------------------ draws

    function test_drawByMandate_enforcesCover() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        junior.withdraw(junior.maxWithdraw(address(this)), address(this), address(this));
        (Offer memory o, bytes memory sig) = _mOffer(0, 50e6, 0, 0);
        bytes memory agentSig = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.InsufficientJuniorCover.selector, 0, 10e6));
        book.drawByMandate(o, sig, id, agentSig);
        assertEq(book.getMandate(id).drawnInPeriod, 0);
    }

    function test_drawByMandate_happy_relayerSubmits_firstDrawCarriesCredential() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        vm.expectEmit(true, true, false, true, address(book));
        emit AdvanceBook.MandateDrawn(id, 1, 50e6);
        uint256 adv = _draw(id, 0, 50e6);
        assertEq(usdc.balanceOf(RCPT), 50e6, "pinned recipient paid");
        assertEq(book.getAdvance(adv).pendingCommitment, NEXT);
        assertEq(book.getMandate(id).pendingCommitment, 0);
        assertEq(book.getMandate(id).drawnInPeriod, 50e6);

        _repay(adv);
        book.claimStandingPass(adv);
        assertEq(book.nextLeafIndex(), 1);

        uint256 adv2 = _draw(id, 0, 50e6);
        _repay(adv2);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NoCredential.selector, adv2));
        book.claimStandingPass(adv2);
    }

    function test_drawByMandate_limits_perDraw_perPeriod_reset() public {
        uint256 id = _register(_req(1, 0), 777); // 100 per draw, 150 per 30 days
        uint256 t0 = block.timestamp;

        (Offer memory o, bytes memory sig) = _mOffer(1, 200e6, 0, 0); // over maxPerDraw
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(AdvanceBook.MandateLimitExceeded.selector);
        book.drawByMandate(o, sig, id, as_);

        _repay(_draw(id, 1, 100e6)); // 100 / 150
        _repay(_draw(id, 1, 50e6)); // 150 / 150 exactly
        (o, sig) = _mOffer(1, 50e6, 0, 0);
        as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(AdvanceBook.MandateLimitExceeded.selector);
        book.drawByMandate(o, sig, id, as_);

        vm.warp(t0 + 30 days - 1); // last second of the period
        (o, sig) = _mOffer(1, 50e6, 0, 0);
        as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(AdvanceBook.MandateLimitExceeded.selector);
        book.drawByMandate(o, sig, id, as_);

        vm.warp(t0 + 30 days); // new period
        _draw(id, 1, 100e6);
        assertEq(book.getMandate(id).drawnInPeriod, 100e6);
        assertEq(book.getMandate(id).periodStart, t0 + 30 days);
    }

    function test_drawByMandate_oneActiveAdvancePerShop() public {
        uint256 id = _register(_req(1, 0), 777);
        uint256 adv = _draw(id, 1, 50e6);
        (Offer memory o, bytes memory sig) = _mOffer(1, 50e6, 0, 0);
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopHasActiveAdvance.selector, SHOP, adv));
        book.drawByMandate(o, sig, id, as_);
    }

    function test_drawByMandate_expiryBoundary() public {
        MandateRequest memory r = _req(1, 0);
        uint256 id = _register(r, 777);
        vm.warp(r.limits.expiry); // still valid at the expiry second
        _repay(_draw(id, 1, 50e6));
        vm.warp(uint256(r.limits.expiry) + 1);
        (Offer memory o, bytes memory sig) = _mOffer(1, 50e6, 0, 0);
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.MandateInactive.selector, id));
        book.drawByMandate(o, sig, id, as_);
    }

    function test_drawByMandate_reverts_mismatches() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        Offer memory o;
        bytes memory sig;
        for (uint256 k = 0; k < 4; ++k) {
            if (k == 0) (o, sig) = _mOffer(1, 50e6, 0, 0); // tier 1 offer, tier 0 mandate
            else if (k == 1) (o, sig) = _mOffer(0, 50e6, 0, 2); // asks band 2, proven 1
            else {
                (o, sig) = _mOffer(0, 50e6, 0, 0);
                if (k == 2) o.recipient = address(0xBAD); // agent cannot redirect funds
                else o.shopId = SHOP2; // nor draw for another shop
                sig = _signOffer(o, OFFER_SIGNER_PK);
            }
            bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
            vm.expectRevert(AdvanceBook.MandateMismatch.selector);
            book.drawByMandate(o, sig, id, as_);
        }
    }

    function test_drawByMandate_reverts_badAgentSig_unknownMandate_offerReplay() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        (Offer memory o, bytes memory sig) = _mOffer(0, 50e6, 0, 1);
        bytes memory wrongKey = _agentSig(id, o.offerId, 0xBAD);
        vm.expectRevert(AdvanceBook.InvalidMandateSignature.selector);
        book.drawByMandate(o, sig, id, wrongKey);
        bytes memory otherOffer = _agentSig(id, bytes32(uint256(999)), AGENT_PK);
        vm.expectRevert(AdvanceBook.InvalidMandateSignature.selector);
        book.drawByMandate(o, sig, id, otherOffer);
        bytes memory good = _agentSig(id + 1, o.offerId, AGENT_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.UnknownMandate.selector, id + 1));
        book.drawByMandate(o, sig, id + 1, good);

        good = _agentSig(id, o.offerId, AGENT_PK);
        uint256 adv = book.drawByMandate(o, sig, id, good);
        _repay(adv);
        vm.expectRevert(Policy.OfferAlreadyUsed.selector);
        book.drawByMandate(o, sig, id, good);
    }

    /// Tier 0 under a mandate: the Business Pass nullifier was spent at registerMandate; offers carry none.
    function test_drawByMandate_rejectsOfferWithPassNullifier() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        (Offer memory o, bytes memory sig) = _mOffer(0, 50e6, BIZ_NULL, 0);
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        book.drawByMandate(o, sig, id, as_);
    }

    function test_drawByMandate_badOfferSignature_reverts() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        (Offer memory o,) = _mOffer(0, 50e6, 0, 0);
        bytes memory forged = _signOffer(o, 0xBAD); // the agent cannot underwrite itself
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(Policy.InvalidSignature.selector);
        book.drawByMandate(o, forged, id, as_);
    }

    // ------------------------------------------------------------------ revocation

    function _revokeSig(uint256 id, uint256 pk) internal view returns (bytes memory) {
        return _sig(pk, _digest(keccak256(abi.encode(keccak256("RevokeMandate(uint256 mandateId)"), id))));
    }

    function test_revoke_byShopOwner_or_agent_notStranger() public {
        uint256 id = _register(_req(0, 1), BIZ_NULL);
        bytes memory bad = _revokeSig(id, 0xBAD);
        vm.expectRevert(AdvanceBook.InvalidMandateSignature.selector);
        book.revokeMandate(id, bad);

        vm.expectEmit(true, false, false, false, address(book));
        emit AdvanceBook.MandateRevoked(id);
        book.revokeMandate(id, _revokeSig(id, SHOP_OWNER_PK)); // the merchant pulls the plug
        assertTrue(book.getMandate(id).revoked);
        book.revokeMandate(id, _revokeSig(id, AGENT_PK)); // idempotent; the agent may also revoke

        (Offer memory o, bytes memory sig) = _mOffer(0, 50e6, 0, 0);
        bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.MandateInactive.selector, id));
        book.drawByMandate(o, sig, id, as_);

        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.UnknownMandate.selector, 99));
        book.revokeMandate(99, bad);
    }

    function test_setAgentPassAttester_onlyOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        book.setAgentPassAttester(address(1));
        vm.expectRevert(AdvanceBook.ZeroAddress.selector);
        book.setAgentPassAttester(address(0));
        book.setAgentPassAttester(address(1));
        assertEq(book.agentPassAttester(), address(1));
        // the old attester can no longer register mandates
        MandateRequest memory r = _req(0, 1);
        AgentPassAttestation memory a = _att(r, ATTESTER_PK, uint64(block.timestamp + 1 hours));
        bytes memory os = _ownerSig(r, SHOP_OWNER_PK);
        vm.expectRevert(AdvanceBook.InvalidAgentPass.selector);
        book.registerMandate(r, _proof(BIZ_NULL), a, os);
    }

    // ------------------------------------------------------------------ fuzz

    /// Any sequence of draws: per-period total never exceeds maxPerPeriod and each draw <= maxPerDraw.
    function testFuzz_drawByMandate_neverExceedsLimits(uint256 seed, address caller) public {
        if (caller == address(0)) caller = address(0x5E1A7);
        uint256 id = _register(_req(1, 0), 777); // 100 / 150 per 30 days
        uint256[4] memory sizes = [uint256(50e6), 100e6, 200e6, 300e6];
        uint256 periodStart = block.timestamp;
        uint256 drawn;
        for (uint256 i = 0; i < 12; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            vm.warp(block.timestamp + bound(r, 0, 7 days)); // 12 x 7 days < 90-day expiry
            if (block.timestamp >= periodStart + 30 days) (periodStart, drawn) = (block.timestamp, 0);
            uint256 amount = sizes[(r >> 64) % 2]; // 50 or 100 (tier-1 cap is 100)
            (Offer memory o, bytes memory sig) = _mOffer(1, amount, 0, 0);
            bytes memory as_ = _agentSig(id, o.offerId, AGENT_PK);
            vm.prank(caller);
            try book.drawByMandate(o, sig, id, as_) returns (uint256 adv) {
                drawn += amount;
                assertLe(drawn, 150e6);
                _repay(adv);
            } catch {
                assertGt(drawn + amount, 150e6, "only the period cap may refuse here");
            }
            assertEq(book.getMandate(id).drawnInPeriod, drawn);
        }
    }
}
