# UX and screens

Who we're designing for: a kiosco owner in Buenos Aires, a phone-accessory seller in Lagos, a duka owner in Nairobi. They use low-end Android phones on expensive data. They think in local prices, save in dollars, and need local money to pay suppliers.

## Screens by user

### Merchant (borrower)

**Onboarding**

| Screen | What it shows |
|---|---|
| Welcome | What the app does, plus the promise: *"We never ask for your name, phone or contacts."* |
| Prove your business | Starts the zkTLS flow (QR or deep link) to log into the seller dashboard |
| Verifying… | Progress while the proof is generated (2–30 s) |
| Business Pass result | *"✅ Verified · Argentina · revenue band 2 · 6+ months: we learned nothing else."* |
| Verification failed | A clear reason (too new, suspended, revenue too low) and what to do next |
| Create your shop | Pick a shop name and get the payment QR |
| Set up your cash-flow agent | Choose limits: max per advance, max per month, purpose |
| Approve with World | A one-time Agent Pass approval that activates the agent |
| Agent denied or expired | *"No agent set up, nothing will be drawn,"* with a retry |

**Day to day**

| Screen | What it shows |
|---|---|
| Home / live sales | Today's sales, the split per sale (yours vs repayment), balance, voice announcements |
| Advance arrived | *"Your agent drew $100 for stock,"* with a "why it drew this" explanation |
| Advance details | Amount, flat fee, total to repay, repaid so far, estimated days left |
| Bad week | Repayment slowed, no penalty, reassuring copy |
| Agent activity log | History of the agent's decisions and draws, with reasons |
| Manage agent | Edit limits, pause, or revoke the agent |
| Repaid / Standing Pass | *"You've repaid 1 advance, your limit is now $100, nobody can see your history."* |
| Start fresh shop | Rotate to a new shop pseudonym and keep the reputation privately |
| Cash out | Move dollars to local money or a supplier (mocked for the demo) |
| Settings | Language (ES/EN), local currency, credential backup and export |
| Recover on a new phone | A World ID check restores credentials, with a cancel path |

### Customer (payer)

| Screen | What it shows |
|---|---|
| Scan & pay | The shop QR opens a simple pay screen: amount and token. **No mention of the advance.** |
| Payment success | A receipt and a "thanks" screen |

### Lender (senior vault)

| Screen | What it shows |
|---|---|
| Earn overview | Vault APY, total lent, default rate, and how losses are covered (junior first) |
| Deposit / withdraw | Add USDC to the senior vault or take it out, showing what's available to withdraw |
| My position | Shares, value, and earnings over time |

### Risk taker (junior token)

| Screen | What it shows |
|---|---|
| Junior vault | A first-loss explanation, fee share, coverage ratio |
| Deposit / withdraw junior | Mint or redeem junior tokens |
| Trade junior token | Swap junior/USDC on the Uniswap pool, with the live price |

### Public and judges

| Screen | What it shows |
|---|---|
| "What the world sees" panel | A toggle on every screen showing what's public onchain vs private on the device |
| Protocol dashboard | Total outstanding, repayments, write-offs, reserve, junior price (TWAP), current limits |
| Risk status | Live risk signals, and when the Risk agent lowered limits, with its reasoning |
| Explorer links | A pseudonymous shop, commitments and nullifiers, with no identity anywhere |

### Demo seller portal (separate site, stand-in for Mercado Pago)

| Screen | What it shows |
|---|---|
| Portal login | The seller logs in (seeded demo accounts) |
| Portal dashboard | Balance, sales chart, transactions: the page the zkTLS proof reads from |

Seed at least one account per outcome: a pass (Argentina, band 2, 6+ months), and one each for too new, suspended and revenue too low, so every failure screen can be shown.

## Realities the design has to handle

1. **Customers hold USDT, not USDC.** People mostly hold it on Tron or BSC, inside Lemon, Belo, Binance or Yellow Card. Checkout accepts any token and swaps through Uniswap. Pitch line: *customer pays in USDT, repayment settles in USDC.*
2. **Merchants need local money.** The Cash out screen moves dollars to Mercado Pago, CVU or M-Pesa, mocked for the demo. Better still, **pay the supplier directly**: it matches the purpose the merchant gave the agent, and lowers the risk of someone taking the money and disappearing.
3. **No onchain history at the start.** The Business Pass fixes cold start: the merchant proves months of offchain sales from day one, without showing their books. First limits stay small and the next limit is always visible.
4. **Being visible is dangerous.** Neutral shop names, nothing about debt on the customer's screen, the split shown only to the merchant, and shop rotation. The "What the world sees" toggle makes this visible. See [zk-privacy.md](zk-privacy.md).
5. **Handing money decisions to an agent is scary.** The merchant sets hard limits, sees why every draw happened, and can pause or revoke the agent at any time. Nothing happens until they approve once with World.
6. **Phones get lost.** Credentials live on the device, so backup, export and World ID recovery are first-class screens, not settings buried at the bottom.
7. **They already have wallets.** For a real launch: World App in Argentina, MiniPay (Celo) in Nigeria, Kenya and Ghana. Check where World ID verification is available before pitching it for a country. Kenya's courts ordered Worldcoin to delete its data.

## Demo-critical details

| Feature | Why |
|---|---|
| **Voice announcement on each sale**, read out by the browser's speech synthesis: *"Recibiste 10 dólares, 1 fue a tu adelanto"* | Mumbai judges know the Paytm soundbox. It's the most memorable demo moment and takes about 20 lines of code. |
| **"We learned nothing else"** on the Business Pass result | The privacy promise in one line, at the moment it matters |
| **"Why it drew this"** on every agent draw | Makes the agent trustworthy and shows the AI doing real judgment |
| **Denied path** for the World approval | Required by World's track, and proves nothing happens without consent |
| **Local currency next to dollars** (ARS, NGN, KES) | Makes the case for stablecoins without explaining it |
| **Bad week screen** | Our strongest argument for these economies |
| **Standing Pass and Start fresh shop** | Makes the ZK benefit something the merchant can feel |
| **"What the world sees" toggle** | Lets judges check the privacy claims on any screen |
| **Judge-ready payment**: a pre-funded web wallet on a demo phone, gas paid by us, "received" shown as soon as the payment is sent | A judge with no Sepolia USDC, or a 12+ second wait, kills the demo |

## Words to use and avoid

| Avoid | Use |
|---|---|
| Loan, interest, APR | Advance, fee |
| Factor | "You pay back $1,150 in total" |
| Default | "If sales stop for 30 days…" (explain plainly, in advance) |
| Tranche, junior, senior | Not shown to merchants (lender and risk-taker views only) |
| Gas, USDC, wallet, proof | Hidden, or "dollars" |
| Zero-knowledge, zkTLS | "Private: we learned nothing else" / "no one can see your history" |
| Credential, nullifier | Business Pass, Standing Pass |
| Mandate, autonomous | "Your agent," "your limits" |

**Languages:** Spanish (rioplatense *vos*) and English for the hackathon. Later: Nigerian Pidgin and Swahili.

**Performance:** the merchant app should be under about 300 KB on first load. Prove ZK credentials in the background with a progress message ("Checking your record privately…").
