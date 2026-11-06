# Anon-RPC

For the EF Best Use of Anon-RPC track.

**Status: on by default on the hosted app.** Browser reads go through Anon-RPC over Nox (`NEXT_PUBLIC_ANON_RPC=1`). Backend reads use Tenderly directly, and writes are public transactions. A Chrome measurement routed 26/26 SDK reads with zero direct reads on Nox and Nym; see [SDK measurement](../../packages/sdk/README.md#anon-rpc-reposdkbrowseranon). This is not a measurement of every service or every session.

## Why ZK needs network privacy

Our credentials (Business Pass, Standing Pass) are leaves in onchain Poseidon2 Merkle trees. A ZK proof hides *which* leaf you own. But to build the proof, the app needs your Merkle path.

If the app asks an RPC provider for "leaf #417" or "the events around my commitment", the provider can link IP to leaf to shop. That undoes the ZK. The same leak comes from checking your own balance, advance status or shop sales.

So:

| Traffic | Route | Without it, who links you |
|---|---|---|
| All app reads: tree events, balances, advance status, shop sales | Anon-RPC (`@anon-rpc/browser-harness`, an anonymised `fetch`) | The RPC provider: IP, shop, credential |
| Merkle path for a proof | **Download the whole tree** (all `LeafInserted` events) through Anon-RPC and compute the path locally | Asking for one leaf reveals the leaf |
| Writes (draws, claims) | Our relayer for configured draws and claims. Anon-RPC is reads only; the relayer and public transaction metadata remain trust boundaries. | The merchant's wallet would link their advances |
| Backend reads (indexer, features) | Direct RPC in the current Sepolia profile | Backend provider sees those reads |

Source: [`docs/privacy-architecture.md`](../../docs/privacy-architecture.md) section 4.

## What exists in the code

- **App:**
  - `NEXT_PUBLIC_ANON_RPC` (default on for Sepolia), `NEXT_PUBLIC_ANON_NETWORK` (default `nox`), `NEXT_PUBLIC_ANON_RPC_STRICT` (default off: fall back to direct reads if Anon-RPC is unavailable) ([`apps/web/src/lib/mra.ts`](../../apps/web/src/lib/mra.ts))
  - `NEXT_PUBLIC_ANON_RPC_SPECIFIER`, `NEXT_PUBLIC_ANON_RPC_BOOTSTRAP_URL`, `NEXT_PUBLIC_ANON_RPC_CONFIG`

  All of these are in [`deploy/env/compose.env.example`](../../deploy/env/compose.env.example). These values are inlined at build time.
- **Backend:** a single `RPC_URL` setting. Its default comment says "use the Anon-RPC endpoint in production" (`agents/src/mra_agents/config.py`). **The current Sepolia profile uses a Tenderly gateway** (`agents/scripts/sepolia.env`), so backend reads do **not** go through Anon-RPC today.
- The tree mirror must be fixed depth 16, zero-padded, using Poseidon2 from `@aztec/bb.js` ([`docs/architecture.md`](../../docs/architecture.md)).

## Scope and remaining work

The app downloads whole trees and builds paths locally. The measured 26 reads do not include every service interaction; backend reads use the configured RPC provider. Check routed/direct counters in the exact demo session. Anon-RPC does not hide public transactions, issuer or relayer interactions.

## Fallback

If Anon-RPC is unavailable on stage, the app falls back to direct reads (strict mode is off by default), or you can build with `NEXT_PUBLIC_ANON_RPC=0`. Either way, **say so out loud**. Don't claim privacy that isn't running.

## Intentional tradeoffs

These are deliberate choices for the hackathon build, not oversights.

- **Backend reads go to Tenderly directly.** Anon-RPC protects a *person*: it hides which merchant or lender is reading which state, and from where. The backend services (keeper, relayer, Risk agent, issuer) are ours and run on our server; routing their reads through a mixnet would hide nothing from us, and would only hide our server's IP from Tenderly while they read public contract state. It would also add mixnet latency and a failure mode to timed jobs such as the keeper and the Risk agent. So the Sepolia profile points `RPC_URL` at a Tenderly gateway (`agents/scripts/sepolia.env`). Tenderly can see the backend's reads; it never sees a user's browser.
- **Strict mode is off by default.** With `NEXT_PUBLIC_ANON_RPC_STRICT` unset, a mixnet that fails to come up falls back to direct reads, so the demo keeps working instead of showing a blank screen. That fallback is never silent: the **"Private reads" chip** in the app header shows the live state and the routed vs direct read counts for the current session (`PrivateReadsChip` in [`apps/web/src/screens/lend/shell.tsx`](../../apps/web/src/screens/lend/shell.tsx)), or "Private reads: off (direct RPC)" after a fallback. Set `NEXT_PUBLIC_ANON_RPC_STRICT=1` to fail closed instead.
- **Writes are public transactions.** Anon-RPC covers reads only. Every `pay`, `repay`, draw, swap and deposit is an ordinary Sepolia transaction, visible onchain with its sender. The privacy for writes comes from the design (shop pseudonyms, ZK passes, no identity onchain), not from the network layer.
