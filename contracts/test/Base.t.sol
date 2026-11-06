pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AdvanceBook, BookConfig} from "../src/AdvanceBook.sol";
import {Offer} from "../src/Policy.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {POSEIDON2_SEPOLIA} from "../src/Constants.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {BusinessPassRegistry} from "../src/BusinessPassRegistry.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";

abstract contract BaseTest is Test {
    MockUSDC internal usdc;
    MockVerifier internal verifier;
    MockVerifier internal bizVerifier;
    BusinessPassRegistry internal registry;
    TrancheVault internal senior;
    TrancheVault internal junior;
    AdvanceBook internal book;
    uint256 internal constant OFFER_SIGNER_PK = 0xA11CE;
    uint256 internal constant RISK_MANAGER_PK = 0xB0B;
    address internal offerSigner;
    address internal riskManager;
    uint256 internal constant ISSUER_PK = 0x155E;
    uint256 internal constant ATTESTER_PK = 0xA77E5;

    function setUp() public virtual {
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        offerSigner = vm.addr(OFFER_SIGNER_PK);
        riskManager = vm.addr(RISK_MANAGER_PK);
        usdc = new MockUSDC();
        verifier = new MockVerifier();
        bizVerifier = new MockVerifier();
        registry = new BusinessPassRegistry(IPoseidon2(POSEIDON2_SEPOLIA), address(this), vm.addr(ISSUER_PK), [uint16(32), 566, 404, 0]);
        senior = new TrancheVault(IERC20(address(usdc)), "Senior", "SNR", address(this), TrancheVault(address(0)), 0);
        junior = new TrancheVault(IERC20(address(usdc)), "Junior", "JNR", address(this), senior, 1000);
        uint256[4] memory caps = [uint256(50e6), 100e6, 250e6, 500e6];
        uint256[4] memory floors = [uint256(50e6), 50e6, 50e6, 50e6];
        book = new AdvanceBook(BookConfig(IERC20(address(usdc)), senior, junior, IPoseidon2(POSEIDON2_SEPOLIA), verifier, address(this), offerSigner, riskManager, caps, floors, 100_000e6, 1_000e6, 30 days, 5e6, IBusinessPass(address(registry)), bizVerifier, vm.addr(ATTESTER_PK)));
        senior.setBook(address(book));
        junior.setBook(address(book));
        usdc.mint(address(this), 60_000e6);
        usdc.approve(address(senior), 50_000e6);
        usdc.approve(address(junior), 10_000e6);
        senior.deposit(50_000e6, address(this));
        junior.deposit(10_000e6, address(this));
    }

    function _offer(bytes32 offerId, bytes32 shopId, address recipient, uint256 nullifier) internal view returns (Offer memory) {
        return Offer(offerId, shopId, recipient, 50e6, 11000, 2000, 0, nullifier, 0, uint64(block.timestamp + 1 days));
    }
    function _signOffer(Offer memory offer, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, book.hashOffer(offer));
        return abi.encodePacked(r, s, v);
    }
    function _registerShop(address owner, bytes32 shopId, address payout) internal {
        vm.prank(owner);
        book.registerShop(shopId, payout);
    }
    function _pay(address customer, bytes32 shopId, uint256 amount) internal {
        usdc.mint(customer, amount);
        vm.startPrank(customer);
        usdc.approve(address(book), amount);
        book.pay(shopId, amount);
        vm.stopPrank();
    }
}
