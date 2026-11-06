import type { Metadata } from "next";
import { FaucetScreen } from "@/screens/faucet/screen";

export const metadata: Metadata = { title: "Get test tokens" };

/** Testnet faucet for judges: gas + test USDC (+ DRIP) to any address, and "Add to MetaMask". */
export default function Page() {
  return <FaucetScreen />;
}
