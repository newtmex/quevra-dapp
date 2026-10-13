"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useBalance } from "wagmi";
import { Droplets, LoaderCircle } from "lucide-react";
import { faucetEnabled, protocolChain } from "@/lib/web3";
import { notify } from "@/lib/notifications";

const buttonClass =
  "qv:inline-flex qv:min-h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-[10px] qv:border qv:border-[rgba(82,221,195,0.35)] qv:bg-[rgba(82,221,195,0.1)] qv:px-[13px] qv:text-xs qv:font-[650] qv:text-[#8be9d4] qv:transition-colors qv:hover:border-[rgba(82,221,195,0.65)] qv:hover:bg-[rgba(82,221,195,0.18)] qv:disabled:cursor-default qv:disabled:opacity-50";

export function FaucetButton() {
  const { address, chain, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { refetch } = useBalance({ address, chainId: protocolChain.id, query: { enabled: Boolean(address) } });
  const [pending, setPending] = useState(false);

  if (!faucetEnabled) return null;
  if (!isConnected || !address) return null;
  if (chain && chain.id !== protocolChain.id) return null;

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : `Faucet failed (${response.status})`);
      }
      notify.success("Faucet", `Sent ${payload.amountMon ?? "?"} MON to your wallet`);
      await refetch();
      await queryClient.invalidateQueries();
    } catch (error) {
      notify.error("Faucet failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPending(false);
    }
  };

  return (
    <button className={buttonClass} disabled={pending} onClick={() => void onClick()} type="button">
      {pending ? <LoaderCircle className="qv:animate-spin" size={15} /> : <Droplets size={15} />}
      {pending ? "Funding…" : "Faucet"}
    </button>
  );
}

export default FaucetButton;
