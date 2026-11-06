# Frontend handoff

## New fee model

Use the current SDK data methods rather than `AdvanceOpened.totalOwed` as a live balance. `totalOwed` is the contract’s maximum debt at the signed fee cap. The onchain reader resolves live debt through `AdvanceBook.owedOf` and calculates accrued fee from draw time, original principal, signed terms, and fee already paid.

- Merchant advance screen: call `mra.merchant.advance()` and render `AdvanceVM.owedNow` as current debt, `feeSoFar` as accrued fee to date, and `left` as the amount still owed. `total` remains temporarily available as an alias for `owedNow` during migration.
- Fee checkpoints: use `feeIfRepaidIn1Week`, `feeIfRepaidIn2Weeks`, `feeIfRepaidIn4Weeks`, and `feeIfRepaidIn6Weeks`. These are fee amounts in USD based on original principal and default terms (50 bps/week, maximum 300 bps). `maxFeeBps` is the signed fee cap in basis points.
- Cost disclosure: `annualizedCostPercent` is the simple annualized maximum (about 26% at the current terms); disclose that this is not an APR computed from actual sale cash flows. Fee accrues on original principal, is collected before principal, stops after full principal payoff, and early payoff saves fee.
- Offer terms from `mra.agent.approveView(...)` / API types contain `fee_rate_bps_per_week: 50` and `fee_cap_bps: 300`; the pilot holdback is 800 bps (8%). The exact merchant copy is: “Fee 0.5% per week while you owe, never more than 3%.”
- Lender fee waterfall: call `mra.lender.earn()` and render its `feeSplit` (40% senior / 30% junior DRIP / 20% reserve / 10% protocol). `waterfall` is the separate loss-order view. For a $100 principal repaid in four weeks, the $2 collected fee pays $0.80/$0.60/$0.40/$0.20 respectively.
- Junior asset naming in new UI should be **DripCoin (DRIP)**. This is the junior vault share token; it takes losses first. Tier caps are $50/$100/$200/$300.

SDK types live in `packages/sdk/src/viewmodels.ts`; live reads are in `packages/sdk/src/chain/chain.ts` and `packages/sdk/src/domains/merchant.ts`; mock examples are in `packages/sdk/src/mock/shop.ts` and `packages/sdk/src/mock/lend.ts`.
