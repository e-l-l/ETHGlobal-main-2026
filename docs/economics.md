# Economics

## The advance

A merchant cash advance, not a loan with interest. The merchant receives an amount, repays it times a fixed **factor** through a **holdback** share of each sale, and pays **one flat fee, shown upfront**. There are no rollovers and no late fees.

Published merchant cash advance ranges: holdback of about 5–20%, factor of 1.1–1.5.

### Worked example (illustrative, larger than hackathon tier caps)

| Input | Value |
|---|---|
| Advance | $1,000 |
| Factor | 1.15 |
| Merchant daily sales | $200 |
| Holdback | 10% |

| Result | Value |
|---|---|
| Total repaid | $1,150 |
| Flat fee | $150 |
| Repaid per day | $20 |
| Days to repay | about 58 |
| Break-even default rate | 13.0% (fee ÷ total repaid) |

Break-even assumes a default loses the whole advance and earns nothing. Partial repayments before a default raise it. These numbers are arithmetic and don't predict performance. We have no real loss data for stablecoin merchant advances.

**A bad week:** if sales halve, repayment halves and nothing else changes. That's why a sales share fits economies with sharp devaluations better than fixed installments.

**Fairness note:** a flat fee means a faster repayment costs more per day. Show the merchant the estimated days for a slow, normal and busy pace, and never present it as an interest rate.

## Capital stack

| Piece | Held by | Earns | Takes losses |
|---|---|---|---|
| Senior vault (ERC-4626) | USDC lenders | Most of each fee, plus yield on idle funds | Only after junior and reserve run out |
| Junior token | Risk takers | A larger share of fees for its size | First, on any default |
| Reserve | Protocol | A slice of fees, plus the Uniswap hook fee | Tops up junior losses |
| Uniswap v4 pool | LPs and traders | Pool trading fees | Market risk on the junior token |

**Fee split (starting point, to tune):** of each fee, 60% to senior, 30% to junior, 10% to reserve.

**Why the junior token trades:** its price is a live market estimate of the pool's risk. The Risk agent reads it and tightens limits when it falls. People trade the risk of the advance book, and merchants never have to trade.

**Why not trading fees alone:** at a 0.05% fee, covering one $100 default takes $200,000 of volume. Advance fees carry the economics, and hook fees are a small top-up.

## Limits ladder

| Tier | Requirement | Max advance |
|---|---|---|
| 0 | World ID + about 2 weeks of sales through the link | $50 |
| 1 | Standing Pass, 1 repaid | $100 |
| 2 | Standing Pass, 2 repaid | $250 |
| 3+ | Standing Pass, 3+ repaid | $500 |

The caps are also limited by sales volume (the Underwriter) and by the current risk limits (the Risk agent).
