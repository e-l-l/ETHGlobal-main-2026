# Anon-RPC

For the EF Best Use of Anon-RPC track.

**Status: designed, config hooks in place, not wired end to end yet. TODO before submission.**

## Why ZK needs network privacy

Our credentials (Business Pass, Standing Pass) are leaves in onchain Poseidon2 Merkle trees. A ZK proof hides *which* leaf you own. But to build the proof, the app needs your Merkle path.

If the app asks an RPC provider for "leaf #417" or "the events around my commitment", the provider can link IP to leaf to shop. That undoes the ZK. The same leak comes from checking your own balance, advance status or shop sales.

So:

| Traffic | Route | Without it, who links you |
|---|---|---|
| All app reads: tree events, balances, advance status, shop sales | Anon-RPC (`@anon-rpc/browser-harness`, an anonymised `fetch`) | The RPC provider: IP, shop, credential |
| Merkle path for a proof | **Download the whole tree** (all `LeafInserted` events) through Anon-RPC and compute the path locally | Asking for one leaf reveals the leaf |
| Writes (draws, claims) | Our relayer. Anon-RPC is reads only, so the merchant's wallet never appears. | The merchant's wallet would link their advances |
| Backend reads (indexer, features) | Anon-RPC too | |

Source: [`docs/privacy-architecture.md`](../../docs/privacy-architecture.md) section 4.

## What exists in the code

- **App:**
  - `NEXT_PUBLIC_RPC_MODE = mock | anon | plain`
  - `NEXT_PUBLIC_ANON_RPC_SPECIFIER`, `NEXT_PUBLIC_ANON_RPC_BOOTSTRAP_URL`, `NEXT_PUBLIC_ANON_RPC_CONFIG`

  All of these are in [`deploy/env/compose.env.example`](../../deploy/env/compose.env.example). These values are inlined at build time.
- **Backend:** a single `RPC_URL` setting. Its default comment says "use the Anon-RPC endpoint in production" (`agents/src/mra_agents/config.py`). **The current Sepolia profile uses a Tenderly gateway** (`agents/scripts/sepolia.env`), so backend reads do **not** go through Anon-RPC today.
- The tree mirror must be fixed depth 16, zero-padded, using Poseidon2 from `@aztec/bb.js` ([`docs/architecture.md`](../../docs/architecture.md)).

## Open questions and TODOs

- **TODO:** does Anon-RPC support Sepolia? The docs mention only mainnet. If not, we either run a Sepolia worker (a suggested build for this track) or demo the reads on a supported network.
- **TODO:** wire `@anon-rpc/browser-harness` into the app (`apps/web`) as the default transport.
- **TODO:** whole-tree download plus a local Merkle path in the app.
- **TODO:** point the backend `RPC_URL` at Anon-RPC.
- **TODO:** measure and report the **share of RPC traffic routed through Anon-RPC**. The target is 100%; we have no number yet.
- **TODO:** demo moment. Show the network panel: every read goes to the Anon-RPC transport, and none to a plain provider.

## Fallback

If Anon-RPC is unavailable on stage, set `NEXT_PUBLIC_RPC_MODE=plain` and **say so out loud**. Don't claim privacy that isn't running.
