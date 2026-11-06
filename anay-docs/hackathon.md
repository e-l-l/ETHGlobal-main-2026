# Hackathon plan: ETHGlobal Mumbai

Thu Nov 5, 21:00 IST to Sat Nov 7, 09:00 IST submission. From Scratch track: no project-specific code, designs or assets made before hacking starts.

## Partners and tracks

ETHGlobal allows three partners, and all of a partner's tracks count as one.

| Partner | Track | Pool | Split | Best case |
|---|---|---|---|---|
| Uniswap Foundation | Build with Uniswap | $10,000 | $4k / $3k / $2k / $1k | $4,000 |
| World | World ID Agent Pass | $5,000 | $2.5k / $1.5k / $1k | $2,500 |
| World | Best Use of IDKit | $2,500 | $1,250 for up to 2 teams | $1,250 |
| Ethereum Foundation | Best Use of Anon-RPC | $5,000 | $2.5k / $1.5k / $1k | $2,500 |
| Ethereum Foundation | Best CROPS App | $3,500 | $2k / $1k / $500 | (one EF prize per project) |
| **Total** | | **$26,000** | | **$10,250** |

- **Realistic target:** $3.5k–7.5k (our estimate).
- **Unconfirmed:** that one project can win both World tracks. Ask World on site. If not, the best case is $9,000.
- **Finalist prize** (top 10): $1,000 per person for teams of 3–5, $250 per person for teams of 1–2. Plus a Finalist Pack.

## Submission checklists

**Uniswap**
- [ ] v4 junior/USDC pool with `RiskHook` deployed. Uniswap API swaps at checkout.
- [ ] Public open-source repo
- [ ] `FEEDBACK.md` and the Developer Feedback Form
- [ ] README links to the relevant contracts and lines

**World**
- [ ] Full journey from request to protected action (one-time Agent Pass approval activates the cash-flow agent, which then draws)
- [ ] Denied or expired path: "No agent set up, nothing will be drawn," with a retry
- [ ] IDKit: World ID check to recover credentials on a new phone, with a cancel path
- [ ] Server-side validation of both
- [ ] Integration debrief
- [ ] Written reason why each credential is the minimum sufficient assurance

**EF: Anon-RPC**
- [ ] App routes all RPC reads through Anon-RPC by default
- [ ] Note the share of traffic routed (aim for 100%)

**EF: CROPS**
- [ ] FOSS license and README explaining how to run it
- [ ] README section titled "CROPS" (drafted in the root README)
- [ ] Demo video of 3 minutes or less showing the privacy property end to end
- [ ] No third-party trackers or analytics in the client. Keys stay on the device.

**ETHGlobal general**
- [ ] Commit steadily. Large single commits can be disqualified.
- [ ] List where AI tools were used
- [ ] 2–4 minute video at 720p or better, with a human voice and no speed-up

## Build plan

| When (IST) | Work |
|---|---|
| Before Thu 21:00 | Read docs only: Uniswap v4 and its Sepolia deployments, World IDKit and Agent Pass, Anon-RPC, Noir and bb, a Solidity Poseidon2 library, zkTLS SDKs (custom providers for our own portal) |
| Thu 21:00 | Start. Confirm Uniswap v4 addresses and USDC on Sepolia (fall back to a mock token). Check that Anon-RPC supports Sepolia. Test that Poseidon2 matches between Noir and Solidity. Get a zkTLS proof working against a hello-world page. |
| Fri 00:00 | Contracts: shop registry, router, advance manager, policy guard (with mandates), business pass, vault, junior token, standing pass tree, with tests. In parallel: demo seller portal with seeded accounts, and the `standing_pass` circuit and verifier. |
| Fri 09:00 | zkTLS Business Pass against the portal, including the failure screens. World flows: agent approval with the denied path, and recovery. Deploy the Uniswap pool and hook. Prove the circuit in the browser. |
| Fri 15:00 | Agents (cash-flow, Underwriter, Critic, Risk) and the merchant app wired to live contracts. Pay screen, lender and junior views, public dashboard. Anon-RPC as the transport. |
| Fri 21:00 | Feature freeze. Full run with seeded sales history. Rehearse onboarding, the agent draw, the default and Standing Pass flows. |
| Sat 01:00 | Docs: `FEEDBACK.md`, World debrief, CROPS section, architecture diagram, AI usage notes. Record the videos. |
| Sat 07:00 | Submit, two hours early |

**If time runs short, cut in this order:** NFC, then Uniswap API checkout swaps, then Start fresh shop (show the Standing Pass on the same shop), then recovery on a new phone (keep backup and export), then Risk agent automation, then the lender position history.
**Never cut:** the payment split, the zkTLS Business Pass against the demo portal, the World approval with its denied path, the cash-flow agent with its "why it drew this", the Standing Pass, the Uniswap hook, Anon-RPC, and the "What the world sees" toggle.

**zkTLS fallback:** if no zkTLS SDK works against our portal by Fri 09:00, the portal signs the facts itself and we label it "signed attestation, zkTLS in progress". The screens and contracts stay the same.

## Four-minute demo

| Time | Scene |
|---|---|
| 0:00–0:25 | **Problem.** A kiosco owner in Buenos Aires needs dollars for stock today, and the sales that would pay for it arrive next week. Loan apps would want her contacts. Welcome screen: *"We never ask for your name, phone or contacts."* |
| 0:25–1:10 | **Private onboarding.** She logs into the demo seller portal through zkTLS. *"✅ Verified · Argentina · revenue band 2 · 6+ months: we learned nothing else."* She creates her shop and sets agent limits. First approval is declined: *"No agent set up, nothing will be drawn."* She retries and approves with World. Flip the "What the world sees" toggle. |
| 1:10–1:50 | **Agent and live sale.** The agent draws: *"Your agent drew $100 for stock,"* with its reason. A judge scans the QR and pays in a test token, with no mention of the advance. The phone announces *"Recibiste 10 dólares, 1 fue a tu adelanto"*. Repaid-so-far rises. |
| 1:50–2:25 | **Attack.** A second merchant's agent asks for a draw on wash-traded sales with an injection string. The Critic rejects it, and a forced draw above the mandate reverts at the contract. |
| 2:25–3:10 | **Standing Pass.** The repaid merchant sees *"your limit is now $100, nobody can see your history,"* starts a fresh shop and proves "1 repaid" in ZK. The explorer shows no link. |
| 3:10–4:00 | **Default and the market.** A merchant stops selling. The junior token absorbs the loss, its Uniswap price falls, and the Risk agent cuts limits live with its reasoning on the Risk status screen. The lender's Earn overview shows senior untouched. |

Judges allow 4 minutes for the demo and 3 for questions.
