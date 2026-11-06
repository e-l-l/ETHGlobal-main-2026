# Future work

What we know is not done yet, how we would build it, and a rough size. Sizes assume one engineer who knows the codebase.

## Privacy

| # | Item | Why | Design | Size |
|---|---|---|---|---|
| P1 | **Stealth payout addresses (ERC-5564)** | Every sale's 92% goes to the shop's one payout address, so a shop's activity is linkable to that address. | The merchant publishes a stealth meta-address. Each payment goes to a fresh one-time address plus an ERC-5564 `Announcement`. The open problem is that the contract can't check the payer's derivation, so the payer could redirect funds. Two fixes: the merchant pre-registers a batch of one-time addresses (the contract pops the next one), or a small ZK proof of correct derivation. The merchant's phone scans announcements and sweeps balances through a paymaster, so gas doesn't link them. | 1.5–2 days + redeploy |
| P2 | **ZK proof of "not on the ban list"** | Today the World ID ban is enforced by our offer signer from a private, HMAC-keyed list. You trust the operator. | An indexed Merkle tree of banned keys, with its root onchain. A Noir circuit proves non-membership for the key derived at World ID verification. The hard part is binding that key to a real World ID without verifying World's proof inside our circuit: a commitment issued at verification, or World's own onchain verifier when available. Draws check the proof. | 2–4 days + redeploy |
| P3 | **Auditable ban list (step toward P2)** | Lets anyone see bans happen and that the list only grows, without learning who is on it. | The relayer posts the root of the banned-key tree and a count to a small contract on every ban. | ~3 h + a small contract |
| P4 | **Hidden amounts** | Sale and advance amounts are public under the shop pseudonym. | Settle through a shielded pool (Aztec, Railgun-style). Repayment-from-sale then needs a private split, which is a large redesign. | Weeks |
| P5 | **Attestor without a trusted issuer** | The issuer briefly sees the seller-account ID during the zkTLS check. | Use Reclaim's attestor network directly with an onchain verifier, or run our attestor in a TEE with remote attestation. | 1–2 days |
| P6 | **Anon-RPC strict mode by default** | Today a failed mixnet falls back to direct reads, shown live in the header chip. | Turn on `NEXT_PUBLIC_ANON_RPC_STRICT=1` once mixnet latency is good enough, and show a "waiting for the private connection" state. | ~1 h |
| P7 | **Private writes** | Writes are public transactions from the merchant's wallet. | Route customer payments and merchant actions through a relayer or 4337 paymaster, so gas funding doesn't link wallets. | 1 day |

## Product and protocol

| # | Item | Size |
|---|---|---|
| R1 | **Pay in any token via Uniswap v4.** A narrow `PaymentRouter` that swaps the customer's token to USDC through a `PoolManager` unlock callback, then calls `AdvanceBook.pay` atomically (min-out, deadline, refunds) | 1–1.5 days + redeploy |
| R2 | **RiskHook pool-key restriction.** Accept only the DRIP/USDC pool key at `afterInitialize` | ~1 h + redeploy |
| R3 | **A manipulation-resistant risk signal.** Weight the TWAP by liquidity; prefer NAV, write-offs and repayment pace as the primary signals | 1 day |
| R4 | **Real seller data: a Reclaim provider for Stripe / Mercado Pago dashboards** (the provider builder was down on 6 Nov) | 0.5–1 day once the builder works |
| R5 | **Owner keys.** Move `owner`, `riskManager` and `offerSigner` behind a multisig plus a timelock | 0.5 day |
| R6 | **Cash-out to local currency.** A partner off-ramp (e.g. M-Pesa or local bank rails via a licensed partner) | Partner-dependent |
| R7 | **Security audit** of AdvanceBook, the vaults and RiskHook | External |
| R8 | **"Charge an amount" QR.** The merchant enters an amount; the QR pre-fills the pay page | ~30 min |

## Engineering

| # | Item | Size |
|---|---|---|
| E1 | **Progressive proof center.** Load each section as soon as its data arrives | ~2 h |
| E2 | **A real domain** instead of `sslip.io`, which avoids wallet phishing warnings on raw-IP subdomains | ~30 min + DNS |
| E3 | **A clean pay path.** `/pay?shop=…` instead of the fixed `/pay/corner-kiosk` slug | ~30 min |
| E4 | **Remove the build stub for Coinbase's `@x402/*` imports** once upstream fixes the missing peer packages | ~15 min |

## Done on 6 Nov (privacy hygiene)

- **No visitor IP logs:** Caddy access logs are off, the agents API runs without an access log, and the issuer redacts client IPs.
- **No raw IPs at rest:** the simulator's rate limiter keeps a salted hash, not the IP.
- **In memory only:** the faucet and API rate limits.
