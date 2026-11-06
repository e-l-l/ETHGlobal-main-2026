# Contracts

Foundry project for DripMoney. The full spec is in [SPEC.md](SPEC.md), and the architecture and the "who calls what" table are in [../docs/architecture.md](../docs/architecture.md).

| Contract | What it does |
|---|---|
| `src/AdvanceBook.sol` | Core: `pay` splits every sale (1%-per-7-days minimum repayment rule); `drawFirst` (Business Pass proof) / `drawWithPass` (Standing Pass proof) / `drawByMandate` (managed agent) open advances; `registerMandate` / `revokeMandate`; fee and loss waterfalls; `writeOff`; `claimStandingPass` |
| `src/BusinessPassRegistry.sol` | Business Pass tree: issuer-attested (zkTLS verified offchain), one pass per business via a peppered business nullifier; attribute-free events |
| `src/Policy.sol` | EIP-712 agent offers, tier caps, exposure cap, downward-only risk limits (inherited by AdvanceBook) |
| `src/StandingPassTree.sol` | Depth-16 Poseidon2 Merkle tree of ZK credentials (inherited by AdvanceBook) |
| `src/TrancheVault.sol` | ERC-4626 senior and junior vaults. The junior shares are DripCoin (DRIP), with 20% cover of senior outstanding. |
| `src/RiskHook.sol` | Uniswap v4 hook: 0.3% USDC-side fee (`flush`: 75% reserve, 25% treasury), TWAP for the Risk agent |

## Build and test

```bash
forge build
FOUNDRY_OFFLINE=true forge test      # 152 tests incl. 2 invariants and real-proof E2Es. Offline avoids a macOS proxy-lookup panic.
```

Poseidon2 is the deployed `zemse/poseidon2-evm` contract (`0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2` on Sepolia). Tests etch its bytecode from `test/fixtures/`.

## Deploy (Sepolia)

```bash
# DeployVerifier.s.sol deploys both bb verifiers first (HonkVerifier + BusinessPassVerifier)
export SEPOLIA_RPC_URL=...  VERIFIER=<HonkVerifier>  BIZ_VERIFIER=<BusinessPassVerifier>  BUSINESS_PASS_ISSUER=...  AGENT_PASS_ATTESTER=...  OFFER_SIGNER=...  RISK_MANAGER=...  POOL_MANAGER=...  POSEIDON2=0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2
# optional: USDC=... (otherwise a MockUSDC is deployed)
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --account deployer   # keystore via `cast wallet import`
```

Before broadcasting, check every external address on Sepolia with `cast code <addr>` plus an identity call, then compare it against the protocol's own deployment list. The script refuses to run without a real `VERIFIER`.

Never commit private keys or `.env` files.

## Verified Sepolia addresses (checked 2026-11-05: `cast code` + identity call + official list)

| Contract | Address | Official source | Onchain check |
|---|---|---|---|
| Uniswap v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | Uniswap v4 deployments page | 48 KB code; `owner()` = `0x5b73…0519` |
| Uniswap v4 PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` | same | — |
| Uniswap PoolSwapTest / PoolModifyLiquidityTest | `0x9b6b46e2c869aa39918db7f52f5557fe577b6eee` / `0x0c478023803a644c94c4ce1c1e7b9a087e411b0a` | same | — |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | same | — |
| USDC (Circle, native) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle USDC contract addresses | `symbol()` USDC, `decimals()` 6 |
| Poseidon2 (zemse, Yul) | `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2` | zemse/poseidon2-evm deployments | code present; matches Noir vectors |
| Reclaim verifier (proxy) | `0xAe94FB09711e1c6B057853a515483792d8e474d0` | Reclaim (see docs/zktls-spike.md) | EIP-1967 impl has `verifyProof` |

Deployer: `0x071735B4e14e601681fc4A82768842c041CC139a` (funded, 2 Sepolia ETH). Its key lives only in `contracts/.env`, which is git-ignored.

**Demo USDC:** we can't mint Circle's Sepolia USDC freely (only through Circle's faucet, in small amounts), so the demo seeds vaults with a **MockUSDC** we deploy. Using real Sepolia USDC is a config switch (`USDC=` env).

## Live on Sepolia (deployed 2026-11-05)

Addresses are in [`agents/deployments/sepolia.json`](../agents/deployments/sepolia.json), and the app and agents service read that file.

| Contract | Address |
|---|---|
| AdvanceBook | `0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1` |
| BusinessPassRegistry | `0x40700886396bafb5ee4f260487a6584efa511adb` |
| SeniorVault / JuniorVault (DripCoin, DRIP) | `0xc2286c564bde614ca1414518d02cacec77f3e297` / `0x5998b918db6edaccde4ce3fc282b9b057ab8d81c` |
| RiskHook (Uniswap v4, DRIP/USDC pool) | `0xf5174b8f8642aef786e6bb1c1facac6d0f201044` |
| MockUSDC (demo) | `0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb` |
| HonkVerifier / BusinessPassVerifier | `0x7764690108c612fafde5eeb1cbe2f20d80e42017` / `0xb79d40dcda63d941a31d866028d5d6852550136a` |

Roles: offer signer `0x8e8b…b433`, risk manager `0xcF0A…3Ada`, issuer `0x7DcA…74Ac`, Agent Pass attester `0x863C…4caD`, relayer `0xA6d5…Fc7e` (funded 0.05 ETH). The owner is the deployer `0x0717…139a`.

### ⚠️ Deploying on current Sepolia: use `--skip-simulation`

Sepolia (reth 2.8, the fork activated around Oct 2026) charges **about 1,584 gas per byte** of deployed code, not the classic 200. Foundry 1.2.2's local simulator still uses the old price, so its gas estimates are about 7× too low and creation txs run out of gas inside the CREATE2 factory. **Fix:** let the node estimate gas:

```bash
forge script script/DeployVerifier.s.sol:DeployVerifier --rpc-url $R --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --slow --skip-simulation
VERIFIER=$(cat ../agents/deployments/verifier.txt) BIZ_VERIFIER=$(cat ../agents/deployments/biz_verifier.txt) \
  forge script script/Deploy.s.sol:Deploy --rpc-url $R --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --slow --skip-simulation
python3 script/export_deployment.py --chain 11155111 --name sepolia
```

Two attempts without it failed and cost only gas. Use a consistent RPC (Tenderly's gateway worked; publicnode's load balancer returned "block not found" mid-script).
