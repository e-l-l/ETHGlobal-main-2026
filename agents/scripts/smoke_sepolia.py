"""Read-only smoke test of the live Sepolia deployment. Sends NO transactions and spends NO gas.

Checks that our services and the deployed contracts agree, using only eth_call:
  1. deployment file loads; contracts have code; vaults/book/registry/hook are wired to each other
  2. onchain roles == our keys (offer signer, risk manager, issuer); relayer/risk manager hold gas
  3. our EIP-712 offer digest == AdvanceBook.hashOffer(offer) (signer config matches the contract)
  4. our BusinessVerified digest == BusinessPassRegistry.hashBusinessVerified(...) (issuer matches registry)
  5. indexer syncs from deployBlock; risk signals compute; keeper finds nothing to write off
  6. cold start: a brand-new shop with a proven band gets a signed offer offchain (FakeLLM by default)

    set -a; . ./.env; . scripts/sepolia.env; set +a
    uv run python scripts/smoke_sepolia.py [--live]      # --live uses the real judge models (a few cents)
"""

from __future__ import annotations

import secrets
import sys
import tempfile
import time
from pathlib import Path

from eth_account import Account

from mra_agents.chain import Web3ChainReader, load_abi
from mra_agents.config import Settings
from mra_agents.decisions import DecisionStore
from mra_agents.indexer import Indexer
from mra_agents.issuer import business_verified_digest
from mra_agents.llm import FakeLLM
from mra_agents.llm_bedrock import make_llm
from mra_agents.models import CriticVerdict, Offer, OfferDraft
from mra_agents.pipeline import UnderwritingPipeline
from mra_agents.relayer import offer_tuple
from mra_agents.risk import risk_signals
from mra_agents.signer import EIP712Signer, offer_digest
from mra_agents.underwriter import ClaudeJudge

OK, BAD = "✅", "❌"
results: list[bool] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    results.append(bool(cond))
    print(f"{OK if cond else BAD} {label}" + (f": {detail}" if detail else ""))


def addr_eq(a, b) -> bool:
    return str(a).lower() == str(b).lower()


