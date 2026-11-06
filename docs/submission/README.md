# Submission docs: DripMoney

ETHGlobal Mumbai (Nov 5–7, 2026), From Scratch track. Partners: **Uniswap, World, Ethereum Foundation**.

**Idea:** DripMoney gives a small shop a revenue-based cash advance and repays it with a slice of every sale made through the checkout. Credential details are private, while shop and transaction data are public; see [privacy architecture](../privacy-architecture.md).

| Doc | For |
|---|---|
| [FEEDBACK.md](FEEDBACK.md) | Uniswap: developer feedback on v4 (RiskHook, the fee, the TWAP, friction, Sepolia notes) |
| [WORLD_DEBRIEF.md](WORLD_DEBRIEF.md) | World, both tracks: Agent Pass (delegate once), IDKit recovery, minimum-sufficient credential, integration debrief |
| [CROPS.md](CROPS.md) | EF Best CROPS App: C, R/O, P and S, plus the honest gaps |
| [ANON_RPC.md](ANON_RPC.md) | EF Best Use of Anon-RPC: why ZK needs network privacy, integration status |
| [AI_USAGE.md](AI_USAGE.md) | ETHGlobal: where AI tools were used, plus the in-product judge models |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | The ≤3-minute narrative, what to say out loud, and the fallbacks |
| [VIDEO.md](VIDEO.md) | Scene-by-scene video recording checklist, with live URLs and fallbacks |

Paths such as `contracts/src/RiskHook.sol` are relative to the repo root.

## Live on Sepolia (chain 11155111, deployed 2026-11-06, deploy block 12076910)

Source: [`contracts/README.md`](../../contracts/README.md), "Live on Sepolia", and `agents/deployments/sepolia.json` (deploy block 12076910).

| Contract | Address |
|---|---|
| AdvanceBook | `0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1` |
| BusinessPassRegistry | `0x40700886396bafb5ee4f260487a6584efa511adb` |
| SeniorVault | `0xc2286c564bde614ca1414518d02cacec77f3e297` |
| JuniorVault (DripCoin, DRIP) | `0x5998b918db6edaccde4ce3fc282b9b057ab8d81c` |
| RiskHook (Uniswap v4, DRIP/USDC pool) | `0xf5174b8f8642aef786e6bb1c1facac6d0f201044` |
| MockUSDC (demo) | `0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb` |
| HonkVerifier (Standing Pass) | `0x7764690108c612fafde5eeb1cbe2f20d80e42017` |
| BusinessPassVerifier | `0xb79d40dcda63d941a31d866028d5d6852550136a` |

External contracts we use:

| Contract | Address |
|---|---|
| Uniswap v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| Poseidon2 (zemse) | `0xB2542195Ad96AcfBC962C48A97D7640A9F5386D2` |
| Reclaim verifier (proxy) | `0xAe94FB09711e1c6B057853a515483792d8e474d0` |

Pool key: currency0 JuniorVault (DRIP), currency1 MockUSDC, fee 3000, tick spacing 60, hooks = RiskHook.

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

| Live | Demo stand-in, simulated or roadmap |
|---|---|
| Sepolia contracts (deploy block 12076910) | Business Pass evidence: a **demo seller portal and a mock attestor** in the live demo. The real Reclaim path is built and tested ([`docs/zktls-spike.md`](../zktls-spike.md), `issuer/src/reclaim.ts`). |
| **Real World IDKit and Agent Pass, wired live** on the hosted app (`WORLD_MOCK=0`, `NEXT_PUBLIC_WORLD_MODE=real`). World ID comes first, before any business step. | World **test mode** stays available as a fallback, and the simulator uses it for unattended runs. At this event, World's Agent Pass proofs use fake identities (per World's prize page), and IDKit testing uses World's staging environment and simulator. |
| Browser-generated ZK proofs (Business Pass, Standing Pass) verified onchain; the proof center at `/proof` decodes them | Testnet money: MockUSDC, not Circle USDC |
| Bedrock AI underwriting (Underwriter, Critic), managed cash-flow agents, Risk agent, keeper | The simulator (`/simulator`) runs on our public devnet with real proofs, real AI and real devnet txs, but **time is fast-forwarded** |
| USDC checkout with the 92/8 split; v4 DripCoin (DRIP) swap through RiskHook | **Paying in any token via Uniswap is roadmap.** Checkout is USDC only. |
| Anon-RPC: browser reads go through Nox by default (`NEXT_PUBLIC_ANON_RPC=1`) | Backend reads use Tenderly directly; writes are public transactions. Cash-out is not built. |

