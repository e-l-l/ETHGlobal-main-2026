import { connectorsForWallets, type WalletList } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, type Config } from "wagmi";
import { sepolia } from "wagmi/chains";
import { APP_NAME } from "./brand";

/*
 * The one wagmi config, shared by the RainbowKit provider (components/wallet-provider.tsx) and the SDK wallet
 * adapter (lib/mra-browser.ts), which takes the active connector's provider from it. Sepolia only.
 *
 * WalletConnect (and MetaMask's QR fallback, which rides on it) is listed only when
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set; without it the list is browser wallets only, so nothing breaks.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const hasMetaMask = typeof window !== "undefined" && !!(window as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask;

const wallets: WalletList = projectId
  ? [{ groupName: "Wallets", wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet] }]
  : [{ groupName: "Wallets", wallets: [...(hasMetaMask ? [metaMaskWallet] : []), injectedWallet, rabbyWallet, coinbaseWallet] }];

// connectorsForWallets requires a projectId string; it is only used by the WalletConnect-based wallets above.
const connectors = connectorsForWallets(wallets, { appName: APP_NAME, projectId: projectId || "unset" });

export const wagmiConfig: Config = createConfig({
  chains: [sepolia],
  connectors,
  transports: { [sepolia.id]: http("https://sepolia.gateway.tenderly.co") },
  ssr: true,
});

export { sepolia };
