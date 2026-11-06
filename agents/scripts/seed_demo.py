#!/usr/bin/env python3
"""Populate a disposable, freshly deployed local Anvil chain."""
import json
import os
import random
from pathlib import Path

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
MNEMONIC = 'test test test test test test test test test test test junk'


def main():
    rpc = os.environ.get('RPC_URL', 'http://127.0.0.1:8545')
    if not (rpc.startswith('http://127.0.0.1:') or rpc.startswith('http://localhost:')):
        raise ValueError('Only a local Anvil RPC is supported')
    w = Web3(Web3.HTTPProvider(rpc, request_kwargs={'timeout': 60}))
    if w.eth.chain_id != 31337:
        raise ValueError('Expected Anvil chain 31337')
    deployment = json.loads(Path(os.environ.get('DEPLOYMENTS_FILE', ROOT / 'deployments/local.json')).read_text())
    if deployment['chainId'] != w.eth.chain_id:
        raise ValueError('Deployment chain mismatch')
    def contract(name, abi):
        return w.eth.contract(address=Web3.to_checksum_address(deployment[name]),
                              abi=json.loads((ROOT / 'abi' / f'{abi}.json').read_text()))
    book, usdc = contract('AdvanceBook', 'AdvanceBook'), contract('USDC', 'MockUSDC')
    accounts = w.eth.accounts
    def tx(call, sender):
        receipt = w.eth.wait_for_transaction_receipt(call.transact({'from': sender}))
        if receipt.status != 1:
            raise RuntimeError('Transaction reverted')
    def rpc_call(method, params):
        response = w.provider.make_request(method, params)
        if 'error' in response:
            raise RuntimeError(f'{method}: {response["error"]}')
        return response.get('result')
    names = ('chai-stall', 'wash-trader', 'ghost-shop')
    ids = {n: Web3.keccak(text=n) for n in names}
    if any(book.functions.shops(ids[n]).call()[0] != '0x0000000000000000000000000000000000000000' for n in names):
        raise RuntimeError('Demo shops already exist; use a fresh devnet')
    payouts = dict(zip(names, accounts[4:7]))
    for name in names:
        tx(book.functions.registerShop(ids[name], payouts[name]), payouts[name])
    # Random throwaway accounts are unlocked only by Anvil and never persisted.
    payers = {n: [Account.create().address for _ in range(count)] for n, count in
              [('chai-stall', 80), ('wash-trader', 4), ('ghost-shop', 40)]}
    for addresses in payers.values():
        for address in addresses:
            rpc_call('anvil_impersonateAccount', [address])
            w.eth.wait_for_transaction_receipt(w.eth.send_transaction({'from': accounts[0], 'to': address, 'value': 10**17}))
            tx(usdc.functions.approve(book.address, 2**256 - 1), address)
    for name in ('chai-stall', 'ghost-shop'):
        for payer in payers[name]:
            tx(usdc.functions.mint(payer, 1000 * 10**6), accounts[0])
    tx(usdc.functions.mint(payouts['wash-trader'], 100_000 * 10**6), accounts[0])
    rng = random.Random(31337)
    start = w.eth.get_block('latest').timestamp + 3600
    schedule = []
    for i in range(200):
        day = i % 30
        schedule.append((day * 86400 + (8 + rng.randrange(12)) * 3600 + rng.randrange(1800), 'chai-stall', i % 80, rng.randrange(275, 2500) * 10_000))
    for i in range(40):
        schedule.append(((i % 12) * 86400 + (9 + rng.randrange(9)) * 3600 + rng.randrange(1800), 'ghost-shop', i, rng.randrange(350, 1800) * 10_000))
    for i in range(60):
        day = (i % 27) if i < 27 else 27 + i % 3
        schedule.append((day * 86400 + (10 + i % 8) * 3600 + i * 20, 'wash-trader', i % 4, (10 + i % 5 * 5) * 10**6))
    for offset, name, index, amount in sorted(schedule):
        target = max(start + offset, w.eth.get_block('latest').timestamp + 2)
        rpc_call('evm_setNextBlockTimestamp', [target])
        payer = payers[name][index]
        if name == 'wash-trader':
            tx(usdc.functions.transfer(payer, amount), payouts[name])
        tx(book.functions.pay(ids[name], amount), payer)
    # An outstanding tier-0 advance makes the stopped shop useful for keeper demos.
    Account.enable_unaudited_hdwallet_features()
    signer = Account.from_mnemonic(MNEMONIC, account_path="m/44'/60'/0'/0/1")
    # v2: a tier-0 draw needs a Business Pass. Devnet issuer = anvil account 4; real proof via circuits/business_pass.
    import secrets as _secrets
    from mra_agents import bizpass, zk
    registry = contract('BusinessPassRegistry', 'BusinessPassRegistry')
    issuer = Account.from_mnemonic(MNEMONIC, account_path="m/44'/60'/0'/0/4")
    now = w.eth.get_block('latest').timestamp
    secret, secret_next = _secrets.randbelow(zk.P - 1) + 1, _secrets.randbelow(zk.P - 1) + 1
    bizpass.devnet_issue(issuer_key=issuer.key, chain_id=31337, registry=registry.address, secret=secret,
                         country=32, revenue_band=2, age_ok=1, now=now,
                         submit_issue=lambda bn, leaf, exp, sig: tx(registry.functions.issue(
                             (bn, leaf, exp), bytes.fromhex(sig[2:]), leaf), accounts[3]))
    leaves = bizpass.tree_leaves(registry, deployment.get('deployBlock', 0))
    offer = {'offerId': Web3.keccak(text='ghost-demo-offer'), 'shopId': ids['ghost-shop'],
             'recipient': payouts['ghost-shop'], 'amount': 50_000_000, 'feeRateBpsPerWeek': 50,
             'feeCapBps': 300, 'holdbackBps': 800, 'tier': 0, 'passNullifier': zk.business_nullifier(secret), 'minRevenueBand': 1,
             'expiresAt': now + 3600}
    fields = [('offerId','bytes32'), ('shopId','bytes32'), ('recipient','address'), ('amount','uint256'),
              ('feeRateBpsPerWeek','uint16'), ('feeCapBps','uint16'), ('holdbackBps','uint16'), ('tier','uint8'),
              ('passNullifier','uint256'), ('minRevenueBand','uint8'), ('expiresAt','uint64')]
    inputs = bizpass.prover_inputs(secret=secret, country=32, revenue_band=2, age_ok=1, leaves=leaves,
                                   leaf_index=leaves.index(zk.business_leaf(secret, 32, 2, 1)),
                                   secret_next=secret_next, min_band=1,
                                   context=zk.offer_context(offer['recipient'], bytes(offer['offerId'])))
    proof = bizpass.prove('SeedGhost', inputs)
    message = encode_typed_data(domain_data={'name': 'AdvanceBook', 'version': '1', 'chainId': 31337,
                                             'verifyingContract': book.address},
                                message_types={'Offer': [{'name': n, 'type': t} for n, t in fields]},
                                message_data=offer)
    signature = signer.sign_message(message).signature
    tx(book.functions.drawFirst(tuple(offer[n] for n, _ in fields), signature, proof, inputs.root,
                                inputs.commitment_next), accounts[3])
    for name in names:
        print(f'{name}: {sum(1 for row in schedule if row[1] == name)} sales, {len(payers[name])} payers, payout {payouts[name]}')
    print('ghost-shop: one active advance; no subsequent sales')


if __name__ == '__main__':
    main()
