// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TrancheVault} from "../src/TrancheVault.sol";

contract VaultTestToken is ERC20 {
    constructor() ERC20("Test USD", "TUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract TrancheVaultTest is Test {
    VaultTestToken token;
    TrancheVault senior;
    TrancheVault junior;
    address lender = address(0x123);
    address borrower = address(0x456);

    function setUp() public {
        token = new VaultTestToken();
        senior = new TrancheVault(IERC20(token), "Senior", "S", address(this), TrancheVault(address(0)), 0);
        junior = new TrancheVault(IERC20(token), "Junior", "J", address(this), senior, 2000);
        senior.setBook(address(this));
        junior.setBook(address(this));
        token.mint(lender, 10_000e6);
        vm.startPrank(lender);
        token.approve(address(senior), type(uint256).max);
        token.approve(address(junior), type(uint256).max);
        vm.stopPrank();
    }

    function deposit(TrancheVault vault, uint256 amount) internal {
        vm.prank(lender);
        vault.deposit(amount, lender);
    }

    function testRoundTrip() public {
        deposit(senior, 100e6);
        uint256 shares = senior.balanceOf(lender);
        vm.prank(lender);
        assertEq(senior.redeem(shares, lender, lender), 100e6);
        assertEq(token.balanceOf(lender), 10_000e6);
    }

    function testReturnWithFeeRaisesPrice() public {
        deposit(senior, 100e6);
        senior.lend(borrower, 40e6);
        uint256 beforePrice = senior.convertToAssets(100e6);
        token.mint(address(senior), 44e6);
        senior.principalReturned(40e6);
        assertGt(senior.convertToAssets(100e6), beforePrice);
        assertEq(senior.totalAssets(), 104e6);
    }

    function testWriteDownLowersPrice() public {
        deposit(senior, 100e6);
        senior.lend(borrower, 40e6);
        uint256 beforePrice = senior.convertToAssets(100e6);
        senior.writeDown(20e6);
        assertLt(senior.convertToAssets(100e6), beforePrice);
        assertEq(senior.totalAssets(), 80e6);
    }

    function testCoverAndIdleLimits() public {
        deposit(senior, 100e6);
        senior.lend(borrower, 80e6);
        assertEq(senior.maxWithdraw(lender), 20e6);
        assertLe(senior.previewRedeem(senior.maxRedeem(lender)), 20e6);
        assertEq(senior.cover(borrower, 30e6), 20e6);
        assertEq(senior.maxWithdraw(lender), 0);
        assertEq(token.balanceOf(borrower), 100e6);
    }

    function testCoverageLimit() public {
        deposit(senior, 1000e6);
        deposit(junior, 300e6);
        senior.lend(borrower, 1000e6);
        assertEq(junior.maxWithdraw(lender), 100e6);
        vm.prank(lender);
        vm.expectRevert();
        junior.withdraw(100e6 + 1, lender, lender);
        vm.prank(lender);
        junior.withdraw(100e6, lender, lender);
        assertEq(junior.maxWithdraw(lender), 0);
        assertEq(junior.maxRedeem(lender), 0);
    }

    function testAuthorizationAndBounds() public {
        vm.startPrank(lender);
        vm.expectRevert(TrancheVault.NotBook.selector); senior.lend(lender, 1);
        vm.expectRevert(TrancheVault.NotBook.selector); senior.principalReturned(1);
        vm.expectRevert(TrancheVault.NotBook.selector); senior.writeDown(1);
        vm.expectRevert(TrancheVault.NotBook.selector); senior.cover(lender, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, lender)); senior.setBook(lender);
        vm.stopPrank();
        vm.expectRevert(TrancheVault.BookAlreadySet.selector); senior.setBook(lender);
        vm.expectRevert(TrancheVault.InsufficientIdle.selector); senior.lend(lender, 1);
        vm.expectRevert(TrancheVault.InsufficientOutstanding.selector); senior.principalReturned(1);
        vm.expectRevert(TrancheVault.InsufficientOutstanding.selector); senior.writeDown(1);
        TrancheVault fresh = new TrancheVault(IERC20(token), "Fresh", "F", address(this), TrancheVault(address(0)), 0);
        vm.expectRevert(TrancheVault.InvalidBook.selector); fresh.setBook(address(0));
        fresh.setBook(address(this));
    }

    function testSeededDonationAttack() public {
        address attacker = address(0x999);
        deposit(senior, 1_000e6);
        token.mint(attacker, 101e6);
        vm.startPrank(attacker);
        token.approve(address(senior), type(uint256).max);
        senior.deposit(1e6, attacker);
        token.transfer(address(senior), 100e6);
        vm.stopPrank();
        uint256 beforeBalance = token.balanceOf(lender);
        deposit(senior, 100e6);
        uint256 shares = senior.balanceOf(lender);
        vm.prank(lender);
        senior.redeem(shares, lender, lender);
        assertGe(token.balanceOf(lender), beforeBalance - 1);
    }

    function testFuzzConservation(uint256 loan, uint256 returned, uint256 loss, uint256 secondLoan) public {
        deposit(senior, 1000e6);
        loan = bound(loan, 0, 1000e6);
        senior.lend(borrower, loan);
        assertEq(senior.totalAssets(), token.balanceOf(address(senior)) + senior.outstanding());
        returned = bound(returned, 0, loan);
        token.mint(address(senior), returned);
        senior.principalReturned(returned);
        assertEq(senior.totalAssets(), token.balanceOf(address(senior)) + senior.outstanding());
        loss = bound(loss, 0, loan - returned);
        senior.writeDown(loss);
        secondLoan = bound(secondLoan, 0, senior.idle());
        senior.lend(borrower, secondLoan);
        assertEq(senior.totalAssets(), 1000e6 - loss);
        assertEq(senior.totalAssets(), token.balanceOf(address(senior)) + senior.outstanding());
    }
}
