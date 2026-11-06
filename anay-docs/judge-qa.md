# Hard questions judges will ask

| Question | Our answer |
|---|---|
| What stops a merchant switching to another payment address? | Nothing fully stops it, and this is our main weakness. We limit the damage with small first advances, limits that grow only through repayment, alerts on sudden sales drops, and paying suppliers directly. The Standing Pass makes good behaviour valuable, because a repaid credential is worth more than one skipped repayment. |
| How do you onboard a merchant with no onchain history? | The Business Pass. The merchant proves through zkTLS that their seller dashboard shows a country, a revenue band and 6+ months of activity. We learn nothing else. |
| Isn't the seller portal fake? | Yes, at the hackathon it's our own site with seeded accounts, standing in for Mercado Pago, because we can't rely on a live provider for it. It shows the mechanism. In production the proof would read the real Mercado Pago, M-Pesa or Paystack dashboard. |
| Who are the merchants today? | Merchants in dollar-short economies, such as Argentina, Nigeria and Kenya, where people already hold stablecoins to escape inflation. The advance gives them a reason to accept stablecoins at the till. |
| Customers there use USDT, not USDC. | Live checkout takes test USDC only. Any-token checkout swaps are planned. |
| What does ZK actually hide? | Your books (the Business Pass reveals only a band), your borrowing history (Standing Pass), and the link between your old and new shops (rotation). Repayment on a known shop is still public. Hiding that needs a shielded pool, which is our roadmap. The "What the world sees" toggle shows exactly what's public on every screen. |
| Why let an AI draw money for me? | It only acts within limits the merchant sets (per advance, per month, recipient and expiry), after a one-time World approval. Every draw comes with a reason, and the merchant can pause or revoke it at any time. `PolicyGuard` enforces the limits onchain, not the agent. |
| Why not approve each draw? | Approving every restock defeats the point of an agent, and a merchant serving customers won't stop to sign. One approval with tight, editable limits is the safer default. Raising a limit needs a fresh approval. |
| Why not just use a KYC'd lender? | Contact-harvesting loan apps show what happens when lenders hold borrower data. Our privacy is built into the system, not a policy we promise to follow. Selective disclosure covers regulators. |
| Can sales be faked to get a bigger advance? | Onchain, yes, through wash trading. The Critic flags suspicious patterns and sales that don't fit the Business Pass band, and first limits are small, so faking costs more than it earns. |
| Can a prompt injection drain the pool? | No. Agent output is schema-bound, the Critic must approve independently, and `PolicyGuard` caps every draw at the merchant's mandate and the protocol limits. We show it failing in the demo. |
| Can a defaulter come back with a new shop? | No. Each seller account gets one Business Pass, World allows one agent per human, and higher limits need a Standing Pass, which is only minted on full repayment. |
| What if I lose my phone? | Credentials are backed up encrypted. On a new phone, a World ID check restores them. We can't read the backup. |
| Is this predatory? | Merchant advances can be expensive, so we show one flat fee upfront, with slow, normal and busy repayment estimates. There are no rollovers and no late fees, and a bad week only slows repayment. |
| Why would anyone trade the junior token? | It earns fees for taking first loss. Liquidity would be thin at first, so the demo seeds the pool. |
| Is it legal? | A real launch needs licensing in each market (for example, Kenya licenses digital lenders) and KYC through selective disclosure. AI credit decisions face extra scrutiny, including the EU AI Act's high-risk rules. |
| Isn't the anonymity set tiny? | In a demo, yes. Privacy grows with the number of repaid advances, which is why the Standing Pass should be portable across lenders. |
