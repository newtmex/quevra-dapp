import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { defineChain, http, type Chain } from "viem";
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

export const monadSolonet = defineChain({
  id: 20143,
  name: "Monad Solonet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_SOLONET_RPC_URL || "http://127.0.0.1:48080"] },
  },
  testnet: true,
});

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "10143");

export const protocolChain: Chain =
  configuredChainId === monadSolonet.id ? monadSolonet : monadTestnet;

export const supportedChains = [protocolChain, protocolChain.id === monadSolonet.id ? monadTestnet : monadSolonet] as const;

let browserConfig: Config | undefined;
let serverConfig: Config | undefined;

export function getWagmiConfig(): Config {
  const transports = Object.fromEntries(
    supportedChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
  );

  if (typeof window === "undefined") {
    serverConfig ??= createConfig({
      chains: supportedChains,
      multiInjectedProviderDiscovery: false,
      transports,
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
    chains: supportedChains,
    transports,
    ssr: true,
  });
  return browserConfig;
}

export function isProtocolChain(chainId: number | undefined): boolean {
  return chainId === protocolChain.id;
}

export function explorerTxUrl(chainId: number | undefined, hash: `0x${string}`): string | null {
  if (chainId === monadTestnet.id) return `${monadTestnet.blockExplorers!.default.url}/tx/${hash}`;
  return null;
}
