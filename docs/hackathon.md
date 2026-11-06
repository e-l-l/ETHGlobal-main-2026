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
- [ ] Full journey from request to protected action (one-time Agent Pass delegation → mandate → automatic draws, no human approving credit)
- [ ] Denied path where the draw doesn't happen
- [ ] Server-side proof validation
- [ ] Integration debrief
- [ ] Written reason why this credential is the minimum sufficient assurance

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
| Before Thu 21:00 | Read docs only: Uniswap v4 and its Sepolia deployments, World IDKit and Agent Pass, Anon-RPC, Noir and bb, a Solidity Poseidon2 library, zkTLS providers |
| Thu 21:00 | Start. Confirm Uniswap v4 addresses and USDC on Sepolia (fall back to a mock token). Check that Anon-RPC supports Sepolia. Test that Poseidon2 matches between Noir and Solidity. |
| Fri 00:00 | Contracts: router, advance manager, policy guard, vault, junior token, standing pass tree, with tests. In parallel: `standing_pass` circuit and verifier. |
| Fri 09:00 | World flows, including the denied path. Deploy the Uniswap pool and hook. Prove the circuit in the browser. |
| Fri 15:00 | Agents and merchant app wired to live contracts. Anon-RPC as the transport. |
| Fri 21:00 | Feature freeze. Full run with seeded sales history. Rehearse the default and Standing Pass flows. |
| Sat 01:00 | Docs: `FEEDBACK.md`, World debrief, CROPS section, architecture diagram, AI usage notes. Record the videos. |
| Sat 07:00 | Submit, two hours early |

**If time runs short, cut in this order:** NFC, then zkTLS, then Uniswap API checkout swaps, then Risk agent automation.
**Never cut:** the payment split, the World flow with its denied path, the Standing Pass, the Uniswap hook, and Anon-RPC.

## Four-minute demo

| Time | Scene |
|---|---|
| 0:00–0:30 | **Problem.** A kiosco owner in Buenos Aires needs dollars for stock today, and the sales that would pay for it arrive next week. Loan apps would want her contacts. |
| 0:30–1:15 | **Private onboarding.** A zkTLS proof from her payments dashboard gives her a Business Pass: the business is real, and that's all we learn. She delegates once to her managed agent with Agent Pass; from then on the agent draws automatically and USDC arrives. |
| 1:15–2:00 | **Live sale.** A judge scans the QR and pays in a test token. The phone announces *"You received 10 dollars, 1 went to your advance"*. The balance falls. |
| 2:00–2:40 | **Attack.** A second merchant applies with wash-traded sales and an injection string. The Critic rejects it, and a forced oversized draw reverts at the contract. |
| 2:40–3:20 | **Standing Pass.** The repaid merchant opens a fresh wallet, proves "1 repaid" in ZK and unlocks a higher limit. The explorer shows no link. |
| 3:20–4:00 | **Default.** A merchant stops selling. The junior token absorbs the loss, its Uniswap price falls, and the Risk agent cuts limits live. |

Judges allow 4 minutes for the demo and 3 for questions.
