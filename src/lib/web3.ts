import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
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
    // WalletConnect requires a project ID issued by Reown. Until one is
    // configured, expose injected browser wallets without making a failing
    // request with a placeholder ID.
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      ? {}
      : { wallets: [{ groupName: "Browser wallets", wallets: [injectedWallet] }] }),
    chains: [monadTestnet],
    transports: { [monadTestnet.id]: http(rpcUrl) },
    ssr: true,
  });
  return browserConfig;
}
