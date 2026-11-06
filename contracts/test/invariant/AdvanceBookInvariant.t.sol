pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {BaseTest} from "../Base.t.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {AdvanceBook} from "../../src/AdvanceBook.sol";
import {Offer} from "../../src/Policy.sol";
import {TrancheVault} from "../../src/TrancheVault.sol";

contract Handler is Test {
    AdvanceBook public book;
    MockUSDC public usdc;
    TrancheVault public senior;
    TrancheVault public junior;
    uint256 public calls;
    uint256 public successes;
    uint256 public failures;
    uint256 private serial;
    uint256 private constant SIGNER_PK = 0xA11CE;
    uint256 private constant EMPTY_ROOT = 0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3;
    address[4] private actors;
    bytes32[4] private shopIds;

    constructor(AdvanceBook book_, MockUSDC usdc_, TrancheVault senior_, TrancheVault junior_) {
        book = book_; usdc = usdc_; senior = senior_; junior = junior_;
        for (uint256 index; index < actors.length; ++index) {
            actors[index] = address(uint160(0x1000 + index));
            shopIds[index] = bytes32(index + 1);
            usdc.mint(actors[index], 10_000_000e6);
            vm.startPrank(actors[index]);
            usdc.approve(address(book), type(uint256).max);
            usdc.approve(address(senior), type(uint256).max);
            usdc.approve(address(junior), type(uint256).max);
            book.registerShop(shopIds[index], actors[index]);
            vm.stopPrank();
        }
    }
    function pay(uint256 actorSeed, uint256 shopSeed, uint256 amount) external {
        ++calls;
        vm.prank(actors[actorSeed % 4]);
        try book.pay(shopIds[shopSeed % 4], bound(amount, 1, 1_000e6)) { ++successes; } catch { ++failures; }
    }
    function drawFirst(uint256 seed) external {
        ++calls;
        uint256 index = seed % 4;
        ++serial;
        Offer memory offer = Offer(bytes32(serial), shopIds[index], actors[index], 50e6, 50, 300, 2000, 0, serial, 0, uint64(vm.getBlockTimestamp() + 1 days));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, book.hashOffer(offer));
        // Business Pass proof: MockVerifier accepts; the registry's empty root is a known root.
        try book.drawFirst(offer, abi.encodePacked(r, s, v), hex"01", EMPTY_ROOT, serial) returns (uint256) { ++successes; } catch { ++failures; }
    }
    function writeOff(uint256 seed, uint256 elapsed) external {
        ++calls;
        vm.warp(vm.getBlockTimestamp() + bound(elapsed, 0, 40 days));
        uint256 id = bound(seed, 1, book.nextAdvanceId());
        try book.writeOff(id) { ++successes; } catch { ++failures; }
    }
    function claimStandingPass(uint256 seed) external {
        ++calls;
        uint256 id = bound(seed, 1, book.nextAdvanceId());
        try book.claimStandingPass(id) { ++successes; } catch { ++failures; }
    }
    function actorAt(uint256 i) external view returns (address) { return actors[i]; }
    function deposit(uint256 actorSeed, uint256 vaultSeed, uint256 amount) external {
        ++calls;
        TrancheVault vault = vaultSeed % 2 == 0 ? senior : junior;
        address actor = actors[actorSeed % 4];
        amount = bound(amount, 1, 1_000e6);
        vm.prank(actor);
        try vault.deposit(amount, actor) returns (uint256) { ++successes; } catch { ++failures; }
    }
    function withdraw(uint256 actorSeed, uint256 vaultSeed, uint256 amount) external {
        ++calls;
        TrancheVault vault = vaultSeed % 2 == 0 ? senior : junior;
        address actor = actors[actorSeed % 4];
        amount = bound(amount, 1, 1_000e6);
        vm.prank(actor);
        try vault.withdraw(amount, actor, actor) returns (uint256) { ++successes; } catch { ++failures; }
    }
}

contract AdvanceBookInvariantTest is StdInvariant, BaseTest {
    Handler internal handler;
    function setUp() public override {
        super.setUp();
        handler = new Handler(book, usdc, senior, junior);
        targetContract(address(handler));
    }
    function invariant_accounting() public view {
        assertEq(senior.totalAssets(), senior.idle() + senior.outstanding());
        uint256 gross = junior.idle() + junior.outstanding();
        uint256 provision = book.delinquentPrincipal();
        assertEq(junior.totalAssets(), gross > provision ? gross - provision : 0);
        assertEq(usdc.balanceOf(address(book)), book.reserve());
        uint256 activePrincipal;
        for (uint256 id = 1; id < book.nextAdvanceId(); ++id) {
            AdvanceBook.Advance memory a = book.getAdvance(id);
            (uint256 principal, uint256 owed, uint256 repaid, uint256 principalRepaid, AdvanceBook.Status status) =
                (a.principal, a.totalOwed, a.repaid, a.principalRepaid, a.status);
            assertLe(repaid, owed);
            if (status == AdvanceBook.Status.Active) activePrincipal += principal - principalRepaid;
        }
        assertEq(senior.outstanding(), activePrincipal);
    }
    /// Conservation: USDC is only minted in setup, so every unit must sit with a known holder.
    /// Catches value created or lost by the split, waterfall, bounty or vault accounting.
    function invariant_usdcConserved() public view {
        uint256 held = usdc.balanceOf(address(senior)) + usdc.balanceOf(address(junior)) + usdc.balanceOf(address(book))
            + usdc.balanceOf(address(this)) + usdc.balanceOf(address(handler));
        for (uint256 i; i < 4; ++i) held += usdc.balanceOf(handler.actorAt(i));
        assertEq(held, usdc.totalSupply());
    }
    function afterInvariant() public {
        emit log_named_uint("handler calls", handler.calls());
        emit log_named_uint("handler successes", handler.successes());
        emit log_named_uint("handler caught reverts", handler.failures());
    }
}
