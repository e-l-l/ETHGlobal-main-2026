"""Real, serial Anvil scenarios for the judge simulator. DEVNET ONLY (chain 31337, public anvil keys).

Every step is backed by real work: devnet transactions, the production underwriting pipeline (red lines,
Underwriter and Critic LLM calls, EIP-712 signer), real Noir/UltraHonk proofs, the Keeper and the Risk agent.
Nothing is canned. Only the merchant's customers are simulated: burner accounts derived from the public anvil
mnemonic at random indices.

Fee model (time-based: 0.5%/week on original principal while principal remains, capped at 3%, paid fee-first;
plus the late-fee step-up: while behind the 1%-per-7-days minimum the fee doubles, an extra 0.5%/week capped at
another 3%, all of it to the reserve) lives in ONE section at the top of this file: `fee_words`, `late_fee_words`,
`offer_terms`, `draft_summary`, `late_fee` and `fee_status`. The
rest of the runner reads advances by ABI field name (`Simulator._advance`, with `owedOf` as the live balance) and
repays until the advance reads Repaid, so it never assumes a fixed total. Signing goes through the pipeline's
signer and drawing through the Relayer, which own the Offer struct encoding.
"""
from __future__ import annotations

import os
import random
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

DAY = 86_400
HOUR = 3_600
USDC = 1_000_000
SCENARIOS = ("honest_kiosk", "slow_week", "wash_ring", "defaulter", "repeat_borrower")
PACE_SECONDS = 0.6  # minimum gap between two steps, so the feed reads as a story
MAX_ATTEMPTS = 4  # an honest merchant asks again when the Critic sends a draft back (send_back only)
HISTORY_DAYS = 30
COUNTRY, REVENUE_BAND, AGE_OK = 32, 2, 1  # devnet Business Pass: AR, band 2, over 18


# ------------------------------------------------------------------ fee / offer terms (the one place)

WEEK = 7 * DAY
BPS = 10_000
FEE_CHECKPOINT_WEEKS = (1, 2, 4, 6)
# AdvanceBook constants (not part of the signed Offer): the late fee while behind the minimum repayment.
LATE_FEE_RATE_BPS_PER_WEEK = 50
LATE_FEE_CAP_BPS = 300
REPAY_WINDOW = 7 * DAY


def fee_words(rate_bps: int, cap_bps: int) -> str:
    """"0.5%/week, max 3%" from the signed terms."""
    return f"{rate_bps / 100:g}%/week, max {cap_bps / 100:g}%"


def late_fee_words(rate_bps: int, cap_bps: int) -> str:
    """The late-fee rule in the merchant's words (FRONTEND-HANDOFF copy)."""
    return (f"Paying on time keeps your fee at {rate_bps / 100:g}% a week, max {cap_bps / 100:g}%. If you fall "
            f"behind the minimum, the fee doubles to {(rate_bps + LATE_FEE_RATE_BPS_PER_WEEK) / 100:g}% a week (max "
            f"{(cap_bps + LATE_FEE_CAP_BPS) / 100:g}% total) until you catch up; the extra goes to the safety reserve.")


