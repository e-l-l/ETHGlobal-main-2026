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

## Late fee: the fee doubles while behind the minimum

The minimum repayment is 1% of original principal plus accrued fee per 7-day window. A merchant who goes more than 7 days without meeting it is **behind** (`AdvanceBook.isBehind`). While behind, a **late fee** accrues on original principal at another 50 bps per week (`LATE_FEE_RATE_BPS_PER_WEEK`), so the total is 1% a week. The late fee has its own 300 bps cap (`LATE_FEE_CAP_BPS`), so the most a merchant can ever owe in fees is **6%** (3% normal + 3% late). As soon as the merchant meets the minimum again, accrual returns to normal. Late fee already accrued stays owed and is paid with the normal fee, fee-first, before principal. On write-off, unpaid late fee is lost, like unpaid normal fee.

| Never repaid, weeks outstanding | Normal fee on $100 | Late fee on $100 | Total fee |
|---:|---:|---:|---:|
| 1 | $0.50 | $0.00 | $0.50 |
| 2 | $1.00 | $0.50 | $1.50 |
| 4 | $2.00 | $1.50 | $3.50 |
| 6 | $3.00 | $2.50 | $5.50 |
| 7 or more | $3.00 | $3.00 | $6.00 (both caps) |

**Why:** 100% of the late fee goes to the **reserve**, the first-loss buffer that sits behind DRIP and in front of the senior vault. It is not split 40/30/20/10. Late payers are the merchants most likely to default, so they pre-fund the buffer that would absorb their own loss, and lenders aren't paid extra for a riskier book. Merchants who pay on time see no change at all: same fee, same split, no late-fee event. In the model (`agents/scripts/econ_model.py`), if 10% of advances spend 2 weeks behind, late fees add **$1,000 per $1 million lent** to the reserve per cycle, on top of its $4,000 fee share at the four-week fee.

Merchant copy: “Paying on time keeps your fee at 0.5% a week, max 3%. If you fall behind the minimum, the fee doubles to 1% a week (max 6% total) until you catch up; the extra goes to the safety reserve.”

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

The onchain minimum repayment is 1% of original principal plus fee accrued by the repayment point per 7-day window. Full principal payoff stops further fee accrual (normal and late). Contract `AdvanceOpened.totalOwed` records the maximum amount at the normal fee cap (a late payer can owe up to 3% more); live owed (`owedOf`) is principal outstanding plus accrued unpaid fee plus unpaid late fee. A merchant can divert sales, and the pool can incur losses beyond junior cover and reserve. This pilot has no validated loss history and no guaranteed lender return.
