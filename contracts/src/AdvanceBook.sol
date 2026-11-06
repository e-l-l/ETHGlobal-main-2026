// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {Policy, Offer} from "./Policy.sol";
import {StandingPassTree} from "./StandingPassTree.sol";
import {TrancheVault} from "./TrancheVault.sol";
import {IPoseidon2} from "./interfaces/IPoseidon2.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {IBusinessPass} from "./interfaces/IBusinessPass.sol";
import {SNARK_FIELD, TAG_COMMIT} from "./Constants.sol";

/// @notice Constructor parameters of AdvanceBook, in the SPEC's order.
struct BookConfig {
    IERC20 usdc;
    TrancheVault senior;
    TrancheVault junior;
    IPoseidon2 poseidon2;
    IVerifier verifier;
    address owner;
    address offerSigner;
    address riskManager;
    uint256[4] caps;
    uint256[4] capFloors;
    uint256 maxExposure;
    uint256 maxExposureFloor;
    uint64 defaultWindow;
    uint256 writeOffBounty;
    IBusinessPass businessPass; // v2: Business Pass tree + allowed country set
    IVerifier bizVerifier; // v2: business_pass HonkVerifier (9 public inputs)
    address agentPassAttester; // v2: signs AgentPass after our backend validates World Agent Pass
}

/// @notice Spending limits a merchant grants their managed agent (USDC base units, seconds).
struct Limits {
    uint256 maxPerDraw;
    uint256 maxPerPeriod;
    uint64 period; // fixed window length; the window restarts at the first draw after it ends
    uint64 expiry; // unix seconds; at most MAX_MANDATE_DURATION after registration
}

/// @notice A mandate as the shop owner signs it (EIP-712 `Mandate`). `recipient` is pinned: the agent can
///         only ever pay the merchant's own address. Tier 0 = Business Pass (band = proven minimum revenue
///         band); tier 1..3 = Standing Pass (band must be 0).
struct MandateRequest {
    bytes32 shopId;
    address agentKey;
    address recipient;
    Limits limits;
    uint8 tier;
    uint8 band;
}

/// @notice A credential proof: business_pass (tier 0) or standing_pass (tier >= 1), context = mandateContext.
struct CredentialProof {
    bytes proof;
    uint256 root;
    uint256 nullifier;
    uint256 commitmentNext;
}

/// @notice EIP-712 `AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)` by
///         `agentPassAttester`, signed after our backend validated the human's World Agent Pass approval of exactly
///         this agent key and these limits. `nonce` is single-use; rejected once `block.timestamp > expiry`.
struct AgentPassAttestation {
    uint256 nonce;
    uint64 expiry;
    bytes signature;
}

