# Merchant UX

Who we're designing for: a kiosco owner in Buenos Aires, a phone-accessory seller in Lagos, a duka owner in Nairobi. They use low-end Android phones on expensive data. They think in local prices, save in dollars, and need local money to pay suppliers.

## Realities the design has to handle

1. **Customers hold USDT, not USDC.** People mostly hold it on Tron or BSC, inside Lemon, Belo, Binance or Yellow Card. Live checkout accepts test USDC only; any-token checkout swaps are planned.
2. **Merchants need local money.** Show a "Withdraw to a local bank account / M-Pesa" step, mocked for the demo. Better still, **send the advance straight to the supplier**: it matches why the merchant asked, and lowers the risk of someone taking the money and disappearing.
3. **No onchain history at the start.** Start tiny ($50 after about two weeks of sales through the link) and make the next limit visible. zkTLS proofs of offchain sales are the stretch fix.
4. **Being visible is dangerous.** Neutral names, nothing about debt on the customer's screen, and the split shown only to the merchant. See [zk-privacy.md](zk-privacy.md).
5. **They already have wallets.** For a real launch: World App in Argentina, MiniPay (Celo) in Nigeria, Kenya and Ghana. Check where World ID verification is available before pitching it for a country. Kenya's courts ordered Worldcoin to delete its data.

## Hackathon build list

| Feature | Why |
|---|---|
| **Voice announcement on each sale**, read out by the browser's speech synthesis: *"You received 10 dollars, 1 went to your advance"* | Mumbai judges know the Paytm soundbox. It's the most memorable demo moment and takes about 20 lines of code. |
| **Local currency next to dollars** (ARS, NGN, KES) | Makes the case for stablecoins without explaining it |
| **"Bad week" screen**: repayment slows, nothing is penalised | Our strongest argument for these economies |
| **Offer screen in plain words**: the fee (0.5% a week while owed, max 3%; a late fee only if behind the 1% weekly minimum), days to repay for a slow, normal and busy week, the Underwriter's reasons, the next limit | Builds trust and answers "is this predatory?" upfront |
| **Denied screen with a next step** ("sell 2 more weeks through your link to unlock $50") | World's track requires a denied path anyway |
| **Standing Pass screen**: "You've repaid 1 advance. Your limit is now $100. No one can see your history." | Makes the ZK benefit something the merchant can feel |
| **Judge-ready payment**: a pre-funded web wallet on a demo phone, gas paid by us, "received" shown as soon as the payment is sent | A judge with no Sepolia USDC, or a 12+ second wait, kills the demo |

## Words to use and avoid

| Avoid | Use |
|---|---|
| Loan, interest, APR | Advance, fee |
| Factor | "You pay back $1,150 in total" |
| Default | "If sales stop for 30 days…" (explain plainly, in advance) |
| Tranche, junior, senior | Not shown to merchants (lender view only) |
| Gas, USDC, wallet, proof | Hidden, or "dollars" |
| Zero-knowledge | "Private: no one can see your history" |

**Languages:** Spanish (rioplatense *vos*) first. Then English and Nigerian Pidgin, Swahili.

**Performance:** the merchant app should be under about 300 KB on first load. Prove ZK credentials in the background with a progress message ("Checking your record privately…").
