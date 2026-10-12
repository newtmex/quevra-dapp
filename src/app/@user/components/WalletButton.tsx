"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { monadTestnet } from "@/lib/web3";

const walletButtonBase = "qv:inline-flex qv:min-h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-[10px] qv:border qv:px-[15px] qv:font-[inherit] qv:text-xs qv:font-[650] qv:transition-colors qv:duration-200";
const walletButtonDefault = `${walletButtonBase} qv:border-[rgba(141,120,255,0.45)] qv:bg-[rgba(141,120,255,0.14)] qv:text-[#e5e0ff] qv:hover:border-[rgba(141,120,255,0.75)] qv:hover:bg-[rgba(141,120,255,0.24)] qv:disabled:cursor-default qv:disabled:opacity-[0.65]`;
const walletButtonWarning = `${walletButtonBase} qv:border-[rgba(255,184,77,0.4)] qv:bg-[rgba(255,184,77,0.12)] qv:text-[#ffd79a]`;

export function WalletButton({ children }: { children?: ReactNode }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && Boolean(account && chain);
        const wrongNetwork = connected && (chain?.unsupported || chain?.id !== monadTestnet.id);

        if (!ready) return <button className={walletButtonDefault} disabled type="button">Loading wallet</button>;
        if (!connected) {
          return <button className={walletButtonDefault} onClick={openConnectModal} type="button"><Wallet size={16} /> Connect wallet</button>;
        }
        if (wrongNetwork) {
          return <button className={walletButtonWarning} onClick={openChainModal} type="button">Switch network</button>;
        }
        if (children != null) return children;
        return (
          <button className={walletButtonDefault} onClick={openAccountModal} type="button">
            <span className="qv:size-[7px] qv:rounded-full qv:bg-[var(--qvr-teal)]" />
            {account?.displayName}
            <ChevronDown size={15} />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export default WalletButton;
