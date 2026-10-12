import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";
import { createConfig, type Config } from "wagmi";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

let browserConfig: Config | undefined;
let serverConfig: Config | undefined;

export function getWagmiConfig(): Config {
  const rpcUrl = monadTestnet.rpcUrls.default.http[0];
  if (typeof window === "undefined") {
    serverConfig ??= createConfig({
      chains: [monadTestnet],
      multiInjectedProviderDiscovery: false,
      transports: { [monadTestnet.id]: http(rpcUrl) },
      ssr: true,
    });
    return serverConfig;
  }

  browserConfig ??= getDefaultConfig({
    appName: "Quevra",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "quevra-testnet-dashboard",
    chains: [monadTestnet],
    transports: { [monadTestnet.id]: http(rpcUrl) },
    ssr: true,
  });
  return browserConfig;
}
