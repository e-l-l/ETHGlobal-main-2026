# Agents service spec (v2: Business Pass + mandates): shared by everyone building `agents/`

Python service that underwrites merchant advances, signs offers, relays draws, and runs the Risk agent and keeper. Read this, `../docs/agents.md` and `../contracts/SPEC.md` (the onchain rules) before writing code.

## Principle: agents judge, code decides

```
onchain events → [1] FEATURES (pure Python) → [2] JUDGE (Claude, structured output) → [3] CLAMP (pure Python) → [4] SIGN / SEND
```

- Never let a model do arithmetic or move funds. Models return **typed Pydantic objects** only.
- The clamp re-reads onchain limits and forces every number into bounds. The contract checks a third time.
- **Hard red lines are code, not prompts.** They run before any model call.
- Untrusted text (shop names, metadata) only reaches a model inside a clearly delimited data field, never as instructions.
- **Payer addresses are HMAC-hashed** (`PAYER_HASH_KEY`) before any model sees them.

No LangChain or LangGraph. Plain Python with the Anthropic SDK. The judging step sits behind the `Judge` protocol, so another backend (for example TypeSafe Jev) can be added later.

## Layout and ownership

Only edit files you own. If you need a change in a shared file (`models.py`, `interfaces.py`, `config.py`, this spec), stop and say so in your final report.

| Path | Owner |
|---|---|
| `pyproject.toml`, `src/mra_agents/{config,models,interfaces}.py`, `SPEC.md`, `abi/` | **lead (frozen)** |
| `src/mra_agents/chain.py` (Web3ChainReader/Writer), `indexer.py`, `features.py`, `tests/test_features.py`, `tests/test_indexer.py` | **claude-data** |
| `src/mra_agents/llm.py`, `underwriter.py`, `critic.py`, `redlines.py`, `prompts/`, `tests/test_judges.py` | **claude-judges** |
| `src/mra_agents/risk.py`, `keeper.py`, `relayer.py`, `tests/test_risk.py`, `tests/test_relayer.py` | **claude-ops** |
| `src/mra_agents/signer.py`, `clamp.py`, `decisions.py`, `pipeline.py`, `tests/test_signer.py`, `tests/test_clamp.py`, `tests/test_pipeline.py` | **codex-core** |
| `src/mra_agents/api.py`, `tests/test_api.py` | **codex-api** |
| `scripts/devnet.sh`, `scripts/seed_demo.py`, `../contracts/script/DeployLocal.s.sol`, `tests/test_devnet.py` | **codex-devnet** |

## Toolchain

- Python 3.12 via `uv` (`uv sync`, `uv run pytest`). Default pytest **skips** `-m anvil` and `-m live_llm`.
- Installed: **anthropic 2.5.0**, **web3 8.0.0**, **pydantic 2.14**, eth-account, fastapi. These are new majors, so check the installed API (`help(...)`, the source in `.venv`) rather than relying on memory.
- **Claude API:**
  - **model:** `claude-opus-5-5`, which can't disable thinking. Control depth with `output_config={"effort": ...}`.
  - **Structured output:** `client.messages.parse(..., output_format=PydanticModel)`, then read `response.parsed_output`.
  - **Effort:** Underwriter `medium`, Critic `high`, Risk `low`.
  - **Caching:** cache the stable system prompt with `cache_control`.
  - **Safety refusals:** enable the server-side refusal fallback (beta `server-side-fallback-2026-07-01`, `fallbacks="default"`). Always check `stop_reason` before reading output.
  - **No forced `tool_choice`** (400 on this model).
- **No network calls in default tests.** Use `FakeLLM` and in-memory fakes of `ChainReader` / `ChainWriter`.
- **Secrets:** read only from env or `.env` through `config.Settings`. Never log keys, never print them, never hardcode them.

## Shared contracts (in code: `models.py`, `interfaces.py`, `config.py`)

- `ShopFeatures`: the only input to judges about a shop (numbers plus hashed payers).
- `OfferDraft`: the Underwriter's output. `CriticVerdict`: the Critic's output. `RiskProposal`: the Risk agent's output.
- `Offer`: mirrors the Solidity struct exactly. `SignedOffer`: an offer plus its 65-byte signature.
- `ChainLimits`: `tierCap[4]`, `maxExposure` and floors, read live.
- `Decision`: an audit record (input hash, model, outputs, clamp changes, final result).

### EIP-712 (must match `AdvanceBook.hashOffer`)

