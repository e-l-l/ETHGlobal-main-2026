# DripMoni: pilot economics and token design

This is a **testnet prototype and a scenario model**, not evidence of a viable lending business, an offer of securities or a forecast. There is no observed loan-loss history. Merchant capture, verification, distribution and servicing costs remain unproven. The current checkout accepts test USDC; mock components and seeded liquidity are not traction. The strongest commercial hypothesis is to partner with a payment provider that already controls settlement.

## Money flows

For a $100 advance at factor 1.15, the merchant receives $100 and owes $115. A 10% holdback sends $10 of each $100 of captured sales to repayment while the advance is open; it is **not another fee**. The merchant pays $15 if the advance is fully repaid. Payments allocate principal and fee pro rata; fee shares arise only on amounts collected. Unpaid principal is borne by junior, then reserve, then senior. Senior is last to lose, not guaranteed.

| Full repayment, $100 advance | Current code | Proposed pilot |
|---|---:|---:|
| Senior fee | $9.00 | ~$8.00 |
| Junior / DRIP fee | $4.50 | ~$4.00 |
| Loss reserve | $1.50 | $1.50 |
| Protocol treasury | $0 | $1.50 |

DRIP is the junior ERC-4626 share: collected junior fees increase vault assets per share, while losses reduce them. Its market price can differ from vault value. It is not a promised return. The originator should fund at least one-third of each cohort's required junior cover and keep it locked until that cohort settles, including resolved defaults. This aligns incentives but is not a substitute for independent underwriting.

Today the pool has a separate 0.30% LP fee and 0.30% hook fee. The hook fee applies only when USDC is the unspecified currency; other orientations currently avoid it. It goes to reserve, not treasury. LPs bear pool inventory and price risk. The proposed hook split and checkout charge below are **not current implementation**.

## Recommended pilot terms

- Factor **1.15**, holdback **10%**, subject to existing offer bounds of 1.10–1.50 and 5–20%. Disclose cash fee, total owed, sales capture and annualized cost before consent.
- Collected fee split **5,333 / 2,667 / 1,000 / 1,000 bps** senior / junior / reserve / treasury. At $15 this is approximately $8 / $4 / $1.50 / $1.50; integer rounding affects cents.
- Require junior assets of at least **15% of senior outstanding after every draw**, and preserve the withdrawal check. Provision delinquency before redemption; queue exits when liquidity or cover is insufficient. Losses can breach cover after a draw: halt new draws until restored, rather than pretending this prevents loss.
- Keep hook fee **30 bps** of eligible USDC and allocate **75% reserve / 25% treasury**. Explicitly disclose the separate LP fee and current orientation gap; model only eligible volume. Do not assume price is an independent credit oracle.
- Charge **50 bps** on captured checkout sales **only when no advance is open**; waive it for the entire sale while an advance is open, including the closing sale. Disclose fee before payment and do not charge holdback as a checkout fee. Validate willingness to pay and local legal treatment before launch.
- Require originator stake **at least 5% of cohort senior principal** (one-third of the 15% required junior cover), locked through cohort settlement. Fund it with cash, not borrowed or unvested DRIP. Cohort accounting, locks and enforcement are additional work.

## Illustrative model and operating assumptions

Run `python agents/scripts/econ_model.py --merchants 1000`; `--help` lists all flags. `--preset '{"default_rate": 0.05}'` or `--preset path.json` loads a JSON object; CLI flags override it. `--scenario default-spike`, `correlated-defaults`, `low-utilisation`, or `drip-selloff` applies the named stress, with explicit flags overriding scenario values. Output includes inputs and results as JSON.

