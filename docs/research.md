# Research and background

## Why this project

The original idea was AI agents issuing unsecured payday loans, with trading fees covering defaults. Research ruled that out:

- **Unsecured small loans lose too much.** Divine, the closest precedent, reported about 40% defaults on first loans, even with World ID stopping repeat borrowing. The figure is company-stated and unaudited.
- **Trading fees are too small.** At a 0.05% fee, one $100 default takes $200,000 of volume to cover.

Advances tied to a cash flow hold up better than loans backed by a promise. Payroll-deducted advances keep losses down, and Huma advances against payment flows that turn over in days. A merchant advance doesn't need an employer to join, because the checkout link collects repayment on its own.

## How big is this? (researched 2026-11-05)

| Layer | Number | Source |
|---|---|---|
| The need | Small-business finance gap in emerging markets: **$5.7T**, about **$8T** with informal firms (119 economies, about 19% of their GDP). **70%** of small businesses lack adequate finance. Caveat: 2019 GDP baselines. | [IFC](https://www.ifc.org/en/what-we-do/sector-expertise/financial-institutions/msme-finance), [IFC factsheet](https://www.ifc.org/content/dam/ifc/doclink/latest/msme-s-factsheet-ifc-financial-institutions-group.pdf) |
| The model works | Merchant cash advances: about **$20–46B a year**, mostly US; estimates vary by publisher. **Shopify Capital: $4.2B** advanced in 2025 (+40%). | [Mordor](https://www.mordorintelligence.com/industry-reports/merchant-cash-advance-market), [Precedence](https://www.precedenceresearch.com/merchant-cash-advance-market), [Congruence](https://www.congruencemarketinsights.com/report/merchant-cash-advance-market) |
| Our markets, incumbents | **Mercado Pago: $2.9B merchant loans** (Sep 2026) in a $16B credit book growing 75% a year, with 7% non-performing. **Moniepoint: about $700M** to small businesses in 2025. **Safaricom Fuliza** now extends to small merchants and is repaid from incoming payments. | [MELI 10-Q](https://www.sec.gov/Archives/edgar/data/0001099590/000109959026000029/meli-20260930.htm), [Asian Banker](https://www.theasianbanker.com/updates-and-articles/mercado-pago-grows-credit-portfolio-75-revolut-secures-french-banking-licence), [Launch Base Africa](https://launchbaseafrica.com/2026/01/29/from-payments-to-credit-nigerian-fintech-moniepoint-deploys-720m-to-corner-shops-and-supermarkets), [TechTrends KE](https://techtrendske.co.ke/2026/10/26/safaricom-fuliza-ya-pochi/) |
| The rails | LatAm crypto economy **$594B** (+9.8% while global flows fell). Cross-border stablecoin transfers **+77.5%** in the year to June 2026. Nigeria ranks **#3** in the adoption index (secondary source). | [Chainalysis LATAM](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/), [Chainalysis report](https://www.chainalysis.com/reports/the-2026-geography-of-cryptocurrency-report/), [Coinpasar](https://coinpasar.sg/chainalysis-2026-global-crypto-adoption-index/) |

**The honest constraint:** demand for credit is huge and the sales-share model is proven. **Our bottleneck is merchants accepting stablecoins at the till** (small today, fast-growing), and the advance is the reason to switch.

**Illustrative bottom-up** (an assumption, not a forecast): 100k merchants × $200 average advance × about 6 cycles a year ≈ **$120M a year in advances**.

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
- ~~**Poseidon2:** a Solidity implementation that matches Noir's output.~~ Verified 2026-11-05, see [zk-privacy.md](zk-privacy.md). Rerun with real `nargo` at the start.
- **Browser proving:** proving time for `standing_pass` on a low-end Android phone.
- **World:** Agent Pass test-mode proofs use fake identities, so check the live judge flow. Ask whether one project can win both World tracks.
- **zkTLS:** whether Reclaim, vlayer or others have working Mercado Pago, M-Pesa or Paystack providers.
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

The original pre-privacy brief (with ENS as a partner) was removed; it's still in git history (e.g. commit `28a7866`).
