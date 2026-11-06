"""Run after scripts/devnet.sh and scripts/seed_demo.py with pytest -o addopts='' -m anvil."""
import json
import os
from pathlib import Path

import pytest
from web3 import Web3

pytestmark = pytest.mark.anvil
ROOT = Path(__file__).resolve().parents[1]


def test_seeded_devnet():
    deployment = json.loads(Path(os.environ.get('DEPLOYMENTS_FILE', ROOT / 'deployments' / 'local.json')).read_text())
    assert set(deployment) == {'chainId', 'AdvanceBook', 'SeniorVault', 'JuniorVault', 'RiskHook',
                               'USDC', 'PoolManager', 'HonkVerifier', 'BusinessPassVerifier',
                               'BusinessPassRegistry', 'poolKey', 'deployBlock'}
    w = Web3(Web3.HTTPProvider(os.environ.get('RPC_URL', 'http://127.0.0.1:8545')))
    assert deployment['chainId'] == w.eth.chain_id == 31337
    for name in ('AdvanceBook', 'SeniorVault', 'JuniorVault', 'RiskHook', 'USDC', 'PoolManager', 'HonkVerifier',
                 'BusinessPassVerifier', 'BusinessPassRegistry'):
        assert w.eth.get_code(Web3.to_checksum_address(deployment[name])), name
    key = deployment['poolKey']
    assert set(key) == {'currency0', 'currency1', 'fee', 'tickSpacing', 'hooks'}
    assert key['fee'] == 3000 and key['tickSpacing'] == 60
    assert key['hooks'].lower() == deployment['RiskHook'].lower()
    assert {key['currency0'].lower(), key['currency1'].lower()} == {deployment['USDC'].lower(), deployment['JuniorVault'].lower()}
    def contract(name, abi):
        return w.eth.contract(address=Web3.to_checksum_address(deployment[name]),
                              abi=json.loads((ROOT / 'abi' / f'{abi}.json').read_text()))
    book, usdc = contract('AdvanceBook', 'AdvanceBook'), contract('USDC', 'MockUSDC')
    start = deployment['deployBlock']
    events = book.events.Sale().get_logs(from_block=start, to_block='latest')
    by_shop = {name: [e for e in events if e['args']['shopId'] == Web3.keccak(text=name)]
               for name in ('chai-stall', 'wash-trader', 'ghost-shop')}
    assert len(by_shop['chai-stall']) == 200
    assert len({e['args']['payer'] for e in by_shop['chai-stall']}) == 80
    assert len(by_shop['ghost-shop']) == 40
    wash = by_shop['wash-trader']
    assert len(wash) == 60
    payers = {e['args']['payer'].lower() for e in wash}
    assert len(payers) == 4
    payout = book.functions.shops(Web3.keccak(text='wash-trader')).call()[1].lower()
    transfers = usdc.events.Transfer().get_logs(from_block=start, to_block='latest')
    funded = {e['args']['to'].lower() for e in transfers if e['args']['from'].lower() == payout and e['args']['value'] > 0}
    assert payers <= funded