/// @title AdvanceBook
/// @notice Core of the merchant revenue-advance system. Routes every customer payment, takes the
///         holdback slice of active advances, splits it into principal and fee across the senior
///         vault, junior vault and reserve, opens advances against agent-signed offers, and issues
///         Standing Pass credentials (Merkle commitments) on full repayment. v2: first advances need
///         a Business Pass proof; managed agents draw automatically under ZK-backed mandates; the default
///         clock needs >= 1% of totalOwed repaid per 7-day window.
/// @dev Custody rule: between calls this contract's USDC balance equals `reserve`. Draw functions
///      never read `msg.sender`, so a relayer or a fresh paymaster account can submit them.
contract AdvanceBook is Policy, StandingPassTree, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants

    uint16 public constant MAX_PROTOCOL_FEE_BPS = 2000;
    uint64 public constant DELINQUENCY_WINDOW = 14 days;
    uint16 internal constant BPS = 10_000;
    /// @dev v2 minimum-repayment rule: the default clock (`lastSaleAt`) only restarts once at least
    ///      MIN_REPAY_BPS of totalOwed has been repaid within one REPAY_WINDOW.
    uint16 public constant MIN_REPAY_BPS = 100; // 1%
    uint64 public constant REPAY_WINDOW = 7 days;
    uint64 public constant MAX_MANDATE_DURATION = 180 days;
    /// @dev Late-fee step-up: while an advance is behind the minimum-repayment clock (no window met for more
    ///      than REPAY_WINDOW since `lastSaleAt`), an extra fee accrues on principal at this rate, capped
    ///      separately. 100% of it goes to the reserve. Contract constants so the signed `Offer` is unchanged.
    uint16 public constant LATE_FEE_RATE_BPS_PER_WEEK = 50;
    uint16 public constant LATE_FEE_CAP_BPS = 300;

    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "Mandate(bytes32 shopId,address agentKey,address recipient,uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry,uint8 tier,uint8 band)"
    );
    bytes32 public constant LIMITS_TYPEHASH =
        keccak256("Limits(uint256 maxPerDraw,uint256 maxPerPeriod,uint64 period,uint64 expiry)");
    bytes32 public constant AGENT_PASS_TYPEHASH =
        keccak256("AgentPassAttestation(address agentKey,bytes32 limitsHash,uint256 nonce,uint64 expiry)");
    bytes32 public constant MANDATE_DRAW_TYPEHASH = keccak256("MandateDraw(bytes32 offerId,uint256 mandateId)");
    bytes32 public constant REVOKE_MANDATE_TYPEHASH = keccak256("RevokeMandate(uint256 mandateId)");

    // ---------------------------------------------------------------- types

    enum Status {
        None,
        Active,
        Repaid,
        WrittenOff
    }

    struct Shop {
        address owner;
        address payout;
        uint256 activeAdvanceId;
    }

    struct Advance {
        bytes32 shopId;
        uint256 principal;
        uint256 totalOwed;
        uint256 repaid;
        uint256 principalRepaid;
        uint256 feePaid;
        uint64 drawnAt;
        uint16 feeRateBpsPerWeek;
        uint16 feeCapBps;
        uint16 holdbackBps;
        uint8 tier;
        uint64 lastSaleAt;
        Status status;
        bool credentialClaimed;
        uint256 pendingCommitment;
        uint64 windowStart; // v2: start of the current minimum-repayment window
        uint256 windowRepaid; // v2: repaid within the current window (not yet enough to reset the clock)
        uint64 lateSecs; // seconds spent behind, settled each time the minimum is met (lastSaleAt resets)
        uint256 lateFeePaid; // late fee paid so far (all of it went to the reserve)
    }

    struct Mandate {
        bytes32 shopId;
        address agentKey;
        uint64 expiry;
        uint8 tier;
        uint8 band;
        bool revoked;
        address recipient;
        uint64 period;
        uint64 periodStart;
        uint256 maxPerDraw;
        uint256 maxPerPeriod;
        uint256 drawnInPeriod;
        bytes32 limitsHash; // hashLimits(limits): what the human approved via World Agent Pass
        uint256 pendingCommitment; // Standing Pass commitment for the FIRST draw only, then 0
    }

    // ---------------------------------------------------------------- immutables

    IERC20 public immutable usdc;
    TrancheVault public immutable senior;
    TrancheVault public immutable junior;
    IVerifier public immutable verifier;
    IVerifier public immutable bizVerifier;
    IBusinessPass public immutable businessPass;
    uint64 public immutable defaultWindow;
    uint256 public immutable writeOffBounty;

    // ---------------------------------------------------------------- storage

    address public treasury;
    uint16 public seniorFeeBps = 4000;
    uint16 public juniorFeeBps = 3000;
    uint16 public reserveFeeBps = 2000;
    uint16 public protocolFeeBps = 1000;
    uint256 public reserve;
    uint256 public nextAdvanceId; // ids start at 1
    mapping(bytes32 => Shop) public shops;
    mapping(uint256 => Advance) internal advances;
    mapping(uint256 => bool) public nullifierSpent;
    address public agentPassAttester;
    uint256 public nextMandateId; // ids start at 1
    mapping(uint256 => Mandate) internal _mandates;
    mapping(uint256 => bool) public agentPassNonceUsed; // each AgentPass attestation registers at most once

    // ---------------------------------------------------------------- events

    event ShopRegistered(bytes32 indexed shopId, address indexed owner, address payout);
    event PayoutChanged(bytes32 indexed shopId, address payout);
    /// `payer` is the customer (msg.sender). Indexed so the agents can count distinct customers
    /// even when gas is sponsored and the tx sender is a bundler or relayer.
    event Sale(bytes32 indexed shopId, address indexed payer, uint256 amount, uint256 repayment);
    event RepaymentSplit(
        uint256 indexed advanceId, uint256 principalPart, uint256 seniorFee, uint256 juniorFee, uint256 reserveFee, uint256 protocolFee
    );
    /// Late fee paid on a repayment; credited 100% to `reserve` (on top of RepaymentSplit.reserveFee).
    event LateFeePaid(uint256 indexed advanceId, uint256 amount);
    event AdvanceOpened(
        uint256 indexed id, bytes32 indexed shopId, uint256 amount, uint256 totalOwed, uint16 holdbackBps, uint8 tier
    );
    event AdvanceRepaid(uint256 indexed id, bytes32 indexed shopId);
    event StandingPassClaimed(uint256 indexed id, uint256 commitment);
    event AdvanceWrittenOff(
        uint256 indexed id, uint256 loss, uint256 paidJ, uint256 fromReserve, uint256 seniorLoss, uint256 bounty
    );
    event ReserveDeposited(address indexed from, uint256 amount);
    event MandateRegistered(
        uint256 indexed mandateId, bytes32 indexed shopId, address indexed agentKey, uint8 tier, Limits limits
    );
    event MandateDrawn(uint256 indexed mandateId, uint256 indexed advanceId, uint256 amount);
    event MandateRevoked(uint256 indexed mandateId);
    event AgentPassAttesterSet(address attester);
    event TreasurySet(address indexed treasury);
    event FeeSharesSet(uint16 seniorBps, uint16 juniorBps, uint16 reserveBps, uint16 protocolBps);

    // ---------------------------------------------------------------- errors

    error ZeroAddress();
    error InvalidFeeShares();
    error InsufficientJuniorCover(uint256 assets, uint256 required);
    error ZeroAmount();
    error InvalidShopId();
    error InvalidDefaultWindow();
    error ShopAlreadyRegistered(bytes32 shopId);
    error ShopNotRegistered(bytes32 shopId);
    error NotShopOwner(bytes32 shopId, address caller);
    error ShopHasActiveAdvance(bytes32 shopId, uint256 advanceId);
    error WrongTier(uint8 tier);
    error InvalidOfferTerms();
    error TransferAmountMismatch(uint256 expected, uint256 received);
    error NotInField(uint256 value);
    error UnknownRoot(uint256 root);
    error NullifierAlreadySpent(uint256 nullifier);
    error InvalidProof();
    error AdvanceNotActive(uint256 advanceId);
    error AdvanceNotRepaid(uint256 advanceId);
    error CredentialAlreadyClaimed(uint256 advanceId);
    error DefaultWindowNotElapsed(uint256 advanceId, uint256 availableAt);
    error CoverExceedsLoss(uint256 paid, uint256 loss);
    error NoCredential(uint256 advanceId);
    error InvalidMandate();
    error InvalidMandateSignature();
    error InvalidAgentPass();
    error UnknownMandate(uint256 mandateId);
    error MandateInactive(uint256 mandateId);
    error MandateMismatch();
    error MandateLimitExceeded();

    // ---------------------------------------------------------------- constructor

    /// @dev SPEC lists 14 flat constructor parameters. Under the legacy (non via-IR) pipeline the
    ///      generated ABI decoder for 13+ parameters is "stack too deep", so they are grouped in
    ///      `BookConfig`. Every field is static, so the deploy calldata is byte-identical to the flat
    ///      14-argument encoding in the same order; only Solidity call sites change.
    constructor(BookConfig memory c)
        Policy(c.owner, c.offerSigner, c.riskManager, c.caps, c.capFloors, c.maxExposure, c.maxExposureFloor)
        StandingPassTree(c.poseidon2)
    {
        if (
            address(c.usdc) == address(0) || address(c.senior) == address(0) || address(c.junior) == address(0)
                || address(c.poseidon2) == address(0) || address(c.verifier) == address(0)
                || address(c.businessPass) == address(0) || address(c.bizVerifier) == address(0)
                || c.agentPassAttester == address(0)
        ) revert ZeroAddress();
        if (c.defaultWindow == 0) revert InvalidDefaultWindow();
        treasury = c.owner;
        usdc = c.usdc;
        senior = c.senior;
        junior = c.junior;
        verifier = c.verifier;
        bizVerifier = c.bizVerifier;
        businessPass = c.businessPass;
        defaultWindow = c.defaultWindow;
        writeOffBounty = c.writeOffBounty;
        agentPassAttester = c.agentPassAttester;
        nextAdvanceId = 1;
        nextMandateId = 1;
    }

    // ---------------------------------------------------------------- shops

    /// @notice Register a shop. First come, first served; the caller becomes its owner.
    function registerShop(bytes32 shopId, address payout) external {
        if (shopId == bytes32(0)) revert InvalidShopId();
        if (payout == address(0)) revert ZeroAddress();
        Shop storage s = shops[shopId];
        if (s.owner != address(0)) revert ShopAlreadyRegistered(shopId);
        s.owner = msg.sender;
        s.payout = payout;
        emit ShopRegistered(shopId, msg.sender, payout);
    }

    /// @notice Change where the merchant share of each sale goes. Shop owner only.
    function setPayout(bytes32 shopId, address payout) external {
        Shop storage s = shops[shopId];
        if (s.owner == address(0)) revert ShopNotRegistered(shopId);
        if (s.owner != msg.sender) revert NotShopOwner(shopId, msg.sender);
        if (payout == address(0)) revert ZeroAddress();
        s.payout = payout;
        emit PayoutChanged(shopId, payout);
    }

    // ---------------------------------------------------------------- sales

    /// @notice A customer pays `amount` USDC to `shopId`. If the shop has an active advance, the
    ///         holdback slice repays it; the rest goes to the shop's payout address.
    function pay(bytes32 shopId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Shop storage s = shops[shopId];
        address payout = s.payout;
        if (payout == address(0)) revert ShopNotRegistered(shopId);

        _pullExact(msg.sender, amount);

        uint256 id = s.activeAdvanceId;
        uint256 rep;
        if (id != 0) {
            rep = Math.min(amount * advances[id].holdbackBps / BPS, owedOf(id));
            if (rep > 0) _settle(id, shopId, rep);
        }
        emit Sale(shopId, msg.sender, amount, rep);
        if (amount > rep) usdc.safeTransfer(payout, amount - rep);
    }

    // ---------------------------------------------------------------- draws

    /// @notice First advance for a shop, unlocked by a Business Pass proof (business_pass circuit):
    ///         membership in the Business Pass tree, revenueBand >= o.minRevenueBand, ageOk, country in the
    ///         registry's allowed set, the one-time first-advance nullifier o.passNullifier, and the first
    ///         Standing Pass commitment `commitmentNext = hash_3(TAG_COMMIT, h_next, 1)`. Bound to the offer's
    ///         recipient and id through `context`. Never reads msg.sender (relayer-submitted).
    /// @dev Public inputs: [root, passNullifier, minRevenueBand, commitmentNext, context, c0, c1, c2, c3].
    function drawFirst(
        Offer calldata o,
        bytes calldata sig,
        bytes calldata proof,
        uint256 root,
        uint256 commitmentNext
    ) external nonReentrant returns (uint256) {
        if (o.tier != 0) revert WrongTier(o.tier);
        _requireShopFree(o.shopId);
        _checkAndConsumeOffer(o, sig, exposure()); // spends o.passNullifier
        _verifyBusinessPass(
            proof, [root, o.passNullifier, uint256(o.minRevenueBand), commitmentNext, contextFor(o.recipient, o.offerId)]
        );
        return _open(o, commitmentNext);
    }

    /// @notice Repeat advance unlocked by a Standing Pass proof. The proof is bound to the offer's
    ///         recipient and id through `context`, so it cannot be redirected by a relayer.
    function drawWithPass(
        Offer calldata o,
        bytes calldata sig,
        bytes calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256 commitmentNext
    ) external nonReentrant returns (uint256) {
        if (o.tier == 0) revert WrongTier(o.tier);
        _requireShopFree(o.shopId);
        _checkAndConsumeOffer(o, sig, exposure());
        _spendStandingPass(proof, [root, nullifier, uint256(o.tier), commitmentNext, contextFor(o.recipient, o.offerId)]);
        return _open(o, commitmentNext);
    }

    // ---------------------------------------------------------------- mandates (managed agents)

    /// @notice Delegate automatic draws to a managed agent, once. Requires, all bound to the same mandate:
    ///         - the shop owner's EIP-712 `Mandate` signature (only the merchant can put debt on their shop);
    ///         - an AgentPassAttestation over (agentKey, hashLimits(limits)) with a single-use nonce: a real human
    ///           approved this agent and these limits in World;
    ///         - a ZK proof with context = mandateContext(r): tier 0 = Business Pass (spends its first-advance
    ///           nullifier, proves revenueBand >= r.band), tier >= 1 = Standing Pass (spends its nullifier).
    ///         Never reads msg.sender (relayer-submitted).
    function registerMandate(
        MandateRequest calldata r,
        CredentialProof calldata p,
        AgentPassAttestation calldata att,
        bytes calldata ownerSig
    ) external nonReentrant returns (uint256 id) {
        Limits calldata l = r.limits;
        if (
            r.agentKey == address(0) || r.recipient == address(0) || l.maxPerDraw == 0
                || l.maxPerPeriod < l.maxPerDraw || l.period == 0 || l.expiry <= block.timestamp
                || l.expiry > block.timestamp + MAX_MANDATE_DURATION || r.tier > 3 || (r.tier != 0 && r.band != 0)
        ) revert InvalidMandate();
        uint256 ctx = _checkOwnerConsent(r, ownerSig);
        bytes32 lh = _useAgentPass(r.agentKey, l, att);

        if (r.tier == 0) {
            if (p.nullifier == 0 || passNullifierUsed[p.nullifier]) revert InvalidPassNullifier();
            passNullifierUsed[p.nullifier] = true;
            _verifyBusinessPass(p.proof, [p.root, p.nullifier, uint256(r.band), p.commitmentNext, ctx]);
        } else {
            _spendStandingPass(p.proof, [p.root, p.nullifier, uint256(r.tier), p.commitmentNext, ctx]);
        }

        id = nextMandateId++;
        Mandate storage m = _mandates[id];
        m.shopId = r.shopId;
        m.agentKey = r.agentKey;
        m.expiry = l.expiry;
        m.tier = r.tier;
        m.band = r.band;
        m.recipient = r.recipient;
        m.period = l.period;
        m.periodStart = uint64(block.timestamp);
        m.maxPerDraw = l.maxPerDraw;
        m.maxPerPeriod = l.maxPerPeriod;
        m.limitsHash = lh;
        m.pendingCommitment = p.commitmentNext;
        emit MandateRegistered(id, r.shopId, r.agentKey, r.tier, l);
    }

    /// @notice Automatic draw by a managed agent. The agent key signs `MandateDraw(mandateId, offerId)`; the
    ///         offer is the usual agent-underwritten, clamped, offerSigner-signed offer. Enforces the mandate's
    ///         shop, recipient, tier (and band), per-draw and per-period limits, expiry, revocation, and one
    ///         active advance per shop. Only the mandate's first draw carries the Standing Pass commitment.
    function drawByMandate(Offer calldata o, bytes calldata offerSig, uint256 mandateId, bytes calldata agentSig)
        external
        nonReentrant
        returns (uint256 id)
    {
        Mandate storage m = _mandates[mandateId];
        address agent = m.agentKey;
        if (agent == address(0)) revert UnknownMandate(mandateId);
        if (m.revoked || block.timestamp > m.expiry) revert MandateInactive(mandateId);
        if (
            o.shopId != m.shopId || o.recipient != m.recipient || o.tier != m.tier
                || (o.tier == 0 && o.minRevenueBand > m.band)
        ) revert MandateMismatch();
        bytes32 d = _hashTypedDataV4(keccak256(abi.encode(MANDATE_DRAW_TYPEHASH, o.offerId, mandateId)));
        if (!SignatureChecker.isValidSignatureNow(agent, d, agentSig)) revert InvalidMandateSignature();

        if (block.timestamp >= uint256(m.periodStart) + m.period) {
            m.periodStart = uint64(block.timestamp);
            m.drawnInPeriod = 0;
        }
        uint256 drawn = m.drawnInPeriod + o.amount;
        if (o.amount > m.maxPerDraw || drawn > m.maxPerPeriod) revert MandateLimitExceeded();
        m.drawnInPeriod = drawn;

        _requireShopFree(o.shopId);
        _consumeOffer(o, offerSig, exposure(), false); // credential spent at registration: passNullifier must be 0
        uint256 pending = m.pendingCommitment;
        m.pendingCommitment = 0;
        emit MandateDrawn(mandateId, nextAdvanceId, o.amount);
        id = _open(o, pending);
    }

    /// @notice Revoke a mandate. `sig` is EIP-712 `RevokeMandate(mandateId)` by the agent key or the shop
    ///         owner (the merchant can always pull the plug). Terminal and idempotent; relayer-submitted.
    function revokeMandate(uint256 mandateId, bytes calldata sig) external {
        Mandate storage m = _mandates[mandateId];
        if (m.agentKey == address(0)) revert UnknownMandate(mandateId);
        bytes32 d = _hashTypedDataV4(keccak256(abi.encode(REVOKE_MANDATE_TYPEHASH, mandateId)));
        if (
            !SignatureChecker.isValidSignatureNow(m.agentKey, d, sig)
                && !SignatureChecker.isValidSignatureNow(shops[m.shopId].owner, d, sig)
        ) revert InvalidMandateSignature();
        m.revoked = true;
        emit MandateRevoked(mandateId);
    }

    /// @notice Rotate the AgentPass attester. Existing mandates are unaffected (they can still be revoked).
    function setAgentPassAttester(address a) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        agentPassAttester = a;
        emit AgentPassAttesterSet(a);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasurySet(t);
    }

    function setFeeShares(uint16 s, uint16 j, uint16 r, uint16 p) external onlyOwner {
        if (uint256(s) + j + r + p != BPS || p > MAX_PROTOCOL_FEE_BPS) revert InvalidFeeShares();
        seniorFeeBps = s; juniorFeeBps = j; reserveFeeBps = r; protocolFeeBps = p;
        emit FeeSharesSet(s, j, r, p);
    }

    // ---------------------------------------------------------------- credential

    /// @notice Insert the pending Standing Pass commitment of a repaid advance. Anyone may call
    ///         (a relayer), so the merchant's wallet is not linked to the insertion.
    function claimStandingPass(uint256 advanceId) external nonReentrant {
        Advance storage a = advances[advanceId];
        if (a.status != Status.Repaid) revert AdvanceNotRepaid(advanceId);
        if (a.credentialClaimed) revert CredentialAlreadyClaimed(advanceId);
        uint256 commitment = a.pendingCommitment;
        if (commitment == 0) revert NoCredential(advanceId); // later draws under one mandate
        a.credentialClaimed = true;
        _insert(commitment);
        emit StandingPassClaimed(advanceId, commitment);
    }

    // ---------------------------------------------------------------- default

    /// @notice Write off an advance with no repaying sale for `defaultWindow`. Permissionless.
    ///         Loss waterfall: junior vault, then reserve, then a senior write-down. The caller
    ///         receives min(writeOffBounty, reserve left after covering).
    function writeOff(uint256 advanceId) external nonReentrant {
        Advance storage a = advances[advanceId];
        if (a.status != Status.Active) revert AdvanceNotActive(advanceId);
        uint256 availableAt = uint256(a.lastSaleAt) + defaultWindow;
        if (block.timestamp < availableAt) revert DefaultWindowNotElapsed(advanceId, availableAt);

        uint256 loss = a.principal - a.principalRepaid;
        a.status = Status.WrittenOff;
        shops[a.shopId].activeAdvanceId = 0;

        // 1. junior covers first, paying straight into the senior vault
        uint256 paidJ = junior.cover(address(senior), loss);
        if (paidJ > loss) revert CoverExceedsLoss(paidJ, loss);
        if (paidJ > 0) senior.principalReturned(paidJ);

        // 2. then the reserve; 3. senior absorbs what is left
        uint256 rest = loss - paidJ;
        uint256 reserve_ = reserve;
        uint256 fromReserve = rest < reserve_ ? rest : reserve_;
        uint256 seniorLoss = rest - fromReserve;
        reserve_ -= fromReserve;

        // 4. bounty from what the reserve still holds
        uint256 bounty = writeOffBounty < reserve_ ? writeOffBounty : reserve_;
        reserve = reserve_ - bounty;

        emit AdvanceWrittenOff(advanceId, loss, paidJ, fromReserve, seniorLoss, bounty);

        if (fromReserve > 0) {
            usdc.safeTransfer(address(senior), fromReserve);
            senior.principalReturned(fromReserve);
        }
        if (seniorLoss > 0) senior.writeDown(seniorLoss);
        if (bounty > 0) usdc.safeTransfer(msg.sender, bounty);
    }

    // ---------------------------------------------------------------- reserve

    /// @notice Add USDC to the first-loss reserve (RiskHook.flush calls this).
    function depositReserve(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pullExact(msg.sender, amount);
        reserve += amount;
        emit ReserveDeposited(msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function contextFor(address recipient, bytes32 offerId) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(recipient, offerId))) % SNARK_FIELD;
    }

    /// @notice EIP-712 struct hash of a mandate (what the shop owner signs, wrapped in the AdvanceBook domain).
    function mandateHash(MandateRequest calldata r) public pure returns (bytes32) {
        Limits calldata l = r.limits;
        return keccak256(
            abi.encode(
                MANDATE_TYPEHASH, r.shopId, r.agentKey, r.recipient, l.maxPerDraw, l.maxPerPeriod, l.period, l.expiry,
                r.tier, r.band
            )
        );
    }

    /// @notice EIP-712 struct hash of `Limits` (what World Agent Pass approval and the attestation cover).
    function hashLimits(Limits calldata l) public pure returns (bytes32) {
        return keccak256(abi.encode(LIMITS_TYPEHASH, l.maxPerDraw, l.maxPerPeriod, l.period, l.expiry));
    }

    /// @notice ZK context a mandate's credential proof must use: mandateHash(r) % P.
    function mandateContext(MandateRequest calldata r) external pure returns (uint256) {
        return uint256(mandateHash(r)) % SNARK_FIELD;
    }

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    /// @notice Repayment needed within one REPAY_WINDOW to restart the default clock: ceil(1% of totalOwed).
    function minWindowRepayment(uint256 principalPlusAccruedFee) public pure returns (uint256) {
        return (principalPlusAccruedFee * MIN_REPAY_BPS + BPS - 1) / BPS;
    }

    function commitmentFor(uint256 h, uint256 count) public view returns (uint256) {
        if (h >= SNARK_FIELD) revert NotInField(h);
        if (count >= SNARK_FIELD) revert NotInField(count);
        return poseidon2.hash_3(TAG_COMMIT, h, count);
    }

    function delinquentPrincipal() public view returns (uint256 amount) {
        for (uint256 id = 1; id < nextAdvanceId; ++id) {
            Advance storage a = advances[id];
            if (a.status == Status.Active && block.timestamp >= uint256(a.lastSaleAt) + DELINQUENCY_WINDOW) {
                amount += a.principal - a.principalRepaid;
            }
        }
    }

    /// @notice Outstanding senior principal (the exposure Policy caps).
    function exposure() public view returns (uint256) {
        return senior.outstanding();
    }

    /// @notice Whole advance as a struct (the auto getter returns a tuple).
    function getAdvance(uint256 advanceId) external view returns (Advance memory) {
        return advances[advanceId];
    }

    /// @notice Amount still owed on an advance (0 unless Active): principal left + unpaid fee + unpaid late fee.
    function owedOf(uint256 advanceId) public view returns (uint256) {
        Advance storage a = advances[advanceId];
        return a.status == Status.Active
            ? a.principal - a.principalRepaid + accruedFee(a) - a.feePaid + _lateFee(a) - a.lateFeePaid
            : 0;
    }

    /// @notice Late fee accrued so far (paid + unpaid). Frozen at what was paid once the advance is not Active.
    function lateFeeOf(uint256 advanceId) external view returns (uint256) {
        Advance storage a = advances[advanceId];
        return a.status == Status.Active ? _lateFee(a) : a.lateFeePaid;
    }

    /// @notice True while an Active advance is behind the minimum: no REPAY_WINDOW met for more than
    ///         REPAY_WINDOW since `lastSaleAt`. The late fee accrues exactly while this is true.
    function isBehind(uint256 advanceId) external view returns (bool) {
        Advance storage a = advances[advanceId];
        return a.status == Status.Active && _behindSecs(a) > 0;
    }

    function accruedFee(Advance storage a) internal view returns (uint256) {
        if (a.principalRepaid == a.principal) return a.feePaid;
        return _feeFor(a.principal, a.feeRateBpsPerWeek, block.timestamp - a.drawnAt, a.feeCapBps);
    }

    /// @dev Late fee = settled behind-seconds plus the still-open behind stretch, at the late rate and cap.
    function _lateFee(Advance storage a) internal view returns (uint256) {
        if (a.principalRepaid == a.principal) return a.lateFeePaid;
        return _feeFor(a.principal, LATE_FEE_RATE_BPS_PER_WEEK, a.lateSecs + _behindSecs(a), LATE_FEE_CAP_BPS);
    }

    /// @dev Seconds past the minimum-repayment deadline (lastSaleAt + REPAY_WINDOW), 0 if not behind.
    function _behindSecs(Advance storage a) internal view returns (uint256) {
        uint256 due = uint256(a.lastSaleAt) + REPAY_WINDOW;
        return block.timestamp > due ? block.timestamp - due : 0;
    }

    /// @dev min(principal * rateBpsPerWeek * secs / (1e4 * 1 week), principal * capBps / 1e4).
    function _feeFor(uint256 principal, uint256 rate, uint256 secs, uint256 capBps) internal pure returns (uint256) {
        uint256 raw = Math.mulDiv(principal, rate * secs, uint256(BPS) * 7 days);
        uint256 cap = Math.mulDiv(principal, capBps, BPS);
        return raw < cap ? raw : cap;
    }

    // ---------------------------------------------------------------- internal

    /// @dev business_pass proof. `pub` = [root, nullifier, minBand, commitmentNext, context]; the verifier's
    ///      public inputs are those five plus the registry's allowed countries c0..c3. The nullifier is spent by
    ///      the caller (Policy for drawFirst, registerMandate for tier-0 mandates).
    function _verifyBusinessPass(bytes calldata proof, uint256[5] memory pub) internal view {
        _requireInField(pub);
        if (!businessPass.isKnownRoot(pub[0])) revert UnknownRoot(pub[0]);
        uint16[4] memory cs = businessPass.countrySet();
        bytes32[] memory inputs = new bytes32[](9);
        for (uint256 i = 0; i < 5; ++i) {
            inputs[i] = bytes32(pub[i]);
        }
        for (uint256 i = 0; i < 4; ++i) {
            inputs[5 + i] = bytes32(uint256(cs[i]));
        }
        if (!bizVerifier.verify(proof, inputs)) revert InvalidProof();
    }

    /// @dev standing_pass proof. `pub` = [root, nullifier, tier, commitmentNext, context] (the verifier's public
    ///      inputs, in order). Spends the nullifier.
    function _spendStandingPass(bytes calldata proof, uint256[5] memory pub) internal {
        _requireInField(pub);
        if (!isKnownRoot[pub[0]]) revert UnknownRoot(pub[0]);
        if (nullifierSpent[pub[1]]) revert NullifierAlreadySpent(pub[1]);
        bytes32[] memory inputs = new bytes32[](5);
        for (uint256 i = 0; i < 5; ++i) {
            inputs[i] = bytes32(pub[i]);
        }
        if (!verifier.verify(proof, inputs)) revert InvalidProof();
        nullifierSpent[pub[1]] = true;
    }

    /// @dev root, nullifier and commitmentNext must be field elements (the others are < P by construction).
    function _requireInField(uint256[5] memory pub) internal pure {
        if (pub[0] >= SNARK_FIELD) revert NotInField(pub[0]);
        if (pub[1] >= SNARK_FIELD) revert NotInField(pub[1]);
        if (pub[3] >= SNARK_FIELD) revert NotInField(pub[3]);
    }

    /// @dev The shop owner signed this exact mandate (EIP-712 `Mandate`). Returns the proof context.
    function _checkOwnerConsent(MandateRequest calldata r, bytes calldata ownerSig) internal view returns (uint256) {
        address shopOwner = shops[r.shopId].owner;
        if (shopOwner == address(0)) revert ShopNotRegistered(r.shopId);
        bytes32 mh = mandateHash(r);
        if (!SignatureChecker.isValidSignatureNow(shopOwner, _hashTypedDataV4(mh), ownerSig)) {
            revert InvalidMandateSignature();
        }
        return uint256(mh) % SNARK_FIELD;
    }

    /// @dev Checks and burns a single-use AgentPassAttestation for (agentKey, hashLimits(l)). Returns limitsHash.
    function _useAgentPass(address agentKey, Limits calldata l, AgentPassAttestation calldata att)
        internal
        returns (bytes32 lh)
    {
        lh = hashLimits(l);
        bytes32 d = _hashTypedDataV4(keccak256(abi.encode(AGENT_PASS_TYPEHASH, agentKey, lh, att.nonce, att.expiry)));
        if (
            block.timestamp > att.expiry || agentPassNonceUsed[att.nonce]
                || !SignatureChecker.isValidSignatureNow(agentPassAttester, d, att.signature)
        ) revert InvalidAgentPass();
        agentPassNonceUsed[att.nonce] = true;
    }

    function _requireShopFree(bytes32 shopId) internal view {
        Shop storage s = shops[shopId];
        if (s.owner == address(0)) revert ShopNotRegistered(shopId);
        if (s.activeAdvanceId != 0) revert ShopHasActiveAdvance(shopId, s.activeAdvanceId);
    }

    /// @dev Effects first, then the single interaction (senior.lend). Never reads msg.sender.
    function _open(Offer calldata o, uint256 pending) internal returns (uint256 id) {
        if (o.amount == 0 || o.recipient == address(0) || o.holdbackBps == 0) {
            revert InvalidOfferTerms();
        }

        uint256 required = Math.mulDiv(senior.outstanding() + o.amount, junior.coverRatioBps(), BPS, Math.Rounding.Ceil);
        uint256 assets = junior.totalAssets();
        if (assets < required) revert InsufficientJuniorCover(assets, required);

        id = nextAdvanceId++;
        advances[id] = Advance({
            shopId: o.shopId,
            principal: o.amount,
            totalOwed: o.amount + Math.mulDiv(o.amount, o.feeCapBps, BPS),
            repaid: 0,
            principalRepaid: 0,
            feePaid: 0,
            drawnAt: uint64(block.timestamp),
            feeRateBpsPerWeek: o.feeRateBpsPerWeek,
            feeCapBps: o.feeCapBps,
            holdbackBps: o.holdbackBps,
            tier: o.tier,
            lastSaleAt: uint64(block.timestamp),
            status: Status.Active,
            credentialClaimed: false,
            pendingCommitment: pending,
            windowStart: uint64(block.timestamp),
            windowRepaid: 0,
            lateSecs: 0,
            lateFeePaid: 0
        });
        shops[o.shopId].activeAdvanceId = id;
        emit AdvanceOpened(id, o.shopId, o.amount, o.amount + Math.mulDiv(o.amount, o.feeCapBps, BPS), o.holdbackBps, o.tier);

        senior.lend(o.recipient, o.amount);
    }

    /// @dev Minimum-repayment rule (v2). Repayments accumulate inside a window of REPAY_WINDOW starting at
    ///      `windowStart`; a repayment at or after windowStart + REPAY_WINDOW first starts a fresh window at
    ///      now (stale partial amounts are dropped). When the window's total reaches
    ///      ceil(totalOwed * MIN_REPAY_BPS / 1e4), the default clock restarts and a new window begins.
    ///      So dust sales can no longer postpone a write-off.
    function _noteRepayment(Advance storage a, uint256 rep) internal {
        uint64 nowTs = uint64(block.timestamp);
        uint256 acc = rep;
        if (nowTs < a.windowStart + REPAY_WINDOW) acc += a.windowRepaid;
        else a.windowStart = nowTs;
        if (acc >= minWindowRepayment(a.principal + accruedFee(a))) {
            a.lateSecs += uint64(_behindSecs(a)); // settle the behind stretch before the clock restarts
            a.lastSaleAt = nowTs;
            a.windowStart = nowTs;
            a.windowRepaid = 0;
        } else {
            a.windowRepaid = acc;
        }
    }

    /// @notice Repay an active advance directly; fee (and any late fee) accrued to this timestamp is paid
    ///         before principal.
    function repay(uint256 advanceId, uint256 amount) external nonReentrant {
        Advance storage a = advances[advanceId];
        if (a.status != Status.Active) revert AdvanceNotActive(advanceId);
        if (amount == 0) revert ZeroAmount();
        uint256 owed = owedOf(advanceId);
        if (amount > owed) amount = owed;
        _pullExact(msg.sender, amount);
        _settle(advanceId, a.shopId, amount);
    }

    /// @dev Shared by pay() and repay(). `amount` <= owedOf(id). Order: normal fee, then late fee, then principal.
    ///      Normal fee splits senior/junior/reserve/protocol; the late fee goes 100% to the reserve.
    function _settle(uint256 id, bytes32 shopId, uint256 amount) internal {
        Advance storage a = advances[id];
        uint256 fee = Math.min(amount, accruedFee(a) - a.feePaid);
        uint256 late = Math.min(amount - fee, _lateFee(a) - a.lateFeePaid);
        uint256 principalPart = amount - fee - late;
        a.feePaid += fee;
        a.lateFeePaid += late;
        a.principalRepaid += principalPart;
        a.repaid += amount;
        _noteRepayment(a, amount);
        uint256 sFee = Math.mulDiv(fee, seniorFeeBps, BPS);
        uint256 jFee = Math.mulDiv(fee, juniorFeeBps, BPS);
        uint256 pFee = Math.mulDiv(fee, protocolFeeBps, BPS);
        uint256 rFee = fee - sFee - jFee - pFee;
        reserve += rFee + late;
        emit RepaymentSplit(id, principalPart, sFee, jFee, rFee, pFee);
        if (late > 0) emit LateFeePaid(id, late);
        if (a.principalRepaid == a.principal) {
            a.status = Status.Repaid;
            shops[shopId].activeAdvanceId = 0;
            emit AdvanceRepaid(id, shopId);
        }
        if (principalPart + sFee > 0) { usdc.safeTransfer(address(senior), principalPart + sFee); if (principalPart > 0) senior.principalReturned(principalPart); }
        if (jFee > 0) usdc.safeTransfer(address(junior), jFee);
        if (pFee > 0) usdc.safeTransfer(treasury, pFee);
    }

    /// @dev Pull exactly `amount` from `from`; rejects fee-on-transfer or otherwise short transfers.
    function _pullExact(address from, uint256 amount) internal {
        uint256 before = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(from, address(this), amount);
        uint256 received = usdc.balanceOf(address(this)) - before;
        if (received != amount) revert TransferAmountMismatch(amount, received);
    }
}