Base case: 40/30/20/10% of advances are $50/$100/$250/$500 (mean $150). Slow/normal/busy durations are 90/45/25 days with 25/50/25% weights (mean 51.25 days). Holdback is 10%; captured sales needed to repay are 11.5 times principal. The durations are assumed, not derived from independent sales data. One advance is active per merchant, immediately replaced at average duration; 3% of originations default with 100% principal LGD and no fee recovered on defaulted loans. This is a conservative binary simplification: actual contracts collect partial principal and fee, and recoveries and default timing matter. Capital is outstanding divided by 75% utilization, with 15% of outstanding in junior and the rest senior. Idle cash earns zero. Annual loss is allocated once against junior opening capital plus annual junior fees, then opening reserve plus annual reserve inflows, then senior opening capital plus annual senior fees. This aggregate calculation assumes fees are available before losses, ignores intra-year timing and reinvestment, and does not simulate cover breaches or a draw halt. Reserve growth is dollars after losses, not distributable revenue. Tranche returns are simple annual net returns on opening capital, **not compounded APYs**; actual realized APYs could be materially different.

Each merchant processes $1,500/month; 75% of volume is waived due to open advances. Eligible hook volume is 50% of $100/month per merchant. These volume assumptions are independent, illustrative inputs, not observed or inferred from repayment. Costs: two $0.10 LLM decisions, eight $0.02 L2 transactions and $0.10 proof/infra per advance; $5 acquisition per merchant in the modeled year; fixed opex $10,000/month. Acquisition is charged annually for simplicity, not a lifetime customer acquisition model. No taxes, financing, legal, collection, slippage, LP losses or default-related servicing costs are included.

| Base annual results | 100 merchants | 1,000 merchants | 10,000 merchants |
|---|---:|---:|---:|
| Advances originated | 712 | 7,122 | 71,220 |
| Gross protocol revenue | $3,849 | $38,494 | $384,937 |
| Total costs including fixed opex | $120,828 | $128,276 | $202,761 |
| Net income | -$116,978 | -$89,782 | $182,176 |
| Net margin | -3,039% | -233% | 47.3% |
| Senior simple annual return | 46.7% | 46.7% | 46.7% |
| DRIP simple annual return | 41.8% | 41.8% | 41.8% |
| Reserve growth | $1,689 | $16,894 | $168,937 |

These high illustrative returns follow from rapid recycling and assumed low defaults; they are not sustainable yield claims. At 100 merchants the model uses $15,000 outstanding, $20,000 capital, including $2,250 junior and $5,000 idle. Of $3,849 revenue, $1,554 is protocol advance fees, $45 hook treasury fees and $2,250 checkout fees. The model requires **3,972 active merchants** to cover $10,000 monthly fixed opex at these assumptions, after modeled variable costs and acquisition; no positive contribution means no finite break-even. Revenue is sensitive to the checkout waiver and captured sales.

For a $100 advance, slow/normal/busy require $1,150 in captured sales and complete in 90/45/25 days respectively. The model assumes smooth equal daily payments; corresponding effective annualized cash-flow costs are **219% / 920% / 6,441%**. These are annualized IRRs, not a claim that the $15 flat fee changes; real irregular sales and local disclosure rules change the calculation. Daily sales needed are approximately $12.78 / $25.56 / $46.00.

## Stress tests

All figures below use 1,000 merchants and the same model except for the specified stress. Annual losses consume available junior assets and fees, reserve, then senior; excess can remain uncovered. Correlation is represented by a severe simultaneous aggregate loss, not a stochastic correlation simulation. The sell-off changes market value and assumed hook volume only; it does not mechanically write down ERC-4626 assets or enforce a price-triggered lending change.

| Scenario | Senior return | DRIP return | Reserve growth | Protocol revenue | Net income |
|---|---:|---:|---:|---:|---:|
| Base: 3% defaults | 46.7% | 41.8% | $16,894 | $38,494 | -$89,782 |
| Default spike: 12% | 13.0% | -100% | $0 | $37,051 | -$91,225 |
| Correlated shock: 30% | -100% | -100% | $0 | $34,167 | -$94,109 |
| Utilization falls to 35% | 20.4% | 41.8% | $16,894 | $38,494 | -$89,782 |
| DRIP price -40%; hook volume $250/month | 46.7% | 41.8% | $18,919 | $39,169 | -$89,107 |

