# Economics

The merchant receives a fixed advance and repays principal plus a flat fee from sales routed through DripMoni while an advance is active. There is no holdback without an active advance. The contract permits factors of 1.10–1.50 and repayment slices of 5–20%; 1.15 and 10% are demo examples. Diversion of sales to other channels can prevent repayment.

## A $100 offer

At factor 1.15 the merchant receives $100 and owes $115: $100 principal plus a $15 fee. A 10% repayment slice requires $1,150 in captured sales for full repayment. Illustrative simple annualized cost is 15% × 365 / days, not an APR derived from actual cash flows:

| Captured sales per day | Repayment per day | Estimated days | Simple annualized cost |
|---:|---:|---:|---:|
| $50 (slow) | $5 | 23 | 238% |
| $100 (normal) | $10 | 11.5 | 476% |
| $200 (busy) | $20 | 5.75 | 952% |

These are estimates assuming constant captured sales; actual payment timing and effective APR differ. There are no real loss data for this testnet prototype.

## Fee and loss waterfall

On full repayment of $100 at 1.15, the $15 fee currently goes 60/30/10: **$9 senior, $4.50 junior, $1.50 reserve; protocol operating revenue is $0**. Payments split principal and fee pro rata. Reserve is loss capital, not revenue. A proposed split is **$8 senior, $4 junior, $1.50 reserve, $1.50 protocol**; this is proposed, contract change pending. A write-off covers unpaid principal from junior, then reserve, then senior; a caller may receive up to $5 from reserve remaining after coverage. Senior is not guaranteed.

DripCoin (DRIP): junior, takes losses first. Junior withdrawals are constrained by 10% of senior outstanding, but new draws do not enforce that ratio; losses can also reduce coverage. Outstanding principal is valued at face value until write-off. Idle liquidity limits withdrawals.

The v4 pool charges a **0.30% LP fee** and a separate **0.30% hook fee only when USDC is the unspecified swap currency**; hook proceeds go to reserve. Pool LPs face inventory and adverse-selection risk and do not earn advance fees merely by supplying USDC. Thin seeded pool prices can reflect liquidity needs or manipulation, not just credit risk; the Risk agent's TWAP trigger can tighten credit.

### Illustrative break-even default rates

For equal $100 advances, full repayment or immediate total loss, no recoveries, operating costs or time value: whole book **13.04%**, junior absorbing each default in full **4.31%**, senior with no protection **8.26%**, and senior with a hypothetical aggregate junior buffer of 10% of original principal plus reserve funded only by successful advances approximately **10.45%**. These are loss-frequency illustrations, not forecasts or APYs. Timing, concentrations, partial repayment, idle capital, costs and bounties change outcomes.

## Tier caps

| Tier | Maximum |
|---|---:|
| 0 | $50 |
| 1 | $100 |
| 2 | $250 |
| 3+ | $500 |

Actual offers are further limited by revenue band, mandate, underwriting and risk limits. The demo Business Pass uses a mock attestor; a genuine external revenue figure would still not establish future captured sales. A settlement-integrated payment-provider partnership is a distribution hypothesis, not a validated channel.