- Domain: name `"AdvanceBook"`, version `"1"`, `chainId`, `verifyingContract`.
- Type (v2): `Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 factorBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)`
- **Reference vectors**, produced by `AdvanceBook.hashOffer` (contracts/test/Eip712Vectors.t.sol) with chainId `31337` and verifyingContract `0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f`:
  - Offer(offerId=`0x…0abc` (bytes32 of 0xabc), shopId=`keccak("chai-stall")`=`0xd2ad3e1920c292f23975ba7355ac9c6e2cfa409b3e12ff1537d187e9fd77ffa4`, recipient=`0x000000000000000000000000000000000000bEEF`, amount=`100000000`, factorBps=`11500`, holdbackBps=`1000`, tier=`1`, passNullifier=`0`, minRevenueBand=`0`, expiresAt=`1800000000`)
    → digest `0xd20c279d2f60369b3c4fa4a5758158ed05624c8a8886e43eb3ef1b28bb7a74f2`
  - The same offer with tier=`0`, passNullifier=`42`, minRevenueBand=`2` → digest `0x33cd4172f8d0782a912874cb845a5b27c2620197f623b671ec1dcaf9c5692dcd`
- Mandate types (same domain): `Limits` hash, `AgentPassAttestation`, `Mandate` (shop owner), `MandateDraw(bytes32 offerId,uint256 mandateId)`, `RevokeMandate`. Vectors in contracts/SPEC.md "v2".
- Business Pass issuer: domain ("BusinessPassRegistry", "1", chainId, registry), `BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)`.
- Signature encoding: `r || s || v`, 65 bytes, `v` in {27, 28}. This is what OpenZeppelin `ECDSA.recover` accepts.

## Onchain rules the clamp must mirror (from contracts/SPEC.md)

- **Allowed amounts:** {50e6, 100e6, 250e6, 500e6}, in USDC with 6 decimals.
- **Ranges:** `factorBps` in [11000, 15000], `holdbackBps` in [500, 2000], tier 0..3.
- **Caps:** `amount <= tierCap[tier]` and `exposure + amount <= maxExposure`.
- **tier == 0** manual (`drawFirst`): `passNullifier != 0` (the Business Pass first-advance nullifier the app sends) and `minRevenueBand` = the band the proof will show. **Mandate draws** (`drawByMandate`): `passNullifier == 0` (spent at `registerMandate`), band ≤ the mandate's. **tier > 0**: both 0.
- **Anchor rule (ours, stricter than the contract):** the offer must be repayable in ≤ 60 days at the shop's normal 30-day pace: `totalOwed / (avg_daily_revenue_30d * holdback) <= 60`. Otherwise step down to the next allowed size, or reject.

## Red lines (code, run before the judges)

Any one of these means reject, with the reason code shown to the merchant:
- `unique_payers_30d < 5`
- `top_payer_share_30d > 0.40`
- `funded_by_shop_share > 0.20`: the share of revenue from payers whose USDC came from the shop's payout address or from one common funder within 7 days
- `days_active_30d < 7`
- `spike_ratio > 4.0`: revenue in the last 3 days ÷ the 3-day average over the previous 27 days

## Risk triggers (code); the model only writes the proposal and the rationale

- the junior TWAP over 1 hour falls more than 10% below the junior TWAP over 24 hours
- write-offs in the last 7 days ≥ 2
- active advances whose median repayment pace is below 0.6× of estimate
- exposure use > 80% of `maxExposure`

The proposal may only **lower** caps and must stay at or above the floors. Code enforces this, then calls `lowerLimits`.

## Local dev

- `scripts/devnet.sh` starts anvil, deploys everything with `DeployLocal.s.sol` (including a fresh v4 PoolManager and the real `HonkVerifier`), and writes `deployments/local.json` (addresses + chainId).
- `scripts/seed_demo.py` creates the shops:
  - **chai-stall:** honest, about 200 sales from about 80 payers, with a daily rhythm
  - **wash-trader:** 4 payers funded from its own payout address, round amounts, a spike before applying
  - **ghost-shop:** draws an advance, then stops selling
- Keys on devnet come from anvil's default mnemonic. Nothing is real.

## Cross-module function signatures (frozen; implement exactly, inject callables in `pipeline.py` for testability)

