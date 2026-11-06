# Where AI was used

ETHGlobal asks every project to list its AI tool use. This is ours.

## Building the project

- **Code was largely written with Claude Code**, which orchestrated Claude and Codex subagents. Humans directed the work, set the design and reviewed the output.
- How it was split up:
  - The contract spec gives each file a named agent owner, for example `claude-tree` (StandingPassTree), `codex-policy` (Policy), `claude-hook` (RiskHook) and `codex-harness` (mocks, test harness, invariants). See the Ownership table in [`contracts/SPEC.md`](../../contracts/SPEC.md).
  - Each subagent worked against a frozen shared spec and its own files, and had to report any needed spec change instead of making it. The agents service also has a spec ([`agents/SPEC.md`](../../agents/SPEC.md)).
  - Agent build reports were kept during the build and removed before merging to main (commit `baddcc5`).
- **What humans did:**
  - chose the product, partners and design pivots (for example: World only at human moments, business verification by zkTLS, the managed agent delegated once)
  - reviewed specs and code
  - ran deployments and handled keys and accounts (AWS, Reclaim, World, Sepolia funds)
- **Docs**, including these submission docs, were drafted with Claude Code from the repo's own docs and edited by the team.
- **Research** (market data, finalist analysis) was AI-assisted. Sources are listed in [`docs/research.md`](../../docs/research.md).
- **TODO (human):** name the people, and note any part written mainly by hand.
- **TODO (human):** list any design or asset AI tools used for the UI (`apps/web`).

## AI inside the product

The agents propose and the contract decides. No model output moves money directly.

| Role | Model (Amazon Bedrock, `ap-south-1`) | What it does |
|---|---|---|
| Underwriter | Mistral Large 3 | Proposes the offer size, holdback, fee and days to repay. It writes plain-language reasons. |
| Critic | Kimi K2.5 | Independent check for wash trading and sales anomalies. A different model family, and it never sees the Underwriter's reasoning. |
| Risk | Qwen3 235B | Proposes lower limits when code-computed triggers fire. If the model fails, a deterministic −25% fallback applies. |

- Output is structured. It is validated against a schema, then clamped by code against live onchain limits, then EIP-712 signed. The contract checks it again.
- Models see numbers and HMAC-hashed payers only, with no personal data ([`docs/agents.md`](../../docs/agents.md)).
- We tested 7 models on an obvious wash trader. GPT-OSS 120B approved it, so we dropped it. MiniMax M2.5 never answered, so we dropped it too.
- Claude (`claude-opus-5-5`) is a drop-in through `LLM_PROVIDER=anthropic`. Our AWS account couldn't use Anthropic models on Bedrock. Offline tests use a fake model.
