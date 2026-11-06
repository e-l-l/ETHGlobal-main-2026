pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {AdvanceBook, BookConfig} from "../src/AdvanceBook.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {RiskHook} from "../src/RiskHook.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";
import {BusinessPassRegistry} from "../src/BusinessPassRegistry.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

contract Deploy is Script {
    using SafeERC20 for IERC20;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    // Read from env in run(); storage keeps run() under the legacy-codegen stack limit.
    address verifier; address bizVerifier; address issuer; address attester; address poseidon; address signer; address risk;

    function run() external {
        verifier = vm.envOr("VERIFIER", address(0));
        require(verifier != address(0) && verifier.code.length != 0, "VERIFIER must be deployed");
        bizVerifier = vm.envOr("BIZ_VERIFIER", address(0));
        require(bizVerifier != address(0) && bizVerifier.code.length != 0, "BIZ_VERIFIER must be deployed");
        issuer = vm.envAddress("BUSINESS_PASS_ISSUER");
        attester = vm.envAddress("AGENT_PASS_ATTESTER");
        poseidon = vm.envAddress("POSEIDON2");
        signer = vm.envAddress("OFFER_SIGNER");
        risk = vm.envAddress("RISK_MANAGER");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        address token = vm.envOr("USDC", address(0));
        vm.startBroadcast();
        (, address owner,) = vm.readCallers();
        if (token == address(0)) {
            MockUSDC mock = new MockUSDC();
            token = address(mock);
            mock.mint(owner, 60_000e6);
        }
        TrancheVault senior = new TrancheVault(IERC20(token), "Senior", "SNR", owner, TrancheVault(address(0)), 0);
        TrancheVault junior = new TrancheVault(IERC20(token), "Junior", "JNR", owner, senior, 1000);
        AdvanceBook book = deployBook(token, senior, junior, owner);
        senior.setBook(address(book));
        junior.setBook(address(book));
        IERC20(token).forceApprove(address(senior), 50_000e6);
        senior.deposit(50_000e6, owner);
        IERC20(token).forceApprove(address(junior), 10_000e6);
        junior.deposit(10_000e6, owner);
        deployHookAndPool(manager, token, book, junior);
        vm.stopBroadcast();
    }

    function deployBook(address token, TrancheVault senior, TrancheVault junior, address owner) internal returns (AdvanceBook) {
        uint256[4] memory caps = [uint256(50e6), 100e6, 250e6, 500e6];
        uint256[4] memory floors = [uint256(50e6), 50e6, 50e6, 50e6];
        BusinessPassRegistry registry = new BusinessPassRegistry(IPoseidon2(poseidon), owner, issuer, [uint16(32), 566, 404, 0]);
        return new AdvanceBook(BookConfig(IERC20(token), senior, junior, IPoseidon2(poseidon), IVerifier(verifier), owner, signer, risk, caps, floors, 100_000e6, 1_000e6, 30 days, 5e6, IBusinessPass(address(registry)), IVerifier(bizVerifier), attester));
    }

    function deployHookAndPool(IPoolManager manager, address token, AdvanceBook book, TrancheVault junior) internal {
        uint24 hookFee = 3000;
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(manager, token, address(book), hookFee);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(RiskHook).creationCode, args);
        RiskHook hook = new RiskHook{salt: salt}(manager, token, address(book), hookFee);
        require(address(hook) == predicted, "hook address mismatch");
        address first = token < address(junior) ? token : address(junior);
        address second = token < address(junior) ? address(junior) : token;
        PoolKey memory key = PoolKey(Currency.wrap(first), Currency.wrap(second), 3000, 60, IHooks(address(hook)));
        manager.initialize(key, uint160(1 << 96));
    }
}
