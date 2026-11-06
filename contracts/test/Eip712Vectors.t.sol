// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AdvanceBook, BookConfig, Limits} from "../src/AdvanceBook.sol";
import {BusinessPassRegistry, BusinessVerified} from "../src/BusinessPassRegistry.sol";
import {Offer} from "../src/Policy.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";
import {POSEIDON2_SEPOLIA} from "../src/Constants.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";

/// Reference EIP-712 vectors for the Python agents and the app, produced by the deployed contracts themselves
/// (AdvanceBook placed at 0x5615…b72f, BusinessPassRegistry at 0x2e23…470b, chainId 31337). Mirrored in
/// contracts/SPEC.md, agents/SPEC.md and agents/tests (test_signer.py, test_world.py, test_zk.py).
contract Eip712VectorsTest is Test {
    address constant BOOK_AT = 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f;
    address constant REG_AT = 0x2e234DAe75C793f67A35089C9d99245E1C58470b;
    AdvanceBook book;
    BusinessPassRegistry reg;

    function setUp() public {
        vm.chainId(31337);
        vm.etch(POSEIDON2_SEPOLIA, vm.parseBytes(vm.readFile("test/fixtures/poseidon2_yul.runtime.hex")));
        MockUSDC usdc = new MockUSDC();
        TrancheVault senior = new TrancheVault(IERC20(address(usdc)), "S", "S", address(this), TrancheVault(address(0)), 0);
        TrancheVault junior = new TrancheVault(IERC20(address(usdc)), "J", "J", address(this), senior, 1000);
        deployCodeTo("BusinessPassRegistry.sol:BusinessPassRegistry",
            abi.encode(IPoseidon2(POSEIDON2_SEPOLIA), address(this), address(0x155E), [uint16(32), 566, 404, 0]), REG_AT);
        reg = BusinessPassRegistry(REG_AT);
        MockVerifier mv = new MockVerifier();
        BookConfig memory c = BookConfig(
            IERC20(address(usdc)), senior, junior, IPoseidon2(POSEIDON2_SEPOLIA), IVerifier(address(mv)), address(this),
            address(1), address(2), [uint256(50e6), 100e6, 250e6, 500e6], [uint256(50e6), 50e6, 50e6, 50e6], 100_000e6,
            1_000e6, 30 days, 5e6, IBusinessPass(REG_AT), IVerifier(address(mv)), address(3)
        );
        deployCodeTo("AdvanceBook.sol:AdvanceBook", abi.encode(c), BOOK_AT);
        book = AdvanceBook(BOOK_AT);
    }

    /// Digest via the contract's own EIP-5267 domain (so a domain mismatch fails the test).
    function _digest(address c, bytes32 structHash) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address vc,,) =
            AdvanceBook(c).eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)), keccak256(bytes(version)), chainId, vc
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _offer(uint8 tier, uint256 passNullifier, uint8 band) internal pure returns (Offer memory) {
        return Offer(bytes32(uint256(0xabc)), keccak256("chai-stall"), address(0xbEEF), 100e6, 11500, 1000, tier,
            passNullifier, band, 1_800_000_000);
    }

    function test_offerVectors() public view {
        assertEq(book.OFFER_TYPEHASH(), keccak256(
            "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)"
        ));
        assertEq(book.hashOffer(_offer(1, 0, 0)), 0xd20c279d2f60369b3c4fa4a5758158ed05624c8a8886e43eb3ef1b28bb7a74f2);
        assertEq(book.hashOffer(_offer(0, 42, 2)), 0x33cd4172f8d0782a912874cb845a5b27c2620197f623b671ec1dcaf9c5692dcd);
    }

    /// The lead's managed-agents backend vectors (agents/src/mra_agents/world.py, merchant_agents.py).
    function test_mandateVectors_matchBackend() public view {
        assertEq(book.LIMITS_TYPEHASH(), 0x121aec3f81e3b43cc21a29e5a5f4a95c50fa1c4bdf64a23e96b41f63bb56af70);
        assertEq(book.AGENT_PASS_TYPEHASH(), 0x14b7cc62774ee8980c51fa464b395bdd3b048068103690cd9466aaff38e4e702);
        assertEq(book.MANDATE_DRAW_TYPEHASH(), 0x71bb6fc5b8f43584b800f4cbc93444a11c9b513008858d086537015fb3d91e78);
        Limits memory l = Limits(100e6, 200e6, 2_592_000, 1_800_000_000);
        bytes32 lh = book.hashLimits(l);
        assertEq(lh, 0xb5e113b3002cf248eea60deb8e6fd8e863ba80e92f38efaf17ae436ec93c2586);
        bytes32 att = _digest(BOOK_AT, keccak256(abi.encode(book.AGENT_PASS_TYPEHASH(), address(0xbEEF), lh, uint256(42), uint64(1_800_000_000))));
        assertEq(att, 0xa9f31df169aab4fb684fb6a2a6662e0a7d726b61c59e851e32d5eb6383f7fa53);
        bytes32 draw = _digest(BOOK_AT, keccak256(abi.encode(book.MANDATE_DRAW_TYPEHASH(), bytes32(uint256(0xabc)), uint256(7))));
        assertEq(draw, 0x546eecd269e58b0970176d613a3d6913821e921c4716706f7a457ba199ccaaa8);
    }

    function test_businessVerifiedVector() public view {
        BusinessVerified memory a = BusinessVerified(42, 0x2c75dad557994639dacc2595ac1b4fc5144853f629d993eb70d8ded784267f43, 1_800_000_000);
        assertEq(reg.hashBusinessVerified(a), 0x33b9ef7df45f740ccc27cfaa49932f91a79990af90592fb2c9f8af46a78bd702);
    }
}
