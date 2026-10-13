import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
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
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
  testnet: true,
});

export const monadSolonet = defineChain({
  id: 20143,
  name: "Monad Solonet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    // Prefer the nginx /rpc/ front on :48082 — it sends Access-Control-Allow-Origin
    // so browser wallets/viem can call Solonet from the Next.js origin. Direct :48080
    // works from curl/cast but is blocked by CORS in the browser.
    default: { http: [process.env.NEXT_PUBLIC_SOLONET_RPC_URL || "http://127.0.0.1:48082/rpc/"] },
  },
  testnet: true,
});

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "10143");

export const protocolChain: Chain =
  configuredChainId === monadSolonet.id ? monadSolonet : monadTestnet;

export const supportedChains = [protocolChain, protocolChain.id === monadSolonet.id ? monadTestnet : monadSolonet] as const;

export const burnerWalletEnabled =
  process.env.NEXT_PUBLIC_ENABLE_BURNER_WALLET === "true"
  || process.env.NEXT_PUBLIC_ENABLE_BURNER_WALLET === "1"
  || protocolChain.id === monadSolonet.id;

export const faucetEnabled =
  process.env.NEXT_PUBLIC_ENABLE_FAUCET === "true"
  || process.env.NEXT_PUBLIC_ENABLE_FAUCET === "1"
  || protocolChain.id === monadSolonet.id;

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

function buildWalletGroups() {
  const browserWallets = walletConnectProjectId
    ? [metaMaskWallet, walletConnectWallet, injectedWallet]
    : [injectedWallet, metaMaskWallet];

  if (!burnerWalletEnabled) {
    return [{ groupName: "Browser wallets", wallets: browserWallets }];
  }

  // Scaffold-ETH Monad pattern: burner-connector RainbowKit wallet for local/dev testing.
  rainbowkitBurnerWallet.rpcUrls = {
    ...(rainbowkitBurnerWallet.rpcUrls ?? {}),
    [monadSolonet.id]: monadSolonet.rpcUrls.default.http[0],
    [monadTestnet.id]: monadTestnet.rpcUrls.default.http[0],
  };

  return [
    { groupName: "Dev wallets", wallets: [rainbowkitBurnerWallet] },
    { groupName: "Browser wallets", wallets: browserWallets },
  ];
}

let browserConfig: Config | undefined;
let serverConfig: Config | undefined;

export function getWagmiConfig(): Config {
  const transports = Object.fromEntries(
    supportedChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
  );

  if (typeof window === "undefined") {
    serverConfig ??= createConfig({
      chains: supportedChains,
      batch: {
        [monadSolonet.id]: { multicall: { deployless: true } },
      },
      multiInjectedProviderDiscovery: false,
      transports,
      ssr: true,
    });
    return serverConfig;
  }

  if (!browserConfig) {
    if (burnerWalletEnabled) {
      const connectors = connectorsForWallets(buildWalletGroups(), {
        appName: "Quevra",
        projectId: walletConnectProjectId || "quevra-local-burner",
      });
      browserConfig = createConfig({
        chains: supportedChains,
        batch: {
          [monadSolonet.id]: { multicall: { deployless: true } },
        },
        connectors,
        transports,
        ssr: true,
        multiInjectedProviderDiscovery: false,
      });
    } else {
      browserConfig = getDefaultConfig({
        appName: "Quevra",
        projectId: walletConnectProjectId || "",
        ...(walletConnectProjectId
          ? {}
          : { wallets: [{ groupName: "Browser wallets", wallets: [injectedWallet] }] }),
        chains: supportedChains,
        batch: {
          [monadSolonet.id]: { multicall: { deployless: true } },
        },
        transports,
        ssr: true,
      });
    }
  }

  return browserConfig;
}

export function isProtocolChain(chainId: number | undefined): boolean {
  return chainId === protocolChain.id;
}

export function explorerTxUrl(chainId: number | undefined, hash: `0x${string}`): string | null {
  if (chainId === monadTestnet.id) return `${monadTestnet.blockExplorers!.default.url}/tx/${hash}`;
  return null;
}
