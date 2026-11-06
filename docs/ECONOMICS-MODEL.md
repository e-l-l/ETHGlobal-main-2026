# DripMoni contract economics

Illustrative contract economics for the current pilot parameters. These are not forecasts or legal disclosures. The fee accrues at 50 bps per week on original principal while principal remains, caps at 300 bps, and is collected fee-first. Paying principal sooner reduces the fee. The merchant holdback is 8% of each sale while the advance is active; there is no checkout fee.

## Merchant cost

| Time outstanding | Fee on $100 | Total repaid if paid then | Simple annualized cost |
|---:|---:|---:|---:|
| 1 week | $0.50 | $100.50 | 26% |
| 2 weeks | $1.00 | $101.00 | 26% |
| 4 weeks | $2.00 | $102.00 | 26% |
| 6 weeks | $3.00 | $103.00 | 26% (fee cap reached) |

Disclosure: “Fee 0.5% per week while you owe, never more than 3%.” This simple annualized figure is not an APR derived from actual sale cash flows. The 8% holdback controls payment pace; it is not an additional fee.

## Fee waterfall and lender scenarios

For a $100 advance repaid after four weeks, the $2 fee is allocated 40/30/20/10: $0.80 senior, $0.60 junior/DRIP, $0.40 reserve, and $0.20 protocol. Fees are distributed only as collected. Junior cover is 20% of senior outstanding and absorbs losses first, then reserve, then senior. At 75% utilization, a 4-week cycle, and 12 cycles/year, the illustrative senior return is $0.80 × 12 = **9.6%** on the lending base in this simple model. Utilization changes capital efficiency and idle cash, not fee earned per dollar lent. Neither is guaranteed.

DRIP return illustration assumes $20 junior cover per $100 senior principal and deducts each stated loss from that cover before annualizing 12 cycles:

| Loss per 4-week cycle | DRIP annualized simple return |
|---:|---:|
| 0.25% | 21% |
| 0.50% | 6% |
| 1.00% | -24% |
| 2.00% | -84% |

These simplified sensitivities do not model correlated defaults, recoveries, late repayments, provisioning, liquidity constraints, or market price. DRIP is the junior ERC-4626 share token, takes losses first, and can lose value. The protocol's 10% fee share yields **$2,000 per $1 million lent** at the four-week fee, before costs. RiskHook fees route 75% to reserve and 25% to treasury. Tier caps are $50/$100/$200/$300. No checkout processing fee is charged.

## Limits and caveats

The onchain minimum repayment is 1% of original principal plus fee accrued by the repayment point per 7-day window. Full principal payoff stops further fee accrual. Contract `AdvanceOpened.totalOwed` records the maximum amount at the fee cap; live owed is principal outstanding plus accrued unpaid fee. A merchant can divert sales, and the pool can incur losses beyond junior cover and reserve. This pilot has no validated loss history and no guaranteed lender return.