def _fee_at(principal: int, rate_bps: int, cap_bps: int, seconds: int) -> int:
    """AdvanceBook.accruedFee: principal x rate x time / week, capped (USDC base units, floor like mulDiv)."""
    raw = principal * rate_bps * max(0, int(seconds)) // (BPS * WEEK)
    return min(raw, principal * cap_bps // BPS)


def offer_terms(offer) -> dict:
    """Plain description of a signed offer. The ONLY place that turns offer terms into words and numbers."""
    amount = int(offer.amount)
    rate, cap, holdback = int(offer.fee_rate_bps_per_week), int(offer.fee_cap_bps), int(offer.holdback_bps)
    max_fee = amount * cap // BPS
    return {
        "amount": amount / USDC, "tier": offer.tier, "holdback_bps": holdback,
        "fee_rate_bps_per_week": rate, "fee_cap_bps": cap, "fee_terms": fee_words(rate, cap),
        "max_fee_usd": max_fee / USDC, "max_total_usd": (amount + max_fee) / USDC,
        "late_fee_rate_bps_per_week": LATE_FEE_RATE_BPS_PER_WEEK, "late_fee_cap_bps": LATE_FEE_CAP_BPS,
        "max_total_if_late_usd": (amount + max_fee + amount * LATE_FEE_CAP_BPS // BPS) / USDC,
        "fee_if_repaid_in_weeks": {str(w): _fee_at(amount, rate, cap, w * WEEK) / USDC
                                   for w in FEE_CHECKPOINT_WEEKS},
        "summary": (f"${amount / USDC:.0f} advance. Fee {fee_words(rate, cap)} (never more than "
                    f"${max_fee / USDC:.2f}), charged only while you owe; paying sooner saves fee. "
                    f"{holdback / 100:g}% of each sale goes to repayment, at least 1% every 7 days. "
                    + late_fee_words(rate, cap)),
    }


def draft_summary(draft) -> str:
    """The Underwriter's draft in words (OfferDraft carries the same fee fields as the Offer)."""
    return (f"${draft.amount / USDC:.0f}, fee {fee_words(draft.fee_rate_bps_per_week, draft.fee_cap_bps)}, "
            f"holdback {draft.holdback_bps / 100:g}%, about {draft.est_days_normal} days to repay.")


def late_fee(a: dict, now: int) -> tuple[int, bool]:
    """AdvanceBook.lateFeeOf / isBehind: (late fee accrued so far, behind now). Behind = no 1% window met for more
    than REPAY_WINDOW since lastSaleAt; settled behind-seconds (`lateSecs`) plus the open stretch, at the late rate."""
    paid = int(a.get("lateFeePaid", 0))
    if int(a["status"]) != 1:
        return paid, False
    behind = max(0, int(now) - int(a.get("lastSaleAt", now)) - REPAY_WINDOW)
    secs = int(a.get("lateSecs", 0)) + behind
    return _fee_at(int(a["principal"]), LATE_FEE_RATE_BPS_PER_WEEK, LATE_FEE_CAP_BPS, secs), behind > 0


def fee_status(a: dict, now: int) -> dict:
    """Fee on a live advance (`Simulator._advance` dict, `left` = owedOf) against the published schedule.

    accrued = owedOf - principal still out - late fee still due + fee already paid (the contract's accruedFee).
    `schedule` is the same formula from the signed terms at `now`; `extra` is anything charged beyond it and the
    late fee. The late fee (only while behind the minimum) is reported separately: it goes 100% to the reserve."""
    principal, prepaid, fee_paid = int(a["principal"]), int(a["principalRepaid"]), int(a["feePaid"])
    rate, cap_bps = int(a["feeRateBpsPerWeek"]), int(a["feeCapBps"])
    active = int(a["status"]) == 1
    late, behind = late_fee(a, now)
    late_paid = int(a.get("lateFeePaid", 0))
    accrued = int(a["left"]) - (principal - prepaid) - max(0, late - late_paid) + fee_paid if active else fee_paid
    elapsed = max(0, int(now) - int(a["drawnAt"]))
    schedule = _fee_at(principal, rate, cap_bps, elapsed) if active else fee_paid
    cap = principal * cap_bps // BPS
    return {"fee_terms": fee_words(rate, cap_bps), "fee_accrued_usd": accrued / USDC,
            "fee_paid_usd": fee_paid / USDC, "fee_schedule_usd": schedule / USDC, "fee_cap_usd": cap / USDC,
            "fee_capped": accrued >= cap, "weeks_outstanding": round(elapsed / WEEK, 2),
            "weeks_to_cap": round(cap_bps / rate, 2) if rate else None,
            "behind": behind, "late_fee_usd": late / USDC, "late_fee_paid_usd": late_paid / USDC,
            "late_fee_cap_usd": principal * LATE_FEE_CAP_BPS // BPS / USDC,
            # 1 cent tolerance: eth_call and d.now() can sit a block apart.
            "extra_fee_usd": round(max(0, accrued - schedule - 10_000) / USDC, 2)}


def plain(text: str) -> str:
    """Model text for the feed: no markdown emphasis."""
    return text.replace("**", "").replace("__", "").strip()


# ------------------------------------------------------------------ proving (artifacts only, temp dirs)

class Prover:
    """Real UltraHonk proofs from compiled circuit artifacts (`<circuit>.json` + `vk`).

    `noir-execute` (witness) then `bb prove` and `bb verify`, in a throwaway directory: circuit sources stay
    read-only and nothing is left behind. Artifacts: $SIM_CIRCUITS_DIR/<circuit>/, else the repo's
    circuits/<circuit>/target/ (compiled once on first use when only the sources exist, dev machines)."""

    def __init__(self):
        self.sources = Path(__file__).resolve().parents[3] / "circuits"
        self.artifact_dir = Path(os.environ["SIM_CIRCUITS_DIR"]) if os.getenv("SIM_CIRCUITS_DIR") else None
        extra = [os.getenv("SIM_TOOLS_DIR", ""), str(Path.home() / ".nargo/bin"), str(Path.home() / ".bb")]
        self.path = os.pathsep.join([p for p in extra if p] + [os.environ.get("PATH", "")])
        self._lock = threading.Lock()

    def _tool(self, name: str) -> str:
        found = shutil.which(name, path=self.path)
        if not found:
            raise FileNotFoundError(f"{name} not found (set SIM_TOOLS_DIR or install nargo/bb)")
        return found

    def artifacts(self, circuit: str) -> tuple[Path, Path]:
        bases = ([self.artifact_dir / circuit] if self.artifact_dir else []) + [self.sources / circuit / "target"]
        for base in bases:
            if (base / f"{circuit}.json").is_file() and (base / "vk").is_file():
                return base / f"{circuit}.json", base / "vk"
        src = self.sources / circuit
        if not (src / "Nargo.toml").is_file():
            raise FileNotFoundError(f"no compiled {circuit} artifact")
        with self._lock:
            self._run(["nargo", "compile"], cwd=src, timeout=180)
            self._run(["bb", "write_vk", "-b", f"target/{circuit}.json", "-o", "target", "-t", "evm"],
                      cwd=src, timeout=180)
        return src / "target" / f"{circuit}.json", src / "target" / "vk"

    def _run(self, argv: list[str], *, timeout: float, cwd=None) -> None:
        subprocess.run([self._tool(argv[0]), *argv[1:]], cwd=cwd, check=True, timeout=max(10, timeout),
                       env=dict(os.environ, PATH=self.path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def prove(self, circuit: str, toml: str, timeout: float = 120) -> tuple[bytes, float]:
        """Returns (proof bytes, milliseconds for witness + proof). The proof is verified before returning."""
        art, vk = self.artifacts(circuit)
        with tempfile.TemporaryDirectory(prefix=f"sim-{circuit}-") as tmp:
            t = Path(tmp)
            (t / "inputs.toml").write_text(toml)
            t0 = time.monotonic()
            self._run(["noir-execute", "execute", "-a", str(art), "-p", str(t / "inputs.toml"), "-o", tmp,
                       "-w", "witness"], timeout=timeout)
            self._run(["bb", "prove", "-b", str(art), "-w", str(t / "witness.gz"), "-k", str(vk), "-o", tmp,
                       "-t", "evm"], timeout=timeout)
            ms = (time.monotonic() - t0) * 1000
            self._run(["bb", "verify", "-k", str(vk), "-p", str(t / "proof"), "-i", str(t / "public_inputs"),
                       "-t", "evm"], timeout=timeout)
            return (t / "proof").read_bytes(), ms


def standing_toml(*, secret: int, count: int, path: list[int], bits: list[bool], secret_next: int, root: int,
                  nullifier: int, tier: int, commitment_next: int, context: int) -> str:
    """Prover inputs for circuits/standing_pass (same layout as its Prover.toml)."""
    def q(x: int) -> str:
        return f'"0x{x:064x}"'
    return "\n".join([
        f"secret = {q(secret)}", f'count = "{count}"',
        "path = [" + ", ".join(q(x) for x in path) + "]",
        "index_bits = [" + ", ".join("true" if b else "false" for b in bits) + "]",
        f"secret_next = {q(secret_next)}", f"root = {q(root)}", f"nullifier = {q(nullifier)}",
        f'tier = "{tier}"', f"commitment_next = {q(commitment_next)}", f"context = {q(context)}", ""])


def _money(xs) -> str:
    return ", ".join(f"${x / USDC:.2f}" for x in xs)


# ------------------------------------------------------------------ the runner

class Simulator:
    def __init__(self, services=None, *, sleep=time.sleep, clock=time.time, prover=None):
        self.services = services
        self.sleep, self.clock = sleep, clock
        # Same defaults as config.Settings (local anvil); compose sets all three for the devnet API.
        self.rpc = os.getenv("RPC_URL", "http://127.0.0.1:8545")
        self.admin = os.getenv("ADMIN_RPC_URL", self.rpc)
        self.manifest = Path(os.getenv("DEPLOYMENTS_FILE", Path(__file__).resolve().parents[2] / "deployments" / "local.json"))
        # Soft budget, checked at every step; the worker kills the run process `hard_grace` seconds later.
        self.timeout = min(240, max(30, int(os.getenv("SIM_RUN_TIMEOUT", "210"))))
        self.hard_grace = 30
        self.prover = prover or Prover()
        self._final: dict[int, tuple[int, int, int]] = {}  # settled advance id -> (principal, repaid, lost)
        self._state_cache: tuple[float, dict] | None = None
        self._local = threading.local()

    # -------------------------------------------------------------- plumbing
    def _service(self, name):
        if self.services is not None:
            return self.services.get(name)
        from .api import _services
        return _services.get(name)

    def _devnet(self):
        """One Devnet (two HTTP providers) per thread, reused: web3 objects are cyclic, so building one per
        ledger read would hold sockets until the GC runs."""
        d = getattr(self._local, "devnet", None)
        if d is None:
            scripts = Path(__file__).resolve().parents[2] / "scripts"
            if str(scripts) not in sys.path:
                sys.path.insert(0, str(scripts))
            from devnet_lib import Devnet
            d = self._local.devnet = Devnet.connect(self.rpc, self.manifest, self.admin)
        return d

    @staticmethod
    def _usd(value) -> float:
        return round(int(value) / USDC, 6)

    @staticmethod
    def _tx(receipt_or_hash):
        if receipt_or_hash is None or isinstance(receipt_or_hash, str):
            return receipt_or_hash
        h = receipt_or_hash.get("transactionHash")
        return "0x" + bytes(h).hex().removeprefix("0x") if h is not None else None

    def _advance(self, d, advance_id: int) -> dict:
        """getAdvance by ABI field name (struct order may change) plus `left` = owedOf (still owed)."""
        fn = d.book.get_function_by_name("getAdvance")
        names = [c["name"] for c in fn.abi["outputs"][0]["components"]]
        a = dict(zip(names, d.book.functions.getAdvance(int(advance_id)).call()))
        a["left"] = int(d.book.functions.owedOf(int(advance_id)).call())
        return a

    # -------------------------------------------------------------- ledger
    def ledger(self, advance_ids=None, tier=None) -> dict:
        """Chain state in USD. Tranches, reserve, prices, outstanding and caps are global. advanced / repaid /
        written_off cover `advance_ids` (this run's merchant) when given, else every advance on the book."""
        d = self._devnet()
        _, tick = d.slot0()
        caps_raw = [int(d.book.functions.tierCap(i).call()) for i in range(4)]
        scoped = advance_ids is not None
        ids = [int(x) for x in advance_ids if x] if scoped else \
            list(range(1, int(d.book.functions.nextAdvanceId().call())))
        advanced = repaid = lost = 0
        merchant_tier = int(tier or 0)
        for i in ids:
            if i in self._final and not scoped:
                p, r, w = self._final[i]
            else:
                a = self._advance(d, i)
                status, p, r = int(a["status"]), int(a["principal"]), int(a["repaid"])
                w = p - int(a["principalRepaid"]) if status == 3 else 0
                if status in (2, 3):  # Repaid and WrittenOff are final
                    self._final[i] = (p, r, w)
                if scoped:
                    merchant_tier = int(a["tier"])
            advanced, repaid, lost = advanced + p, repaid + r, lost + w
        merchant_tier = min(3, max(0, merchant_tier))
        return {
            "senior_assets": self._usd(d.senior.functions.totalAssets().call()),
            "junior_assets": self._usd(d.junior.functions.totalAssets().call()),
            "reserve": self._usd(d.book.functions.reserve().call()),
            "junior_share_price": round(d.share_price(d.junior), 6),
            "junior_pool_price": round(d.junior_price_from_tick(tick), 6),
            "outstanding": self._usd(d.senior.functions.outstanding().call()),
            "advanced": self._usd(advanced), "repaid": self._usd(repaid), "written_off": self._usd(lost),
            "tier_caps": [self._usd(x) for x in caps_raw], "merchant_tier": merchant_tier,
            "merchant_limit": self._usd(caps_raw[merchant_tier]),
        }

    def state_ledger(self, max_age: float = 3.0) -> dict:
        """Global ledger for GET /sim/state, cached briefly (every judge's browser polls it)."""
        now = time.monotonic()
        if self._state_cache is None or now - self._state_cache[0] >= max_age:
            self._state_cache = (now, self.ledger())
        return self._state_cache[1]

    # -------------------------------------------------------------- steps
    def _step(self, ctx, kind, title, detail, data=None, tx=None):
        if self.clock() - ctx["started"] > self.timeout:
            raise TimeoutError("scenario exceeded its run budget")
        gap = PACE_SECONDS - (self.clock() - ctx["last"])
        if gap > 0 and ctx["i"]:
            self.sleep(gap)
        event = {"i": ctx["i"], "at": self.clock(), "sim_day": ctx["sim_day"], "kind": kind, "title": title,
                 "detail": detail, "data": data or {}, "tx": self._tx(tx)}
        ctx["i"] += 1
        ctx["last"] = event["at"]
        ctx["store"].update(ctx["run_id"], lambda r, e=event: r["steps"].append(e))
        return event

    def _left(self, ctx) -> float:
        return max(5.0, self.timeout - (self.clock() - ctx["started"]))

    def _ledger(self, ctx):
        return self.ledger(ctx["advances"], ctx.get("tier"))

    # -------------------------------------------------------------- accounts and money
    @staticmethod
    def _burner():
        """A throwaway account from the public anvil mnemonic at a random index (devnet keys only)."""
        from devnet_lib import key
        return key(1_000_000 + secrets.randbelow(2**30))

    def _fund_eth(self, d, acct, amount=10**17):
        if d.w3.eth.get_balance(acct.address) < amount // 2:
            from devnet_lib import role
            d.send_eth(role("faucet"), acct.address, amount)

    def _mint(self, d, to_addr, amount):
        from devnet_lib import role
        return d.send(d.usdc.functions.mint(to_addr, int(amount)), role("owner"))

    def _new_payers(self, d, n):
        payers = [self._burner() for _ in range(n)]
        for p in payers:
            self._fund_eth(d, p)
            d.send(d.usdc.functions.approve(d.addr("AdvanceBook"), 2**256 - 1), p)
        return payers

    def _pay(self, d, payer, shop_id: bytes, amount: int):
        if d.usdc.functions.balanceOf(payer.address).call() < amount:
            self._mint(d, payer.address, amount + 50 * USDC)
        return d.send(d.book.functions.pay(shop_id, int(amount)), payer)

    @staticmethod
    def _at(d, ts: int):
        now = d.now()
        if ts > now:
            d.warp(ts - now)

    # -------------------------------------------------------------- World ID binding, ban, unlock (humans.py)
    def _world_verify(self, ctx, shop):
        """The shop's owner signs the owner-auth message and binds a World ID (mock IDKit: one human per run, so the
        same person always yields the same nullifier). The backend keeps only an HMAC of the nullifier."""
        from eth_account import Account
        from eth_account.messages import encode_defunct

        from mra_agents.humans import owner_auth_message
        from mra_agents.world import MockIDKit
        humans = self._service("humans")
        issued = int(time.time())
        msg = owner_auth_message(shop["shop_hex"], 31337, issued)
        sig = Account.sign_message(encode_defunct(text=msg), shop["owner"].key).signature.hex()
        auth = f"Owner {issued}:0x{sig.removeprefix('0x')}"
        human = f"sim-{ctx['run_id']}"
        if isinstance(humans.verifier, MockIDKit):
            out = humans.bind(shop["shop_hex"], {"mock": "approve", "mock_human": human}, auth)
        else:  # a real World verifier is configured: a devnet stand-in nullifier for this run's merchant
            from eth_utils import keccak
            if not humans.owner_ok(shop["shop_hex"], auth):
                raise RuntimeError("owner auth failed")
            humans.registry.bind(shop["shop_hex"], "0x" + keccak(f"sim-world:{human}".encode()).hex())
            out = {"verified": True}
        shop["auth"] = auth
        self._step(ctx, "world_id", "World ID: a unique human, nobody in particular",
                   "The shop owner proved with World ID (proof of human, mock IDKit on the devnet) that a unique "
                   "person stands behind the shop. The backend keeps only an HMAC of World's nullifier, encrypted "
                   "and linked to this shop privately. No name, nothing onchain, and the API never returns it.",
                   {"verified": out.get("verified") is True,
                    "public": [{"label": "Onchain", "value": "nothing: the binding lives in the offer signer's DB"}],
                    "private": [{"label": "World nullifier", "value": "never stored; HMAC only"},
                                {"label": "Which shops belong to this human", "value": "encrypted at rest"}]})
        return out

    def _world_ban(self, ctx, d, shop):
        """After a write-off: the human behind the shop is banned, then a fresh pseudonymous shop is refused."""
        reader = self._service("reader")
        registry = self._service("human_registry")
        registry.sync_write_offs(reader.advances())  # the Keeper already did this; idempotent
        human = registry.human_for_shop(shop["shop_hex"])
        banned = bool(human and registry.is_banned(human))
        if not banned:
            raise RuntimeError("write-off did not ban the World ID")
        status = self._service("humans").status(shop["shop_hex"], shop["auth"])
        self._step(ctx, "world_id", "World ID banned: this person can't borrow again, on any shop",
                   "The advance was written off, so the offer signer banned the World ID behind this shop. It is a "
                   "private list: nothing about the person went onchain, and only the shop's owner can see the "
                   "ban. A new pseudonym won't help, because the same human gives the same World ID.",
                   {"banned": status.get("banned"), "verified": status.get("verified"),
                    "public": [{"label": "Onchain", "value": "only the write-off of a pseudonymous shop"}],
                    "private": [{"label": "Ban list", "value": "HMAC of the World nullifier, offer signer only"}]})
        features = ctx.get("features")
        before = self.ledger()
        ctx["stage"] = "new_shop"
        fresh = self._register(ctx, d, "defaulter")
        secret = self._business_pass(ctx, d)
        from mra_agents import zk
        signed = self._underwrite(ctx, fresh, tier=0, pass_nullifier=zk.business_nullifier(secret), band=1,
                                  attempts=1)
        hits = list(ctx.get("last_hits") or [])
        if signed is not None or "human_banned" not in hits:
            raise RuntimeError("banned human was not refused on a new shop")
        after = self.ledger()
        self._step(ctx, "world_view", "New shop refused: human_banned, no money moved",
                   f"Same person, new pseudonymous shop, even a fresh Business Pass: the offer signer refused before "
                   f"any model call. Outstanding stays at ${after['outstanding']:,.2f}.",
                   {"flags": hits, "outstanding_before": before["outstanding"],
                    "outstanding_after": after["outstanding"],
                    "unchanged": before["outstanding"] == after["outstanding"]})
        ctx["features"] = features  # the run's summary describes the original shop
        return fresh

    def _unlock_step(self, ctx, shop, tier, amount):
        """Owner-only status after the first draw at a new level: what the gradual unlock allows now and next."""
        status = self._service("humans").status(shop["shop_hex"], shop["auth"], tier)
        u = status.get("unlock") or {}
        steps = u.get("steps") or []
        ladder = ", ".join(f"{s['pct']}% = ${s['amount_usd']:.0f}" for s in steps)
        self._step(ctx, "unlock", f"Gradual unlock: ${amount / USDC:.0f} of the ${u.get('limit_usd', 0):.0f} limit",
                   f"The first advance at a new limit level is capped at 50%. Each full week of on-time minimum "
                   f"repayments (1% of principal plus fee per 7 days) unlocks 25% more: {ladder}. A missed minimum "
                   "freezes it; a write-off bans the World ID.",
                   {"unlock": u, "drawn": amount / USDC})
        return u

    # -------------------------------------------------------------- shop + sales history
    def _register(self, ctx, d, kind: str):
        from web3 import Web3
        owner, payout = self._burner(), self._burner()
        self._fund_eth(d, owner)
        self._fund_eth(d, payout)
        shop_id = Web3.keccak(text=f"sim:{kind}:{secrets.token_hex(16)}")
        shop_hex = "0x" + shop_id.hex().removeprefix("0x")
        rc = d.send(d.book.functions.registerShop(shop_id, payout.address), owner)
        label = f"{kind.replace('_', '-')}-{shop_hex[2:6]}"
        ctx["store"].update(ctx["run_id"], lambda r: r.update(shop={"pseudonym": label, "shop_id": shop_hex}))
        self._step(ctx, "shop", "Merchant opens a pseudonymous shop",
                   f"Registered {label} onchain: a random shop id and a fresh payout address. No name, no phone.",
                   {"pseudonym": label, "shop_id": shop_hex}, rc)
        shop = {"shop_id": shop_id, "shop_hex": shop_hex, "payout": payout, "label": label, "owner": owner}
        self._world_verify(ctx, shop)
        return shop

    def _history(self, ctx, d, shop, *, days, payers, rng, per_day=(1, 3), amount=(6.0, 28.0), machine=False):
        """Real customer sales, one step per simulated day. Honest: 1-3 sales a day at scattered hours, uneven
        cent amounts, many customers, a gently rising month (a declining trend reads as risk to the Critic).
        machine=True: one round-dollar sale a day at the same minute."""
        start = (d.now() // DAY + 1) * DAY
        total = 0
        for day in range(days):
            base = start + day * DAY
            times = [base + 14 * HOUR] if machine else \
                sorted(base + rng.randrange(8 * HOUR, 21 * HOUR) for _ in range(rng.randint(*per_day)))
            amounts, rc = [], None
            for ts in times:
                self._at(d, ts)
                trend = 1.0 if machine else 0.9 + 0.2 * day / max(1, days - 1)
                amt = int(round(rng.uniform(*amount) * trend, 0 if machine else 2) * USDC)
                rc = self._pay(d, rng.choice(payers), shop["shop_id"], amt)
                amounts.append(amt)
            ctx["sim_day"] += 1
            total += sum(amounts)
            n = len(amounts)
            self._step(ctx, "sale", f"Day {ctx['sim_day']}: {n} sale{'s' * (n > 1)}, ${sum(amounts) / USDC:.2f}",
                       f"Customer payment{'s' * (n > 1)} to {shop['label']}: {_money(amounts)}.",
                       {"amount": sum(amounts) / USDC, "sales": n, "total_usd": round(total / USDC, 2)}, rc)
        return total

    # -------------------------------------------------------------- Business Pass (tier 0)
    def _business_pass(self, ctx, d):
        from devnet_lib import role

        from mra_agents import bizpass, zk
        secret = secrets.randbelow(zk.P - 1) + 1
        registry = d.contract("BusinessPassRegistry")
        relayer = self._service("relayer")
        txs: list[str] = []

        def submit(*args):
            txs.append(relayer.issue_business_pass(*args))
            return txs[-1]
        bizpass.devnet_issue(issuer_key=role("issuer").key, chain_id=31337, registry=registry.address,
                             secret=secret, country=COUNTRY, revenue_band=REVENUE_BAND, age_ok=AGE_OK,
                             now=d.now(), submit_issue=submit)
        self._step(ctx, "info", "Business Pass issued (zkTLS stand-in)",
                   "The devnet issuer attested the seller account (country, revenue band, age) and added a hiding "
                   "commitment to the Business Pass tree. The secret stays on the merchant's phone.",
                   {"country": "AR", "revenue_band": REVENUE_BAND}, txs[0] if txs else None)
        return secret

    def _business_proof(self, ctx, d, secret, offer):
        from mra_agents import bizpass, zk
        leaves = bizpass.tree_leaves(d.contract("BusinessPassRegistry"), int(d.dep.get("deployBlock", 0)))
        secret_next = secrets.randbelow(zk.P - 1) + 1
        inputs = bizpass.prover_inputs(
            secret=secret, country=COUNTRY, revenue_band=REVENUE_BAND, age_ok=AGE_OK, leaves=leaves,
            leaf_index=leaves.index(zk.business_leaf(secret, COUNTRY, REVENUE_BAND, AGE_OK)),
            secret_next=secret_next, min_band=offer.min_revenue_band,
            context=zk.offer_context(offer.recipient, bytes.fromhex(offer.offer_id[2:])))
        proof, ms = self.prover.prove("business_pass", inputs.toml, timeout=min(120, self._left(ctx)))
        self._proof_step(ctx, "business_pass", proof, ms,
                         {"root": inputs.root, "nullifier": inputs.nullifier, "min_revenue_band": inputs.min_band,
                          "commitment_next": inputs.commitment_next, "context (offer binding)": inputs.context},
                         ["secret", "country", "revenue band", "age flag", "Merkle path (which leaf)", "secret_next"],
                         len(leaves))
        return proof, inputs, secret_next

    def _proof_step(self, ctx, circuit, proof, ms, public, private, tree_size):
        self._step(ctx, "zk_proof", f"Zero-knowledge proof: {circuit.replace('_', ' ').title()}",
                   f"Real UltraHonk proof, {len(proof):,} bytes, made in {ms / 1000:.2f} s and verified. It proves "
                   f"membership in a tree of {tree_size} without revealing which leaf, and it is bound to this offer.",
                   {"circuit": circuit, "proof_bytes": len(proof), "ms": round(ms), "tree_size": tree_size,
                    "public_inputs": [{"label": k, "value": hex(v) if v > 10**6 else str(v)} for k, v in public.items()],
                    "private": private})

    # -------------------------------------------------------------- underwriting
    def _features(self, pipeline, shop_hex, tier, band):
        """The same features the pipeline computes inside request_offer (shown in the feed)."""
        from mra_agents.pipeline import apply_cold_start
        now = int(pipeline.now())
        pipeline.indexer.sync()
        sales = pipeline.indexer.sales_for(shop_hex, now - 90 * DAY)
        payers = list({x.payer for x in sales})
        funders = pipeline.reader.usdc_funders(payers, now - 97 * DAY)
        features = pipeline.build_features(shop_hex, sales, funders, pipeline.reader.shop_payout(shop_hex), now,
                                           pipeline.settings.payer_hash_key.get_secret_value().encode())
        return apply_cold_start(features, tier, band)

    @staticmethod
    def _feature_view(f):
        return {"sales_count_30d": f.sales_count_30d, "unique_payers_30d": f.unique_payers_30d,
                "days_active_30d": f.days_active_30d, "revenue_30d_usd": round(f.revenue_30d_usd, 2),
                "top_payer_share_30d": round(f.top_payer_share_30d, 4),
                "funded_by_shop_share": round(f.funded_by_shop_share, 4), "spike_ratio": round(f.spike_ratio, 3),
                "hour_of_day_entropy": round(f.hour_of_day_entropy, 3),
                "round_amount_share_30d": round(f.round_amount_share_30d, 3), "cold_start": f.cold_start}

    @staticmethod
    def _redline_table(f):
        from mra_agents import redlines as rl
        return [
            {"rule": "unique_payers_30d", "value": f.unique_payers_30d, "limit": f">= {rl.MIN_UNIQUE_PAYERS_30D}"},
            {"rule": "top_payer_share_30d", "value": round(f.top_payer_share_30d, 4),
             "limit": f"<= {rl.MAX_TOP_PAYER_SHARE_30D}"},
            {"rule": "funded_by_shop_share", "value": round(f.funded_by_shop_share, 4),
             "limit": f"<= {rl.MAX_FUNDED_BY_SHOP_SHARE}"},
            {"rule": "days_active_30d", "value": f.days_active_30d, "limit": f">= {rl.MIN_DAYS_ACTIVE_30D}"},
            {"rule": "spike_ratio", "value": round(f.spike_ratio, 3), "limit": f"<= {rl.MAX_SPIKE_RATIO}"},
        ]

    def _underwrite(self, ctx, shop, *, tier, pass_nullifier=0, band=0, attempts=MAX_ATTEMPTS):
        """The production pipeline end to end: features -> red lines -> Underwriter -> Critic -> clamp -> sign.
        Re-asks only on the Critic's send_back (the merchant tapping "try again"); reject is final."""
        from mra_agents import redlines as rl
        pipeline = self._service("pipeline")
        models = getattr(pipeline.judge.llm, "models", None) or {}
        model = models.get("OfferDraft") or pipeline.settings.anthropic_model
        critic_model = models.get("CriticVerdict") or model
        decision = features = None
        ctx["stage"] = "underwriting"
        for attempt in range(1, attempts + 1):
            features = self._features(pipeline, shop["shop_hex"], tier, band)
            view = self._feature_view(features)
            if attempt == 1:
                self._step(ctx, "info", f"Merchant asks for a tier-{tier} advance",
                           f"The agents read {features.sales_count_30d} onchain sales from "
                           f"{features.unique_payers_30d} customers over {features.days_active_30d} days. Customer "
                           "addresses are HMAC-hashed before any model sees them.",
                           {"tier": tier, "features_seen": view})
            decision = pipeline.request_offer(shop["shop_hex"], tier, shop["payout"].address, pass_nullifier, band)
            hits = list(decision.redline_hits)
            ctx["last_hits"] = hits
            if attempt == 1 or hits:
                self._step(ctx, "redlines", "Red lines: " + (", ".join(hits) if hits else "all clear"),
                           ("Pure code stopped the request before any model call. " + " ".join(rl.messages(hits)))
                           if hits else "Pure-code checks passed: customers, concentration, circular funding, "
                                        "active days, spikes.",
                           {"flags": hits, "checks": self._redline_table(features), "features_seen": view})
            draft, verdict = decision.draft, decision.verdict
            if hits:
                self._step(ctx, "underwriter", "AI Underwriter not called",
                           "A red line fired, so no model was asked: fraud checks never depend on an LLM.",
                           {"model": model, "decision": "skipped", "reasons": [], "flags": hits})
                self._step(ctx, "critic", "AI Critic not called", "Skipped: the red lines already rejected the shop.",
                           {"model": critic_model, "verdict": "skipped", "reasons": [], "flags": hits})
                break
            if draft is not None:
                terms = draft_summary(draft) + " " if draft.decision == "offer" else ""
                reasons = [plain(x) for x in draft.reasons_en]
                self._step(ctx, "underwriter", f"AI Underwriter drafts: {draft.decision}"
                           + (f" (attempt {attempt})" if attempt > 1 else ""), terms + " ".join(reasons),
                           {"model": model, "decision": draft.decision, "reasons": reasons,
                            "draft": draft.model_dump(exclude={"reasons_en", "reasons_es"}), "flags": [],
                            "features_seen": view})
            else:
                self._step(ctx, "underwriter", "AI Underwriter did not answer",
                           f"The pipeline ended as '{decision.result}' without a draft, so nothing was signed.",
                           {"model": model, "decision": decision.result, "reasons": decision.clamp_changes,
                            "flags": []})
            if verdict is not None:
                self._step(ctx, "critic", f"Independent AI Critic: {verdict.verdict}", plain(verdict.summary_en),
                           {"model": critic_model, "verdict": verdict.verdict, "reasons": [plain(verdict.summary_en)],
                            "flags": [f.model_dump() for f in verdict.flags],
                            "sees": "features and the draft's numbers only, never the Underwriter's reasons"})
            elif draft is not None and draft.decision != "offer":
                self._step(ctx, "critic", "AI Critic not needed", "The Underwriter declined, so nothing to review.",
                           {"model": critic_model, "verdict": "skipped", "reasons": [], "flags": []})
            if decision.signed_offer is not None:
                break
            if verdict is not None and verdict.verdict == "send_back" and attempt < attempts:
                self._step(ctx, "info", "Draft sent back: the merchant asks again",
                           "The Critic can approve, send back or reject, never edit an offer. A new request runs the "
                           "whole pipeline again.", {"attempt": attempt + 1})
                continue
            break
        ctx["features"] = features
        if decision.signed_offer is None:
            self._step(ctx, "offer", "No offer: no money moves",
                       f"Pipeline result: {decision.result}. Nothing was signed, so nothing can be drawn.",
                       {"decision": decision.result, "flags": list(decision.redline_hits),
                        "clamp_changes": decision.clamp_changes})
            return None
        o = decision.signed_offer.offer
        terms = offer_terms(o)
        self._step(ctx, "offer", f"Offer signed: ${terms['amount']:.0f} at tier {o.tier}",
                   terms["summary"] + (" Code clamped: " + "; ".join(decision.clamp_changes) + "."
                                       if decision.clamp_changes else ""),
                   {**terms, "clamp_changes": decision.clamp_changes, "expires_at": o.expires_at,
                    "signature": decision.signed_offer.signature[:18] + "…"})
        return decision.signed_offer

    # -------------------------------------------------------------- draw / repay / claim
    def _after_draw(self, ctx, d, shop, tx, signed, how):
        active = int(d.book.functions.shops(shop["shop_id"]).call()[2])
        ctx["advances"].append(active)
        ctx["tier"] = signed.offer.tier
        a = self._advance(d, active)
        fee = fee_status(a, d.now())
        self._step(ctx, "draw", f"Advance #{active} drawn: ${signed.offer.amount / USDC:.0f} paid out",
                   f"{how} The senior vault funded ${int(a['principal']) / USDC:.2f}; ${a['left'] / USDC:.2f} is owed "
                   f"now. The fee accrues {fee['fee_terms']} (at most ${fee['fee_cap_usd']:.2f}) only while principal "
                   "is owed, and each repayment pays fee first.",
                   {"advance_id": active, "amount": signed.offer.amount / USDC, "tier": signed.offer.tier,
                    "owed": a["left"] / USDC, **fee, "ledger": self._ledger(ctx)}, tx)
        return active

    def _sales_period(self, ctx, d, shop, advance_id, payers, *, days, pace, rng, close=False, title=None):
        """`days` days of real customer sales at about `pace` $/day; each pay() routes the holdback to the
        advance. close=True sizes the last sale to finish it (demo_standing_pass.sale_to_repay). One step."""
        from demo_standing_pass import sale_to_repay
        before = self._advance(d, advance_id)
        start = (d.now() // DAY + 1) * DAY
        amounts, rc = [], None
        for day in range(days):
            times = sorted(start + day * DAY + rng.randrange(8 * HOUR, 21 * HOUR) for _ in range(rng.randint(1, 2)))
            for j, ts in enumerate(times):
                self._at(d, ts)
                a = self._advance(d, advance_id)  # after the warp: owedOf includes the fee accrued so far
                if int(a["status"]) != 1:
                    break
                amt = int(round(pace / len(times) * rng.uniform(0.7, 1.3), 2) * USDC)
                if close and day == days - 1 and j == len(times) - 1:
                    # +1 cent: the fee keeps accruing per second until the sale mines; the book caps at owedOf.
                    amt = max(amt, sale_to_repay(a["left"] + 10_000, int(a["holdbackBps"])))
                rc = self._pay(d, rng.choice(payers), shop["shop_id"], amt)
                amounts.append(amt)
        ctx["sim_day"] += days
        after = self._advance(d, advance_id)
        to_advance = int(after["repaid"]) - int(before["repaid"])
        to_late = int(after.get("lateFeePaid", 0)) - int(before.get("lateFeePaid", 0))
        to_fee = int(after["feePaid"]) - int(before["feePaid"])
        done = int(after["status"]) == 2
        fee = fee_status(after, d.now())
        span = f"Days {ctx['sim_day'] - days + 1}-{ctx['sim_day']}" if days > 1 else f"Day {ctx['sim_day']}"
        self._step(ctx, "repay", title or f"{span}: ${to_advance / USDC:.2f} repaid from sales",
                   f"{len(amounts)} sales, ${sum(amounts) / USDC:.2f} in total; the "
                   f"{int(after['holdbackBps']) / 100:g}% holdback sent ${to_advance / USDC:.2f} to the advance "
                   f"(fee first: ${to_fee / USDC:.2f} fee, "
                   + (f"${to_late / USDC:.2f} late fee to the reserve, " if to_late else "")
                   + f"${(to_advance - to_fee - to_late) / USDC:.2f} principal). "
                   + (f"Fully repaid; total fee ${fee['fee_paid_usd']:.2f}." if done else
                      f"${after['left'] / USDC:.2f} left, fee so far ${fee['fee_accrued_usd']:.2f} of at most "
                      f"${fee['fee_cap_usd']:.2f}."),
                   {"sales_usd": sum(amounts) / USDC, "sales": len(amounts), "to_advance": to_advance / USDC,
                    "to_fee": to_fee / USDC, "to_late_fee": to_late / USDC,
                    "to_principal": (to_advance - to_fee - to_late) / USDC, **fee,
                    "repaid": int(after["repaid"]) / USDC, "left": after["left"] / USDC, "days": days,
                    "status": ["none", "active", "repaid", "written_off"][int(after["status"])],
                    "ledger": self._ledger(ctx)}, rc)
        return after

    def _repay_all(self, ctx, d, shop, advance_id, payers, pace, rng):
        """Sales periods until owedOf reaches zero (the advance reads Repaid). The live balance includes the fee
        accrued so far, so the total is never assumed up front."""
        for _ in range(12):
            a = self._advance(d, advance_id)
            if int(a["status"]) != 1:
                break
            per_day = max(0.01, pace * int(a["holdbackBps"]) / 10_000)
            days_left = a["left"] / USDC / per_day
            self._sales_period(ctx, d, shop, advance_id, payers, days=max(1, min(4, round(days_left))),
                               pace=pace, rng=rng, close=days_left <= 4.5)
        return self._advance(d, advance_id)

    def _claim(self, ctx, d, advance_id):
        tx = self._service("relayer").claim(advance_id)
        events = d.book.events.LeafInserted().get_logs(from_block=int(d.dep.get("deployBlock", 0)))
        leaves = [int(e["args"]["commitment"]) for e in sorted(events, key=lambda e: e["args"]["leafIndex"])]
        self._step(ctx, "standing_pass", "Standing Pass claimed",
                   "Full repayment unlocked claimStandingPass: the commitment made at the draw joins the Standing "
                   f"Pass tree ({len(leaves)} {'leaf' if len(leaves) == 1 else 'leaves'}). The merchant can now prove a good "
                   "record from any new shop.",
                   {"advance_id": advance_id, "tier": 1, "tree_size": len(leaves), "ledger": self._ledger(ctx)}, tx)
        return leaves

    # -------------------------------------------------------------- scenarios
    def _honest(self, ctx, d, archetype, rng):
        from mra_agents import zk
        shop = self._register(ctx, d, archetype)
        payers = self._new_payers(d, 16)
        self._history(ctx, d, shop, days=HISTORY_DAYS, payers=payers, rng=rng)
        secret = self._business_pass(ctx, d)
        signed = self._underwrite(ctx, shop, tier=0, pass_nullifier=zk.business_nullifier(secret), band=1)
        if signed is None:
            return shop, "Underwriting did not issue an offer; no money moved"
        ctx["stage"] = "proving"
        proof, inputs, standing_secret = self._business_proof(ctx, d, secret, signed.offer)
        ctx["stage"] = "draw"
        tx = self._service("relayer").draw_first(signed, "0x" + proof.hex(), inputs.root, inputs.commitment_next)
        advance_id = self._after_draw(ctx, d, shop, tx, signed,
                                      "drawFirst verified the Business Pass proof onchain and spent its nullifier.")
        pace = max(10.0, ctx["features"].revenue_30d_usd / HISTORY_DAYS)
        ctx["stage"] = "repayment"
        if archetype == "defaulter":
            return shop, self._default(ctx, d, shop, advance_id, payers, pace, rng)
        if archetype == "slow_week":
            start = self._advance(d, advance_id)
            normal = self._sales_period(ctx, d, shop, advance_id, payers, days=3, pace=pace, rng=rng)
            before = self._advance(d, advance_id)
            slow = self._sales_period(ctx, d, shop, advance_id, payers, days=7, pace=pace * 0.2, rng=rng,
                                      title="Slow week: sales drop 80%, repayment slows")
            fee = fee_status(slow, d.now())
            per_day_normal = (int(normal["repaid"]) - int(start["repaid"])) / 3 / USDC
            per_day_slow = (int(slow["repaid"]) - int(before["repaid"])) / 7 / USDC
            clock_reset = int(slow["lastSaleAt"]) > int(before["lastSaleAt"])
            if fee["extra_fee_usd"] > 0:
                raise RuntimeError("fee above the published schedule after the slow week")
            on_time = fee["late_fee_usd"] == 0
            self._step(ctx, "info", f"Slow week: the fee keeps to {fee['fee_terms']}, "
                       + ("no late fee" if on_time else f"plus a ${fee['late_fee_usd']:.2f} late fee"),
                       f"Repayment fell from ${per_day_normal:.2f}/day to ${per_day_slow:.2f}/day. "
                       f"The fee so far is ${fee['fee_accrued_usd']:.2f} after {fee['weeks_outstanding']:g} weeks: "
                       f"exactly the published {fee['fee_terms']} on ${int(slow['principal']) / USDC:.0f}, "
                       f"and it stops at ${fee['fee_cap_usd']:.2f} however slow sales get (the cap is reached after "
                       f"{fee['weeks_to_cap']:g} weeks). "
                       + ("The slow week's sales still met the 1% weekly minimum, so there is no late fee and no "
                          "penalty." if on_time else
                          f"Repayment fell behind the 1% weekly minimum, so the fee doubled while behind: a "
                          f"${fee['late_fee_usd']:.2f} late fee, all of it to the safety reserve. It stops as soon as "
                          "they catch up.")
                       + (" The default clock reset." if clock_reset else ""),
                       {"repaid_per_day_normal": round(per_day_normal, 2),
                        "repaid_per_day_slow": round(per_day_slow, 2), **fee,
                        "min_repayment_met": clock_reset, "owed_now": slow["left"] / USDC})
        final = self._repay_all(ctx, d, shop, advance_id, payers, pace, rng)
        if int(final["status"]) != 2:
            raise RuntimeError("advance was not fully repaid")
        ctx["stage"] = "standing_pass"
        leaves = self._claim(ctx, d, advance_id)
        if archetype == "repeat_borrower":
            return self._repeat(ctx, d, standing_secret, leaves, rng)
        days = ctx["sim_day"] - HISTORY_DAYS
        return shop, (f"Repaid ${int(final['repaid']) / USDC:.2f} in {days} days (fee "
                      f"${int(final['feePaid']) / USDC:.2f}, {fee_words(int(final['feeRateBpsPerWeek']), int(final['feeCapBps']))})"
                      + ((" despite a slow week, with no late fee" if int(final.get("lateFeePaid", 0)) == 0 else
                          f" despite a slow week, incl. ${int(final['lateFeePaid']) / USDC:.2f} late fee to the reserve")
                         if archetype == "slow_week" else "")
                      + "; Standing Pass claimed")

    def _repeat(self, ctx, d, standing_secret, leaves, rng):
        from mra_agents import zk
        ctx["stage"] = "repeat"
        fresh = self._register(ctx, d, "repeat_borrower")
        self._step(ctx, "world_view", "A fresh, unlinkable pseudonym",
                   "The returning merchant opened a brand-new shop. Onchain, nothing links it to the repaid one.",
                   {"public": [{"label": "New shop id", "value": fresh["shop_hex"]}],
                    "private": [{"label": "Which earlier shop repaid", "value": "hidden by the zero-knowledge proof"}]})
        payers = self._new_payers(d, 10)
        # A busy week on the new shop: the Standing Pass replaces history, not sales (thin sales read as unaffordable).
        self._history(ctx, d, fresh, days=6, payers=payers, rng=rng, per_day=(2, 4))
        signed = self._underwrite(ctx, fresh, tier=1)
        if signed is None:
            return fresh, "Repaid and claimed a Standing Pass; the tier-1 request got no offer"
        ctx["stage"] = "proving"
        path, bits, root = zk.merkle_path(leaves, leaves.index(zk.standing_commitment(standing_secret, 1)))
        nullifier = zk.standing_nullifier(standing_secret)
        secret_next = secrets.randbelow(zk.P - 1) + 1  # the count-2 credential; on a real phone it stays there
        nxt = zk.standing_commitment(secret_next, 2)
        context = zk.offer_context(signed.offer.recipient, bytes.fromhex(signed.offer.offer_id[2:]))
        toml = standing_toml(secret=standing_secret, count=1, path=path, bits=bits, secret_next=secret_next,
                             root=root, nullifier=nullifier, tier=1, commitment_next=nxt, context=context)
        proof, ms = self.prover.prove("standing_pass", toml, timeout=min(120, self._left(ctx)))
        self._proof_step(ctx, "standing_pass", proof, ms,
                         {"root": root, "nullifier": nullifier, "tier": 1, "commitment_next": nxt,
                          "context (offer binding)": context},
                         ["secret", "repaid count", "Merkle path (which leaf)", "secret_next"], len(leaves))
        ctx["stage"] = "draw"
        tx = self._service("relayer").draw_with_pass(signed, "0x" + proof.hex(), root, nullifier, nxt)
        aid = self._after_draw(ctx, d, fresh, tx, signed,
                               "drawWithPass verified the Standing Pass proof and spent its nullifier.")
        ledger = self._ledger(ctx)
        self._step(ctx, "standing_pass", f"Tier-1 limit on the fresh pseudonym: ${ledger['merchant_limit']:.0f}",
                   f"The Standing Pass lifted this shop from the tier-0 cap (${ledger['tier_caps'][0]:.0f}) to "
                   f"tier 1 (${ledger['merchant_limit']:.0f}) with only 6 days of history; it drew "
                   f"${signed.offer.amount / USDC:.0f}.",
                   {"tier": 1, "advance_id": aid, "limit": ledger["merchant_limit"],
                    "amount": signed.offer.amount / USDC, "ledger": ledger})
        self._unlock_step(ctx, fresh, 1, signed.offer.amount)
        return fresh, (f"Repaid, claimed a Standing Pass, then drew ${signed.offer.amount / USDC:.0f} at tier 1 "
                       "on a fresh pseudonym")

    def _wash(self, ctx, d, rng):
        from mra_agents import zk
        shop = self._register(ctx, d, "wash_ring")
        payout = shop["payout"]
        ring = self._new_payers(d, 4)
        funder = self._burner()
        self._fund_eth(d, funder)
        self._mint(d, payout.address, 4_000 * USDC)
        self._mint(d, funder.address, 4_000 * USDC)
        rc = None
        for p in ring:
            # Circular: the shop's own payout address funds its "customers"; one common funder tops them all up.
            d.send(d.usdc.functions.transfer(p.address, 1_000 * USDC), payout)
            rc = d.send(d.usdc.functions.transfer(p.address, 1_000 * USDC), funder)
        self._step(ctx, "info", "Ring setup: the shop pays its own customers",
                   "The payout address sends USDC to 4 burner 'customers', and one common funder tops all of them up. "
                   "They buy from the shop every day, so the same money goes round in a circle.",
                   {"payers": 4, "funded_from_payout_usd": 4_000, "common_funder_usd": 4_000}, rc)
        self._history(ctx, d, shop, days=HISTORY_DAYS, payers=ring, rng=rng, machine=True, amount=(90, 140))
        secret = self._business_pass(ctx, d)
        before = self.ledger()
        signed = self._underwrite(ctx, shop, tier=0, pass_nullifier=zk.business_nullifier(secret), band=1,
                                  attempts=1)
        if signed is not None:
            raise RuntimeError("wash ring was offered an advance: red lines and Critic both failed")
        after = self.ledger()
        same = before["outstanding"] == after["outstanding"] and before["senior_assets"] == after["senior_assets"]
        hits = ctx.get("last_hits") or []
        self._step(ctx, "world_view", "Stopped before any money moved",
                   f"Outstanding stays at ${after['outstanding']:,.2f} and the vaults are unchanged: the ring has "
                   "nothing to draw.", {"outstanding_before": before["outstanding"],
                                        "outstanding_after": after["outstanding"], "unchanged": same})
        by = f"red lines ({', '.join(hits)})" if hits else "the AI Critic"
        return shop, f"Rejected by {by}; no advance, no money moved"

    def _default(self, ctx, d, shop, advance_id, payers, pace, rng):
        from devnet_lib import role

        from mra_agents.keeper import Keeper
        self._sales_period(ctx, d, shop, advance_id, payers, days=2, pace=pace, rng=rng,
                           title="Two more days of sales, then the shop goes quiet")
        # Falls behind the minimum: 3 days past the 7-day deadline (still before the 14-day delinquency mark, so
        # the `dark` ledger below is taken before DRIP provisions), the late fee is accruing.
        a = self._advance(d, advance_id)
        self._at(d, int(a["lastSaleAt"]) + REPAY_WINDOW + 3 * DAY)
        gap = max(1, round((d.now() - int(a["lastSaleAt"])) / DAY))
        ctx["sim_day"] += gap
        a = self._advance(d, advance_id)
        fee = fee_status(a, d.now())
        self._step(ctx, "warp", f"{gap} days with no sales: behind the minimum, the fee doubles",
                   f"No 1% repayment for more than 7 days, so the advance is behind. While behind, the fee doubles "
                   f"to 1% a week: a ${fee['late_fee_usd']:.2f} late fee so far (max ${fee['late_fee_cap_usd']:.2f}), "
                   "on top of the normal fee. It goes 100% to the safety reserve, the first-loss buffer.",
                   {"days": gap, **fee, "left": a["left"] / USDC, "ledger": self._ledger(ctx)})
        # A trickle of sales while behind: fee first, then the late fee, which lands in the reserve.
        r0 = int(d.book.functions.reserve().call())
        after = self._sales_period(ctx, d, shop, advance_id, payers, days=1, pace=pace * 0.15, rng=rng,
                                   title="A trickle of sales while behind: the late fee funds the reserve")
        to_reserve = int(d.book.functions.reserve().call()) - r0
        self._step(ctx, "info", f"Reserve +${to_reserve / USDC:.2f} from this late payer",
                   f"Late fee paid so far ${int(after.get('lateFeePaid', 0)) / USDC:.2f}, credited 100% to the "
                   "reserve (plus its 20% share of the normal fee). Late payers fund the default buffer that "
                   "protects the vaults if they never pay.",
                   {"reserve_delta": to_reserve / USDC, "late_fee_paid": int(after.get("lateFeePaid", 0)) / USDC,
                    "ledger": self._ledger(ctx)})
        a = self._advance(d, advance_id)
        window = int(d.book.functions.defaultWindow().call())
        target = int(a["lastSaleAt"]) + window + DAY
        days = max(1, round((target - d.now()) / DAY))
        dark = self.ledger()  # before the silence: DRIP provisions delinquent principal from day 14, not at writeOff
        self._at(d, target)
        ctx["sim_day"] += days
        a = self._advance(d, advance_id)
        fee = fee_status(a, d.now())
        delinquent = int(d.book.functions.DELINQUENCY_WINDOW().call())
        self._step(ctx, "warp", f"{days} days with no sales",
                   f"Anvil's clock jumps {days} days. The minimum repayment is 1% of principal plus fee every 7 "
                   f"days; with none, the advance is delinquent after {delinquent // DAY} days and anyone may call "
                   f"writeOff after {window // DAY}. ${a['left'] / USDC:.2f} is owed (fee "
                   f"${fee['fee_accrued_usd']:.2f}, capped at ${fee['fee_cap_usd']:.2f}; late fee "
                   f"${fee['late_fee_usd']:.2f}, of which ${fee['late_fee_paid_usd']:.2f} already in the reserve). "
                   "The unpaid fee and late fee are simply lost at write-off.",
                   {"days": days, "default_window_days": window // DAY, "delinquency_days": delinquent // DAY,
                    "left": a["left"] / USDC, **fee, "ledger": self._ledger(ctx)})
        caps0 = [int(d.book.functions.tierCap(i).call()) for i in range(4)]
        max0 = int(d.book.functions.maxExposure().call())
        _, tick0 = d.slot0()
        lp = role("junior_lp")
        try:
            ctx["stage"] = "writeoff"
            pre = self.ledger()
            reader, relayer = self._service("reader"), self._service("relayer")

            class ThisAdvanceOnly:  # the real Keeper, scoped to this run (seeded demo shops are left alone)
                def __getattr__(self, name):
                    return getattr(reader, name)

                def advances(self):
                    return [x for x in reader.advances() if x.advance_id == advance_id]

            sent = Keeper(ThisAdvanceOnly(), relayer.writer, self._service("pipeline").settings, now=d.now,
                          humans=self._service("human_registry")).tick()
            a = self._advance(d, advance_id)
            if int(a["status"]) != 3:
                raise RuntimeError("keeper did not write off the eligible advance")
            loss = int(a["principal"]) - int(a["principalRepaid"])
            post = self.ledger()
            senior_hit = post["senior_assets"] < dark["senior_assets"] - 0.01
            self._step(ctx, "writeoff", f"Keeper writes off advance #{advance_id}: ${loss / USDC:.2f} lost",
                       f"DRIP, the junior tranche, absorbs it first: it marked the unpaid principal down as soon as "
                       f"the advance went delinquent (day {delinquent // DAY}), and writeOff makes the loss final. "
                       f"Junior assets ${dark['junior_assets']:,.2f} to ${post['junior_assets']:,.2f}, share price "
                       f"{dark['junior_share_price']:.4f} to {post['junior_share_price']:.4f}. "
                       + (f"Senior assets moved ${dark['senior_assets']:,.2f} to ${post['senior_assets']:,.2f}."
                          if senior_hit else "Senior holders lose nothing."),
                       {"amount": loss / USDC, "junior_before": dark["junior_assets"],
                        "junior_at_writeoff": pre["junior_assets"], "junior_after": post["junior_assets"],
                        "junior_price_before": dark["junior_share_price"],
                        "junior_price_after": post["junior_share_price"], "senior_before": pre["senior_assets"],
                        "senior_after": post["senior_assets"], "ledger": self._ledger(ctx)},
                       sent[0] if sent else None)
            ctx["stage"] = "swap"
            balance = int(d.junior.functions.balanceOf(lp.address).call())
            if balance < 500 * USDC:
                self._mint(d, lp.address, 1_000 * USDC)
                d.send(d.usdc.functions.approve(d.addr("JuniorVault"), 2**256 - 1), lp)
                d.send(d.junior.functions.deposit(1_000 * USDC, lp.address), lp)
                balance = int(d.junior.functions.balanceOf(lp.address).call())
            price0 = d.junior_price_from_tick(tick0)
            rc = d.swap_to_tick(lp, tick0 - 1625 if d.junior_is_token0() else tick0 + 1625, balance)
            _, tick1 = d.slot0()
            price1 = d.junior_price_from_tick(tick1)
            self._step(ctx, "swap", f"DRIP holder panics and sells on Uniswap v4 (-{(1 - price1 / price0) * 100:.0f}%)",
                       f"A junior LP dumps shares into the junior/USDC v4 pool: ${price0:.4f} to ${price1:.4f} per share "
                       f"(tick {tick0} to {tick1}). The RiskHook records every swap for its TWAP oracle.",
                       {"tick_before": tick0, "tick_after": tick1, "price_before": round(price0, 6),
                        "price_after": round(price1, 6), "ledger": self._ledger(ctx)}, rc)
            d.warp(HOUR)
            self._step(ctx, "warp", "One hour later", "The 1-hour TWAP window now reflects the sell-off.",
                       {"seconds": HOUR, "twap_tick": d.twap_tick(HOUR)})
            ctx["stage"] = "risk"
            risk = self._service("risk")
            out = risk.tick()
            caps1 = [int(d.book.functions.tierCap(i).call()) for i in range(4)]
            max1 = int(d.book.functions.maxExposure().call())
            lowered = caps1 != caps0 or max1 != max0
            rationale = (out.get("proposal") or {}).get("rationale", "")
            llm = getattr(getattr(risk, "judge", None), "llm", None)
            risk_model = (getattr(llm, "models", None) or {}).get("RiskProposal") or \
                getattr(getattr(risk, "judge", None), "model", None) or "risk model"
            self._step(ctx, "risk", "Risk agent lowers the limits" if lowered else "Risk agent holds the limits",
                       f"Triggers: {', '.join(out.get('triggers') or []) or 'none'}. Tier caps {_money(caps0)} to "
                       f"{_money(caps1)}, enforced down-only onchain. {rationale}".strip(),
                       {"model": risk_model, "source": out.get("source"),
                        "verdict": "lowered" if lowered else "no_change", "reasons": rationale,
                        "flags": out.get("triggers") or [], "tier_caps": [self._usd(c) for c in caps1],
                        "max_exposure": self._usd(max1), "ledger": self._ledger(ctx)}, out.get("tx_hash"))
        finally:
            ctx["stage"] = "restore"
            self._restore(d, caps0, max0, tick0, lp)
        self._step(ctx, "risk", "Caps restored for the next judge",
                   "The devnet owner put the tier caps, exposure limit and junior pool price back where this run "
                   "found them.", {"tier_caps": [self._usd(d.book.functions.tierCap(i).call()) for i in range(4)],
                                   "junior_pool_price": round(d.junior_price_from_tick(d.slot0()[1]), 6),
                                   "ledger": self._ledger(ctx)})
        self._world_ban(ctx, d, shop)
        return (f"Written off after {days} silent days; DRIP (junior) absorbed ${loss / USDC:.2f}; "
                "risk caps lowered, then restored; World ID banned and a new shop refused (human_banned)")

    def _restore(self, d, caps0, max0, tick0, lp):
        """Runs even when the scenario fails: the next judge must start from the same limits and pool price."""
        from devnet_lib import role
        try:
            caps = [int(d.book.functions.tierCap(i).call()) for i in range(4)]
            if caps != caps0 or int(d.book.functions.maxExposure().call()) != max0:
                d.send(d.book.functions.setLimits(caps0, max0), role("owner"))
        finally:
            _, now_tick = d.slot0()
            if abs(now_tick - tick0) > 10:
                buy_junior = d.junior_price_from_tick(tick0) > d.junior_price_from_tick(now_tick)
                token = d.usdc if buy_junior else d.junior
                if buy_junior and int(token.functions.balanceOf(lp.address).call()) < 5_000 * USDC:
                    self._mint(d, lp.address, 5_000 * USDC)
                have = int(token.functions.balanceOf(lp.address).call())
                if have:
                    d.swap_to_tick(lp, tick0, have)

    # -------------------------------------------------------------- entry point
    def run(self, run_id, store):
        run = store.get(run_id)
        archetype = run["archetype"]
        if archetype not in SCENARIOS:
            raise ValueError("unknown archetype")
        ctx = {"run_id": run_id, "store": store, "i": 0, "sim_day": 0, "started": self.clock(), "last": 0.0,
               "advances": [], "tier": 0, "stage": "start"}
        rng = random.Random()
        try:
            d = self._devnet()
            self._step(ctx, "world_view", "Starting public ledger",
                       "Live devnet state before this merchant arrives: tranche vaults, reserve, junior price, caps.",
                       {"ledger": self.ledger()})
            shop, reason = self._wash(ctx, d, rng) if archetype == "wash_ring" else self._honest(ctx, d, archetype, rng)
        except Exception as exc:
            reason, ledger = f"Failed during {ctx['stage']} ({type(exc).__name__})", self._safe_ledger(ctx)
            store.update(run_id, lambda r: r.update(done_reason=reason, ledger=ledger))
            raise
        f = ctx.get("features")
        if f is not None:
            self._step(ctx, "world_view", "What the world saw, and what stayed private",
                       "Every step above is a real devnet transaction anyone can inspect. Identity never touched "
                       "the chain.",
                       {"public": [{"label": "Shop", "value": f"{shop['label']} (random id)"},
                                   {"label": "Sales in the last 30 days", "value": str(f.sales_count_30d)},
                                   {"label": "Advances", "value": ", ".join(f"#{a}" for a in ctx["advances"]) or "none"},
                                   {"label": "Proofs", "value": "verified onchain"}],
                        "private": [{"label": "Merchant identity and seller account", "value": "never onchain"},
                                    {"label": "Business Pass and Standing Pass secrets", "value": "only on the phone"},
                                    {"label": "Customer addresses", "value": "HMAC-hashed before any model"},
                                    {"label": "Link between an old and a new shop", "value": "hidden by the proof"}]})
        ledger = self._ledger(ctx)
        store.update(run_id, lambda r: r.update(ledger=ledger, done_reason=reason))

    def _safe_ledger(self, ctx):
        try:
            return self._ledger(ctx)
        except Exception:  # noqa: BLE001 - a failed run still reports what it can
            return None