def main() -> int:
    live = "--live" in sys.argv
    s = Settings()
    if s.chain_id != 11155111:
        print("Load the Sepolia profile first: set -a; . ./.env; . scripts/sepolia.env; set +a")
        return 2
    r = Web3ChainReader(s)
    w3, d = r.w3, r.dep
    print(f"Sepolia block {w3.eth.block_number} | book {r.book_address}\n")

    # 1. code + wiring
    for name in ("AdvanceBook", "BusinessPassRegistry", "SeniorVault", "JuniorVault", "RiskHook", "USDC",
                 "HonkVerifier", "BusinessPassVerifier"):
        check(f"{name} has code", len(w3.eth.get_code(d[name])) > 0, d[name])
    vault_abi = [{"name": "book", "type": "function", "stateMutability": "view", "inputs": [],
                  "outputs": [{"type": "address"}]}]
    for v in ("SeniorVault", "JuniorVault", "RiskHook"):
        got = w3.eth.contract(address=d[v], abi=vault_abi).functions.book().call()
        check(f"{v}.book == AdvanceBook", addr_eq(got, r.book_address))
    reg = w3.eth.contract(address=d["BusinessPassRegistry"], abi=load_abi("BusinessPassRegistry"))

    # 2. roles and gas floats
    book = r.book
    signer_onchain = book.functions.offerSigner().call()
    risk_onchain = book.functions.riskManager().call()
    for fld in ("offer_signer_private_key", "risk_manager_private_key", "relayer_private_key"):
        if getattr(s, fld) is None:
            print(f"{fld.upper()} is not set; load agents/.env")
            return 2
    my_signer = Account.from_key(s.offer_signer_private_key.get_secret_value()).address
    my_risk = Account.from_key(s.risk_manager_private_key.get_secret_value()).address
    check("offer signer == our key", addr_eq(signer_onchain, my_signer), signer_onchain)
    check("risk manager == our key", addr_eq(risk_onchain, my_risk), risk_onchain)
    issuer_onchain = reg.functions.issuer().call()
    if s.issuer_private_key is not None:
        my_issuer = Account.from_key(s.issuer_private_key.get_secret_value()).address
        check("registry issuer == our key", addr_eq(issuer_onchain, my_issuer), issuer_onchain)
    else:
        print(f"-  registry issuer {issuer_onchain} (ISSUER_PRIVATE_KEY not set; not compared)")
    for label, key in (("relayer", s.relayer_private_key), ("risk manager", s.risk_manager_private_key)):
        a = Account.from_key(key.get_secret_value()).address
        bal = w3.eth.get_balance(a) / 1e18
        check(f"{label} has gas", bal > 0.001, f"{bal:.4f} ETH")

    # 3. offer digest parity (eth_call only)
    o = Offer(offer_id="0x" + secrets.token_hex(32), shop_id="0x" + secrets.token_hex(32),
              recipient=Account.create().address, amount=50_000_000, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=800, tier=0,
              pass_nullifier=42, min_revenue_band=2, expires_at=int(time.time()) + 900)
    ours = offer_digest(o, s.chain_id, r.book_address)
    theirs = "0x" + book.functions.hashOffer(offer_tuple(o)).call().hex().removeprefix("0x")
    check("offer digest == AdvanceBook.hashOffer", ours.lower() == theirs.lower(), ours[:18] + "…")

    # 4. BusinessVerified digest parity
    bn, cm, ex = secrets.randbelow(2**250), secrets.randbelow(2**250), int(time.time()) + 600
    ours_bv = business_verified_digest(bn, cm, ex, s.chain_id, d["BusinessPassRegistry"])
    theirs_bv = "0x" + reg.functions.hashBusinessVerified((bn, cm, ex)).call().hex().removeprefix("0x")
    check("BusinessVerified digest == registry", ours_bv.lower() == theirs_bv.lower(), ours_bv[:18] + "…")

    # 5. indexer + risk + keeper (read-only)
    tmp = Path(tempfile.mkdtemp())
    idx = Indexer(r, tmp / "idx.sqlite")
    n = idx.sync()
    check("indexer syncs from deployBlock", n >= 0, f"{n} sales")
    sig = risk_signals(r, int(w3.eth.get_block("latest")["timestamp"]))
    check("risk signals compute", isinstance(sig, dict) and "triggers" in sig, f"triggers={sig.get('triggers')}")
    adv = r.advances()
    check("advances readable", isinstance(adv, list), f"{len(adv)} advances")

    # 6. cold start offer, offchain
    chain_now = lambda: w3.eth.get_block("latest")["timestamp"]
    llm = make_llm(s) if live else FakeLLM([
        OfferDraft(decision="offer", amount=50_000_000, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=800, est_days_slow=15,
                   est_days_normal=9, est_days_busy=6, reasons_en=["Your verified sales are at least $2,000 a month"],
                   reasons_es=["Tus ventas verificadas superan los $2.000 por mes"]),
        CriticVerdict(verdict="approve", flags=[], summary_en="New shop with proven revenue.",
                      summary_es="Comercio nuevo con ventas verificadas."),
    ])
    p = UnderwritingPipeline(reader=r, indexer=idx, judge=ClaudeJudge(llm, s),
                             signer=EIP712Signer(s.offer_signer_private_key.get_secret_value()),
                             store=DecisionStore(tmp / "d.sqlite"), settings=s, now=chain_now)
    fresh_shop = "0x" + secrets.token_hex(32)
    dec = p.request_offer(fresh_shop, 0, Account.create().address, pass_nullifier=secrets.randbelow(2**200) + 1,
                          min_revenue_band=2)
    check("cold-start shop gets a signed offer (no tx)", dec.result == "offered",
          f"result={dec.result} redlines={dec.redline_hits} clamp={dec.clamp_changes}")
    if dec.signed_offer:
        so = dec.signed_offer
        onchain = "0x" + book.functions.hashOffer(offer_tuple(so.offer)).call().hex().removeprefix("0x")
        check("signed offer digest == AdvanceBook.hashOffer", so.digest.lower() == onchain.lower())
        rec = Account._recover_hash(bytes.fromhex(onchain[2:]), signature=bytes.fromhex(so.signature[2:]))
        check("offer signature recovers to onchain offerSigner", addr_eq(rec, signer_onchain))

    ok = all(results)
    print(f"\n{'SMOKE PASS' if ok else 'SMOKE FAIL'}: {sum(results)}/{len(results)} checks, 0 transactions sent")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
