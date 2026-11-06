#!/usr/bin/env python3
"""The DEFAULT scene, scripted for the public devnet: a default that the junior tranche absorbs.

    setup     a merchant gets a 50 USDC advance (real Business Pass proof, drawFirst) and makes a few sales
    stop      ...then stops selling (no tx: we show the last repaying sale and when writeOff unlocks)
    warp      the chain clock jumps 31 days (admin evm_increaseTime: internal network only)
    writeoff  the keeper calls writeOff: the junior vault pays the loss, senior is untouched
    sell      a junior LP panics and sells junior shares on the Uniswap v4 pool (price limit: about -15%)
    twap      one more hour passes, so the 1h TWAP catches up with the new price while the 24h TWAP lags
    risk      the Risk agent reads RiskHook.consult (1h vs 24h) + the write-offs and calls lowerLimits (down only)
    summary   before/after table

Idempotent and resumable: each step checks the chain and a small state file before doing anything, so an
interrupted run continues where it stopped. DRY RUN BY DEFAULT: nothing is sent without --execute.

    python scripts/demo_default_scene.py                        # dry run: status + plan
    python scripts/demo_default_scene.py --execute              # run every pending step
    python scripts/demo_default_scene.py --execute --step sell  # one step (live, step by step on stage)
    python scripts/demo_default_scene.py --execute --reset      # pool price + caps back, new merchant, again
    python scripts/demo_default_scene.py --execute --llm        # Risk agent asks the configured LLM

On the EC2 box run it through `deploy/devnet.sh scene [args]` (inside the docker network, next to anvil).
Env: RPC_URL (default http://127.0.0.1:8545), ADMIN_RPC_URL (default RPC_URL), DEPLOYMENTS_FILE,
SCENE_STATE (default: scene-state.json next to the deployments file). DEVNET ONLY: chain 31337, public keys.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import secrets
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from devnet_lib import AGENTS, Devnet, DevnetError, key, role
from web3 import Web3

STEPS = ("setup", "stop", "warp", "writeoff", "sell", "twap", "risk", "summary")
DAY = 86_400
DEFAULT_WINDOW = 30 * DAY
ADVANCE = 50 * 10**6  # tier-0 cap
SALES = (12_000_000, 8_500_000, 15_000_000)  # three customer payments (USDC, 6 decimals)
SELL_TICKS = 1_625  # ~ -15% junior price: well past the Risk agent's -10% 1h-vs-24h trigger
STATUS = {0: "none", 1: "active", 2: "repaid", 3: "written off"}

# ---------------------------------------------------------------------------------------------- narration
B, D, G, R, Y, C, X = "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[0m"
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    B = D = G = R = Y = C = X = ""


def say(msg: str = "") -> None:
    print(msg, flush=True)


def head(i: int, name: str, title: str) -> None:
    say(f"\n{B}{C}[{i}/{len(STEPS)}] {name.upper():9}{X} {B}{title}{X}")


def line(msg: str) -> None:
    say(f"   {msg}")


def usd(v: int) -> str:
    return f"{v / 1e6:,.2f} USDC"


def ts(t: int) -> str:
    return datetime.fromtimestamp(t, tz=UTC).strftime("%Y-%m-%d %H:%M UTC")


def short(h: str) -> str:
    h = h if h.startswith("0x") else "0x" + h
    return h[:10] + "…"


def caps_str(caps, max_exp) -> str:
    return "tier caps [" + ", ".join(f"{c / 1e6:g}" for c in caps) + f"] USDC, maxExposure {max_exp / 1e6:,.0f}"


# ---------------------------------------------------------------------------------------------- scene

class Scene:
    def __init__(self, d: Devnet, state_path: Path, execute: bool, use_llm: bool):
        self.d = d
        self.state_path = state_path
        self.execute = execute
        self.use_llm = use_llm
        self.st = self._load()
        self._agents = None

    # ---- state
    def _load(self) -> dict:
        if self.state_path.is_file():
            st = json.loads(self.state_path.read_text())
            if st.get("book") == self.d.addr("AdvanceBook"):
                return st
            say(f"{Y}state file belongs to another deployment: starting fresh{X}")
        return {"book": self.d.addr("AdvanceBook"), "run": 1, "done": {}, "baseline": None}

    def save(self) -> None:
        if not self.execute:
            return
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.st, indent=2) + "\n")
        tmp.replace(self.state_path)

    def done(self, step: str) -> dict | None:
        return self.st["done"].get(step)

    def mark(self, step: str, **info) -> None:
        self.st["done"][step] = {"at_block": self.d.w3.eth.block_number, **info}
        self.save()

    # ---- identities (deterministic from the public mnemonic, so a resumed run finds them again)
    @property
    def run(self) -> int:
        return int(self.st["run"])

    @property
    def label(self) -> str:
        return f"kiosco-{self.run}"

    @property
    def shop_id(self) -> bytes:
        return Web3.keccak(text=f"default-scene:{self.label}")

    def shop_owner(self):
        return key(1000 + self.run)

    def payout(self):
        return key(2000 + self.run)  # fresh payout address per advance (privacy rule)

    def payer(self, i: int):
        return key(3000 + self.run * 10 + i)

    # ---- agents objects (lazy: dry runs never need keys or the prover)
    def agents(self):
        if self._agents is None:
            from mra_agents.chain import Web3ChainReader, Web3ChainWriter
            from mra_agents.config import Settings
            from mra_agents.relayer import Relayer

            hexkey = lambda r: "0x" + role(r).key.hex().removeprefix("0x")
            s = Settings(rpc_url=self.d.w3.provider.endpoint_uri, chain_id=31337,
                         deployments_file=self.d.manifest_path,
                         offer_signer_private_key=hexkey("offer_signer"),
                         risk_manager_private_key=hexkey("risk_manager"),
                         relayer_private_key=hexkey("relayer"), issuer_private_key=hexkey("issuer"),
                         db_path=Path(tempfile.mkdtemp()) / "scene.sqlite")
            reader, writer = Web3ChainReader(s), Web3ChainWriter(s)
            self._agents = {"settings": s, "reader": reader, "writer": writer,
                            "relayer": Relayer(writer, s, now=self.d.now)}
        return self._agents

    # ---- chain views
    def shop(self) -> tuple[str, str, int]:
        return self.d.book.functions.shops(self.shop_id).call()  # (owner, payout, activeAdvanceId)

    def advance(self, aid: int) -> tuple:
        # (shopId, principal, totalOwed, repaid, principalRepaid, holdbackBps, tier, lastSaleAt, status, ...)
        return self.d.book.functions.getAdvance(aid).call()

    def limits(self) -> tuple[list[int], int]:
        f = self.d.book.functions
        return [f.tierCap(i).call() for i in range(4)], f.maxExposure().call()

    def snapshot(self) -> dict:
        d = self.d
        caps, max_exp = self.limits()
        _, tick = d.slot0()
        return {"junior_share": d.share_price(d.junior), "senior_share": d.share_price(d.senior),
                "junior_assets": d.junior.functions.totalAssets().call(),
                "senior_assets": d.senior.functions.totalAssets().call(),
                "reserve": d.book.functions.reserve().call(), "pool_tick": tick,
                "pool_price": d.junior_price_from_tick(tick), "caps": caps, "max_exposure": max_exp,
                "chain_time": d.now()}

    def ensure_baseline(self) -> None:
        if self.st.get("baseline"):
            return
        snap = self.snapshot()
        self.st["baseline"] = {"caps": snap["caps"], "max_exposure": snap["max_exposure"],
                               "tick": snap["pool_tick"], "snapshot": snap}
        self.save()

    def advance_id(self) -> int | None:
        info = self.done("setup")
        return int(info["advance_id"]) if info else None

    def fund(self, acct, eth: int = 10**17) -> None:
        if self.d.w3.eth.get_balance(acct.address) < eth // 2:
            self.d.send_eth(role("faucet"), acct.address, eth)

    # ======================================================================================== steps

    def step_setup(self, i: int) -> None:
        head(i, "setup", f"a merchant with an active advance ({self.label})")
        d = self.d
        owner, _payout, active = self.shop()
        if self.done("setup"):
            aid = self.advance_id()
            a = self.advance(aid)
            line(f"done: advance #{aid} for {self.label}, {usd(a[1])} principal, {usd(a[3])} repaid, "
                 f"status {STATUS.get(a[8], a[8])}")
            return
        if not self.execute:
            line(f"would: register shop {self.label}, issue a Business Pass (devnet issuer), prove it with Noir/bb,")
            line(f"       drawFirst a {usd(ADVANCE)} advance to a fresh payout address, then {len(SALES)} customer "
                 "sales (8% holdback repays)")
            return
        self.ensure_baseline()
        if not self.st.get("run_start"):
            self.st["run_start"] = self.snapshot()
            self.save()
        from mra_agents import bizpass, zk
        from mra_agents.models import Offer
        from mra_agents.signer import EIP712Signer

        ag = self.agents()
        so_owner, pay = self.shop_owner(), self.payout()
        if int(owner, 16) == 0:
            self.fund(so_owner)
            d.send(d.book.functions.registerShop(self.shop_id, pay.address), so_owner)
            line(f"shop {self.label} registered; payout {short(pay.address)} (fresh address)")
        if active == 0:
            registry = d.contract("BusinessPassRegistry")
            secret = secrets.randbelow(zk.P - 1) + 1  # never leaves this process (the "phone")
            bizpass.devnet_issue(issuer_key=role("issuer").key, chain_id=31337, registry=registry.address,
                                 secret=secret, country=32, revenue_band=2, age_ok=1, now=d.now(),
                                 submit_issue=ag["relayer"].issue_business_pass)
            leaves = bizpass.tree_leaves(registry, int(d.dep.get("deployBlock", 0)))
            line(f"Business Pass issued by the devnet issuer: Argentina, revenue band 2 (leaf {len(leaves) - 1})")
            offer = Offer(offer_id="0x" + secrets.token_hex(32), shop_id="0x" + self.shop_id.hex().removeprefix("0x"),
                          recipient=pay.address, amount=ADVANCE, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=800, tier=0,
                          pass_nullifier=zk.business_nullifier(secret), min_revenue_band=1,
                          expires_at=d.now() + 900)
            inputs = bizpass.prover_inputs(
                secret=secret, country=32, revenue_band=2, age_ok=1, leaves=leaves,
                leaf_index=leaves.index(zk.business_leaf(secret, 32, 2, 1)),
                secret_next=secrets.randbelow(zk.P - 1) + 1, min_band=1,
                context=zk.offer_context(offer.recipient, bytes.fromhex(offer.offer_id[2:])))
            line(f"{D}proving the Business Pass (real Noir circuit + bb Honk proof)…{X}")
            t0 = time.monotonic()
            with _quiet_stderr():  # nargo/bb chatter would drown the narration
                proof = bizpass.prove("DefaultScene", inputs)
            line(f"proof ready in {time.monotonic() - t0:.1f}s ({len(proof):,} bytes)")
            so = EIP712Signer(ag["settings"].offer_signer_private_key.get_secret_value()).sign_offer(
                offer, chain_id=31337, verifying_contract=d.addr("AdvanceBook"))
            tx = ag["relayer"].draw_first(so, "0x" + proof.hex(), inputs.root, inputs.commitment_next)
            active = self.shop()[2]
            line(f"{G}drawFirst{X}: advance #{active}, {usd(ADVANCE)} to {short(pay.address)}, "
                 f"fee 0.5% per week, capped at 3%; 8% holdback (tx {short(tx)})")
        aid = int(active)
        a = self.advance(aid)
        if a[3] == 0:  # no repayment yet: the customer sales
            for n, amount in enumerate(SALES):
                p = self.payer(n)
                self.fund(p)
                d.send(d.usdc.functions.mint(p.address, amount), role("owner"))
                d.send(d.usdc.functions.approve(d.addr("AdvanceBook"), amount), p)
                d.send(d.book.functions.pay(self.shop_id, amount), p)
            a = self.advance(aid)
            line(f"{len(SALES)} customer sales, {usd(sum(SALES))} total: holdback repaid {usd(a[3])} of "
                 f"{usd(d.book.functions.owedOf(aid).call())} owed now")
        self.mark("setup", advance_id=aid, label=self.label)

    def step_stop(self, i: int) -> None:
        head(i, "stop", "the merchant stops selling")
        aid = self.advance_id()
        if aid is None:
            line("waits for: setup")
            return
        a = self.advance(aid)
        last = int(a[7])
        line(f"last repaying sale {ts(last)}; writeOff unlocks after {DEFAULT_WINDOW // DAY} days with no "
             f"repaying sale, at {ts(last + DEFAULT_WINDOW)}")
        line(f"outstanding: {usd(a[2] - a[3])} owed, {usd(a[1] - a[4])} principal at risk")
        if self.execute and not self.done("stop"):
            self.mark("stop", last_sale_at=last)

    def step_warp(self, i: int) -> None:
        head(i, "warp", "31 days pass with no sales (devnet clock)")
        aid = self.advance_id()
        if aid is None:
            line("waits for: setup")
            return
        last = int(self.advance(aid)[7])
        target = last + DEFAULT_WINDOW + DAY
        now = self.d.now()
        if now >= last + DEFAULT_WINDOW:
            line(f"done: chain time {ts(now)} is {(now - last) / DAY:.1f} days after the last sale")
            if self.execute and not self.done("warp"):
                self.mark("warp", chain_time=now)
            return
        if not self.execute:
            line(f"would: evm_increaseTime {(target - now) / DAY:.2f} days (admin RPC, never public) "
                 f"-> {ts(target)}")
            return
        now = self.d.warp(target - now)
        line(f"{Y}evm_increaseTime{X} (internal admin RPC): chain time now {ts(now)}, "
             f"{(now - last) / DAY:.1f} days since the last sale")
        self.mark("warp", chain_time=now)

    def step_writeoff(self, i: int) -> None:
        head(i, "writeoff", "the keeper writes the advance off; junior absorbs the loss")
        aid = self.advance_id()
        if aid is None:
            line("waits for: setup")
            return
        a = self.advance(aid)
        if self.done("writeoff"):
            info = self.done("writeoff")
            line(f"done: advance #{aid} {STATUS.get(a[8])}; junior share {info['junior_before']:.6f} -> "
                 f"{info['junior_after']:.6f} USDC, senior {info['senior_before']:.6f} -> {info['senior_after']:.6f}")
            return
        eligible = self.d.now() >= int(a[7]) + DEFAULT_WINDOW
        if not self.execute:
            line(f"would: Keeper.tick() -> writeOff(#{aid}) from the relayer"
                 + ("" if eligible else f" {D}(after the warp){X}"))
            return
        if a[8] == 1 and not eligible:
            line(f"{R}not eligible yet{X}: run the warp step first")
            return
        from mra_agents.keeper import Keeper

        ag = self.agents()
        before = self.snapshot()
        statuses = {x.advance_id: x.status for x in ag["reader"].advances()}
        res = Keeper(ag["reader"], ag["writer"], ag["settings"], now=self.d.now).tick()
        after = self.snapshot()
        newly = [x for x in ag["reader"].advances()
                 if x.status.value == "written_off" and statuses.get(x.advance_id) != x.status]
        if res.errors:
            line(f"{R}keeper errors{X}: {res.errors}")
        if not newly and self.advance(aid)[8] != 3:
            line(f"{R}advance #{aid} not written off{X} (status {STATUS.get(self.advance(aid)[8])})")
            return
        for x in newly:
            adv = self.advance(x.advance_id)
            tag = "this scene" if x.advance_id == aid else "also 30+ days quiet: the keeper writes off every one"
            line(f"{G}writeOff(#{x.advance_id}){X} ({tag}): principal lost {usd(adv[1] - adv[4])}")
        for tx in res:
            line(f"{D}tx {short(tx)}{X}")
        jl = before["junior_assets"] - after["junior_assets"]
        line(f"junior vault paid {usd(jl)} straight into senior; reserve {usd(before['reserve'])} -> "
             f"{usd(after['reserve'])}")
        line(f"{B}junior share price {before['junior_share']:.6f} -> {after['junior_share']:.6f} USDC "
             f"({(after['junior_share'] / before['junior_share'] - 1) * 100:+.2f}%){X}")
        line(f"senior share price {before['senior_share']:.6f} -> {after['senior_share']:.6f} USDC "
             f"({'untouched' if abs(after['senior_share'] - before['senior_share']) < 1e-6 else 'CHANGED'})")
        self.mark("writeoff", written_off=[x.advance_id for x in newly], txs=list(res),
                  junior_before=before["junior_share"], junior_after=after["junior_share"],
                  senior_before=before["senior_share"], senior_after=after["senior_share"])

    def step_sell(self, i: int) -> None:
        head(i, "sell", "a junior LP panics and sells on the Uniswap v4 pool")
        d = self.d
        lp = role("junior_lp")
        if self.done("sell"):
            info = self.done("sell")
            line(f"done: sold {info['shares'] / 1e6:,.2f} JNR; pool price {info['price_before']:.4f} -> "
                 f"{info['price_after']:.4f} USDC")
            return
        if not self.done("writeoff"):
            line("waits for: writeoff" if self.execute else
                 f"would: sell junior shares from {short(lp.address)} with a price limit {SELL_TICKS} ticks "
                 f"lower (about -{(1 - 1.0001 ** -SELL_TICKS) * 100:.0f}%)")
            return
        if not self.execute:
            line(f"would: sell junior shares down to a price about {(1 - 1.0001 ** -SELL_TICKS) * 100:.0f}% lower")
            return
        bal = d.junior.functions.balanceOf(lp.address).call()
        if bal < 500 * 10**6:  # top the LP up so repeated runs never run dry
            d.send(d.usdc.functions.mint(lp.address, 1_000 * 10**6), role("owner"))
            d.send(d.usdc.functions.approve(d.addr("JuniorVault"), 1_000 * 10**6), lp)
            d.send(d.junior.functions.deposit(1_000 * 10**6, lp.address), lp)
            bal = d.junior.functions.balanceOf(lp.address).call()
        _, t0 = d.slot0()
        p0 = d.junior_price_from_tick(t0)
        usdc0 = d.usdc.functions.balanceOf(lp.address).call()
        hook0 = d.usdc.functions.balanceOf(d.addr("RiskHook")).call()
        target = t0 - SELL_TICKS if d.junior_is_token0() else t0 + SELL_TICKS
        rc = d.swap_to_tick(lp, target, bal)
        _, t1 = d.slot0()
        p1 = d.junior_price_from_tick(t1)
        sold = bal - d.junior.functions.balanceOf(lp.address).call()
        got = d.usdc.functions.balanceOf(lp.address).call() - usdc0
        fee = d.usdc.functions.balanceOf(d.addr("RiskHook")).call() - hook0
        line(f"{G}swap{X}: sold {sold / 1e6:,.2f} JNR for {usd(got)} (RiskHook kept a {usd(fee)} fee for the reserve)")
        line(f"{B}pool price {p0:.4f} -> {p1:.4f} USDC per JNR ({(p1 / p0 - 1) * 100:+.1f}%), tick {t0} -> {t1}{X}")
        line(f"{D}tx {short(rc['transactionHash'].hex())}{X}")
        self.mark("sell", shares=sold, usdc=got, tick_before=t0, tick_after=t1, price_before=p0, price_after=p1)

    def step_twap(self, i: int) -> None:
        head(i, "twap", "one hour later: the 1h TWAP has moved, the 24h TWAP lags")
        d = self.d
        if not self.done("sell"):
            line("waits for: sell" if self.execute else "would: evm_increaseTime 1 hour, then read RiskHook.consult")
            return
        sell_block = int(self.done("sell")["at_block"])
        sell_time = int(d.w3.eth.get_block(sell_block)["timestamp"])
        if not self.done("twap"):
            if not self.execute:
                line("would: evm_increaseTime 1 hour, then read RiskHook.consult(1h) and consult(24h)")
                return
            wait = sell_time + 3_600 - d.now()
            if wait > 0:
                d.warp(wait)
                line(f"{Y}evm_increaseTime{X} {wait / 60:.0f} min: chain time {ts(d.now())}")
        t1h, t24h = d.twap_tick(3_600), d.twap_tick(86_400)
        if t1h is None or t24h is None:
            line(f"{R}RiskHook.consult failed{X} (oracle history too short): 1h={t1h} 24h={t24h}")
            return
        ratio = d.junior_price_from_tick(t1h) / d.junior_price_from_tick(t24h)
        line(f"RiskHook.consult: 1h TWAP tick {t1h} (price {d.junior_price_from_tick(t1h):.4f}), "
             f"24h TWAP tick {t24h} (price {d.junior_price_from_tick(t24h):.4f})")
        fires = ratio < 0.90
        line(f"{B}1h / 24h junior price = {ratio:.4f}{X}  -> trigger needs < 0.9000: "
             + (f"{G}FIRES{X}" if fires else f"{Y}does not fire{X}"))
        if self.execute and not self.done("twap"):
            self.mark("twap", tick_1h=t1h, tick_24h=t24h, ratio=ratio)

    def step_risk(self, i: int) -> None:
        head(i, "risk", "the Risk agent lowers the caps (down only)")
        if not self.done("twap"):
            line("waits for: twap" if self.execute else
                 "would: RiskAgent.tick(): signals -> judge proposal -> clamp down-only -> lowerLimits")
            return
        if self.done("risk"):
            info = self.done("risk")
            line(f"done: triggers {info['triggers']}; {caps_str(info['caps_before'], info['max_before'])} -> "
                 f"{caps_str(info['caps_after'], info['max_after'])}")
            return
        if not self.execute:
            line("would: RiskAgent.tick() -> lowerLimits from the risk manager key")
            return
        from mra_agents.risk import RiskAgent

        ag = self.agents()
        if self.use_llm:
            from mra_agents.llm_bedrock import make_llm
            from mra_agents.underwriter import ClaudeJudge
            judge = ClaudeJudge(make_llm(ag["settings"]), ag["settings"])
            line(f"{D}asking the configured risk model ({ag['settings'].llm_provider})…{X}")
        else:
            judge = _NoModel()
            logging.getLogger("mra_agents.risk").setLevel(logging.ERROR)  # the fallback is the intended path
        caps0, max0 = self.limits()
        rec = RiskAgent(ag["reader"], ag["writer"], judge, ag["settings"], now=self.d.now).tick()
        sig = rec["signals"]
        tw, wo = sig.get("twap", {}), sig.get("write_offs", {})
        if "price_ratio_1h_vs_24h" in tw:
            line(f"signal junior_twap_drop : 1h/24h = {tw['price_ratio_1h_vs_24h']:.4f} (< 0.90?) "
                 f"{'FIRED' if tw.get('fired') else 'no'}")
        line(f"signal write_offs_7d   : {wo.get('count_7d')} write-off(s) in 7 days (>= 2?) "
             f"{'FIRED' if wo.get('fired') else 'no'}")
        line(f"triggers: {B}{rec['triggers'] or 'none'}{X}")
        if rec.get("source") == "fallback" and not self.use_llm:
            line("policy: deterministic cut, -25% on tiers 2-3 and maxExposure (pass --llm to ask the model)")
        elif rec.get("proposal"):
            line(f"model proposal ({rec['source']}): {rec['proposal'].get('rationale', '')[:160]}")
        caps1, max1 = self.limits()
        if rec.get("tx_hash"):
            line(f"{G}lowerLimits{X} (risk manager, tx {short(rec['tx_hash'])})")
        else:
            line(f"no transaction: {rec.get('skipped')} {rec.get('error') or ''}")
        line(f"{B}before: {caps_str(caps0, max0)}{X}")
        line(f"{B}after : {caps_str(caps1, max1)}{X}")
        if rec.get("tx_hash") or rec.get("skipped") == "no_change":
            self.mark("risk", triggers=rec["triggers"], caps_before=caps0, max_before=max0, caps_after=caps1,
                      max_after=max1, tx=rec.get("tx_hash"))

    def step_summary(self, i: int) -> None:
        head(i, "summary", "before vs after")
        base = self.st.get("run_start") or (self.st.get("baseline") or {}).get("snapshot")
        now = self.snapshot()
        if not base:
            line("nothing has run yet")
            base = now
        rows = [("junior share price (USDC)", f"{base['junior_share']:.6f}", f"{now['junior_share']:.6f}"),
                ("senior share price (USDC)", f"{base['senior_share']:.6f}", f"{now['senior_share']:.6f}"),
                ("junior pool price (USDC)", f"{base['pool_price']:.4f}", f"{now['pool_price']:.4f}"),
                ("tier caps (USDC)", "/".join(f"{c / 1e6:g}" for c in base["caps"]),
                 "/".join(f"{c / 1e6:g}" for c in now["caps"])),
                ("maxExposure (USDC)", f"{base['max_exposure'] / 1e6:,.0f}", f"{now['max_exposure'] / 1e6:,.0f}"),
                ("chain time", ts(base["chain_time"]), ts(now["chain_time"]))]
        say(f"   {'':28}{"scene start":>23}{"now":>23}")
        for name, a, b in rows:
            say(f"   {name:28}{a:>23}{b:>23}")

    # ======================================================================================== reset

    def reset(self) -> None:
        say(f"\n{B}{C}RESET{X} {B}put the pool price and the caps back, start a new merchant{X}")
        base = self.st.get("baseline")
        d = self.d
        if not base:
            line("nothing to reset (no baseline yet)")
            return
        _, tick = d.slot0()
        caps, max_exp = self.limits()
        if not self.execute:
            line(f"would: buy junior back to tick {base['tick']} (now {tick}); restore {caps_str(base['caps'], base['max_exposure'])} "
                 f"(owner setLimits; now {caps_str(caps, max_exp)}); start run {self.run + 1}")
            return
        lp = role("junior_lp")
        if abs(tick - base["tick"]) > 10:
            d.send(d.usdc.functions.mint(lp.address, 5_000 * 10**6), role("owner"))
            buying_junior = d.junior_price_from_tick(base["tick"]) > d.junior_price_from_tick(tick)
            spend = (d.usdc if buying_junior else d.junior).functions.balanceOf(lp.address).call()
            d.swap_to_tick(lp, base["tick"], spend)
            line(f"pool: bought junior back, tick {tick} -> {d.slot0()[1]}")
        if caps != base["caps"] or max_exp != base["max_exposure"]:
            d.send(d.book.functions.setLimits(base["caps"], base["max_exposure"]), role("owner"))
            line(f"limits restored by the owner: {caps_str(*self.limits())}")
        self.st["run"] = self.run + 1
        self.st["done"] = {}
        self.st["run_start"] = None
        self.save()
        line(f"new run {self.run}: merchant {self.label}. Past write-offs stay in history (chain time only moves "
             "forward).")


@contextlib.contextmanager
def _quiet_stderr():
    sys.stderr.flush()
    saved = os.dup(2)
    try:
        with open(os.devnull, "w") as null:
            os.dup2(null.fileno(), 2)
            yield
    finally:
        os.dup2(saved, 2)
        os.close(saved)


class _NoModel:
    """Judge stand-in that declines, so the Risk agent applies its documented deterministic cut."""

    def propose_risk(self, signals, limits):
        raise RuntimeError("no model configured for the scene (use --llm)")


# ---------------------------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--execute", action="store_true", help="send transactions (default: dry run)")
    ap.add_argument("--step", choices=STEPS, help="run only this step")
    ap.add_argument("--reset", action="store_true", help="restore pool price + caps and start a new merchant")
    ap.add_argument("--llm", action="store_true", help="Risk agent asks the configured LLM (else deterministic)")
    ap.add_argument("--rpc", default=os.environ.get("RPC_URL", "http://127.0.0.1:8545"))
    ap.add_argument("--admin-rpc", default=os.environ.get("ADMIN_RPC_URL"))
    ap.add_argument("--deployments", default=os.environ.get("DEPLOYMENTS_FILE",
                                                            str(AGENTS / "deployments" / "devnet.json")))
    ap.add_argument("--state", default=os.environ.get("SCENE_STATE"))
    a = ap.parse_args()

    manifest = Path(a.deployments)
    try:
        d = Devnet.connect(a.rpc, manifest, a.admin_rpc)
    except (DevnetError, OSError, KeyError, ValueError) as e:
        say(f"{R}cannot use the devnet{X}: {e}")
        return 1
    state = Path(a.state) if a.state else manifest.with_name("scene-state.json")
    sc = Scene(d, state, a.execute, a.llm)
    mode = f"{G}EXECUTE{X}" if a.execute else f"{Y}DRY RUN (nothing is sent; add --execute){X}"
    say(f"{B}Default scene: a default that the junior tranche absorbs{X}   [{mode}]")
    say(f"{D}devnet chain 31337, block {d.w3.eth.block_number}, chain time {ts(d.now())}; "
        f"AdvanceBook {d.addr('AdvanceBook')}; run {sc.run} ({sc.label}){X}")
    try:
        if a.reset:
            sc.reset()
            if not a.step:
                return 0
        steps = [a.step] if a.step else list(STEPS)
        for name in steps:
            getattr(sc, f"step_{name}")(STEPS.index(name) + 1)
    except DevnetError as e:
        say(f"\n{R}stopped{X}: {e}\nRe-run the same command to resume.")
        return 1
    if not a.execute:
        say(f"\n{Y}Dry run: nothing was sent.{X} Run with --execute (optionally --step <name>).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
