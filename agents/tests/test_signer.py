import pytest
from eth_account import Account

from mra_agents.models import Offer
from mra_agents.signer import EIP712Signer, _message, offer_digest

BOOK = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f"


def make_offer(tier, nullifier, band=0):
    return Offer(offer_id="0x" + "0" * 61 + "abc", shop_id="0xd2ad3e1920c292f23975ba7355ac9c6e2cfa409b3e12ff1537d187e9fd77ffa4", recipient="0x000000000000000000000000000000000000bEEF", amount=100_000_000, factor_bps=11500, holdback_bps=1000, tier=tier, pass_nullifier=nullifier, min_revenue_band=band, expires_at=1800000000)


# Produced by AdvanceBook.hashOffer at 0x5615…b72f, chainId 31337 (contracts/test/Eip712Vectors.t.sol).
@pytest.mark.parametrize("tier,nullifier,band,expected", [
    (1, 0, 0, "0xd20c279d2f60369b3c4fa4a5758158ed05624c8a8886e43eb3ef1b28bb7a74f2"),
    (0, 42, 2, "0x33cd4172f8d0782a912874cb845a5b27c2620197f623b671ec1dcaf9c5692dcd"),
])
def test_vectors_and_recovery(tier, nullifier, band, expected):
    account = Account.create()
    signer = EIP712Signer(account.key)
    offer = make_offer(tier, nullifier, band)
    assert offer_digest(offer, 31337, BOOK) == expected
    signed = signer.sign_offer(offer, chain_id=31337, verifying_contract=BOOK)
    sig = bytes.fromhex(signed.signature[2:])
    assert len(sig) == 65 and sig[-1] in (27, 28)
    assert signed.digest == expected
    assert Account.recover_message(_message(offer, 31337, BOOK), signature=sig) == account.address
    assert account.key.hex() not in repr(signer) and account.key.hex() not in str(signer)
    assert offer_digest(offer, 31338, BOOK) != expected
