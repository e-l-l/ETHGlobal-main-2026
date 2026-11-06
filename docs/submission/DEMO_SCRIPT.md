# Demo script

Judging gives 4 minutes of demo and 3 of questions. Below: a live script, a video outline, and a fallback for every live dependency.

Cast:
- **Presenter**
- **Merchant phone:** "Kiosco Don Pepe", demo account `donpepe`, band 2, Argentina
- **Customer phone:** a judge, if they're willing
- **Laptop:** explorer plus the "what the world sees" panel

## Live: 4 minutes

| Time | Scene | What the judge sees |
|---|---|---|
| 0:00–0:20 | **Problem.** A kiosco owner in Buenos Aires needs dollars for stock today. Her sales arrive next week. Loan apps would want her contacts. | One slide |
| 0:20–1:00 | **Business Pass demo (mock attestor, fictional portal).** On the phone she logs into her seller dashboard (the PagoSur demo portal, introduced as a stand-in) inside the Reclaim flow. The mock issuer checks the demo evidence, sees the account ID transiently and signs. The relayer calls `BusinessPassRegistry.issue`. | The app shows "Verified business · Argentina · revenue band 2 · 6+ months. The issuer sees the account ID transiently." The explorer shows only `BusinessPassIssued(index, root)`. |
| 1:00–1:35 | **Managed agent, set up once with Agent Pass.** She sets limits (max per draw, max per month) and approves in the World test-mode stub. Then `registerMandate` lands onchain. *Quick aside:* a second try with "deny" means no attestation, no mandate and no draws. | One approval screen, then "Your agent is active". There will be no more taps. |
| 1:35–2:05 | **Automatic draw, then a live sale.** Her agent requests an offer: the Underwriter proposes, the Critic approves, code clamps, the offer is signed, and the relayer calls `drawByMandate`. USDC goes to a fresh address. A judge pays the QR. | The phone says, in voice: **"You received 10 dollars, 1 went to your advance."** The advance balance falls. |
| 2:05–2:35 | **The wash trader is caught.** `wash-trader` applies. Its payers were funded from the shop's own payout address, and its shop name holds an injection string. The circular-funding red line fires for this seeded example; other wash patterns can evade the checks. Then we force an oversized offer, and the contract reverts. | The rejection reasons on screen, and a reverted tx |
| 2:35–3:15 | **A default the junior tranche absorbs.** A shop with no repaying sale for 30 days: anyone calls `writeOff`. The junior vault pays first, then the reserve, and senior is untouched. A separate scripted junior sale moves the seeded Uniswap v4 pool price; the write-off alone does not cause a trade. The Risk agent reads `RiskHook.consult` (the TWAP) and calls `lowerLimits`. | The write-off event, junior share price down, the pool price down, and tier caps lowered onchain (down only) |
| 3:15–3:45 | **What the world sees.** A side-by-side panel: what the chain, the customer, us, the AI and the RPC provider each learned. | Shop owner and payout, sales payer/amount/shop, advance amount/tier/shop, and the advance-to-commitment claim are public; a later proof hides the selected leaf. Correlation remains possible. |
| 3:45–4:00 | **Close.** Repayment lives inside the payment. Agents propose, the contract decides. Privacy is a property of the system. | Repo and contract addresses |

Optional if there's time: a Standing Pass. The repaid merchant opens a fresh shop and wallet, proves "1 repaid" in ZK, and may get a higher limit; timing and other metadata may correlate activity.

### Timing caveat for the default scene

`writeOff` needs 30 days with no repaying sale. The Risk agent's triggers are:
- a 1h TWAP more than 10% below the 24h TWAP
- at least 2 write-offs in 7 days
- slow repayment
- exposure above 80%

None of these can happen live on Sepolia in 40 seconds. **Label the selected scene as time-warped or seeded:**
- (a) Run this scene on the local devnet, where `agents/scripts/e2e_local.py` moves the clock 31 days. Say so on stage.
- (b) Prepare an advance on Sepolia ahead of time that is already past its window, plus a scripted junior sell to move the TWAP.

## Video outline (2–4 min; aim for 3:00)

ETHGlobal wants 2–4 minutes, 720p or better, a human voice and no speed-up. EF CROPS wants 3 minutes or less with the privacy property shown end to end. **One 3:00 cut meets both.**

1. 0:00–0:20: The problem, and the one-line idea (repayment inside the payment)
2. 0:20–0:55: Business Pass via zkTLS, plus the explorer showing only `BusinessPassIssued`
3. 0:55–1:20: Agent Pass delegation, once, plus a 3-second denied path
4. 1:20–1:50: The automatic draw, the live sale and the voice line
5. 1:50–2:15: The wash trader rejected, and an oversized draw reverting
6. 2:15–2:40: Time-warped default, junior absorbs, separate scripted sell in a seeded pool, then Risk agent lowering caps
7. 2:40–3:00: The "what the world sees" panel, then the close

**TODO:** record it, and check resolution, voice and that nothing is sped up.

## Fallbacks for each live dependency

General switch: the app's **Demo menu** sets any integration to `mock` (stored in localStorage, no redeploy). Every mode defaults to mock when unset ([`deploy/README.md`](../../deploy/README.md)).

| Dependency | If it fails | Fallback |
|---|---|---|
| Reclaim zkTLS (attestors, provider, login webview) | No proof, or the proof is slow | Issuer mock mode (`ISSUER_MOCK=1`, `/mock/proof`). It skips only the Reclaim signature check; everything else is real. If needed, a pre-recorded proof JSON plus a replayed `issue()` tx ([`docs/zktls-spike.md`](../../docs/zktls-spike.md)). |
| World Agent Pass and IDKit | OIDC or verify fails | `WORLD_MOCK=1` with `approve`, `deny` or `expire`. Say "mock" on stage. |
| Bedrock judge models | Timeout or access error | Switch to `LLM_PROVIDER=anthropic` (Claude), or `NEXT_PUBLIC_API_MODE=mock`. The Risk agent has its own deterministic −25% fallback. |
| Sepolia RPC | Errors or "block not found" | Use the Tenderly gateway (the one that worked for deploys). Otherwise run the laptop devnet. |
| Anon-RPC | Not available | `NEXT_PUBLIC_RPC_MODE=plain`, said out loud |
| Uniswap pool movement | Not enough price move to show | A separate scripted junior sell; label the seeded pool and do not attribute the trade to write-off. |
| Voice announcement | No audio | Turn up the phone volume and show the on-screen text. **TODO: confirm where the voice line is implemented and that it works on the demo phone.** |
| EC2 box | Down | `./deploy/compose.sh restart <service>`, or the laptop fallback `./deploy/local.sh --mock` with anvil, `devnet.sh` and `seed_demo.py`. Present from the laptop browser. |
| Venue Wi-Fi | Down | Phone on mobile data, or the laptop fallback. Last resort: the recorded happy-path screen capture. |
| Relayer gas | Out of Sepolia ETH | **TODO: top up the relayer and risk manager the evening before** (deploy checklist) |

Before the demo, run `uv run python scripts/smoke_sepolia.py` (read-only). Expect `SMOKE PASS`.
