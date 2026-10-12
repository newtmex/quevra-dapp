"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Wallet } from "lucide-react";
import { monadTestnet } from "@/lib/web3";

export default function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && Boolean(account && chain);
        const wrongNetwork = connected && (chain?.unsupported || chain?.id !== monadTestnet.id);

        if (!ready) return <button className="wallet-button" disabled>Loading wallet</button>;
        if (!connected) {
          return <button className="wallet-button" onClick={openConnectModal} type="button"><Wallet size={16} /> Connect wallet</button>;
        }
        if (wrongNetwork) {
          return <button className="wallet-button wallet-button--warning" onClick={openChainModal} type="button">Switch network</button>;
        }
        return (
          <button className="wallet-button" onClick={openAccountModal} type="button">
            <span className="wallet-button__dot" />
            {account?.displayName}
            <ChevronDown size={15} />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
