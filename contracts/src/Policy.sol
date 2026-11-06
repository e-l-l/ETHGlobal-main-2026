// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Agent-signed advance offer. See SPEC.md.
struct Offer {
    bytes32 offerId;
    bytes32 shopId;
    address recipient;
    uint256 amount;
    uint16 factorBps;
    uint16 holdbackBps;
    uint8 tier;
    uint256 passNullifier; // tier 0: Business Pass first-advance nullifier (proven in-circuit); else 0
    uint8 minRevenueBand; // tier 0: minimum Business Pass revenue band the proof must meet (0 = none); else 0
    uint64 expiresAt;
}

/// @notice EIP-712 agent offers, tier caps, exposure cap, downward-only risk limits. See SPEC.md (v2).
abstract contract Policy is EIP712, Ownable2Step {
    error InvalidSignature();
    error OfferAlreadyUsed();
    error OfferExpired();
    error InvalidAmount();
    error InvalidTier();
    error TierCapExceeded();
    error InvalidFactor();
    error InvalidHoldback();
    error ExposureExceeded();
    error InvalidPassNullifier();
    error InvalidMinRevenueBand();
    error UnauthorizedRiskManager();
    error InvalidLimits();
    bytes32 public constant OFFER_TYPEHASH = keccak256(
        "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)"
    );

    address public offerSigner;
    address public riskManager;
    uint256[4] public tierCap;
    uint256[4] public tierCapFloor;
    uint256 public maxExposure;
    uint256 public maxExposureFloor;
    mapping(bytes32 => bool) public offerUsed;
    mapping(uint256 => bool) public passNullifierUsed;

    event OfferConsumed(bytes32 indexed offerId, bytes32 indexed shopId, uint8 tier, uint256 amount);
    event LimitsChanged(address indexed by, uint256[4] caps, uint256 maxExposure);

    constructor(
        address owner_,
        address offerSigner_,
        address riskManager_,
        uint256[4] memory caps,
        uint256[4] memory capFloors,
        uint256 maxExposure_,
        uint256 maxExposureFloor_
    ) EIP712("AdvanceBook", "1") Ownable(owner_) {
        for (uint256 index = 0; index < 4; ++index) {
            if (caps[index] < capFloors[index]) revert InvalidLimits();
        }
        if (maxExposure_ < maxExposureFloor_) revert InvalidLimits();
        offerSigner = offerSigner_;
        riskManager = riskManager_;
        tierCap = caps;
        tierCapFloor = capFloors;
        maxExposure = maxExposure_;
        maxExposureFloor = maxExposureFloor_;
    }

    function hashOffer(Offer calldata o) public view virtual returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            OFFER_TYPEHASH, o.offerId, o.shopId, o.recipient, o.amount, o.factorBps,
            o.holdbackBps, o.tier, o.passNullifier, o.minRevenueBand, o.expiresAt
        )));
    }

    /// @dev Manual draws: a tier-0 offer spends its Business Pass first-advance nullifier here.
    function _checkAndConsumeOffer(Offer calldata o, bytes calldata sig, uint256 currentExposure) internal virtual {
        _consumeOffer(o, sig, currentExposure, true);
    }

    /// @param manual true for drawFirst / drawWithPass. false for mandate draws: their credential was spent
    ///        once, at registerMandate, so the offer carries no pass nullifier (passNullifier must be 0 at every
    ///        tier) and AdvanceBook checks minRevenueBand against the mandate's proven band.
    function _consumeOffer(Offer calldata o, bytes calldata sig, uint256 currentExposure, bool manual)
        internal
    {
        if (!SignatureChecker.isValidSignatureNow(offerSigner, hashOffer(o), sig)) revert InvalidSignature();
        if (offerUsed[o.offerId]) revert OfferAlreadyUsed();
        if (block.timestamp > o.expiresAt) revert OfferExpired();
        if (o.tier > 3) revert InvalidTier();
        if (o.amount != 50e6 && o.amount != 100e6 && o.amount != 250e6 && o.amount != 500e6) {
            revert InvalidAmount();
        }
        if (o.amount > tierCap[o.tier]) revert TierCapExceeded();
        if (o.factorBps < 11000 || o.factorBps > 15000) revert InvalidFactor();
        if (o.holdbackBps < 500 || o.holdbackBps > 2000) revert InvalidHoldback();
        if (currentExposure > maxExposure || o.amount > maxExposure - currentExposure) revert ExposureExceeded();
        if (!manual) {
            if (o.passNullifier != 0) revert InvalidPassNullifier();
            if (o.tier != 0 && o.minRevenueBand != 0) revert InvalidMinRevenueBand();
        } else if (o.tier == 0) {
            if (o.passNullifier == 0 || passNullifierUsed[o.passNullifier]) revert InvalidPassNullifier();
            passNullifierUsed[o.passNullifier] = true;
        } else {
            // A Standing Pass proof proves no revenue band and spends its own nullifier, so both must be 0.
            if (o.passNullifier != 0) revert InvalidPassNullifier();
            if (o.minRevenueBand != 0) revert InvalidMinRevenueBand();
        }
        offerUsed[o.offerId] = true;
        emit OfferConsumed(o.offerId, o.shopId, o.tier, o.amount);
    }

    function lowerLimits(uint256[4] calldata caps, uint256 maxExposure_) external virtual {
        if (msg.sender != riskManager) revert UnauthorizedRiskManager();
        for (uint256 index = 0; index < 4; ++index) {
            if (caps[index] > tierCap[index] || caps[index] < tierCapFloor[index]) revert InvalidLimits();
        }
        if (maxExposure_ > maxExposure || maxExposure_ < maxExposureFloor) revert InvalidLimits();
        tierCap = caps;
        maxExposure = maxExposure_;
        emit LimitsChanged(msg.sender, caps, maxExposure_);
    }

    function setLimits(uint256[4] calldata caps, uint256 maxExposure_) external virtual onlyOwner {
        tierCap = caps;
        maxExposure = maxExposure_;
        emit LimitsChanged(msg.sender, caps, maxExposure_);
    }

    function setOfferSigner(address s) external virtual onlyOwner {
        offerSigner = s;
    }

    function setRiskManager(address r) external virtual onlyOwner {
        riskManager = r;
    }
}