```python
# features.py  (claude-data)
def build_features(shop_id: str, sales: list[SaleEvent], funders: dict[str, list[str]],
                   payout: str | None, now: int, hash_key: bytes, shop_label: str | None = None) -> ShopFeatures: ...

# indexer.py  (claude-data): incremental, idempotent (unique on tx_hash+log_index)
class Indexer:
    def __init__(self, reader: ChainReader, db_path: Path): ...
    def sync(self) -> int: ...                       # returns number of new sales stored
    def sales_for(self, shop_id: str, since_ts: int) -> list[SaleEvent]: ...

# chain.py  (claude-data): Web3ChainReader(settings) implements ChainReader; Web3ChainWriter(settings) implements ChainWriter
#   addresses come from settings.deployments_file (JSON written by scripts/devnet.sh, see codex-devnet):
#   {"chainId": 31337, "AdvanceBook": "0x..", "SeniorVault": "0x..", "JuniorVault": "0x..", "RiskHook": "0x..",
#    "USDC": "0x..", "PoolManager": "0x..", "HonkVerifier": "0x..", "poolKey": {...}, "deployBlock": 0}

# redlines.py  (claude-judges)
def check(features: ShopFeatures) -> list[str]: ...   # reason codes; empty = pass

# underwriter.py / critic.py / llm.py  (claude-judges)
class AnthropicLLM: ...                               # implements LLM; FakeLLM in llm.py for tests
class ClaudeJudge: ...                                # implements Judge, takes an LLM

# clamp.py  (codex-core)
def clamp_offer(draft: OfferDraft, features: ShopFeatures, tier: int, limits: ChainLimits,
                max_days: int) -> tuple[OfferDraft | None, list[str]]: ...   # (None, reasons) = cannot offer

# signer.py  (codex-core): EIP712Signer(private_key) implements Signer; also offer_digest(offer, chain_id, verifying_contract) -> str
# decisions.py (codex-core): DecisionStore(db_path).save(Decision) / .get(id) / .latest_for_shop(shop_id)
# pipeline.py  (codex-core)
class UnderwritingPipeline:
    def __init__(self, *, reader: ChainReader, indexer, judge: Judge, signer: Signer, store,
                 settings: Settings, build_features=features.build_features, redline_check=redlines.check,
                 clamp=clamp.clamp_offer, now=time.time): ...
    def request_offer(self, shop_id: str, tier: int, recipient: str, pass_nullifier: int = 0,
                      min_revenue_band: int = 0) -> Decision: ...

# risk.py / keeper.py / relayer.py  (claude-ops)
def risk_signals(reader: ChainReader, now: int) -> dict: ...            # triggers per SPEC "Risk triggers"
class RiskAgent:  def tick(self) -> dict: ...                            # signals -> (if triggered) judge.propose_risk -> enforce down-only/floors -> writer.send("lowerLimits", ..., signer="risk_manager")
class Keeper:     def tick(self) -> list[str]: ...                       # writeOff eligible advances, RiskHook.flush if balance > 0
class Relayer:    def draw_first(so, proof, root, commitment_next) / draw_with_pass(...) / draw_by_mandate(so, mandate_id, agent_sig)
                  / register_mandate(...) / issue_business_pass(...) / claim(advance_id) -> str: ...  # allow-listed fns only; per-shop rate limit

# api.py  (codex-api): FastAPI `app`, built by create_app(pipeline, relayer, reader, store, risk) for DI
#   POST /offers  {shop_id, tier, recipient, pass_nullifier?, min_revenue_band?}  -> Decision (SignedOffer if offered)
#   POST /relay/draw-first {signed_offer, proof, root, commitment_next} ; POST /relay/draw-with-pass {signed_offer, proof, root, nullifier, commitment_next}
#   POST /relay/register-mandate {shop_id, agent_key, recipient, limits{max_per_draw,max_per_period,period,expiry}, tier, band,
#                                 proof, root, nullifier, commitment_next, attestation_nonce, attestation_expiry, attestation_signature, owner_signature}
#   POST /relay/claim/{advance_id} ; GET /shops/{shop_id}/insights ; GET /decisions/{id} ; GET /risk/status ; GET /health
```


## v2 modules (Business Pass, mandates)

- `zk.py`: pure-Python Poseidon2 (constants from the deployed Yul contract) + all credential formulas + Merkle paths (whole-tree download). Matches Noir and Solidity (tests/test_zk.py).
- `issuer.py`: offchain Business Pass issuer. Verifies zkTLS (injected `verify_zktls`), recomputes the leaf from `h` + proven attributes, `businessNullifier = HMAC-SHA256(BUSINESS_PEPPER, accountId)` (account id discarded), signs `BusinessVerified` with `ISSUER_PRIVATE_KEY`. **Not exposed over HTTP yet** (needs the Reclaim provider).
- `bizpass.py`: mandate hashing/context, `Mandate` typed data for the shop owner, Prover.toml inputs, local proving (`circuits/business_pass/build.sh` with `PROVER=<name>`), devnet issuance helper.
- `chain.py` allow-list adds `drawByMandate`, `registerMandate`, `revokeMandate` (AdvanceBook) and `issue` (BusinessPassRegistry), relayer key only.
- Devnet: `scripts/devnet.sh` deploys both verifiers + the registry (issuer = anvil #4, attester = anvil #5) and writes `ISSUER_PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY`, `BUSINESS_PEPPER`, `DEPLOYMENTS_FILE` into `.env.devnet`. `MANIFEST=… ENV_OUT=… RPC_URL=…:8546` runs a second devnet without touching the shared one.
