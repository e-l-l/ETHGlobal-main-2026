// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {AdvanceBook, BookConfig} from "../src/AdvanceBook.sol";
import {TrancheVault} from "../src/TrancheVault.sol";
import {RiskHook} from "../src/RiskHook.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {IBusinessPass} from "../src/interfaces/IBusinessPass.sol";
import {BusinessPassRegistry} from "../src/BusinessPassRegistry.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

contract DeployLocal is Script {
    address constant POSEIDON = 0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    string constant MNEMONIC = "test test test test test test test test test test test junk";

    MockUSDC usdc; address verifier; address bizVerifier; BusinessPassRegistry registry; IPoolManager manager; TrancheVault senior; TrancheVault junior; AdvanceBook book; PoolKey key; uint256 deployBlock;
    function run() external {
        require(block.chainid == 31337 && POSEIDON.code.length > 0, "local chain and Poseidon required");
        deployBlock = block.number;
        address owner = vm.addr(vm.deriveKey(MNEMONIC, 0));
        vm.startBroadcast();
        usdc = new MockUSDC();
        // HonkVerifier needs solc >=0.8.27 and library linking: deployed first by DeployVerifier.s.sol.
        verifier = vm.envAddress("VERIFIER");
        require(verifier.code.length > 0, "VERIFIER has no code");
        bizVerifier = vm.envAddress("BIZ_VERIFIER");
        require(bizVerifier.code.length > 0, "BIZ_VERIFIER has no code");
        // Business Pass issuer = anvil account 4, AgentPass attester = account 5 (devnet keys only).
        registry = new BusinessPassRegistry(IPoseidon2(POSEIDON), owner, vm.addr(vm.deriveKey(MNEMONIC, 4)), [uint16(32), 566, 404, 0]);
        manager = IPoolManager(address(new PoolManager(owner)));
        senior = new TrancheVault(IERC20(address(usdc)), "Senior", "SNR", owner, TrancheVault(address(0)), 0);
        junior = new TrancheVault(IERC20(address(usdc)), "DripCoin", "DRIP", owner, senior, 1500);
        uint256[4] memory caps = [uint256(50e6), 100e6, 250e6, 500e6];
        uint256[4] memory floors = [uint256(50e6), 50e6, 50e6, 50e6];
        book = new AdvanceBook(BookConfig(IERC20(address(usdc)), senior, junior, IPoseidon2(POSEIDON), IVerifier(verifier), owner, vm.addr(vm.deriveKey(MNEMONIC, 1)), vm.addr(vm.deriveKey(MNEMONIC, 2)), caps, floors, 100_000e6, 1_000e6, 30 days, 5e6, IBusinessPass(address(registry)), IVerifier(bizVerifier), vm.addr(vm.deriveKey(MNEMONIC, 5))));
        senior.setBook(address(book));
        junior.setBook(address(book));
        usdc.mint(owner, 65_000e6);
        usdc.approve(address(senior), 50_000e6);
        senior.deposit(50_000e6, owner);
        usdc.approve(address(junior), 10_000e6);
        junior.deposit(10_000e6, owner);
        key = setupPool(manager, usdc, junior, book);
        vm.stopBroadcast();
        writeManifest();
    }

    function writeManifest() internal {
        string memory pool = "pool";
        vm.serializeAddress(pool, "currency0", Currency.unwrap(key.currency0));
        vm.serializeAddress(pool, "currency1", Currency.unwrap(key.currency1));
        vm.serializeUint(pool, "fee", key.fee);
        vm.serializeInt(pool, "tickSpacing", key.tickSpacing);
        string memory poolJson = vm.serializeAddress(pool, "hooks", address(key.hooks));
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "AdvanceBook", address(book));
        vm.serializeAddress(obj, "SeniorVault", address(senior));
        vm.serializeAddress(obj, "JuniorVault", address(junior));
        vm.serializeAddress(obj, "RiskHook", address(key.hooks));
        vm.serializeAddress(obj, "USDC", address(usdc));
        vm.serializeAddress(obj, "PoolManager", address(manager));
        vm.serializeAddress(obj, "HonkVerifier", verifier);
        vm.serializeAddress(obj, "BusinessPassVerifier", bizVerifier);
        vm.serializeAddress(obj, "BusinessPassRegistry", address(registry));
        vm.serializeUint(obj, "deployBlock", deployBlock);
        // Nest the pool key object (writeJson with a key path only replaces existing keys).
        string memory json = vm.serializeString(obj, "poolKey", poolJson);
        vm.writeJson(json, vm.envOr("DEPLOYMENTS_OUT", string("../agents/deployments/local.json")));
    }

    function setupPool(IPoolManager manager_, MockUSDC usdc_, TrancheVault junior_, AdvanceBook book_) internal returns (PoolKey memory k) {
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(manager_, address(usdc_), address(book_), uint24(3000));
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(RiskHook).creationCode, args);
        RiskHook hook = new RiskHook{salt: salt}(manager_, address(usdc_), address(book_), 3000);
        require(address(hook) == predicted, "hook address mismatch");
        bool usdcFirst = address(usdc_) < address(junior_);
        k = PoolKey(Currency.wrap(usdcFirst ? address(usdc_) : address(junior_)), Currency.wrap(usdcFirst ? address(junior_) : address(usdc_)), 3000, 60, IHooks(address(hook)));
        manager_.initialize(k, uint160(1 << 96));
        PoolModifyLiquidityTest router = new PoolModifyLiquidityTest(manager_);
        usdc_.approve(address(router), type(uint256).max);
        junior_.approve(address(router), type(uint256).max);
        router.modifyLiquidity(k, ModifyLiquidityParams(-6000, 6000, 1_000e6, 0), "");
    }
}
