"""Business Pass helpers: mandate hashing, Prover.toml inputs for circuits/business_pass, and local proving.

Proving shells out to circuits/business_pass/build.sh (nargo 1.0.0-rc.3 + bb 6.0.0) with PROVER=<name>, which
proves <name>.toml and skips the Foundry hand-off. Devnet and fixture use only: in production the merchant's
phone proves in the browser (noir_js + bb.js) and the secret never leaves it.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from eth_abi import encode
from eth_utils import keccak, to_checksum_address

from . import zk

CIRCUIT_DIR = Path(__file__).resolve().parents[3] / "circuits" / "business_pass"
DEFAULT_COUNTRIES = (32, 566, 404, 0)  # AR, NG, KE, unused

MANDATE_TYPEHASH = keccak(
    b"Mandate(bytes32 shopId,address agentKey,address recipient,uint256 maxPerDraw,uint256 maxPerPeriod,"
    b"uint64 period,uint64 expiry,uint8 tier,uint8 band)"
)


@dataclass(frozen=True)
class Limits:
    max_per_draw: int
    max_per_period: int
    period: int
    expiry: int

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.max_per_draw, self.max_per_period, self.period, self.expiry)


@dataclass(frozen=True)
class MandateRequest:
    shop_id: bytes
    agent_key: str
    recipient: str
    limits: Limits
    tier: int
    band: int

    def as_tuple(self) -> tuple:
        """Solidity `MandateRequest` struct order."""
        return (self.shop_id, to_checksum_address(self.agent_key), to_checksum_address(self.recipient),
                self.limits.as_tuple(), self.tier, self.band)


def mandate_hash(r: MandateRequest) -> bytes:
    """AdvanceBook.mandateHash: the EIP-712 struct hash of `Mandate`."""
    l = r.limits
    return keccak(encode(
        ["bytes32", "bytes32", "address", "address", "uint256", "uint256", "uint64", "uint64", "uint8", "uint8"],
        [MANDATE_TYPEHASH, r.shop_id, r.agent_key, r.recipient, l.max_per_draw, l.max_per_period, l.period,
         l.expiry, r.tier, r.band]))


def mandate_context(r: MandateRequest) -> int:
    return int.from_bytes(mandate_hash(r), "big") % zk.P


@dataclass(frozen=True)
class BizProofInputs:
    root: int
    nullifier: int
    min_band: int
    commitment_next: int
    context: int
    countries: tuple[int, int, int, int]
    toml: str


def prover_inputs(*, secret: int, country: int, revenue_band: int, age_ok: int, leaves: list[int],
                  leaf_index: int, secret_next: int, min_band: int, context: int,
                  countries: tuple[int, int, int, int] = DEFAULT_COUNTRIES) -> BizProofInputs:
    leaf = zk.business_leaf(secret, country, revenue_band, age_ok)
    if leaves[leaf_index] != leaf:
        raise ValueError("leaf at leaf_index is not this Business Pass")
    path, bits, root = zk.merkle_path(leaves, leaf_index)
    nullifier = zk.business_nullifier(secret)
    nxt = zk.poseidon2(zk.TAG_COMMIT, zk.h_of(secret_next), 1)

    def q(v: int) -> str:
        return f'"{v}"' if v < 2**64 else f'"0x{v:064x}"'

    toml = "\n".join([
        f"secret = {q(secret)}", f"country = {q(country)}", f"revenue_band = {q(revenue_band)}",
        f"age_ok = {q(age_ok)}",
        "path = [" + ", ".join(f'"0x{p:064x}"' for p in path) + "]",
        "index_bits = [" + ", ".join("true" if b else "false" for b in bits) + "]",
        f"secret_next = {q(secret_next)}", f'root = "0x{root:064x}"', f'nullifier = "0x{nullifier:064x}"',
        f"min_band = {q(min_band)}", f'commitment_next = "0x{nxt:064x}"', f'context = "0x{context:064x}"',
        "allowed_countries = [" + ", ".join(f'"{c}"' for c in countries) + "]", "",
    ])
    return BizProofInputs(root, nullifier, min_band, nxt, context, tuple(countries), toml)


def prove(name: str, inputs: BizProofInputs, *, circuit_dir: Path = CIRCUIT_DIR, timeout: int = 600) -> bytes:
    """Write <name>.toml, run build.sh with PROVER=<name>, return the raw proof bytes."""
    if not name.isidentifier() or name == "Prover":
        raise ValueError("name must be an identifier other than 'Prover'")
    (circuit_dir / f"{name}.toml").write_text(inputs.toml)
    env = dict(os.environ, PROVER=name)
    env["PATH"] = f"{Path.home()}/.nargo/bin:{Path.home()}/.bb:{env.get('PATH', '')}"
    subprocess.run(["bash", str(circuit_dir / "build.sh")], check=True, env=env, timeout=timeout,
                   stdout=subprocess.DEVNULL)
    return (circuit_dir / "target" / name / "proof").read_bytes()


# ---------------------------------------------------------------- devnet helper (local issuer key; never prod)

def tree_leaves(registry_contract, from_block: int = 0) -> list[int]:
    """Every Business Pass leaf in insertion order, from the registry's LeafInserted events (download the whole
    tree: asking for one leaf would reveal which one is yours)."""
    logs = registry_contract.events.LeafInserted().get_logs(from_block=from_block)
    return [e["args"]["commitment"] for e in sorted(logs, key=lambda e: e["args"]["leafIndex"])]


def devnet_issue(*, issuer_key: str, chain_id: int, registry: str, submit_issue, secret: int, country: int,
                 revenue_band: int, age_ok: int, now: int, ttl: int = 3600) -> int:
    """Stand-in for the zkTLS issuer on a devnet: random business nullifier (= HMAC(pepper, accountId) in prod),
    sign BusinessVerified, submit through `submit_issue(bn, leaf, expires, sig) -> tx`. Returns the leaf."""
    from eth_account import Account

    from .issuer import business_verified_message

    leaf = business_leaf(secret, country, revenue_band, age_ok)
    bn = int.from_bytes(os.urandom(32), "big") or 1
    sig = Account.sign_message(business_verified_message(bn, leaf, now + ttl, chain_id, registry), issuer_key)
    submit_issue(bn, leaf, now + ttl, "0x" + sig.signature.hex())
    return leaf


def business_leaf(secret: int, country: int, revenue_band: int, age_ok: int) -> int:
    return zk.business_leaf(secret, country, revenue_band, age_ok)


MANDATE_FIELDS = [
    {"name": "shopId", "type": "bytes32"}, {"name": "agentKey", "type": "address"},
    {"name": "recipient", "type": "address"}, {"name": "maxPerDraw", "type": "uint256"},
    {"name": "maxPerPeriod", "type": "uint256"}, {"name": "period", "type": "uint64"},
    {"name": "expiry", "type": "uint64"}, {"name": "tier", "type": "uint8"}, {"name": "band", "type": "uint8"},
]


def mandate_message(r: MandateRequest, chain_id: int, book: str):
    """EIP-712 `Mandate` the SHOP OWNER signs (consent to put this agent's debt on their shop)."""
    from eth_account.messages import encode_typed_data

    l = r.limits
    return encode_typed_data(
        domain_data={"name": "AdvanceBook", "version": "1", "chainId": chain_id,
                     "verifyingContract": to_checksum_address(book)},
        message_types={"Mandate": MANDATE_FIELDS},
        message_data={"shopId": r.shop_id, "agentKey": to_checksum_address(r.agent_key),
                      "recipient": to_checksum_address(r.recipient), "maxPerDraw": l.max_per_draw,
                      "maxPerPeriod": l.max_per_period, "period": l.period, "expiry": l.expiry, "tier": r.tier,
                      "band": r.band})
