"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { isMock } from "@/lib/mra";
import { wagmiConfig } from "@/lib/wagmi-config";

/*
 * RainbowKit + wagmi (the Scaffold-ETH 2 stack) around the whole app, for "Connect wallet". Client-only: it only
 * wraps children, so server components stay server components. In mock mode it renders children untouched.
 * Theme: hunter green accent on canvas, 8px radii (packages/tailwind-config/final.css).
 */
const theme = lightTheme({
  accentColor: "#2c5a3a",
  accentColorForeground: "#f6faf5",
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "small",
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  if (isMock) return <>{children}</>;
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact" initialChain={wagmiConfig.chains[0]}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
