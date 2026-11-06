// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Policy, Offer} from "../src/Policy.sol";

contract PolicyHarness is Policy {
    constructor(address signer, address manager, uint256[4] memory caps, uint256[4] memory floors, uint256 limit, uint256 floor)
        Policy(msg.sender, signer, manager, caps, floors, limit, floor) {}

    function consume(Offer calldata offer, bytes calldata signature, uint256 exposure) external {
        _checkAndConsumeOffer(offer, signature, exposure);
    }

    function consumeNoSpend(Offer calldata offer, bytes calldata signature, uint256 exposure) external {
        _consumeOffer(offer, signature, exposure, false);
    }
}

contract PolicyTest is Test {
    PolicyHarness internal policy;
    uint256 internal constant KEY = 12345;
    address internal constant MANAGER = address(0x1234);
    uint256[4] internal caps = [uint256(50e6), 100e6, 200e6, 300e6];
    uint256[4] internal floors = [uint256(10e6), 20e6, 30e6, 40e6];

    function setUp() public {
        policy = new PolicyHarness(vm.addr(KEY), MANAGER, caps, floors, 1_000e6, 100e6);
    }

    function offer() internal view returns (Offer memory) {
        return Offer(bytes32(uint256(1)), bytes32(uint256(2)), address(0x123), 50e6, 50, 300, 500, 0, 42, 2, uint64(block.timestamp + 100));
    }

    function sign(Offer memory item, uint256 key) internal view returns (bytes memory) {
        bytes32 domain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("AdvanceBook"), keccak256("1"), block.chainid, address(policy)
        ));
        bytes32 structHash = keccak256(abi.encode(
            keccak256("Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 feeRateBpsPerWeek,uint16 feeCapBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)"),
            item.offerId, item.shopId, item.recipient, item.amount, item.feeRateBpsPerWeek, item.feeCapBps, item.holdbackBps,
            item.tier, item.passNullifier, item.minRevenueBand, item.expiresAt
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function check(Offer memory item, uint256 exposure) internal {
        policy.consume(item, sign(item, KEY), exposure);
    }

    function testValidAndReplay() public {
        Offer memory item = offer();
        vm.expectEmit(true, true, false, true);
        emit Policy.OfferConsumed(item.offerId, item.shopId, item.tier, item.amount);
        check(item, 950e6);
        assertTrue(policy.offerUsed(item.offerId));
        assertTrue(policy.passNullifierUsed(42));
        vm.expectRevert(Policy.OfferAlreadyUsed.selector);
        check(item, 0);
    }

    function testSignerAndExpiry() public {
        Offer memory item = offer();
        bytes memory wrong = sign(item, KEY + 1);
        vm.expectRevert(Policy.InvalidSignature.selector);
        policy.consume(item, wrong, 0);
        vm.warp(item.expiresAt);
        check(item, 0);
        item.offerId = bytes32(uint256(3));
        vm.warp(uint256(item.expiresAt) + 1);
        vm.expectRevert(Policy.OfferExpired.selector);
        check(item, 0);
    }

    function testAmountAndTier() public {
        Offer memory item = offer();
        item.amount = 51e6;
        vm.expectRevert(Policy.InvalidAmount.selector);
        check(item, 0);
        item.amount = 100e6;
        vm.expectRevert(Policy.TierCapExceeded.selector);
        check(item, 0);
        item.tier = 4;
        vm.expectRevert(Policy.InvalidTier.selector);
        check(item, 0);
        for (uint8 tier = 0; tier < 4; ++tier) {
            item.offerId = bytes32(uint256(tier) + 10);
            item.tier = tier;
            item.amount = caps[tier];
            item.passNullifier = tier == 0 ? 99 : 0;
            item.minRevenueBand = 0;
            check(item, 0);
        }
    }

    function testFuzzFeeRate(uint16 value) public {
        Offer memory item = offer();
        item.feeRateBpsPerWeek = uint16(bound(value, 0, 1001));
        if (item.feeRateBpsPerWeek == 0 || item.feeRateBpsPerWeek > policy.maxFeeRateBpsPerWeek()) vm.expectRevert(Policy.InvalidFeeRate.selector);
        check(item, 0);
    }

    function testFuzzHoldback(uint16 value) public {
        Offer memory item = offer();
        item.holdbackBps = uint16(bound(value, 499, 2001));
        if (item.holdbackBps < 500 || item.holdbackBps > 2000) vm.expectRevert(Policy.InvalidHoldback.selector);
        check(item, 0);
    }

    function testExactBoundaries() public {
        uint16[6] memory factors = [uint16(0), 1, 49, 50, 51, 1000];
        uint16[6] memory holdbacks = [uint16(499), 500, 501, 1999, 2000, 2001];
        for (uint256 index = 0; index < 6; ++index) {
            Offer memory item = offer();
            item.tier = 1;
            item.passNullifier = 0;
            item.minRevenueBand = 0;
            item.offerId = bytes32(index + 100);
            item.feeRateBpsPerWeek = factors[index];
            if (index == 0 || index >= 4) vm.expectRevert(Policy.InvalidFeeRate.selector);
            check(item, 0);
            item.offerId = bytes32(index + 200);
            item.feeRateBpsPerWeek = 50;
            item.holdbackBps = holdbacks[index];
            if (index == 0 || index == 5) vm.expectRevert(Policy.InvalidHoldback.selector);
            check(item, 0);
        }
    }

    function testFeeTermBoundsOwnerConfigurationAndEvents() public {
        vm.expectEmit(false, false, false, true, address(policy));
        emit Policy.FeeTermBoundsSet(75, 400);
        policy.setFeeTermBounds(75, 400);
        assertEq(policy.maxFeeRateBpsPerWeek(), 75);
        assertEq(policy.maxFeeCapBps(), 400);
        vm.prank(MANAGER); vm.expectRevert(); policy.setFeeTermBounds(50, 300);
        vm.expectRevert(Policy.InvalidFeeRate.selector); policy.setFeeTermBounds(0, 300);
        vm.expectRevert(Policy.InvalidFeeCap.selector); policy.setFeeTermBounds(50, 1001);
    }

    function testExposureAndNullifiers() public {
        Offer memory item = offer();
        vm.expectRevert(Policy.ExposureExceeded.selector);
        check(item, type(uint256).max);
        vm.expectRevert(Policy.ExposureExceeded.selector);
        check(item, 950e6 + 1);
        item.passNullifier = 0;
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        check(item, 0);
        item.passNullifier = 42;
        check(item, 0);
        item.offerId = bytes32(uint256(3));
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        check(item, 0);
        item.tier = 1;
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        check(item, 0);
        item.passNullifier = 0;
        vm.expectRevert(Policy.InvalidMinRevenueBand.selector); // a Standing Pass proves no revenue band
        check(item, 0);
        item.minRevenueBand = 0;
        check(item, 0);
    }

    /// Mandate draws (manual = false): the credential was spent at registerMandate, so no pass nullifier.
    function testMandateVariant() public {
        Offer memory item = offer(); // tier 0, passNullifier 42, band 2
        bytes memory sig = sign(item, KEY);
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        policy.consumeNoSpend(item, sig, 0);
        item.passNullifier = 0;
        policy.consumeNoSpend(item, sign(item, KEY), 0); // tier 0 + band, no nullifier: ok
        assertFalse(policy.passNullifierUsed(42));
        item.offerId = bytes32(uint256(9));
        item.tier = 1;
        sig = sign(item, KEY);
        vm.expectRevert(Policy.InvalidMinRevenueBand.selector);
        policy.consumeNoSpend(item, sig, 0);
        // the manual path still demands a nullifier at tier 0
        item.tier = 0;
        sig = sign(item, KEY);
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        policy.consume(item, sig, 0);
    }

    function testLimitsAndRoles() public {
        vm.expectRevert(Policy.UnauthorizedRiskManager.selector);
        policy.lowerLimits(caps, 1_000e6);
        uint256[4] memory changed = caps;
        changed[2] = caps[2] + 1;
        vm.prank(MANAGER);
        vm.expectRevert(Policy.InvalidLimits.selector);
        policy.lowerLimits(changed, 1_000e6);
        changed = floors;
        changed[1] = floors[1] - 1;
        vm.prank(MANAGER);
        vm.expectRevert(Policy.InvalidLimits.selector);
        policy.lowerLimits(changed, 100e6);
        vm.prank(MANAGER);
        vm.expectRevert(Policy.InvalidLimits.selector);
        policy.lowerLimits(floors, 100e6 - 1);
        vm.prank(MANAGER);
        vm.expectRevert(Policy.InvalidLimits.selector);
        policy.lowerLimits(floors, 1_000e6 + 1);
        vm.prank(MANAGER);
        policy.lowerLimits(floors, 100e6);
        assertEq(policy.tierCap(2), 30e6);
        assertEq(policy.maxExposure(), 100e6);
        policy.setLimits(caps, 1_000e6);
        assertEq(policy.tierCap(2), 200e6);
        assertEq(policy.maxExposure(), 1_000e6);
        vm.prank(MANAGER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, MANAGER));
        policy.setLimits(floors, 100e6);
        vm.prank(MANAGER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, MANAGER));
        policy.setOfferSigner(address(1));
        vm.prank(MANAGER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, MANAGER));
        policy.setRiskManager(address(1));
        policy.setOfferSigner(address(1));
        policy.setRiskManager(address(2));
        assertEq(policy.offerSigner(), address(1));
        assertEq(policy.riskManager(), address(2));
    }

    function testConstructorLimits() public {
        uint256[4] memory badCaps = caps;
        badCaps[3] = floors[3] - 1;
        vm.expectRevert(Policy.InvalidLimits.selector);
        new PolicyHarness(vm.addr(KEY), MANAGER, badCaps, floors, 1_000e6, 100e6);
        vm.expectRevert(Policy.InvalidLimits.selector);
        new PolicyHarness(vm.addr(KEY), MANAGER, caps, floors, 99e6, 100e6);
    }

    function testFuzzDigestFields(uint256 seed) public view {
        Offer memory item = offer();
        bytes32 original = policy.hashOffer(item);
        uint256 field = seed % 10;
        if (field == 0) item.offerId = bytes32(uint256(item.offerId) ^ 1);
        else if (field == 1) item.shopId = bytes32(uint256(item.shopId) ^ 1);
        else if (field == 2) item.recipient = address(uint160(item.recipient) ^ 1);
        else if (field == 3) item.amount ^= 1;
        else if (field == 4) item.feeRateBpsPerWeek ^= 1;
        else if (field == 5) item.holdbackBps ^= 1;
        else if (field == 6) item.tier ^= 1;
        else if (field == 7) item.passNullifier ^= 1;
        else if (field == 8) item.minRevenueBand ^= 1;
        else item.expiresAt ^= 1;
        assertTrue(policy.hashOffer(item) != original);
    }
}
