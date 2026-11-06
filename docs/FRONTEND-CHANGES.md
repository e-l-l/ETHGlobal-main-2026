# Frontend changes needed (from the backend side)

This was audited against `main` on 6 Nov. Data fields and SDK methods are documented in [FRONTEND-HANDOFF.md](FRONTEND-HANDOFF.md). The new fee fields arrive in `@repo/sdk` with the contracts merge. Mock mode returns them too, so screens can be built before the redeploy.

> **Timing:** the fee copy below must ship together with the contract redeploy. Until then the live contracts still charge the old flat fee.

## P0: the fee model changed (flat fee → time-based)

New terms: **0.5% per week while you owe, never more than 3%.** The fee accrues on the original advance and is paid before principal. Paying early saves fee. Holdback is **8%**. There are no late fees. Each 7 days the merchant must repay at least 1% of the advance plus the fee accrued; after 14 days short of that, the advance is marked late.

Exact merchant copy: **"Fee 0.5% per week while you owe, never more than 3%."**

| File (apps/web/src/…) | Today | Change to |
|---|---|---|
| `app/merchant/(app)/screen.tsx` L199 | `{fee} {feeLabel}, no interest · {eta}` | `Fee so far {feeSoFar} · owed now {owedNow} · {eta}` |
| `app/merchant/(app)/advance/screen.tsx` L40, L115, L123 | "No interest and no late fees. The fee never grows, however long it takes." | Show `owedNow`, `feeSoFar`, `left`. Add a small table: "If repaid in 1 / 2 / 4 / 6 weeks → fee `feeIfRepaidIn1Week` / `…2Weeks` / `…4Weeks` / `…6Weeks`". Copy: "No late fees. The fee stops at 3%. Pay early, pay less." |
| `app/merchant/(app)/advance/arrived/screen.tsx` L30, L53 | "…and a flat fee that never grows" | "…and a fee of 0.5% a week while you owe, never more than 3%" |
| `app/merchant/(app)/week/screen.tsx` L76, L98 | "No penalty and no extra fee. The total stays {total}." | "No penalty and no late fee. The fee keeps adding 0.5% a week but stops at 3% ({maxFee})." |
| `app/merchant/(app)/agent/screen.tsx` L50 | "A flat fee, no interest." | "A small weekly fee while you owe, capped at 3%." |
| `app/merchant/(app)/agent/setup/limits-form.tsx` L92–L101 | "One flat fee", illustration at **15% flat fee, 10% holdback** | "0.5% a week, max 3%". Illustration: `fee = perAdvance * 0.03` (worst case), `holdback = 8` |
| `app/merchant/(focus)/agent/approve/screen.tsx` L72–L77 | `fee={advance.fee}` | Pass `maxFeeBps` and the checkpoints into `OfferDisclosure`. The payoff-days estimate stays the same. |
| `OfferDisclosure` component | principal / fee / total | Show principal, **max fee (3%)**, "fee if repaid in 2 weeks", and `annualizedCostPercent` as "≈26%/yr maximum (simple, not an APR)" |

`total` still works as an alias for `owedNow` during the migration. Prefer the new names.

## P0: lender fee split is now 4-way, with DRIP naming

- **`screens/lend/screens.tsx` L42 `feeSplit()`** parses 3 parts: vault / DRIP / reserve. The split is now **40% vault (senior) / 30% DripCoin / 20% reserve / 10% protocol**. Render `mra.lender.earn().feeSplit` (4 entries) and don't parse a string. The example: a $100 advance repaid in 4 weeks has a $2 fee, which pays $0.80 / $0.60 / $0.40 / $0.20.
- **L75 / L105** "One flat fee per advance" → "A small weekly fee on every advance (max 3%). Most of it goes to the vault."
- **L377** label → `Fee split: 40% vault, 30% DripCoin, 20% reserve, 10% protocol`.
- Add one line to `/earn` and `/dripcoin`: **"Every advance has 20% DripCoin cover underneath it."**
- Tier caps shown anywhere are now **$50 / $100 / $200 / $300**.
- **Naming:** say **DripCoin (DRIP)** everywhere. "Junior token" is still in `landing/Lenders.tsx`, `landing/UnderTheHood.tsx` and `app/page.tsx` (user-facing copy only; leave code identifiers).

## P1: World is real on the backend; the screens aren't wired

The backend and SDK are done and were tested against live World (OIDC device flow plus IDKit v4 proof verification). The live box runs `WORLD_MOCK=1` until these screens ship. After that, we flip it to `0`.

1. **Agent Pass (approve screen):** in `lib/mra-browser.ts`, configure `worldDeviceAgentPass({ api, manageToken, show })`. Its `show(prompt)` should render a **QR code of `verificationUriComplete`, the `userCode` in large type, and a countdown from `expiresAt`** on `app/merchant/(focus)/agent/approve/screen.tsx` while the step is `awaiting_agent_pass`. Route `expired` to the denied screen with an "expired, try again" variant. The existing code only maps `active` vs everything else.
2. **Recovery with World ID (new screens):** add `pnpm add @worldcoin/idkit` and configure `idkitV4({ api, run })` (snippet in the handoff doc).
   - Settings → "Back up with World ID": `recovery.backup(passphrase)`. Require at least 8 characters and warn that it can't be reset.
   - New device → "Restore with World ID": `recovery.restore(passphrase)`.
   - Today nothing in the app calls `m.recovery.*`.
3. Build with `NEXT_PUBLIC_WORLD_MODE=real` in sepolia mode. Mock remains the default for e2e.

## P1: simulator page (new route)

There's a judge-facing simulator: pick a shop archetype and watch a real ZK proof, AI underwriting and money flows on our public devnet. The backend API is under `https://api-devnet.<host>/sim` (contract in `deploy/README.md` → Simulator, being finished now). The `feat/sim-web` branch has a reference page plus `packages/sdk/src/sim.ts`; restyle it to the current design.

- `GET /sim/archetypes`: 5 cards (honest kiosk, slow week, wash ring, defaulter, repeat borrower).
- `POST /sim/runs {archetype}` → poll `GET /sim/runs/{id}` every second. Render `steps[]` as a timeline: `kind` picks the icon, and `tx` links to `/explorer`. Render `ledger` as a live strip (vault, DripCoin price, reserve, outstanding, tier caps).
- Handle the `queued` state (show `ahead`) and the 429 response ("busy, try in a minute").

## Already wired and working on main (no change needed)

| Integration | Where |
|---|---|
| **Anon-RPC (Nox mixnet)** for every chain read, with direct fallback; browser Noir prover | `lib/mra.ts`, `lib/mra-browser.ts` |
| **Uniswap v4:** DRIP ⇄ USDC swap through the RiskHook pool, hook fee to the reserve, TWAP → Risk agent | `/dripcoin/trade` (`m.lender.junior.swap`), `/risk` (`m.lender.riskPanel`) |
| Burner wallet + faucet, Business Pass proof, Standing Pass claim, agent log, risk panel, world-view, explorer | the merchant and lend screens |

After the redeploy the new contract addresses ship inside `@repo/sdk`, so nothing changes in the frontend for addresses.

## Positioning line for the landing page (optional)

Stripe's Tempo launched "Credit on Tempo" on 5 Nov with the same "pay only for what you use" idea for businesses. Our differentiators are worth one line each on the landing page:

- **private:** a ZK pass, so lenders never see who you are
- **built for tiny shops** ($50–$300)
- **an agent draws for you**
- **risk priced in public** on Uniswap
