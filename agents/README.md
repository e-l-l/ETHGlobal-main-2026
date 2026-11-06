# Agents service (Python)

Underwriting (features, red lines, Claude Underwriter + Critic, clamp, EIP-712 signer), relayer, Risk agent and keeper. The spec is in [SPEC.md](SPEC.md) and the design in [../docs/agents.md](../docs/agents.md).

```bash
uv sync
uv run pytest -q                                   # 554 offline tests (fake model, fake chain)

# Local devnet: anvil, full deploy (real ZK verifier, Uniswap v4 pool + hook), 3 seeded merchants
anvil --chain-id 31337 &                           # or let devnet.sh start it
bash scripts/devnet.sh                             # writes deployments/local.json + .env.devnet (public anvil keys)
uv run python scripts/seed_demo.py                 # chai-stall (honest), wash-trader, ghost-shop
set -a; . ./.env.devnet; set +a
uv run pytest -q -o addopts='' -m anvil            # live chain tests
uv run python scripts/e2e_local.py                 # wash rejected → chai offered → drawFirst onchain → keeper write-off
uv run python scripts/e2e_local.py --live          # same, with real Claude (needs ANTHROPIC_API_KEY; costs a few cents)
uv run uvicorn mra_agents.api:app --port 8787      # API: /offers /relay/* /shops/{id}/insights /risk/status /health
```

Re-running `seed_demo.py` needs a fresh deployment: `rm deployments/local.json && bash scripts/devnet.sh`. The e2e script moves the chain clock forward 31 days.

## Sepolia

The contracts are live on Sepolia (addresses: `deployments/sepolia.json`, see "Live on Sepolia" in
`contracts/README.md`). `scripts/sepolia.env` is the network profile with no secrets in it: `RPC_URL` (Tenderly
gateway), `CHAIN_ID=11155111`, `DEPLOYMENTS_FILE`, `DB_PATH`. Keys still come from `.env`.

```bash
set -a; . ./.env; . scripts/sepolia.env; set +a
uv run python scripts/smoke_sepolia.py           # read-only smoke test; FakeLLM judges
uv run python scripts/smoke_sepolia.py --live    # same, with the real judge models (a few cents)
```

The smoke test **sends no transactions and spends no gas**: it uses only `eth_call`/`eth_getLogs`. It checks that
the contracts have code and are wired together, that the onchain roles match our keys and the relayer and risk
manager have gas, and that our EIP-712 digests equal `AdvanceBook.hashOffer` and
`BusinessPassRegistry.hashBusinessVerified`. It also syncs the indexer, computes the risk signals, and signs a
cold-start offer offchain whose signature must recover to the onchain `offerSigner`. It ends with `SMOKE PASS` or
`SMOKE FAIL`.

### Seeding demo state on Sepolia

`scripts/seed_sepolia.py` builds a small demo state in real time (no time warps): shops `chai-stall`,
`kiosco-don-pepe` and `wash-trader`, each with its own fresh owner/payout key; 6 honest payers that pay the two honest shops 8
varied-cents sales each; and 2 wash-trader payers whose gas ETH **and** USDC come from the shop's own payout
address, so the circular-funding red line fires. `--with-business-pass` also issues a Business Pass for
chai-stall (Python `Issuer` over a **mock** zkTLS claim → relayer `BusinessPassRegistry.issue`) for the
cold-start demo. The demo uses a mock attestor; the real Reclaim path is built and tested.

```bash
set -a; . ./.env; . scripts/sepolia.env; set +a
uv run python scripts/seed_sepolia.py --with-business-pass             # DRY RUN: plan + eth_estimateGas, sends nothing
uv run python scripts/seed_sepolia.py --with-business-pass --execute   # sends (demo day)
```

The default is a dry run. It prints every planned step with its live gas estimate, the totals, the live gas price, the ETH cost
and which key pays. `pay` steps are estimated with `eth_estimateGas` state overrides, so the dry run is accurate
before any shop exists. Only the **relayer** key spends ETH: it funds each demo wallet with exactly its estimated
gas limit × the fee cap (`--fee-cap-gwei`, default 0.25), and the run aborts if the total would exceed `--max-eth`
(default 0.005). Progress, the generated keys and the Business Pass secret are kept only in `data/sepolia_seed.json`
(mode 0600, git-ignored), and are never printed. Re-running resumes: completed steps are skipped, and a sent but
unconfirmed tx is checked before anything is re-sent. The file belongs to one AdvanceBook. After a redeploy,
move it aside.
