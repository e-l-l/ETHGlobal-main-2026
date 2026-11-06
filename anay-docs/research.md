# Research and background

## Why this project

The original idea was AI agents issuing unsecured payday loans, with trading fees covering defaults. Research ruled that out:

- **Unsecured small loans lose too much.** Divine, the closest precedent, reported about 40% defaults on first loans, even with World ID stopping repeat borrowing. The figure is company-stated and unaudited.
- **Trading fees are too small.** The pool charges 0.30%; a separate 0.30% hook fee applies only when USDC is the unspecified swap currency and goes to the reserve. Trading fees depend on volume and do not guarantee loss coverage.

Advances tied to a cash flow hold up better than loans backed by a promise. Payroll-deducted advances keep losses down, and Huma advances against payment flows that turn over in days. A merchant advance doesn't need an employer to join, because the checkout link collects repayment on its own.

## What 2026 finalist data shows

| Finding | What we do |
|---|---|
| Agents appear in about 31% of the four in-person fields and 12 of 36 finalists, so they give no edge alone | Lead with the merchant, repayment and privacy |
| x402 fell from 4 of 10 Buenos Aires finalists to 1 of 36 in 2026 | Leave x402 out |
| Credit-scoring projects are common, and none appears among the 2026 finalists found | Never pitch this as a credit score |
| New market structures reach the finals (for example Cumulant's tranches) | Make the Uniswap risk market a showpiece |
| Physical demos and hidden crypto stand out | Run a real stall where a judge makes a purchase |
| No project description matched merchant advances across 2,824 projects from 2026 events | Open space, though short descriptions can hide close projects |

Finalist data covers 36 finalists from Cannes, New York, Lisbon and Tokyo 2026, with two New York names missing. Theme counts rest on keyword matches and our own reading.

## Open questions (check at the start)

- **Sepolia setup:** Uniswap v4 addresses, USDC availability, whether the Uniswap API supports Sepolia.
- **Anon-RPC:** which networks it supports, and whether Sepolia is one of them.
- **Poseidon2:** a Solidity implementation that matches Noir's output.
- **Browser proving:** proving time for `standing_pass` on a low-end Android phone.
- **World:** Agent Pass test-mode proofs use fake identities, so check the live judge flow. Can one approval authorise an ongoing agent with limits, and does it give one agent per human? Can IDKit back credential recovery? Ask whether one project can win both World tracks.
- **zkTLS (critical, now core):** which SDK (Reclaim, vlayer, TLSNotary or others) can prove facts from our own demo seller portal fastest, how long proofs take on a phone, and whether the attestation can be verified onchain or only server-side. For production: whether working Mercado Pago, M-Pesa or Paystack providers exist.
- **World ID by country:** where Orb verification is actually available in Africa and Argentina.
- **Competition:** read Tap Pay, Usury Protocol and Kreditos on the ETHGlobal showcase.
- **Default rates:** we have no real loss data. Break-even figures are arithmetic only.

## Sources

- [ETHGlobal Mumbai overview](https://ethglobal.com/events/mumbai)
- [Mumbai prize tracks](https://ethglobal.com/events/mumbai/prizes)
- [Rules and judging](https://ethglobal.com/events/mumbai/info/details)
- [ETHGlobal showcase](https://ethglobal.com/showcase)
- [Divine Research loans](https://www.tradingview.com/news/cointelegraph:336c27280094b:0-divine-research-issues-unbacked-crypto-loans-using-sam-altman-s-world-id/)
- [University of Washington EWA report](https://evans.uw.edu/wp-content/uploads/2025/08/EWA-report-1.pdf)
- [Huma vault announcement](https://rockawayx.com/insights/introducing-the-rockawayx-huma-usdc-main-vault-on-morpho)
- [Merchant cash advance mechanics](https://www.nationalbusinesscapital.com/blog/what-is-an-mca-advance-and-how-does-it-work/)
- [Uniswap v4 custom accounting](https://docs.uniswap.org/contracts/v4/guides/custom-accounting)
- [Uniswap v4 deployments](https://developers.uniswap.org/contracts/v4/deployments)
- [Anon-RPC](https://ethereum.github.io/anon-rpc/) · [wallet and app guide](https://ethereum.github.io/anon-rpc/wallets/)
- [EF Mandate (CROPS)](https://blog.ethereum.org/2026/03/13/ef-mandate)
- [Kohaku privacy SDK](https://github.com/ethereum/kohaku)
- [Lisbon 2026 finalists](https://www.bitget.com/news/detail/12560605546777)
- [Cannes 2026 finalists](https://crypto.news/ai-agents-privacy-and-prediction-markets-define-ethglobal-cannes-2026-finalists/)
- [New York 2026 finalists](https://x.com/ETHGlobal/status/2066247812787081221)
- [Buenos Aires 2025 finalists](https://www.bitget.cloud/news/detail/12560605081065)
- [EU AI Act context](https://protofire.io/blog/on-chain-credit-2026-lending-beyond-collateral/)

The original pre-privacy project brief was removed; it remains in Git history.
