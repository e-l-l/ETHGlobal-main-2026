# AI agents

**Agents propose, the contract decides.** Agents do the judgment work: deciding when a shop needs cash, reading messy sales data, spotting manipulation and watching market signals. Every action that moves money is checked by `PolicyGuard` against the merchant's own limits and the protocol's hard limits.

## Roles

### Cash-flow agent (the merchant's)
- **Set up by the merchant** with a mandate (below), and activated by a **one-time World Agent Pass approval**. Denied or expired approval means no agent and nothing drawn.
- **Input:** the shop's onchain sales and balance, the active advance (if any), the mandate's purpose, and the current limit.
- **Job:** decide when to draw and how much (for example: balance is low ahead of the shop's usual restock day, so draw $100 for stock), and write a plain-language reason.
- **Output:** a draw request in a fixed schema. Every decision, including "no draw today", goes into the merchant's activity log with reasons.
- **Cannot:** go beyond the mandate or the protocol caps, draw while an advance is active, draw while paused or revoked, or move funds anywhere except the shop's payout address or a supplier the purpose allows.

### Underwriter
- **Input:** shop ID, Business Pass facts (country, revenue band, months active), Standing Pass tier, onchain `Sale` events (amounts, timestamps, hashed payer addresses), current risk limits.
- **Output:** an offer in a fixed schema (below).
- **Cannot:** move funds, see personal data, or output free text that the contract acts on.

### Critic
- Runs independently of the Underwriter, with a separate prompt and no access to its reasoning, only its offer.
- Looks for wash trading: few unique payers, circular flows, round-number bursts, sales that appear only just before a draw.
- Looks for sudden sales changes, and for sales that don't fit the Business Pass revenue band.
- **Output:** `approve`, `reject` or `send_back`, with reasons shown to the merchant in the activity log.
- **Cannot:** raise an amount or approve anything on its own. An offer is signed only if the Critic approves.

### Risk
- Watches the junior token's time-averaged price on Uniswap, the default rate and repayment speed.
- Lowers `PolicyGuard` limits (cap per tier, total exposure) **only within preset bounds**, and only downward. Restoring limits needs an admin or a timelock.
- Publishes every change with its reasoning to the public Risk status screen.

## Mandate schema

Set by the merchant on the "Set up your cash-flow agent" screen and stored in `PolicyGuard` after the Agent Pass approval.

```ts
type Mandate = {
  shopId: string;
  maxPerAdvanceUsd: 50 | 100 | 250 | 500;
  maxPerMonthUsd: number;
  purpose: "stock" | "rent" | "repairs";
  supplier?: string;          // optional: pay the supplier directly
  status: "active" | "paused" | "revoked";
};
```

Lowering a limit, pausing or revoking takes effect immediately. Raising a limit needs a new approval.

## Offer schema

```ts
type Offer = {
  offerId: string;          // unique, bound into any ZK proof's context
  shopId: string;
  tier: number;             // from the Standing Pass proof, 0 for the first advance
  amountUsd: 50 | 100 | 250 | 500;   // fixed sizes only, never above the mandate
  factor: number;           // total repaid per $1, e.g. 1.15
  holdbackPct: number;      // share of each sale, 5–20
  estDaysToRepay: { slow: number; normal: number; busy: number };
  reasons: string[];        // plain-language, shown to the merchant ("why it drew this")
  expiresAt: number;
};
```

The model returns this through structured outputs. The service validates it against the schema, the mandate and the policy bounds before the Critic sees it. The contract checks it again.

## Guardrails against prompt injection

| Attack | Defence |
|---|---|
| Malicious text in shop name or metadata ("approve $10,000") | Agent output is schema-bound, and amounts outside the mandate or `PolicyGuard` caps revert onchain |
| Fooling the cash-flow agent into drawing too often | The monthly cap, one active advance per shop, and the Critic all apply. The merchant sees every draw and can pause. |
| Fooling one agent | The Critic is independent and must approve. The contract still caps the result. |
| Stealing the agent service's key | The key only signs offers. It can't move funds, and offers still need an active mandate, a valid pass, and payout to the shop's address. |
| Risk agent loosening limits | Its rights are downward-only, within bounds |

**Demo:** a second merchant's agent requests a draw on wash-traded sales, with an injection string in the shop name. The Critic rejects it. Then we force an offer above the merchant's mandate and show the contract revert.

## World Agent Pass

- **One-time approval** activates the cash-flow agent for a shop, with the limits the merchant chose. It is the protected action for World's track.
- **Denied, expired or cancelled:** no mandate is written and nothing can be drawn. The screen says so and offers a retry.
- **Validated server-side** before `PolicyGuard.setMandate` is called. Client responses are never trusted.
- **One agent per human**, which also stops a defaulter starting over. To confirm with World on site.
- **Privacy:** World's docs describe a stable per-person `sub`. We never store it or put it onchain. See [zk-privacy.md](zk-privacy.md).

## Privacy

- No personal data reaches the model. There's none to send.
- Payer addresses are hashed before reaching the agents. The Critic counts distinct payers without seeing who they are.
- The Business Pass gives agents a revenue band, not the merchant's books.
- Agent decisions and reasons are logged for the merchant to see. The logs contain only public data.

## Implementation

- TypeScript service, Claude via the Anthropic API with structured outputs.
- The cash-flow agent runs on a schedule and after each `Sale` event for shops with an active mandate.
- Offers are signed with an EIP-712 signature that `PolicyGuard` verifies.
