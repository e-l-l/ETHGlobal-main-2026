import pytest
from eth_account import Account

from mra_agents.models import Offer
from mra_agents.signer import EIP712Signer, _message, offer_digest

BOOK = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f"


def make_offer(tier, nullifier, band=0):
    return Offer(offer_id="0x" + "0" * 61 + "abc", shop_id="0xd2ad3e1920c292f23975ba7355ac9c6e2cfa409b3e12ff1537d187e9fd77ffa4", recipient="0x000000000000000000000000000000000000bEEF", amount=100_000_000, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=1000, tier=tier, pass_nullifier=nullifier, min_revenue_band=band, expires_at=1800000000)


# Produced by AdvanceBook.hashOffer at 0x5615…b72f, chainId 31337 (contracts/test/Eip712Vectors.t.sol).
@pytest.mark.parametrize("tier,nullifier,band,expected", [
    (1, 0, 0, "0xc4a22d69a87eaab1258d0b960527a060ce5ac8d09c9bc585b3d492752f3447b2"),
    (0, 42, 2, "0x09e7930d1014a6927aa32426ec61587000e224fb12e00f3792537c510ef169a9"),
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
