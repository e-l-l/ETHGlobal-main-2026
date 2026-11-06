"""EIP-712 offers compatible with AdvanceBook's Policy."""
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak

_FIELDS = [
    {"name": name, "type": typ} for name, typ in (
        ("offerId", "bytes32"), ("shopId", "bytes32"), ("recipient", "address"),
        ("amount", "uint256"), ("factorBps", "uint16"), ("holdbackBps", "uint16"),
        ("tier", "uint8"), ("passNullifier", "uint256"), ("minRevenueBand", "uint8"), ("expiresAt", "uint64"),
    )
]


def _message(offer, chain_id, verifying_contract):
    return encode_typed_data(
        domain_data={"name": "AdvanceBook", "version": "1", "chainId": chain_id,
                     "verifyingContract": verifying_contract},
        message_types={"Offer": _FIELDS},
        message_data={"offerId": offer.offer_id, "shopId": offer.shop_id,
                      "recipient": offer.recipient, "amount": offer.amount,
                      "factorBps": offer.factor_bps, "holdbackBps": offer.holdback_bps,
                      "tier": offer.tier, "passNullifier": offer.pass_nullifier,
                      "minRevenueBand": offer.min_revenue_band, "expiresAt": offer.expires_at},
    )


def offer_digest(offer, chain_id, verifying_contract) -> str:
    message = _message(offer, chain_id, verifying_contract)
    return "0x" + keccak(b"\x19" + message.version + message.header + message.body).hex()


class EIP712Signer:
    def __init__(self, private_key):
        self.__key = private_key

    def sign_offer(self, offer, *, chain_id, verifying_contract):
        from .models import SignedOffer
        signed = Account.sign_message(_message(offer, chain_id, verifying_contract), self.__key)
        return SignedOffer(offer=offer, signature="0x" + signed.signature.hex(),
                           digest="0x" + signed.message_hash.hex())
