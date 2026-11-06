"""Business Pass issuer (offchain half of BusinessPassRegistry.issue).

Flow (docs/privacy-architecture.md section 2):
  1. The merchant's phone runs a Reclaim zkTLS session against the logged-in seller dashboard, with
     `context = the Business Pass leaf`, and sends us the proof plus (h, country, revenue_band, age_ok).
  2. `verify_zktls` (injected; Reclaim js/py SDK) checks attestor signatures, the allow-listed provider, that the
     proven predicates match the claimed attributes, and that the context equals the leaf. It returns the
     account id (from the authenticated whoami response) ONLY to this process.
  3. We recompute leaf = Poseidon2(TAG_BIZ, h, country, revenue_band, age_ok), derive
     businessNullifier = HMAC-SHA256(pepper, accountId) mod BN254 P (same as the Node issuer), DISCARD the account id, and sign
     EIP-712 BusinessVerified(businessNullifier, commitment = leaf, expiresAt) for the registry.
Trust assumptions (named in CROPS): the issuer key vouches for attributes and uniqueness; the pepper must stay
secret (whoever has it can test guesses of account ids). Roadmap: OPRF or TEE so we never see the account id.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable
from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak, to_checksum_address

from . import zk

_BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617


class IssuerError(ValueError):
    pass


@dataclass(frozen=True)
class BusinessClaim:
    """What the zkTLS proof established (predicates only) plus the account id, which never leaves this module."""
    account_id: str
    country: int
    revenue_band: int
    age_ok: int


def business_nullifier(pepper: bytes, account_id: str) -> int:
    if not pepper or not account_id:
        raise IssuerError("pepper and account id required")
    # mod BN254 P, identical to the Node issuer (issuer/src/nullifier.ts). Both issuers MUST produce the same value
    # for the same business, or one business could obtain two passes (one per issuer).
    return int.from_bytes(hmac.new(pepper, account_id.encode(), hashlib.sha256).digest(), "big") % _BN254_P


def business_verified_message(business_nullifier_: int, commitment: int, expires_at: int, chain_id: int,
                              registry: str):
    return encode_typed_data(
        domain_data={"name": "BusinessPassRegistry", "version": "1", "chainId": chain_id,
                     "verifyingContract": to_checksum_address(registry)},
        message_types={"BusinessVerified": [{"name": "businessNullifier", "type": "uint256"},
                                            {"name": "commitment", "type": "uint256"},
                                            {"name": "expiresAt", "type": "uint64"}]},
        message_data={"businessNullifier": business_nullifier_, "commitment": commitment, "expiresAt": expires_at},
    )


def business_verified_digest(*args) -> str:
    m = business_verified_message(*args)
    return "0x" + keccak(b"\x19" + m.version + m.header + m.body).hex()


class Issuer:
    def __init__(self, private_key: str, pepper: bytes, *, chain_id: int, registry: str,
                 verify_zktls: Callable[[dict, int], BusinessClaim], ttl_seconds: int = 3600):
        self.__key = private_key
        self.__pepper = pepper
        self.chain_id, self.registry, self.verify_zktls, self.ttl = chain_id, registry, verify_zktls, ttl_seconds

    def __repr__(self) -> str:
        return f"Issuer(chain_id={self.chain_id}, registry={self.registry})"

    def attest(self, zktls_proof: dict, h: int, country: int, revenue_band: int, age_ok: int, now: int) -> dict:
        """Returns {businessNullifier, commitment, expiresAt, signature} for BusinessPassRegistry.issue."""
        if not 0 < h < zk.P:
            raise IssuerError("bad h")
        leaf = zk.business_leaf_from_h(h, country, revenue_band, age_ok)
        claim = self.verify_zktls(zktls_proof, leaf)  # raises on any failure; context must equal the leaf
        if (claim.country, claim.revenue_band, claim.age_ok) != (country, revenue_band, age_ok):
            raise IssuerError("claimed attributes differ from the zkTLS predicates")
        if age_ok != 1:
            raise IssuerError("business younger than 6 months")
        bn = business_nullifier(self.__pepper, claim.account_id)
        del claim  # the account id is not stored or logged anywhere
        expires = now + self.ttl
        signed = Account.sign_message(business_verified_message(bn, leaf, expires, self.chain_id, self.registry),
                                      self.__key)
        return {"businessNullifier": bn, "commitment": leaf, "expiresAt": expires,
                "signature": "0x" + signed.signature.hex()}
