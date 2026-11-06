"""Relayer: submits draws and Standing Pass claims from the RELAYER key, never the merchant's wallet.

Privacy rule (docs/architecture.md): draws, mandate registration and Business Pass issuance never read
`msg.sender`, and the merchant must never send them from their usual wallet, or the public sender would link
what the ZK proofs keep apart. So every tx here is `writer.send(..., signer="relayer")`, and only these
functions are reachable: AdvanceBook `drawFirst`, `drawWithPass`, `drawByMandate`, `registerMandate`,
`claimStandingPass`, and BusinessPassRegistry `issue`.

Everything is validated before a tx is sent (the contract checks again; this saves gas and griefing):
  * offer fields: allowed amount, factor/holdback ranges, tier rules (drawFirst: tier 0 with a nonzero
    Business Pass nullifier; drawWithPass: tier 1..3, nullifier 0 and band 0; drawByMandate: nullifier 0,
    since the credential was spent at registerMandate), uint widths, hex formats
  * offer not expired, with `min_validity_seconds` of headroom for inclusion
  * signature: exactly 65 bytes (0x + 130 hex), v in {27, 28}
  * ZK inputs (root, nullifier, commitmentNext): integers in [1, P) where P is the BN254 scalar field
    (`SNARK_FIELD` in contracts/src/Constants.sol); proof: non-empty even-length hex, bounded size
  * rate limits: per shop (claims: per advance id) and global, sliding windows

Args passed to `ChainWriter.send` (for the web3 writer):
  drawFirst:         [offer_tuple, sig: bytes, proof: bytes, root: int, commitmentNext: int]
  drawWithPass:      [offer_tuple, sig: bytes, proof: bytes, root: int, nullifier: int, commitmentNext: int]
  drawByMandate:     [offer_tuple, offerSig: bytes, mandateId: int, agentSig: bytes]
  registerMandate:   [(shopId, agentKey, recipient, (maxPerDraw, maxPerPeriod, period, expiry), tier, band),
                      (proof, root, nullifier, commitmentNext), (nonce, expiry, attesterSig), ownerSig]
  issue (registry):  [(businessNullifier, commitment, expiresAt), issuerSig: bytes, commitment: int]
  claimStandingPass: [advance_id: int]
  offer_tuple = (offerId: bytes32, shopId: bytes32, recipient: checksum str, amount, factorBps, holdbackBps,
                 tier, passNullifier, minRevenueBand, expiresAt), in Solidity struct order.

Logs carry the function, shop id, offer id and tx hash only: never signatures, proofs, recipients or keys.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import deque
from collections.abc import Callable

from eth_utils import to_checksum_address
from pydantic import ValidationError

from .config import Settings
from .interfaces import ChainWriter
from .models import ALLOWED_AMOUNTS, FACTOR_BPS_RANGE, HOLDBACK_BPS_RANGE, MAX_TIER, Offer, SignedOffer

log = logging.getLogger(__name__)

# contracts/src/Constants.sol SNARK_FIELD
BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617

ALLOWED_FUNCTIONS = frozenset({"drawFirst", "drawWithPass", "drawByMandate", "registerMandate", "issue",
                               "claimStandingPass"})
RELAYER_SIGNER = "relayer"

_SIG_RE = re.compile(r"^0x[0-9a-fA-F]{130}$")
_HEX_RE = re.compile(r"^0x(?:[0-9a-fA-F]{2})+$")
_FIELD_HEX_RE = re.compile(r"^0x[0-9a-fA-F]{1,64}$")
MAX_PROOF_BYTES = 64 * 1024
UINT64_MAX = 2**64 - 1
UINT256_MAX = 2**256 - 1


class RelayError(ValueError):
    """Request rejected before any tx was sent. `code` is a stable, user-showable reason."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


class RateLimited(RelayError):
    pass


class _SlidingWindow:
    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str, now: float) -> bool:
        q = self._hits.setdefault(key, deque())
        while q and q[0] <= now - self.window:
            q.popleft()
        return len(q) < self.limit

    def record(self, key: str, now: float) -> None:
        self._hits.setdefault(key, deque()).append(now)


def parse_field(name: str, value: object) -> int:
    """A BN254 field element in [1, P). Accepts int or 0x-hex (<= 32 bytes). Zero is rejected: every input
    here is a Poseidon2 output or a Merkle root, and a zero is a client bug, not a real value."""
    if isinstance(value, bool):
        raise RelayError("bad_field", name)
    if isinstance(value, str):
        if not _FIELD_HEX_RE.match(value):
            raise RelayError("bad_field", f"{name} must be 0x-hex")
        value = int(value, 16)
    if not isinstance(value, int):
        raise RelayError("bad_field", name)
    if not 0 < value < BN254_P:
        raise RelayError("field_out_of_range", name)
    return value


