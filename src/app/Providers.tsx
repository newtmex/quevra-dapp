"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { getWagmiConfig, protocolChain } from "@/lib/web3";
import { NotificationsToaster } from "@/lib/notifications";
import { TxFlowRuntimeProvider } from "@/lib/tx-flow/runtime";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={getWagmiConfig()}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={protocolChain}
          theme={darkTheme({
            accentColor: "#7c62ff",
            accentColorForeground: "#ffffff",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
        >
          <TxFlowRuntimeProvider>
            {children}
            <NotificationsToaster />
          </TxFlowRuntimeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
