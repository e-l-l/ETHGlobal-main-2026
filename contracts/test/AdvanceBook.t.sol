// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {AdvanceBook, BookConfig} from "../src/AdvanceBook.sol";
import {Offer} from "../src/Policy.sol";
import {StandingPassTree} from "../src/StandingPassTree.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {SNARK_FIELD, TAG_COMMIT, TAG_NULL, POSEIDON2_SEPOLIA} from "../src/Constants.sol";
import {BusinessPassRegistry} from "../src/BusinessPassRegistry.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";
import {Policy} from "../src/Policy.sol";

// =====================================================================================
// TEST DOUBLES (test-only, never deploy). Remove / bypass by setting USE_REAL_DEPS = true
// in AdvanceBookTest once Policy, StandingPassTree and TrancheVault are implemented.
// =====================================================================================

/// @dev TEST DOUBLE: 6-decimal USDC with open mint.
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev TEST DOUBLE: fee-on-transfer token (burns 1% of every transfer), to exercise the balance-delta check.
contract FeeOnTransferUSDC is ERC20 {
    constructor() ERC20("Fee USDC", "fUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev TEST DOUBLE: verifier. Lenient mode returns `result`; strict mode accepts only one exact
///      public-input vector (so a proof made for recipient A cannot be replayed for recipient B).
contract MockVerifier is IVerifier {
    bool public result = true;
    bool public strict;
    bytes32 public expectedInputsHash;

    function setResult(bool r) external {
        result = r;
    }

    function setStrict(bytes32[] calldata inputs) external {
        strict = true;
        expectedInputsHash = keccak256(abi.encode(inputs));
    }

    function verify(bytes calldata, bytes32[] calldata publicInputs) external view returns (bool) {
        if (strict) return keccak256(abi.encode(publicInputs)) == expectedInputsHash;
        return result;
    }
}

/// @dev TEST DOUBLE for TrancheVault (codex-vault is implementing the real one). Same functions,
///      minimal SPEC semantics: lend / principalReturned / writeDown / cover, totalAssets = idle + outstanding.
contract FakeTrancheVault is TrancheVault {
    using SafeERC20 for IERC20;

    error FakeNotBook();
    error FakeBookAlreadySet();
    error FakeInsufficientIdle();

    constructor(IERC20 usdc, string memory n, string memory s, address owner_, TrancheVault coverRef_, uint16 ratio)
        TrancheVault(usdc, n, s, owner_, coverRef_, ratio)
    {}

    modifier onlyBookFake() {
        if (msg.sender != book) revert FakeNotBook();
        _;
    }

    function setBook(address b) external override onlyOwner {
        if (book != address(0)) revert FakeBookAlreadySet();
        book = b;
    }

    function idle() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function totalAssets() public view override returns (uint256) {
        return idle() + outstanding;
    }

    function lend(address to, uint256 amount) external override onlyBookFake {
        if (idle() < amount) revert FakeInsufficientIdle();
        outstanding += amount;
        IERC20(asset()).safeTransfer(to, amount);
    }

    function principalReturned(uint256 amount) external override onlyBookFake {
        outstanding -= amount;
    }

    function writeDown(uint256 amount) external override onlyBookFake {
        outstanding -= amount;
    }

    function cover(address to, uint256 amount) external override onlyBookFake returns (uint256 paid) {
        uint256 i = idle();
        paid = amount < i ? amount : i;
        if (paid > 0) IERC20(asset()).safeTransfer(to, paid);
    }
}

// =====================================================================================
// TESTS
// =====================================================================================

contract AdvanceBookTest is Test {
    /// @dev Flip to true once the real Policy / StandingPassTree / TrancheVault land. Then the real
    ///      contracts are deployed, offers are really signed, and the skipped tests run.
    bool internal constant USE_REAL_DEPS = true;

    // SPEC known vectors
    uint256 internal constant H_VEC = 0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9b; // hash_1(123456789)
    uint256 internal constant COMMIT1_VEC = 0x18d3e34b1ac1a9ec7bd66ebd313eecd900ce61d5051062a622e3cc87123ec81f; // hash_3(TAG_COMMIT,h,1)
    uint256 internal constant NULL_VEC = 0x0cf89fcd279f976f879be030c4624455df2d39f63e99eb51b8f584cbe2493c84; // hash_2(TAG_NULL,123456789)
    uint256 internal constant EMPTY_ROOT = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;

    uint64 internal constant WINDOW = 30 days;
    uint256 internal constant BOUNTY = 5e6;
    uint256 internal constant SENIOR_SEED = 1000e6;
    uint256 internal constant JUNIOR_SEED = 200e6;
    bytes32 internal constant SHOP = keccak256("shop-1");
    bytes32 internal constant SHOP2 = keccak256("shop-2");

    TestUSDC internal usdc;
    MockVerifier internal verifier;
    MockVerifier internal bizVerifier;
    BusinessPassRegistry internal registry;
    TrancheVault internal senior;
    TrancheVault internal junior;
    AdvanceBook internal book;

    uint256 internal signerPk = 0xA11CE;
    address internal signer;
    address internal owner = makeAddr("owner");
    address internal riskMgr = makeAddr("riskManager");
    address internal lp = makeAddr("lp");
    address internal shopOwner = makeAddr("shopOwner");
    address internal payout = makeAddr("payout");
    address internal recipient = makeAddr("freshRecipient");
    address internal customer = makeAddr("customer");
    address internal relayer = makeAddr("relayer");
    address internal keeper = makeAddr("keeper");

    uint256 internal offerNonce;
    uint256 internal passNonce;
    address internal attester = vm.addr(0xA77E5);

    struct Bal {
        uint256 customer;
        uint256 payout;
        uint256 senior;
        uint256 junior;
        uint256 book;
        uint256 reserve;
        uint256 outstanding;
    }

    function setUp() public {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        signer = vm.addr(signerPk);
        usdc = new TestUSDC();
        verifier = new MockVerifier();
        bizVerifier = new MockVerifier();
        registry = new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), owner, vm.addr(0x155E), [uint16(32), 566, 404, 0]);
        (book, senior, junior) = _deploySystem(IERC20(address(usdc)));

        _seed(senior, SENIOR_SEED);
        _seed(junior, JUNIOR_SEED);

        vm.prank(shopOwner);
        book.registerShop(SHOP, payout);

        vm.prank(customer);
        usdc.approve(address(book), type(uint256).max);
    }

    // ------------------------------------------------------------------ deployment helpers

    function _deploySystem(IERC20 token) internal returns (AdvanceBook b, TrancheVault s, TrancheVault j) {
        s = _deployVault(token, "Senior", "sUSDC", TrancheVault(address(0)), 0);
        j = _deployVault(token, "Junior", "jUSDC", s, 1000);
        uint256[4] memory caps = [uint256(100e6), 250e6, 500e6, 500e6];
        uint256[4] memory floors = [uint256(50e6), 50e6, 100e6, 100e6];
        BookConfig memory c = BookConfig({
            usdc: token,
            senior: s,
            junior: j,
            poseidon2: IPoseidon2(POSEIDON2_SEPOLIA),
            verifier: verifier,
            owner: owner,
            offerSigner: signer,
            riskManager: riskMgr,
            caps: caps,
            capFloors: floors,
            maxExposure: 1000e6,
            maxExposureFloor: 100e6,
            defaultWindow: WINDOW,
            writeOffBounty: BOUNTY,
            businessPass: IBusinessPass(address(registry)),
            bizVerifier: bizVerifier,
            agentPassAttester: attester
        });
        b = new AdvanceBook(c);
        vm.startPrank(owner);
        s.setBook(address(b));
        j.setBook(address(b));
        vm.stopPrank();
    }

    function _deployVault(IERC20 token, string memory n, string memory sym, TrancheVault ref, uint16 ratio)
        internal
        returns (TrancheVault)
    {
        if (USE_REAL_DEPS) return new TrancheVault(token, n, sym, owner, ref, ratio);
        return TrancheVault(address(new FakeTrancheVault(token, n, sym, owner, ref, ratio)));
    }

    function _seed(TrancheVault v, uint256 amount) internal {
        usdc.mint(lp, amount);
        vm.startPrank(lp);
        usdc.approve(address(v), amount);
        v.deposit(amount, lp);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ offer helpers

    function _offer(bytes32 shopId, uint256 amount, uint16 factorBps, uint16 holdbackBps, uint8 tier)
        internal
        returns (Offer memory o)
    {
        o = Offer({
            offerId: keccak256(abi.encode("offer", ++offerNonce)),
            shopId: shopId,
            recipient: recipient,
            amount: amount,
            factorBps: factorBps,
            holdbackBps: holdbackBps,
            tier: tier,
            passNullifier: tier == 0 ? uint256(keccak256(abi.encode("bizpass", ++passNonce))) % SNARK_FIELD : 0,
            minRevenueBand: 0,
            expiresAt: uint64(block.timestamp + 1 days)
        });
    }

    /// @dev EIP-712 digest computed independently of Policy.hashOffer (domain "AdvanceBook", "1").
    function _sign(Offer memory o) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AdvanceBook"),
                keccak256("1"),
                block.chainid,
                address(book)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)"
                ),
                o.offerId,
                o.shopId,
                o.recipient,
                o.amount,
                o.factorBps,
                o.holdbackBps,
                o.tier,
                o.passNullifier,
                o.minRevenueBand,
                o.expiresAt
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _drawFirst(bytes32 shopId, uint256 amount, uint16 factorBps, uint16 holdbackBps)
        internal
        returns (uint256 id)
    {
        Offer memory o = _offer(shopId, amount, factorBps, holdbackBps, 0);
        bytes memory sig = _sign(o);
        vm.prank(relayer);
        id = book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    function _pay(bytes32 shopId, uint256 amount) internal {
        usdc.mint(customer, amount);
        vm.prank(customer);
        book.pay(shopId, amount);
    }

    function _adv(uint256 id) internal view returns (AdvanceBook.Advance memory) {
        return book.getAdvance(id);
    }

    function _snap() internal view returns (Bal memory b) {
        b.customer = usdc.balanceOf(customer);
        b.payout = usdc.balanceOf(payout);
        b.senior = usdc.balanceOf(address(senior));
        b.junior = usdc.balanceOf(address(junior));
        b.book = usdc.balanceOf(address(book));
        b.reserve = book.reserve();
        b.outstanding = senior.outstanding();
    }

    /// @dev Root of a depth-16 tree whose only non-zero leaf is `leaf` at index 0, computed directly.
    function _rootWithSingleLeaf(uint256 leaf) internal view returns (uint256 cur) {
        IPoseidon2 p = IPoseidon2(POSEIDON2_SEPOLIA);
        uint256 z = 0;
        cur = leaf;
        for (uint256 i = 0; i < 16; i++) {
            cur = p.hash_2(cur, z);
            z = p.hash_2(z, z);
        }
    }

    /// @dev drawFirst(commitmentNext = COMMIT1_VEC), repay in full, claim. Returns the advance id.
    function _repaidAndClaimed() internal returns (uint256 id) {
        id = _drawFirst(SHOP, 100e6, 12500, 1000);
        for (uint256 i = 0; i < 13; i++) {
            _pay(SHOP, 100e6);
        }
        book.claimStandingPass(id);
    }

    function _inputs(uint256 root, uint256 nullifier, uint8 tier, uint256 next, address rcpt, bytes32 offerId)
        internal
        pure
        returns (bytes32[] memory pi)
    {
        pi = new bytes32[](5);
        pi[0] = bytes32(root);
        pi[1] = bytes32(nullifier);
        pi[2] = bytes32(uint256(tier));
        pi[3] = bytes32(next);
        pi[4] = bytes32(uint256(keccak256(abi.encode(rcpt, offerId))) % SNARK_FIELD);
    }

    // ================================================================== shops

    function test_registerShop_firstComeAndOwnerOnlySetPayout() public {
        vm.prank(makeAddr("squatter"));
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopAlreadyRegistered.selector, SHOP));
        book.registerShop(SHOP, makeAddr("x"));

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NotShopOwner.selector, SHOP, stranger));
        book.setPayout(SHOP, stranger);

        address newPayout = makeAddr("newPayout");
        vm.prank(shopOwner);
        book.setPayout(SHOP, newPayout);
        _pay(SHOP, 7e6);
        assertEq(usdc.balanceOf(newPayout), 7e6);
        assertEq(usdc.balanceOf(payout), 0);
    }

    function test_registerShop_rejectsZeroValues() public {
        vm.expectRevert(AdvanceBook.InvalidShopId.selector);
        book.registerShop(bytes32(0), payout);
        vm.expectRevert(AdvanceBook.ZeroAddress.selector);
        book.registerShop(SHOP2, address(0));
    }

    // ================================================================== pay

    function test_pay_noAdvance_allToPayout() public {
        Bal memory b0 = _snap();
        _pay(SHOP, 123_456_789);
        assertEq(usdc.balanceOf(payout) - b0.payout, 123_456_789);
        assertEq(usdc.balanceOf(address(book)), 0);
        assertEq(book.reserve(), 0);
    }

    function test_pay_reverts_unregisteredShop_and_zero() public {
        usdc.mint(customer, 1e6);
        vm.prank(customer);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopNotRegistered.selector, SHOP2));
        book.pay(SHOP2, 1e6);
        vm.prank(customer);
        vm.expectRevert(AdvanceBook.ZeroAmount.selector);
        book.pay(SHOP, 0);
    }

    /// Happy path: 100 USDC at 1.25x, 10% holdback, 13 sales of 100 USDC.
    /// Hand-computed: 12 sales repay 10 each (8 principal + 2 fee), the 13th repays the last 5
    /// (4 principal + 1 fee). Total fee 25 -> senior 15, junior 7.5, reserve 2.5.
    function test_happyPath_fullRepayment_exactBalances() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(recipient), 100e6);
        assertEq(senior.outstanding(), 100e6);

        for (uint256 i = 0; i < 12; i++) {
            _pay(SHOP, 100e6);
            assertEq(senior.outstanding(), 100e6 - (i + 1) * 8e6);
        }
        assertEq(uint8(_adv(id).status), uint8(AdvanceBook.Status.Active));

        usdc.mint(customer, 100e6);
        vm.expectEmit(true, true, false, false, address(book));
        emit AdvanceBook.AdvanceRepaid(id, SHOP);
        vm.prank(customer);
        book.pay(SHOP, 100e6);

        assertEq(usdc.balanceOf(payout), 12 * 90e6 + 95e6, "merchant payout");
        assertEq(usdc.balanceOf(address(senior)), SENIOR_SEED - 100e6 + 100e6 + 15e6, "senior");
        assertEq(usdc.balanceOf(address(junior)), JUNIOR_SEED + 7_500_000, "junior");
        assertEq(book.reserve(), 2_500_000, "reserve");
        assertEq(usdc.balanceOf(address(book)), 2_500_000, "book custody == reserve");
        assertEq(senior.outstanding(), 0);
        assertEq(senior.totalAssets(), SENIOR_SEED + 15e6, "senior earned 60% of fee");

        AdvanceBook.Advance memory a = _adv(id);
        assertEq(uint8(a.status), uint8(AdvanceBook.Status.Repaid));
        assertEq(a.repaid, 125e6);
        assertEq(a.principalRepaid, 100e6);
        assertEq(book.owedOf(id), 0);
        (,, uint256 active) = book.shops(SHOP);
        assertEq(active, 0);

        // split back to 0: the whole next sale goes to the merchant
        uint256 before = usdc.balanceOf(payout);
        _pay(SHOP, 50e6);
        assertEq(usdc.balanceOf(payout) - before, 50e6);
        assertEq(book.reserve(), 2_500_000);
    }

    function test_pay_emitsSaleAndSplit() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        usdc.mint(customer, 100e6);
        vm.expectEmit(true, false, false, true, address(book));
        emit AdvanceBook.RepaymentSplit(id, 8e6, 1_200_000, 600_000, 200_000);
        vm.expectEmit(true, true, false, true, address(book));
        emit AdvanceBook.Sale(SHOP, customer, 100e6, 10e6);
        vm.prank(customer);
        book.pay(SHOP, 100e6);
    }

    /// Odd sizes, factor 1.1x, holdback 7.77%: no dust owed at the end and every unit accounted for.
    function test_partialSales_finalRepaymentLeavesNoDust() public {
        uint256 id = _drawFirst(SHOP, 50e6, 11000, 777);
        Bal memory b0 = _snap();
        uint256[6] memory sizes = [uint256(12_345_678), 1_000_001, 333_333, 98_765_432, 7, 4_444_444];
        uint256 spent;
        uint256 i;
        while (_adv(id).status == AdvanceBook.Status.Active) {
            uint256 amt = sizes[i % 6];
            _pay(SHOP, amt);
            spent += amt;
            i++;
            AdvanceBook.Advance memory a = _adv(id);
            assertEq(senior.outstanding(), 50e6 - a.principalRepaid, "outstanding tracks principal");
        }
        AdvanceBook.Advance memory f = _adv(id);
        assertEq(f.repaid, 55e6);
        assertEq(f.principalRepaid, 50e6);
        assertEq(senior.outstanding(), 0);

        uint256 toSenior = usdc.balanceOf(address(senior)) - b0.senior;
        uint256 toJunior = usdc.balanceOf(address(junior)) - b0.junior;
        uint256 toReserve = book.reserve() - b0.reserve;
        uint256 toPayout = usdc.balanceOf(payout) - b0.payout;
        assertEq(toSenior + toJunior + toReserve, 55e6, "repayments == totalOwed");
        assertEq(toPayout + 55e6, spent, "conservation");
        // fee = 5e6: senior got 50e6 principal + ~60%, junior ~30%, reserve the rest (>= 10% by rounding)
        assertLe(toJunior, 1_500_000);
        assertGe(toJunior, 1_500_000 - i);
        assertLe(toSenior - 50e6, 3_000_000);
        assertGe(toSenior - 50e6, 3_000_000 - i);
        assertGe(toReserve, 500_000);
    }

    /// Regression for the SPEC's literal per-sale formula. 20 sales repaying 7 units each round the
    /// principal down by 1 each time (floor(7*50/55) = 6); a per-sale formula then needs a final
    /// principal part larger than the final 1-unit repayment and the fee underflows (repayment
    /// bricked). The cumulative formula keeps principalPart <= rep on every sale.
    function test_tinySalesThenOneUnitFinal_noUnderflow() public {
        uint256 id = _drawFirst(SHOP, 50e6, 11000, 1000);
        for (uint256 i = 0; i < 20; i++) {
            _pay(SHOP, 70); // rep = 7
        }
        _pay(SHOP, (55e6 - 140 - 1) * 10); // leaves exactly 1 unit owed
        assertEq(book.owedOf(id), 1);
        uint256 outBefore = senior.outstanding();
        _pay(SHOP, 10); // rep = 1
        AdvanceBook.Advance memory a = _adv(id);
        assertEq(uint8(a.status), uint8(AdvanceBook.Status.Repaid));
        assertEq(a.principalRepaid, 50e6);
        assertEq(senior.outstanding(), 0);
        assertLe(outBefore, 1, "final principal part never exceeds rep");
    }

    // ================================================================== minimum repayment rule (v2)
    // 100 USDC at 1.25x: totalOwed 125e6, so the 7-day minimum is ceil(1%) = 1_250_000. Holdback 10%.

    uint256 internal constant MIN_REP = 1_250_000;

    function test_minWindowRepayment_isCeilOnePercent() public view {
        assertEq(book.minWindowRepayment(125e6), MIN_REP);
        assertEq(book.minWindowRepayment(100), 1);
        assertEq(book.minWindowRepayment(101), 2, "rounds up");
        assertEq(book.minWindowRepayment(0), 0);
    }

    /// Zero and sub-1% repayments no longer restart the default clock; reaching 1% in the window does.
    function test_repaymentClock_needsOnePercentPerWindow() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        uint64 opened = _adv(id).lastSaleAt;
        vm.warp(block.timestamp + 10 days); // first window [open, open+7d) has expired
        _pay(SHOP, 9); // rep 0
        assertEq(_adv(id).lastSaleAt, opened);
        _pay(SHOP, 10); // rep 1: starts a new window, total 1 < 1%
        assertEq(_adv(id).lastSaleAt, opened);
        assertEq(_adv(id).windowStart, block.timestamp);
        assertEq(_adv(id).windowRepaid, 1);
        _pay(SHOP, 12_499_980); // rep 1_249_998: total 1_249_999, one unit short
        assertEq(_adv(id).lastSaleAt, opened, "1 unit below the minimum");
        assertEq(_adv(id).windowRepaid, MIN_REP - 1);
        _pay(SHOP, 10); // rep 1: total exactly 1%
        assertEq(_adv(id).lastSaleAt, block.timestamp, "exactly 1% resets");
        assertEq(_adv(id).windowRepaid, 0, "fresh window");
        assertEq(_adv(id).windowStart, block.timestamp);
    }

    /// Repayments only add up inside one window: last second in, first second out.
    function test_repaymentClock_windowBoundaries() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        uint256 w = block.timestamp;
        _pay(SHOP, 12_499_990); // rep MIN_REP - 1 at the window start
        vm.warp(w + 7 days - 1); // last second of the window
        _pay(SHOP, 10); // rep 1 -> total MIN_REP within the window
        assertEq(_adv(id).lastSaleAt, w + 7 days - 1);

        uint256 w2 = block.timestamp; // new window started at the reset
        _pay(SHOP, 12_499_990); // MIN_REP - 1 in window 2
        vm.warp(w2 + 7 days); // first second AFTER window 2
        _pay(SHOP, 10); // rep 1 starts window 3 alone: stale partial dropped
        assertEq(_adv(id).lastSaleAt, w2, "partial from an expired window does not count");
        assertEq(_adv(id).windowStart, w2 + 7 days);
        assertEq(_adv(id).windowRepaid, 1);
    }

    /// Dust sales every day can no longer postpone a write-off.
    function test_dustSales_cannotDelayWriteOff() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        uint256 t0 = block.timestamp;
        for (uint256 d = 1; d <= 30; d++) {
            vm.warp(t0 + d * 1 days);
            _pay(SHOP, 1e6); // rep 100_000/day = 700_000/week < 1_250_000
            if (d < 30) {
                vm.expectRevert();
                book.writeOff(id);
            }
        }
        assertEq(_adv(id).lastSaleAt, t0);
        vm.prank(keeper);
        book.writeOff(id);
        assertEq(uint8(_adv(id).status), uint8(AdvanceBook.Status.WrittenOff));
    }

    /// Fuzz: two repaying sales; the clock resets iff they land in one window and sum to >= 1%.
    function testFuzz_repaymentClock(uint256 rep1, uint256 rep2, uint256 gap) public {
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        uint64 opened = _adv(id).lastSaleAt;
        rep1 = bound(rep1, 1, MIN_REP - 1);
        rep2 = bound(rep2, 1, 2 * MIN_REP);
        gap = bound(gap, 0, 14 days);
        _pay(SHOP, rep1 * 10);
        assertEq(_adv(id).lastSaleAt, opened);
        vm.warp(block.timestamp + gap);
        _pay(SHOP, rep2 * 10);
        bool sameWindow = gap < 7 days;
        uint256 total = sameWindow ? rep1 + rep2 : rep2;
        if (total >= MIN_REP) assertEq(_adv(id).lastSaleAt, block.timestamp);
        else assertEq(_adv(id).lastSaleAt, opened);
    }

    // ================================================================== drawFirst

    function test_drawFirst_opensAdvance_storesCommitmentVector_anySender() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1500, 0);
        bytes memory sig = _sign(o);
        vm.expectEmit(true, true, false, true, address(book));
        emit AdvanceBook.AdvanceOpened(1, SHOP, 100e6, 120e6, 1500, 0);
        vm.prank(makeAddr("anyRelayer"));
        uint256 id = book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);

        AdvanceBook.Advance memory a = _adv(id);
        assertEq(a.pendingCommitment, COMMIT1_VEC, "proven first Standing Pass commitment stored");
        assertEq(a.totalOwed, 120e6);
        assertEq(a.lastSaleAt, block.timestamp);
        assertEq(usdc.balanceOf(recipient), 100e6, "funds to offer recipient, not the sender");
        assertEq(usdc.balanceOf(makeAddr("anyRelayer")), 0);
        assertEq(book.exposure(), 100e6);
        assertEq(book.nextAdvanceId(), 2);
    }

    function test_commitmentFor_knownVector() public view {
        assertEq(book.commitmentFor(H_VEC, 1), COMMIT1_VEC);
        assertEq(IPoseidon2(POSEIDON2_SEPOLIA).hash_1(123456789), H_VEC);
    }

    function test_drawFirst_reverts_tierNonZero() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 1);
        bytes memory sig = _sign(o);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.WrongTier.selector, uint8(1)));
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    function test_drawFirst_reverts_doubleDrawWhileActive() public {
        uint256 id = _drawFirst(SHOP, 100e6, 12000, 1000);
        Offer memory o = _offer(SHOP, 50e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopHasActiveAdvance.selector, SHOP, id));
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    function test_drawFirst_reverts_unregisteredShop_and_commitmentNotInField() public {
        Offer memory o = _offer(SHOP2, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopNotRegistered.selector, SHOP2));
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);

        o = _offer(SHOP, 100e6, 12000, 1000, 0);
        sig = _sign(o);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NotInField.selector, SNARK_FIELD));
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, SNARK_FIELD);
    }

    function _bizInputs(uint256 root, uint256 nullifier, uint8 minBand, uint256 next, address rcpt, bytes32 offerId)
        internal
        pure
        returns (bytes32[] memory pi)
    {
        pi = new bytes32[](9);
        pi[0] = bytes32(root);
        pi[1] = bytes32(nullifier);
        pi[2] = bytes32(uint256(minBand));
        pi[3] = bytes32(next);
        pi[4] = bytes32(uint256(keccak256(abi.encode(rcpt, offerId))) % SNARK_FIELD);
        pi[5] = bytes32(uint256(32));
        pi[6] = bytes32(uint256(566));
        pi[7] = bytes32(uint256(404));
        pi[8] = bytes32(uint256(0));
    }

    function test_drawFirst_exactBusinessPassPublicInputs() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        o.minRevenueBand = 2;
        bytes memory sig = _sign(o);
        bytes32[] memory pi = _bizInputs(EMPTY_ROOT, o.passNullifier, 2, COMMIT1_VEC, recipient, o.offerId);
        bizVerifier.setStrict(pi);
        vm.expectCall(address(bizVerifier), abi.encodeCall(IVerifier.verify, (hex"beef", pi)));
        book.drawFirst(o, sig, hex"beef", EMPTY_ROOT, COMMIT1_VEC);
        assertTrue(book.passNullifierUsed(o.passNullifier));
    }

    /// A proof for minBand 1 cannot back an offer that demands band 2 (minRevenueBand is a public input).
    function test_drawFirst_reverts_bandMismatch() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bizVerifier.setStrict(_bizInputs(EMPTY_ROOT, o.passNullifier, 1, COMMIT1_VEC, recipient, o.offerId));
        o.minRevenueBand = 2;
        bytes memory sig = _sign(o);
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    /// The country set is read from the registry at draw time: changing it changes the public inputs.
    function test_drawFirst_countrySetFromRegistry() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        bizVerifier.setStrict(_bizInputs(EMPTY_ROOT, o.passNullifier, 0, COMMIT1_VEC, recipient, o.offerId));
        vm.prank(owner);
        registry.setCountrySet([uint16(32), 566, 0, 0]); // KE removed
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    /// The Standing Pass root is not a Business Pass root (separate trees).
    function test_drawFirst_reverts_unknownBusinessRoot() public {
        _repaidAndClaimed();
        uint256 standingRoot = book.currentRoot();
        vm.prank(makeAddr("o2"));
        book.registerShop(SHOP2, payout);
        Offer memory o = _offer(SHOP2, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.UnknownRoot.selector, standingRoot));
        book.drawFirst(o, sig, hex"01", standingRoot, COMMIT1_VEC);
    }

    function test_drawFirst_reverts_verifierFalse_noStateChange() public {
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        bizVerifier.setResult(false);
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
        assertFalse(book.passNullifierUsed(o.passNullifier));
        assertFalse(book.offerUsed(o.offerId));
        assertEq(senior.outstanding(), 0);
    }

    /// One first advance per Business Pass: the same nullifier cannot open a second shop's advance.
    function test_drawFirst_reverts_reusedPassNullifier() public {
        Offer memory o = _offer(SHOP, 50e6, 12000, 1000, 0);
        book.drawFirst(o, _sign(o), hex"01", EMPTY_ROOT, COMMIT1_VEC);
        vm.prank(makeAddr("o2"));
        book.registerShop(SHOP2, payout);
        Offer memory o2 = _offer(SHOP2, 50e6, 12000, 1000, 0);
        o2.passNullifier = o.passNullifier;
        bytes memory sig2 = _sign(o2);
        vm.expectRevert(Policy.InvalidPassNullifier.selector);
        book.drawFirst(o2, sig2, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    function testFuzz_drawFirst_callerIrrelevant(address caller) public {
        if (caller == address(0)) caller = relayer; // no vm.assume
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        uint256 recBefore = usdc.balanceOf(recipient);
        vm.prank(caller);
        uint256 id = book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
        assertEq(usdc.balanceOf(recipient) - recBefore, 100e6);
        assertEq(_adv(id).shopId, SHOP);
    }

    // ================================================================== drawWithPass

    function _passSetup() internal returns (uint256 root, Offer memory o, bytes memory sig, uint256 next) {
        _repaidAndClaimed();
        root = book.currentRoot();
        o = _offer(SHOP, 250e6, 12000, 1000, 1);
        sig = _sign(o);
        next = book.commitmentFor(H_VEC, 2);
    }

    function test_drawWithPass_happy_exactPublicInputs() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        bytes memory proof = hex"deadbeef";
        bytes32[] memory pi = _inputs(root, NULL_VEC, 1, next, recipient, o.offerId);
        verifier.setStrict(pi);
        vm.expectCall(address(verifier), abi.encodeCall(IVerifier.verify, (proof, pi)));

        uint256 recBefore = usdc.balanceOf(recipient);
        vm.prank(relayer);
        uint256 id = book.drawWithPass(o, sig, proof, root, NULL_VEC, next);

        assertTrue(book.nullifierSpent(NULL_VEC));
        AdvanceBook.Advance memory a = _adv(id);
        assertEq(a.pendingCommitment, next);
        assertEq(a.tier, 1);
        assertEq(a.principal, 250e6);
        assertEq(usdc.balanceOf(recipient) - recBefore, 250e6);
    }

    function test_contextFor_matchesSpecFormula() public view {
        bytes32 offerId = keccak256("x");
        uint256 ctx = book.contextFor(recipient, offerId);
        assertLt(ctx, SNARK_FIELD);
        assertEq(ctx, uint256(keccak256(abi.encode(recipient, offerId))) % SNARK_FIELD);
        assertTrue(ctx != book.contextFor(relayer, offerId));
    }

    /// A proof made for (recipient, offerId) cannot be redirected to another recipient.
    function test_drawWithPass_reverts_redirectedRecipient() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        verifier.setStrict(_inputs(root, NULL_VEC, 1, next, recipient, o.offerId));
        o.recipient = relayer; // front-runner swaps the recipient (and gets the offer re-signed)
        sig = _sign(o);
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.drawWithPass(o, sig, hex"01", root, NULL_VEC, next);
    }

    function test_drawWithPass_reverts_verifierFalse_noStateChange() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        verifier.setResult(false);
        vm.expectRevert(AdvanceBook.InvalidProof.selector);
        book.drawWithPass(o, sig, hex"01", root, NULL_VEC, next);
        assertFalse(book.nullifierSpent(NULL_VEC));
        assertFalse(book.offerUsed(o.offerId));
    }

    function test_drawWithPass_reverts_replayedNullifier() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        book.drawWithPass(o, sig, hex"01", root, NULL_VEC, next);

        vm.prank(makeAddr("o2"));
        book.registerShop(SHOP2, payout);
        Offer memory o2 = _offer(SHOP2, 100e6, 12000, 1000, 1);
        bytes memory sig2 = _sign(o2);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NullifierAlreadySpent.selector, NULL_VEC));
        book.drawWithPass(o2, sig2, hex"01", root, NULL_VEC, next);
    }

    function test_drawWithPass_reverts_unknownRoot() public {
        (, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        uint256 bad = 12345;
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.UnknownRoot.selector, bad));
        book.drawWithPass(o, sig, hex"01", bad, NULL_VEC, next);
    }

    function test_drawWithPass_oldRootStillAccepted() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        assertTrue(book.isKnownRoot(EMPTY_ROOT));
        assertTrue(root != EMPTY_ROOT);
        // the empty root is an older known root: still accepted (recent-roots rule)
        book.drawWithPass(o, sig, hex"01", EMPTY_ROOT, NULL_VEC, next);
        assertTrue(book.nullifierSpent(NULL_VEC));
    }

    function test_drawWithPass_reverts_inputsNotInField() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        uint256 p = SNARK_FIELD;
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NotInField.selector, p));
        book.drawWithPass(o, sig, hex"01", p, NULL_VEC, next);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NotInField.selector, p + 1));
        book.drawWithPass(o, sig, hex"01", root, p + 1, next);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.NotInField.selector, type(uint256).max));
        book.drawWithPass(o, sig, hex"01", root, NULL_VEC, type(uint256).max);
    }

    function test_drawWithPass_reverts_tierZero_and_activeAdvance() public {
        (uint256 root, Offer memory o, bytes memory sig, uint256 next) = _passSetup();
        Offer memory z = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory zs = _sign(z);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.WrongTier.selector, uint8(0)));
        book.drawWithPass(z, zs, hex"01", root, NULL_VEC, next);

        uint256 id = book.drawWithPass(o, sig, hex"01", root, NULL_VEC, next);
        Offer memory o3 = _offer(SHOP, 100e6, 12000, 1000, 2);
        bytes memory s3 = _sign(o3);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.ShopHasActiveAdvance.selector, SHOP, id));
        book.drawWithPass(o3, s3, hex"01", root, 777, next);
    }

    // ================================================================== claimStandingPass

    function test_claimStandingPass_insertsVectorCommitment_once() public {
        assertEq(book.currentRoot(), EMPTY_ROOT, "empty depth-16 root vector");
        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);

        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.AdvanceNotRepaid.selector, id));
        book.claimStandingPass(id);

        for (uint256 i = 0; i < 13; i++) {
            _pay(SHOP, 100e6);
        }
        uint256 expectedRoot = _rootWithSingleLeaf(COMMIT1_VEC);
        vm.expectEmit(true, false, false, true, address(book));
        emit StandingPassTree.LeafInserted(COMMIT1_VEC, 0, expectedRoot);
        vm.expectEmit(true, false, false, true, address(book));
        emit AdvanceBook.StandingPassClaimed(id, COMMIT1_VEC);
        vm.prank(relayer);
        book.claimStandingPass(id);

        assertEq(book.currentRoot(), expectedRoot);
        assertTrue(book.isKnownRoot(expectedRoot));
        assertEq(book.nextLeafIndex(), 1);
        assertTrue(_adv(id).credentialClaimed);

        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.CredentialAlreadyClaimed.selector, id));
        book.claimStandingPass(id);
    }

    function test_claimStandingPass_reverts_unknownAndWrittenOff() public {
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.AdvanceNotRepaid.selector, 99));
        book.claimStandingPass(99);

        uint256 id = _drawFirst(SHOP, 100e6, 12500, 1000);
        vm.warp(block.timestamp + WINDOW);
        book.writeOff(id);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.AdvanceNotRepaid.selector, id));
        book.claimStandingPass(id);
        assertEq(book.nextLeafIndex(), 0);
    }

    // ================================================================== writeOff

    /// 100 USDC at 1.25x, three 100-USDC sales: principalRepaid 24, fees 6 (senior 3.6, junior 1.8,
    /// reserve 0.6). Loss on write-off = 76.
    function _writeOffSetup() internal returns (uint256 id) {
        id = _drawFirst(SHOP, 100e6, 12500, 1000);
        _pay(SHOP, 100e6);
        _pay(SHOP, 100e6);
        _pay(SHOP, 100e6);
        assertEq(book.reserve(), 600_000);
        assertEq(senior.outstanding(), 76e6);
    }

    function _depositReserve(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(book), amount);
        book.depositReserve(amount);
    }

    function _shrinkJuniorTo(uint256 idleTarget) internal {
        uint256 bal = usdc.balanceOf(address(junior));
        vm.prank(lp);
        junior.withdraw(bal - idleTarget, lp, lp);
        assertEq(usdc.balanceOf(address(junior)), idleTarget);
    }

    function test_writeOff_reverts_tooEarly_and_saleResetsClock() public {
        uint256 id = _writeOffSetup();
        uint256 t = block.timestamp;
        vm.warp(t + WINDOW - 1);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.DefaultWindowNotElapsed.selector, id, t + WINDOW));
        book.writeOff(id);

        _pay(SHOP, 1e6); // repays 0.1 < 1% of 125: does NOT restart the clock (v2 minimum-repayment rule)
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.DefaultWindowNotElapsed.selector, id, t + WINDOW));
        book.writeOff(id);
        _pay(SHOP, 11_500_000); // window total 0.1 + 1.15 = 1.25 = 1%: restarts the clock
        vm.warp(t + WINDOW);
        vm.expectRevert(
            abi.encodeWithSelector(AdvanceBook.DefaultWindowNotElapsed.selector, id, t + WINDOW - 1 + WINDOW)
        );
        book.writeOff(id);
    }

    /// Junior covers the whole loss; the reserve pays the full bounty.
    function test_writeOff_juniorCoversAll_fullBounty() public {
        uint256 id = _writeOffSetup();
        _depositReserve(10e6); // reserve 10.6
        uint256 seniorBefore = usdc.balanceOf(address(senior)); // 1000 - 100 + 27.6
        vm.warp(block.timestamp + WINDOW);

        vm.expectEmit(true, false, false, true, address(book));
        emit AdvanceBook.AdvanceWrittenOff(id, 76e6, 76e6, 0, 0, BOUNTY);
        vm.prank(keeper);
        book.writeOff(id);

        assertEq(usdc.balanceOf(address(senior)), seniorBefore + 76e6);
        assertEq(seniorBefore, 927_600_000);
        assertEq(usdc.balanceOf(address(junior)), JUNIOR_SEED + 1_800_000 - 76e6);
        assertEq(senior.outstanding(), 0);
        assertEq(usdc.balanceOf(keeper), BOUNTY);
        assertEq(book.reserve(), 5_600_000);
        assertEq(usdc.balanceOf(address(book)), book.reserve());
        assertEq(uint8(_adv(id).status), uint8(AdvanceBook.Status.WrittenOff));
        (,, uint256 active) = book.shops(SHOP);
        assertEq(active, 0);
    }

    /// Full waterfall: junior 20, reserve 0.6, senior writes down 55.4, no bounty left.
    function test_writeOff_fullWaterfall_noBounty() public {
        uint256 id = _writeOffSetup();
        _shrinkJuniorTo(20e6);
        vm.warp(block.timestamp + WINDOW);

        vm.expectEmit(true, false, false, true, address(book));
        emit AdvanceBook.AdvanceWrittenOff(id, 76e6, 20e6, 600_000, 55_400_000, 0);
        vm.prank(keeper);
        book.writeOff(id);

        assertEq(usdc.balanceOf(address(junior)), 0);
        assertEq(usdc.balanceOf(address(senior)), 927_600_000 + 20e6 + 600_000);
        assertEq(senior.outstanding(), 0);
        assertEq(senior.totalAssets(), 948_200_000, "senior realised 55.4 loss");
        assertEq(book.reserve(), 0);
        assertEq(usdc.balanceOf(address(book)), 0);
        assertEq(usdc.balanceOf(keeper), 0);
    }

    /// Reserve covers the rest and has 2.6 left, so the bounty is capped at 2.6.
    function test_writeOff_bountyCappedByReserveLeftover() public {
        uint256 id = _writeOffSetup();
        _shrinkJuniorTo(20e6);
        _depositReserve(58e6); // reserve 58.6; rest after junior = 56
        vm.warp(block.timestamp + WINDOW);

        vm.expectEmit(true, false, false, true, address(book));
        emit AdvanceBook.AdvanceWrittenOff(id, 76e6, 20e6, 56e6, 0, 2_600_000);
        vm.prank(keeper);
        book.writeOff(id);
        assertEq(usdc.balanceOf(keeper), 2_600_000);
        assertEq(book.reserve(), 0);
        assertEq(usdc.balanceOf(address(book)), 0);
        assertEq(senior.outstanding(), 0);
        assertEq(senior.totalAssets(), 927_600_000 + 76e6);
    }

    function test_writeOff_afterwards_shopFree_secondWriteOffReverts() public {
        uint256 id = _writeOffSetup();
        vm.warp(block.timestamp + WINDOW);
        book.writeOff(id);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.AdvanceNotActive.selector, id));
        book.writeOff(id);
        uint256 before = usdc.balanceOf(payout);
        _pay(SHOP, 10e6);
        assertEq(usdc.balanceOf(payout) - before, 10e6, "no holdback after write-off");
    }

    // ================================================================== depositReserve / custody

    function test_depositReserve() public {
        vm.expectRevert(AdvanceBook.ZeroAmount.selector);
        book.depositReserve(0);
        _depositReserve(3e6);
        assertEq(book.reserve(), 3e6);
        assertEq(usdc.balanceOf(address(book)), 3e6);
    }

    function test_feeOnTransferToken_rejectedByBalanceDelta() public {
        FeeOnTransferUSDC f = new FeeOnTransferUSDC();
        (AdvanceBook b2,,) = _deploySystem(IERC20(address(f)));
        vm.prank(shopOwner);
        b2.registerShop(SHOP, payout);
        f.mint(customer, 100e6);
        vm.startPrank(customer);
        f.approve(address(b2), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.TransferAmountMismatch.selector, 100e6, 99e6));
        b2.pay(SHOP, 100e6);
        vm.expectRevert(abi.encodeWithSelector(AdvanceBook.TransferAmountMismatch.selector, 100e6, 99e6));
        b2.depositReserve(100e6);
        vm.stopPrank();
    }

    // ================================================================== fuzz

    function _size(uint256 i) internal pure returns (uint256) {
        uint256[4] memory s = [uint256(50e6), 100e6, 250e6, 500e6];
        return s[i % 4];
    }

    /// One sale on a fresh advance across the whole Policy domain: money in == money out.
    function testFuzz_pay_conservation(uint256 amount, uint256 hb, uint256 factor, uint256 sizeIdx) public {
        amount = bound(amount, 1, 1e13);
        hb = bound(hb, 500, 2000);
        factor = bound(factor, 11000, 15000);
        uint256 principal = _size(sizeIdx) > 100e6 ? 100e6 : _size(sizeIdx); // tier-0 cap is 100
        uint256 id = _drawFirst(SHOP, principal, uint16(factor), uint16(hb));
        uint256 owed = principal * factor / 10_000;

        Bal memory b0 = _snap();
        _pay(SHOP, amount);
        Bal memory b1 = _snap();

        uint256 expectedRep = amount * hb / 10_000;
        if (expectedRep > owed) expectedRep = owed;
        uint256 toPayout = b1.payout - b0.payout;
        uint256 toSenior = b1.senior - b0.senior;
        uint256 toJunior = b1.junior - b0.junior;
        uint256 toReserve = b1.reserve - b0.reserve;

        assertEq(toPayout + toSenior + toJunior + toReserve, amount, "conservation");
        assertEq(amount - toPayout, expectedRep, "repayment");
        assertEq(b1.book, b1.reserve, "custody == reserve");
        uint256 principalPart = b0.outstanding - b1.outstanding;
        assertLe(principalPart, expectedRep);
        assertEq(principalPart, expectedRep * principal / owed, "first sale: rep*principal/totalOwed");
        assertEq(_adv(id).repaid, expectedRep);
        assertLe(_adv(id).repaid, _adv(id).totalOwed);
    }

    /// Many sales until repaid: per-sale conservation, exact final principal, fee split shares.
    function testFuzz_multiSale_repaysExactly(uint256 seed, uint256 hb, uint256 factor, uint256 sizeIdx) public {
        hb = bound(hb, 500, 2000);
        factor = bound(factor, 11000, 15000);
        uint256 principal = _size(sizeIdx) > 100e6 ? 100e6 : _size(sizeIdx);
        uint256 id = _drawFirst(SHOP, principal, uint16(factor), uint16(hb));
        uint256 owed = principal * factor / 10_000;
        Bal memory start = _snap();

        uint256 n;
        while (_adv(id).status == AdvanceBook.Status.Active) {
            uint256 amt = n < 40 ? bound(uint256(keccak256(abi.encode(seed, n))), 1, principal * 2) : 1e13;
            Bal memory b0 = _snap();
            _pay(SHOP, amt);
            Bal memory b1 = _snap();
            assertEq(
                (b1.payout - b0.payout) + (b1.senior - b0.senior) + (b1.junior - b0.junior) + (b1.reserve - b0.reserve),
                amt,
                "per-sale conservation"
            );
            assertEq(b1.book, b1.reserve);
            assertEq(b1.outstanding, principal - _adv(id).principalRepaid);
            n++;
        }
        Bal memory end = _snap();
        uint256 fee = owed - principal;
        uint256 toSenior = end.senior - start.senior;
        uint256 toJunior = end.junior - start.junior;
        uint256 toReserve = end.reserve - start.reserve;
        assertEq(end.outstanding, 0);
        assertEq(_adv(id).principalRepaid, principal);
        assertEq(toSenior + toJunior + toReserve, owed, "all of totalOwed distributed");
        assertLe(toSenior - principal, fee * 6000 / 10_000);
        assertGe(toSenior - principal + n, fee * 6000 / 10_000);
        assertLe(toJunior, fee * 3000 / 10_000);
        assertGe(toJunior + n, fee * 3000 / 10_000);
    }

    // ================================================================== real-dependency tests (skipped now)

    /// TODO(codex-policy): runs once the real Policy verifies EIP-712 signatures.
    function test_real_drawFirst_badSignature_reverts() public {
        if (!USE_REAL_DEPS) vm.skip(true);
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, keccak256("not the offer"));
        vm.expectRevert();
        book.drawFirst(o, abi.encodePacked(r, s, v), hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    /// TODO(codex-policy): expiry is enforced only by the real Policy.
    function test_real_drawFirst_expiredOffer_reverts() public {
        if (!USE_REAL_DEPS) vm.skip(true);
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        vm.warp(o.expiresAt + 1);
        vm.expectRevert();
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    /// TODO(codex-policy): tier cap (tier 0 = 100) enforced only by the real Policy.
    function test_real_drawFirst_overTierCap_reverts() public {
        if (!USE_REAL_DEPS) vm.skip(true);
        Offer memory o = _offer(SHOP, 250e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        vm.expectRevert();
        book.drawFirst(o, sig, hex"01", EMPTY_ROOT, COMMIT1_VEC);
    }

    /// TODO(codex-policy): the digest the test signs must equal Policy.hashOffer.
    function test_real_hashOffer_matchesTestDigest() public {
        if (!USE_REAL_DEPS) vm.skip(true);
        Offer memory o = _offer(SHOP, 100e6, 12000, 1000, 0);
        bytes memory sig = _sign(o);
        (bytes32 r, bytes32 s) = abi.decode(sig, (bytes32, bytes32));
        uint8 v = uint8(sig[64]);
        assertEq(ecrecover(book.hashOffer(o), v, r, s), signer);
    }

    /// TODO(codex-vault): junior withdrawals limited by the cover ratio while senior has outstanding.
    function test_real_juniorWithdrawLimitedByCoverRatio() public {
        if (!USE_REAL_DEPS) vm.skip(true);
        _drawFirst(SHOP, 100e6, 12000, 1000);
        // junior must keep >= 10% of senior.outstanding (10e6)
        uint256 maxW = junior.maxWithdraw(lp);
        assertLe(maxW, JUNIOR_SEED - 10e6);
    }
}