def offer_tuple(o: Offer) -> tuple:
    return (bytes.fromhex(o.offer_id[2:]), bytes.fromhex(o.shop_id[2:]), to_checksum_address(o.recipient),
            o.amount, o.factor_bps, o.holdback_bps, o.tier, o.pass_nullifier, o.min_revenue_band, o.expires_at)


class Relayer:
    def __init__(
        self,
        writer: ChainWriter,
        settings: Settings,
        now: Callable[[], float] = time.time,
        *,
        per_shop_limit: int = 3,
        per_shop_window: float = 3_600,
        global_limit: int = 30,
        global_window: float = 60,
        min_validity_seconds: int = 15,
    ):
        self.writer = writer
        self.settings = settings
        self.now = now
        self.min_validity_seconds = min_validity_seconds
        self._per_key = _SlidingWindow(per_shop_limit, per_shop_window)
        self._global = _SlidingWindow(global_limit, global_window)
        self._lock = threading.Lock()

    # ------------------------------------------------------------ public API (allow-listed fns only)

    def draw_first(self, signed_offer: SignedOffer | dict, proof_hex: str, root: int | str,
                   commitment_next: int | str) -> str:
        """Business Pass first advance. The nullifier and the band are inside the signed offer."""
        so = self._signed_offer(signed_offer)
        o = so.offer
        if o.tier != 0:
            raise RelayError("bad_tier", "drawFirst needs tier 0")
        if not 0 < o.pass_nullifier < BN254_P:
            raise RelayError("missing_pass_nullifier")
        proof = self._proof(proof_hex)
        r, c = parse_field("root", root), parse_field("commitment_next", commitment_next)
        sig = self._signature(so.signature)
        return self._send("drawFirst", [offer_tuple(o), sig, proof, r, c], key=f"shop:{o.shop_id.lower()}",
                          ctx=f"shop={o.shop_id} offer={o.offer_id}")

    def draw_with_pass(self, signed_offer: SignedOffer | dict, proof_hex: str, root: int | str,
                       nullifier: int | str, commitment_next: int | str) -> str:
        so = self._signed_offer(signed_offer)
        o = so.offer
        if not 1 <= o.tier <= MAX_TIER:
            raise RelayError("bad_tier", "drawWithPass needs tier 1..3")
        if o.pass_nullifier != 0 or o.min_revenue_band != 0:
            raise RelayError("unexpected_pass_nullifier")
        proof = self._proof(proof_hex)
        r, n, c = parse_field("root", root), parse_field("nullifier", nullifier), \
            parse_field("commitment_next", commitment_next)
        sig = self._signature(so.signature)
        return self._send("drawWithPass", [offer_tuple(o), sig, proof, r, n, c],
                          key=f"shop:{o.shop_id.lower()}", ctx=f"shop={o.shop_id} offer={o.offer_id}")

    def draw_by_mandate(self, signed_offer: SignedOffer | dict, mandate_id: int, agent_sig: str) -> str:
        """Managed-agent draw. The agent key signed MandateDraw(offerId, mandateId); the contract enforces the
        mandate's shop, recipient, tier/band, limits and expiry."""
        so = self._signed_offer(signed_offer)
        o = so.offer
        if o.pass_nullifier != 0:
            raise RelayError("unexpected_pass_nullifier", "spent at registerMandate")
        if o.tier > 0 and o.min_revenue_band != 0:
            raise RelayError("bad_band")
        if isinstance(mandate_id, bool) or not isinstance(mandate_id, int) or not 1 <= mandate_id <= UINT256_MAX:
            raise RelayError("bad_mandate_id")
        return self._send("drawByMandate", [offer_tuple(o), self._signature(so.signature), mandate_id,
                                            self._signature(agent_sig)],
                          key=f"shop:{o.shop_id.lower()}", ctx=f"shop={o.shop_id} offer={o.offer_id} mandate={mandate_id}")

    def register_mandate(self, request: tuple, proof_hex: str, root: int | str, nullifier: int | str,
                         commitment_next: int | str, att_nonce: int, att_expiry: int, att_sig: str,
                         owner_sig: str) -> str:
        """`request` = MandateRequest tuple (shopId bytes32, agentKey, recipient, (4 limits), tier, band)."""
        try:
            shop_id, agent, recipient, limits, tier, band = request
            shop_id = bytes(shop_id)
            agent, recipient = to_checksum_address(agent), to_checksum_address(recipient)
            limits = tuple(int(x) for x in limits)
        except (TypeError, ValueError):
            raise RelayError("bad_mandate") from None
        if (len(shop_id) != 32 or len(limits) != 4 or not 0 <= int(tier) <= MAX_TIER or not 0 <= int(band) <= 255
                or not 0 <= att_nonce <= UINT256_MAX or not 0 <= att_expiry <= UINT64_MAX):
            raise RelayError("bad_mandate")
        proof = self._proof(proof_hex)
        cred = (proof, parse_field("root", root), parse_field("nullifier", nullifier),
                parse_field("commitment_next", commitment_next))
        args = [(shop_id, agent, recipient, limits, int(tier), int(band)), cred,
                (att_nonce, att_expiry, self._signature(att_sig)), self._signature(owner_sig)]
        return self._send("registerMandate", args, key=f"shop:0x{shop_id.hex()}", ctx=f"shop=0x{shop_id.hex()}")

    def issue_business_pass(self, business_nullifier: int, commitment: int | str, expires_at: int,
                            issuer_sig: str) -> str:
        """BusinessPassRegistry.issue with the issuer's BusinessVerified attestation (see issuer.py)."""
        c = parse_field("commitment", commitment)
        if not 0 < business_nullifier <= UINT256_MAX or not 0 <= expires_at <= UINT64_MAX:
            raise RelayError("bad_attestation")
        return self._send("issue", [(business_nullifier, c, expires_at), self._signature(issuer_sig), c],
                          key=f"issue:{c}", ctx="business pass")

    def claim(self, advance_id: int) -> str:
        if isinstance(advance_id, bool) or not isinstance(advance_id, int) or not 1 <= advance_id <= UINT256_MAX:
            raise RelayError("bad_advance_id")
        return self._send("claimStandingPass", [advance_id], key=f"advance:{advance_id}",
                          ctx=f"advance={advance_id}")

    # ------------------------------------------------------------ validation

    def _signed_offer(self, so: SignedOffer | dict) -> SignedOffer:
        try:
            so = so if isinstance(so, SignedOffer) else SignedOffer.model_validate(so)
            # re-validate even a model instance (it may have been built with model_construct)
            so = SignedOffer.model_validate(so.model_dump())
        except ValidationError as e:
            raise RelayError("bad_offer", f"{e.error_count()} invalid field(s)") from None
        o = so.offer
        if o.amount not in ALLOWED_AMOUNTS:
            raise RelayError("bad_amount")
        if not FACTOR_BPS_RANGE[0] <= o.factor_bps <= FACTOR_BPS_RANGE[1]:
            raise RelayError("bad_factor")
        if not HOLDBACK_BPS_RANGE[0] <= o.holdback_bps <= HOLDBACK_BPS_RANGE[1]:
            raise RelayError("bad_holdback")
        if not 0 <= o.tier <= MAX_TIER:
            raise RelayError("bad_tier")
        if not 0 <= o.pass_nullifier < BN254_P:
            raise RelayError("bad_pass_nullifier")
        if not 0 <= o.min_revenue_band <= 255:
            raise RelayError("bad_band")
        if not 0 <= o.expires_at <= UINT64_MAX:
            raise RelayError("bad_expiry")
        if o.expires_at < int(self.now()) + self.min_validity_seconds:
            raise RelayError("offer_expired")
        return so

    @staticmethod
    def _signature(sig: str) -> bytes:
        if not isinstance(sig, str) or not _SIG_RE.match(sig):
            raise RelayError("bad_signature", "need 65 bytes as 0x + 130 hex")
        raw = bytes.fromhex(sig[2:])
        if raw[64] not in (27, 28):
            raise RelayError("bad_signature", "v must be 27 or 28")
        return raw

    @staticmethod
    def _proof(proof_hex: str) -> bytes:
        if not isinstance(proof_hex, str) or not _HEX_RE.match(proof_hex):
            raise RelayError("bad_proof", "need non-empty even-length 0x-hex")
        raw = bytes.fromhex(proof_hex[2:])
        if len(raw) > MAX_PROOF_BYTES:
            raise RelayError("bad_proof", "too large")
        return raw

    # ------------------------------------------------------------ send

    def _send(self, fn: str, args: list, *, key: str, ctx: str) -> str:
        if fn not in ALLOWED_FUNCTIONS:  # defence in depth; public methods only pass allow-listed names
            raise RelayError("function_not_allowed", fn)
        t = self.now()
        with self._lock:
            if not self._global.allow("*", t):
                raise RateLimited("rate_limited", "global")
            if not self._per_key.allow(key, t):
                raise RateLimited("rate_limited", key.split(":", 1)[0])
            self._global.record("*", t)
            self._per_key.record(key, t)
        tx = self.writer.send(fn, args, signer=RELAYER_SIGNER)
        log.info("relayed %s %s tx=%s", fn, ctx, tx)
        return tx
