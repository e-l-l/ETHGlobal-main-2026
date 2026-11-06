"""End-to-end run against the local anvil devnet (scripts/devnet.sh + scripts/seed_demo.py first).

Real chain, real indexer/features/red lines/clamp/EIP-712 signer/relayer/keeper, real Business Pass proofs
(circuits/business_pass via nargo + bb). The judge is ClaudeJudge with a scripted FakeLLM, so no API key or spend
is needed; pass --live to use the real Claude model instead.

  2. chai-stall: devnet issuer attests a Business Pass -> relayer issue() -> offer (passNullifier, band) ->
     merchant proves -> relayer drawFirst
  3. mandate-stall: shop owner consent + AgentPassAttestation + Business Pass proof -> relayer registerMandate;
     the managed agent signs MandateDraw -> relayer drawByMandate (offer signed directly by the offer signer:
     a brand-new shop has no sales history for the pipeline to underwrite)

    set -a; . ./.env.devnet; set +a; uv run python scripts/e2e_local.py [--live]
"""

from __future__ import annotations

import secrets
import sys
import tempfile
from pathlib import Path

from eth_account import Account
from web3 import Web3

from mra_agents.chain import Web3ChainReader, Web3ChainWriter, load_abi
from mra_agents.config import Settings
from mra_agents.decisions import DecisionStore
from mra_agents.indexer import Indexer
from mra_agents.keeper import Keeper
from mra_agents.llm import FakeLLM
from mra_agents.llm_bedrock import make_llm
from mra_agents.models import CriticVerdict, OfferDraft
from mra_agents.pipeline import UnderwritingPipeline
from mra_agents.relayer import Relayer
from mra_agents.signer import EIP712Signer
from mra_agents import bizpass, zk
from mra_agents.merchant_agents import sign_mandate_draw
from mra_agents.models import Offer
from mra_agents.world import Attester, Limits as WorldLimits
from mra_agents.underwriter import ClaudeJudge

SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617
USDC_ABI = [{"name": "balanceOf", "type": "function", "stateMutability": "view",
             "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]}]


def shop(label: str) -> str:
    return "0x" + Web3.keccak(text=label).hex().removeprefix("0x")


def main() -> int:
    live = "--live" in sys.argv
    s = Settings()
    tmp = Path(tempfile.mkdtemp())
    reader, writer = Web3ChainReader(s), Web3ChainWriter(s)
    w3 = reader.w3
    chain_now = lambda: w3.eth.get_block("latest")["timestamp"]  # noqa: E731 - devnet clock was warped by seeding

    llm = make_llm(s) if live else FakeLLM()
    judge = ClaudeJudge(llm, s)
    store = DecisionStore(tmp / "decisions.sqlite")
    pipeline = UnderwritingPipeline(reader=reader, indexer=Indexer(reader, tmp / "idx.sqlite"), judge=judge,
                                    signer=EIP712Signer(s.offer_signer_private_key.get_secret_value()),
                                    store=store, settings=s, now=chain_now)
    ok = True
    relayer = Relayer(writer, s, now=chain_now)
    offer_signer = s.offer_signer_private_key.get_secret_value()
    registry = w3.eth.contract(address=writer.dep["BusinessPassRegistry"], abi=load_abi("BusinessPassRegistry"))

    def issue_pass(secret_: int) -> None:
        bizpass.devnet_issue(issuer_key=s.issuer_private_key.get_secret_value(), chain_id=reader.chain_id,
                             registry=registry.address, secret=secret_, country=32, revenue_band=2, age_ok=1,
                             now=chain_now(), submit_issue=relayer.issue_business_pass)

    def prove_first(rcpt: str, offer_id: bytes, secret_: int, min_band: int, context: int | None = None):
        leaves = bizpass.tree_leaves(registry, writer.dep.deploy_block)
        inputs = bizpass.prover_inputs(
            secret=secret_, country=32, revenue_band=2, age_ok=1, leaves=leaves,
            leaf_index=leaves.index(zk.business_leaf(secret_, 32, 2, 1)),
            secret_next=secrets.randbelow(SNARK_FIELD - 1) + 1, min_band=min_band,
            context=zk.offer_context(rcpt, offer_id) if context is None else context)
        return bizpass.prove("E2E", inputs), inputs.root, inputs.commitment_next

    secret = secrets.randbelow(SNARK_FIELD - 1) + 1  # never leaves the "phone"
    issue_pass(secret)
    print(f"[issuer] Business Pass issued; tree has {len(bizpass.tree_leaves(registry, writer.dep.deploy_block))} leaves")

    # 1. Wash trader: red lines must reject before any model call.
    calls_before = len(getattr(llm, "calls", []))
    d = pipeline.request_offer(shop("wash-trader"), 0, Account.create().address, secrets.randbelow(2**200) + 1)
    print(f"[wash-trader] result={d.result} redlines={d.redline_hits}")
    ok &= d.result == "rejected" and bool(d.redline_hits)
    if not live:
        ok &= len(llm.calls) == calls_before  # LLM untouched

    # 2. Chai stall: passes red lines; judge approves; clamp + sign; relayer draws onchain.
    if not live:
        llm.push(OfferDraft(decision="offer", amount=100_000_000, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=800,
                            est_days_slow=40, est_days_normal=25, est_days_busy=15,
                            reasons_en=["Steady daily sales from many customers"],
                            reasons_es=["Ventas diarias estables de muchos clientes"]),
                 CriticVerdict(verdict="approve", flags=[], summary_en="Looks organic.", summary_es="Parece orgánico."))
    recipient = Account.create().address  # fresh payout address (privacy rule)
    d = pipeline.request_offer(shop("chai-stall"), 0, recipient, zk.business_nullifier(secret), 1)
    print(f"[chai-stall] result={d.result} redlines={d.redline_hits} clamp={d.clamp_changes}")
    if d.draft:
        print(f"             draft: ${d.draft.amount / 1e6:.0f}, holdback {d.draft.holdback_bps / 100:.0f}%, "
              f"reasons={d.draft.reasons_en}")
    if d.result != "offered":
        print("FAIL: chai-stall should be offered")
        return 1
    usdc = reader.usdc
    o = d.signed_offer.offer
    proof, root, nxt = prove_first(o.recipient, bytes.fromhex(o.offer_id[2:]), secret, min_band=1)
    tx = relayer.draw_first(d.signed_offer, "0x" + proof.hex(), root, nxt)
    got = usdc.functions.balanceOf(recipient).call()
    print(f"[chai-stall] drawFirst (real Business Pass proof) tx={tx[:12]}…  recipient USDC={got / 1e6:.2f}")
    ok &= got == d.signed_offer.offer.amount

    # 2b. Managed agent: register a tier-0 mandate with a second Business Pass, then an automatic draw.
    ok &= mandate_flow(s, reader, relayer, w3, chain_now, issue_pass, prove_first, offer_signer)

    # 3. Keeper: ghost-shop stopped selling; warp past the default window, keeper writes it off.
    w3.provider.make_request("evm_increaseTime", [31 * 86400])
    w3.provider.make_request("evm_mine", [])
    keeper = Keeper(reader, writer, s, now=chain_now)
    res = keeper.tick()
    written = [a for a in reader.advances() if a.status.value == "written_off"]
    print(f"[keeper] txs={len(res)} errors={getattr(res, 'errors', [])} written_off={len(written)}")
    ok &= len(written) >= 1

    print("E2E", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def mandate_flow(s, reader, relayer, w3, chain_now, issue_pass, prove_first, offer_signer) -> bool:
    book = reader.book
    owner, agent, rcpt = Account.create(), Account.create(), Account.create().address
    shop_id = Web3.keccak(text=f"mandate-stall-{secrets.token_hex(4)}")
    # the shop owner registers the shop from their own pseudonymous key (funded on the devnet)
    w3.provider.make_request("anvil_setBalance", [owner.address, hex(10**18)])
    tx = book.functions.registerShop(shop_id, rcpt).build_transaction(
        {"from": owner.address, "nonce": w3.eth.get_transaction_count(owner.address), "chainId": reader.chain_id})
    w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(owner.sign_transaction(tx).raw_transaction))

    now = chain_now()
    secret = secrets.randbelow(SNARK_FIELD - 1) + 1
    issue_pass(secret)
    lim = bizpass.Limits(50_000_000, 100_000_000, 30 * 86400, now + 90 * 86400)
    req = bizpass.MandateRequest(shop_id=bytes(shop_id), agent_key=agent.address, recipient=rcpt, limits=lim,
                                 tier=0, band=1)
    proof, root, nxt = prove_first("", b"", secret, 1, context=bizpass.mandate_context(req))
    owner_sig = "0x" + owner.sign_message(bizpass.mandate_message(req, reader.chain_id, book.address)).signature.hex()
    nonce = secrets.randbelow(2**64)
    att = Attester(s.attester_private_key.get_secret_value(), reader.chain_id, book.address).sign(
        agent.address, WorldLimits(max_per_draw=lim.max_per_draw, max_per_period=lim.max_per_period,
                                   period=lim.period, expiry=lim.expiry), nonce, now + 3600)
    relayer.register_mandate(req.as_tuple(), "0x" + proof.hex(), root, zk.business_nullifier(secret), nxt, nonce,
                             now + 3600, att["signature"], owner_sig)
    mandate_id = book.functions.nextMandateId().call() - 1
    m = book.functions.getMandate(mandate_id).call()
    print(f"[mandate] registered id={mandate_id} agent={m[1][:10]}… (real Business Pass proof, AgentPass attested)")

    offer = Offer(offer_id="0x" + secrets.token_hex(32), shop_id="0x" + bytes(shop_id).hex(), recipient=rcpt,
                  amount=50_000_000, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=800, tier=0, pass_nullifier=0,
                  min_revenue_band=1, expires_at=now + 900)
    so = EIP712Signer(offer_signer).sign_offer(offer, chain_id=reader.chain_id, verifying_contract=book.address)
    agent_sig = sign_mandate_draw(agent.key.hex(), offer.offer_id, mandate_id, scheme="eip712",
                                  chain_id=reader.chain_id, verifying_contract=book.address)
    relayer.draw_by_mandate(so, mandate_id, agent_sig)
    got = reader.usdc.functions.balanceOf(rcpt).call()
    print(f"[mandate] drawByMandate: nobody tapped; recipient USDC={got / 1e6:.2f}")
    return got == 50_000_000


if __name__ == "__main__":
    raise SystemExit(main())
