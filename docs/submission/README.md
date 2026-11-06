# Submission docs: Merchant Revenue Advance

ETHGlobal Mumbai (Nov 5–7, 2026), From Scratch track. Partners: **Uniswap, World, Ethereum Foundation**.

**Idea:** a merchant gets a revenue-based cash advance and repays it with a slice of every sale made through the checkout. Credential details are private, while shop and transaction data are public; see [privacy architecture](../privacy-architecture.md).

| Doc | For |
|---|---|
| [FEEDBACK.md](FEEDBACK.md) | Uniswap: developer feedback on v4 (RiskHook, the fee, the TWAP, friction, Sepolia notes) |
| [WORLD_DEBRIEF.md](WORLD_DEBRIEF.md) | World, both tracks: Agent Pass (delegate once), IDKit recovery, minimum-sufficient credential, integration debrief |
| [CROPS.md](CROPS.md) | EF Best CROPS App: C, R/O, P and S, plus the honest gaps |
| [ANON_RPC.md](ANON_RPC.md) | EF Best Use of Anon-RPC: why ZK needs network privacy, integration status |
| [AI_USAGE.md](AI_USAGE.md) | ETHGlobal: where AI tools were used, plus the in-product judge models |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | The 4-minute live script, the video outline and the fallbacks |
| [VIDEO.md](VIDEO.md) | Scene-by-scene video recording checklist, with live URLs and fallbacks |

Paths such as `contracts/src/RiskHook.sol` are relative to the repo root.

## Live on Sepolia (chain 11155111, deployed 2026-11-05)

Source: [`contracts/README.md`](../../contracts/README.md), "Live on Sepolia", and `agents/deployments/sepolia.json` (deploy block 12070938).

| Contract | Address |
|---|---|
| AdvanceBook | `0x873bb34ad35a66947dbd2f9482d15ba5d400d8db` |
| BusinessPassRegistry | `0x00806c3ec1f51cd643d896ad5274d839d9e8b136` |
| SeniorVault | `0x51892eb237ae06e85b59007270dc28142a69ff95` |
| JuniorVault (junior token) | `0x30911a69b90523fa53f2dd3e8096ac3096c61a90` |
| RiskHook (Uniswap v4, junior/USDC pool) | `0x216ec669911e5e042c73de8f593397a51e00d044` |
| MockUSDC (demo) | `0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb` |
| HonkVerifier (Standing Pass) | `0x7764690108c612fafde5eeb1cbe2f20d80e42017` |
| BusinessPassVerifier | `0xb79d40dcda63d941a31d866028d5d6852550136a` |

External contracts we use:

| Contract | Address |
|---|---|
| Uniswap v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| Poseidon2 (zemse) | `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2` |
| Reclaim verifier (proxy) | `0xAe94FB09711e1c6B057853a515483792d8e474d0` |

Pool key: currency0 JuniorVault, currency1 MockUSDC, fee 3000, tick spacing 60, hooks = RiskHook.

The vaults are seeded with a MockUSDC we deploy, because Circle's Sepolia USDC can't be minted freely. Switching to real USDC is a config change (`USDC=`).

**Roles:**
- offer signer `0x8e8b…b433`
- risk manager `0xcF0A…3Ada`
- issuer `0x7DcA…74Ac`
- Agent Pass attester `0x863C…4caD`
- relayer `0xA6d5…Fc7e`
- owner/deployer `0x0717…139a`

**TODO:** add Etherscan links once the contracts are verified on Etherscan. Contract source verification isn't recorded in the repo.

## What is live vs simulated

| Live | Simulated or planned |
|---|---|
| Sepolia contracts; browser-generated ZK proofs verified onchain; Bedrock AI underwriting; managed agents and Risk agent; test-USDC payments; v4 DripCoin swap via RiskHook; Anon-RPC app reads | Mock zkTLS attestor and fictional seller portal; World test-mode stub (real OIDC/IDKit built and tested, pending keys); cash-out; any-token checkout; testnet money |

DripCoin (DRIP): junior, takes losses first. The deployed contract still uses Junior/JNR until redeploy. The demo pool is seeded; its price is not a validated credit oracle. See [privacy architecture](../privacy-architecture.md) for public data and trust boundaries and [economics](../economics.md) for fees and risks.

## Status at a glance

| Piece | Status |
|---|---|
| Contracts and Uniswap v4 hook | Live on Sepolia; 152 Foundry tests |
| Agents (Underwriter, Critic, Risk, keeper, relayer) | Built; 256 offline tests; read-only Sepolia smoke test passes 24/24 |
| Business Pass issuer and demo seller portal | Built. Demo attestor is **mock**; the real Reclaim path is built and tested. |
| World Agent Pass and IDKit | Test-mode stub; real OIDC and IDKit paths built and tested, pending keys. |
| Anon-RPC | Wired in the app; Chrome measurement routed 26/26 reads. |
| Uniswap API checkout swaps | Planned; live checkout accepts test USDC only. |
| License | **TODO** |
