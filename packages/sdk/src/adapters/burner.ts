/**
 * Burner wallet for the testnet demo: a viem local account whose key lives in this device's CredentialVault
 * (IndexedDB in a browser) and nowhere else. Created the first time it is asked for, then reused. It is included
 * in `vault.export()` backups (encrypted), so a recovered phone keeps the same payout address.
 *
 * Testnets only: `loadOrCreateBurner` refuses any chain but Sepolia (11155111) and anvil (31337).
 * The key is never logged, never sent anywhere and never put in an error message.
 */
import { createWalletClient, http, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import { ConfigError, VaultError } from "../errors.js";
import type { CredentialVault } from "./vault.js";

const BURNER_CHAINS: Record<number, typeof sepolia | typeof foundry> = { [sepolia.id]: sepolia, [foundry.id]: foundry };

export type BurnerWallet = { wallet: WalletClient; address: `0x${string}`; created: boolean };

/**
 * The device's burner wallet: loaded from the vault, or created and saved there first.
 * `rpcUrl` is where its transactions are sent (eth_sendRawTransaction plus nonce / fee lookups).
 */
export async function loadOrCreateBurner(vault: CredentialVault, opts: { chainId: number; rpcUrl: string }): Promise<BurnerWallet> {
  const chain = BURNER_CHAINS[opts.chainId];
  if (!chain) throw new ConfigError("config_invalid", "burner wallets are for Sepolia / anvil only");
  let rec = await vault.get("wallet");
  let created = false;
  if (!rec || rec.kind !== "burner_wallet" || !/^0x[0-9a-fA-F]{64}$/.test(rec.privateKey)) {
    const privateKey = generatePrivateKey();
    rec = {
      kind: "burner_wallet",
      privateKey,
      address: privateKeyToAccount(privateKey).address,
      chainId: opts.chainId,
      createdAt: Math.floor(Date.now() / 1000),
    };
    await vault.put("wallet", rec);
    if (!(await vault.get("wallet"))) throw new VaultError("vault_locked", "could not save the burner wallet");
    created = true;
  }
  const account = privateKeyToAccount(rec.privateKey);
  const wallet = createWalletClient({ account, chain, transport: http(opts.rpcUrl, { retryCount: 1 }) });
  return { wallet, address: account.address, created };
}