In the 30% shock, the model exhausts junior and reserve and charges $237,324 to senior, with additional loss potentially uncovered; it does not assume the protocol treasury covers it. In the sell-off, opening junior capital of $22,500 has illustrative market value $13,500; no executable liquidity or price recovery is assumed. Higher trading revenue is a mechanical volume assumption, not a benefit to count on during distress.

Break-even default frequency is not a single portfolio risk limit. Under the critique's equal-sized, fully successful or immediately lost advances, zero recoveries, costs, buffers and time value, $15/(100+15) = **13.04%** for the whole book, $4.50/(100+4.50) = **4.31%** for junior if it absorbs every loss, and $9/(100+9) = **8.26%** for unprotected senior. With the proposed fee split, those unbuffered junior and senior figures become **3.85% and 7.41%**. These calculations use fee per successful advance divided by principal LGD plus that fee; aggregate buffers, timing, partial repayments, expenses, provisioning and concentration alter actual outcomes. In particular they are not senior break-even with a 15% buffer.

## Implementation handoff

The following is a proposed interface and governance policy, not a claim that it is deployed. Fee-split changes apply only to newly opened advances: snapshot the four bps at draw, distribute the actual collected fee with deterministic rounding and ensure the four allocations sum exactly to the amount collected. Bounds are pilot policy recommendations, not existing onchain bounds.

| Parameter / rule | Initial value and bounds | Authority |
|---|---|---|
| `seniorFeeBps`, `juniorFeeBps`, `reserveFeeBps`, `protocolFeeBps` | 5333, 2667, 1000, 1000; each 0–10000, sum exactly 10000 | Owner multisig through timelock; new draws only |
| `juniorCoverBps` | 1500; 1500–5000; check post-draw senior outstanding and withdrawals | Owner multisig through timelock; risk manager may pause draws, not lower cover |
| `hookFeePips` | 3000 (30 bps; denominator 1,000,000); 0–3000 | Immutable per deployed hook; replacement requires governance and migration |
| `hookReserveShareBps` | 7500; 5000–10000; treasury gets remainder | Owner multisig through timelock; route actual received USDC atomically |
| `checkoutFeeBps` | 50; 0–100 | Owner multisig through timelock |
| `waiveCheckoutFeeWhileAdvanceOpen` | true; waiver covers entire closing sale | Fixed true for pilot; change only through timelocked governance and clear merchant notice |
| `originatorJuniorBpsOfRequiredCover` | 3334 minimum; 3334–10000, rounding up | Owner multisig through timelock; enforce cohort lock until all obligations and defaults resolve |
| `treasury` | Nonzero multisig address, separate from reserve | Owner multisig through timelock; emit changes |

Set an explicit timelock (recommend 48 hours), emit old/new values, prohibit zero destinations and ensure changes cannot retroactively alter existing advance economics. Define roles, emergency pause, cohort membership, asset accounting, provision methodology, redemption queues, rounding and migration in tests before implementation. The current `coverRatioBps` is immutable, so a mutable policy needs a deliberate contract change; do not assume these suggested names exist. Checkout fee and holdback must not double-charge the closing sale; add tests for all four swap orientations and both fee destinations. Originator lock and delinquency provisioning require implementation beyond parameter setters.

## Risks that remain

Merchants can divert sales, manufacture transaction history or default together. Settlement integration, small caps, exposure concentration limits, monitoring and real recoveries are essential; a cover ratio is not fraud prevention. Face-value accounting permits exits ahead of losses unless provisioning and withdrawal queues work. A thin DRIP pool can be manipulated, and a price-triggered cut to originations can reduce fee income and reinforce selling; keep the signal advisory until liquidity and oracle resistance are demonstrated. Reserve, junior and senior losses depend on when defaults and repayments occur, and the model's aggregate annual waterfall cannot establish solvency. Privacy has trust and metadata boundaries; mock verification is not proof of a real business. Test with real consent, measured capture, loss and costs before scaling or handling real lender funds.
