// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TrancheVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotBook();
    error BookAlreadySet();
    error InvalidBook();
    error InsufficientIdle();
    error InsufficientOutstanding();
    error CoverageViolation();
    error UnexpectedAssetAmount();
    TrancheVault public immutable coverRef;
    uint16 public immutable coverRatioBps;
    address public book;
    uint256 public outstanding;

    constructor(
        IERC20 usdc,
        string memory name_,
        string memory symbol_,
        address owner_,
        TrancheVault coverRef_,
        uint16 coverRatioBps_
    ) ERC20(name_, symbol_) ERC4626(usdc) Ownable(owner_) {
        coverRef = coverRef_;
        coverRatioBps = coverRatioBps_;
    }

    modifier onlyBook() {
        if (msg.sender != book) revert NotBook();
        _;
    }

    function setBook(address b) external virtual onlyOwner {
        if (book != address(0)) revert BookAlreadySet();
        if (b == address(0)) revert InvalidBook();
        book = b;
    }

    function idle() public view virtual returns (uint256) { return IERC20(asset()).balanceOf(address(this)); }
    function totalAssets() public view virtual override returns (uint256) { return idle() + outstanding; }

    function lend(address to, uint256 amount) external virtual onlyBook nonReentrant {
        if (amount > idle()) revert InsufficientIdle();
        outstanding += amount;
        IERC20(asset()).safeTransfer(to, amount);
    }

    function principalReturned(uint256 amount) external virtual onlyBook {
        if (amount > outstanding) revert InsufficientOutstanding();
        outstanding -= amount;
    }

    function writeDown(uint256 amount) external virtual onlyBook {
        if (amount > outstanding) revert InsufficientOutstanding();
        outstanding -= amount;
    }

    function cover(address to, uint256 amount) external virtual onlyBook nonReentrant returns (uint256 paid) {
        paid = Math.min(amount, idle());
        IERC20(asset()).safeTransfer(to, paid);
    }

    function _available() internal view returns (uint256) {
        uint256 available = idle();
        if (address(coverRef) != address(0)) {
            uint256 required = Math.mulDiv(coverRef.outstanding(), coverRatioBps, 1e4);
            uint256 assets = totalAssets();
            available = Math.min(available, assets > required ? assets - required : 0);
        }
        return available;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(previewRedeem(balanceOf(owner)), _available());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 available = _available();
        uint256 shares = balanceOf(owner);
        if (previewRedeem(shares) <= available) return shares;
        return Math.min(shares, _convertToShares(available + 1, Math.Rounding.Ceil) - 1);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        uint256 beforeBalance = idle();
        super._deposit(caller, receiver, assets, shares);
        if (idle() - beforeBalance != assets) revert UnexpectedAssetAmount();
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal override nonReentrant
    {
        if (assets > _available()) revert CoverageViolation();
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