DripCoin (DRIP) is the junior, first-loss tranche share (ERC-4626). The deployed vault is named "DripCoin" with symbol "DRIP". The demo pool is seeded by the team, so its price is an early-warning signal, not a validated credit oracle. See [privacy architecture](../privacy-architecture.md) for public data and trust boundaries and [economics](../economics.md) for fees and risks.

**Deployed terms** (verified in `contracts/src/AdvanceBook.sol`, `TrancheVault.sol`, `RiskHook.sol`, `contracts/script/Deploy.s.sol` and the offer signer's config):
- Fee: 0.5% per week on principal while owed, capped at 3%. A $100 advance repaid in four weeks accrues a $2 fee, so early payoff saves fee.
- Minimum repayment: 1% of owed per 7 days. While behind it, a late fee accrues: an extra 0.5% per week, capped at 3% (6% total), and 100% of it goes to the reserve.
- Write-off: 30 days after the last on-time repayment. Anyone can call `writeOff`, for a 5 USDC bounty.
- Holdback: 8% of each sale while an advance is active.
- Tier caps: $50 / $100 / $200 / $300.
- Fee split: 40% senior, 30% junior (DRIP), 20% reserve, 10% protocol.
- Junior cover: 20% of senior outstanding, checked on every draw.
- Uniswap hook fee: 0.3%, only when the swap's unspecified currency is USDC. `flush()` sends 75% to the reserve and 25% to the treasury.

## Status at a glance

| Piece | Status |
|---|---|
| Contracts and Uniswap v4 hook | Live on Sepolia; 170 Foundry tests (offline suite); unaudited hackathon code |
| Agents (Underwriter, Critic, Risk, keeper, relayer) | Running; offline test suite; read-only Sepolia smoke test passes 24/24 |
| Business Pass issuer and demo seller portal | Live with a **mock attestor**; the real Reclaim path is built and tested |
| World ID (IDKit) and Agent Pass | **Real mode, wired live** on the hosted app; test mode as fallback (and in the simulator). At this event, World's Agent Pass proofs use fake identities (per World's prize page), and IDKit testing uses World's staging environment and simulator. |
| Anon-RPC | Browser reads through Nox by default; a Chrome measurement routed 26/26 SDK reads |
| Proof center (`/proof`) and simulator (`/simulator`) | Live |
| Uniswap API checkout swaps | Roadmap; checkout takes USDC only |
| License | [MIT](../../LICENSE) |

## Verified contracts (Sepolia, Etherscan)

All source-verified on Etherscan (deploy block 12076910, 6 Nov 2026):

| Contract | Address | Role |
|---|---|---|
| AdvanceBook | [`0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1`](https://sepolia.etherscan.io/address/0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1#code) | the book: offers, draws, repayment split, Standing Pass |
| BusinessPassRegistry | [`0x40700886396bafb5ee4f260487a6584efa511adb`](https://sepolia.etherscan.io/address/0x40700886396bafb5ee4f260487a6584efa511adb#code) | Business Pass tree (issuer-signed commitments) |
| SeniorVault | [`0xc2286c564bde614ca1414518d02cacec77f3e297`](https://sepolia.etherscan.io/address/0xc2286c564bde614ca1414518d02cacec77f3e297#code) | senior lenders (ERC-4626) |
| DripCoin (DRIP) | [`0x5998b918db6edaccde4ce3fc282b9b057ab8d81c`](https://sepolia.etherscan.io/address/0x5998b918db6edaccde4ce3fc282b9b057ab8d81c#code) | first-loss junior vault share (ERC-4626) |
| RiskHook | [`0xf5174b8f8642aef786e6bb1c1facac6d0f201044`](https://sepolia.etherscan.io/address/0xf5174b8f8642aef786e6bb1c1facac6d0f201044#code) | Uniswap v4 hook: USDC-side fee to the reserve, TWAP oracle |
| HonkVerifier | [`0x7764690108c612fafde5eeb1cbe2f20d80e42017`](https://sepolia.etherscan.io/address/0x7764690108c612fafde5eeb1cbe2f20d80e42017#code) | Noir UltraHonk verifier: Standing Pass |
| BusinessPassVerifier | [`0xb79d40dcda63d941a31d866028d5d6852550136a`](https://sepolia.etherscan.io/address/0xb79d40dcda63d941a31d866028d5d6852550136a#code) | Noir UltraHonk verifier: Business Pass |
| MockUSDC | [`0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb`](https://sepolia.etherscan.io/address/0x6603ac3f0a1ea33f232c97655a1b4f91280e55bb#code) | test USDC (open mint, testnet only) |
