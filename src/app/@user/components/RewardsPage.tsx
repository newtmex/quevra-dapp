"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowDownToLine, Coins, LoaderCircle, Sparkles, Wallet } from "lucide-react";
import { formatEther, parseAbi, type Address } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { protocolChain } from "@/lib/web3";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeAddressWriteStep, makeContractWriteStep } from "@/lib/tx-flow/steps";
import { fetchHolderDirectory, formatTokenAmount, getIncentiveTokenList, readIncentiveRewards, readNativeRewards } from "./reward-data";
import { keepPreviousWalletData } from "@/lib/indexer-data";

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const field = "qv:h-10 qv:w-full qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";
const button = "qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[10px] qv:font-semibold qv:text-white qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-40";
const rewardAbi = parseAbi(["function getReward(uint256 tokenId, address[] tokens)"]);

export default function RewardsPage({ initialTokenId }: { initialTokenId?: string }) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [selectedTokenId, setSelectedTokenId] = useState(initialTokenId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(address as Address),
    enabled: Boolean(address && chain?.id === protocolChain.id),
    refetchInterval: 15_000,
    placeholderData: keepPreviousWalletData(address),
  });
  const positions = directoryQuery.data?.positions ?? [];
  const validators = directoryQuery.data?.validators ?? [];
  const selectedPosition = positions.find((position) => position.tokenId === selectedTokenId);

  useEffect(() => {
    if (positions.length && !positions.some((position) => position.tokenId === selectedTokenId)) {
      setSelectedTokenId(positions[0].tokenId);
    }
  }, [positions, selectedTokenId]);

  const nativeQuery = useQuery({
    queryKey: ["native-rewards", address?.toLowerCase(), selectedTokenId, validators.map((validator) => validator.vault).join(",")],
    queryFn: () => readNativeRewards(publicClient!, BigInt(selectedTokenId), validators),
    enabled: Boolean(address && publicClient && selectedPosition && chain?.id === protocolChain.id),
    refetchInterval: 20_000,
    placeholderData: keepPreviousWalletData(address),
  });
  const incentiveQuery = useQuery({
    queryKey: ["incentive-rewards", address?.toLowerCase(), selectedTokenId, validators.map((validator) => validator.bribe).join(",")],
    queryFn: () => readIncentiveRewards(publicClient!, validators, BigInt(selectedTokenId)),
    enabled: Boolean(address && publicClient && selectedPosition && chain?.id === protocolChain.id),
    refetchInterval: 30_000,
    placeholderData: keepPreviousWalletData(address),
  });
  const controller = getContractConfig(protocolChain.id, "StakingController");
  const claimableIncentives = (incentiveQuery.data ?? []).filter((reward) => reward.amount > BigInt(0));
  const incentiveGroups = useMemo(() => getIncentiveTokenList(claimableIncentives), [claimableIncentives]);
  const nativeVaults = nativeQuery.data?.vaults ?? [];
  const rewardClaimSteps = useMemo(() => nativeVaults.length && controller ? [makeContractWriteStep({
    key: `claim-native-rewards-${selectedTokenId}`,
    label: "Claim native MON rewards",
    contractName: "StakingController",
    functionName: "claimRewards",
    args: [BigInt(selectedTokenId || "0"), nativeVaults],
    displayLabelBtn: true,
  })] : [], [controller, nativeVaults, selectedTokenId]);
  const compoundSteps = useMemo(() => nativeVaults.length && controller ? [makeContractWriteStep({
    key: `compound-native-rewards-${selectedTokenId}`,
    label: "Compound native MON rewards",
    contractName: "StakingController",
    functionName: "compound",
    args: [BigInt(selectedTokenId || "0"), nativeVaults],
    displayLabelBtn: true,
  })] : [], [controller, nativeVaults, selectedTokenId]);
  const incentiveClaimSteps = useMemo(() => incentiveGroups.map((group) => makeAddressWriteStep({
    key: `claim-incentive-${group.bribe}-${selectedTokenId}`,
    label: `Claim ${group.label} incentives`,
    address: group.bribe,
    abi: rewardAbi,
    functionName: "getReward",
    args: [BigInt(selectedTokenId || "0"), group.tokens],
    displayLabelBtn: true,
  })), [incentiveGroups, selectedTokenId]);

  async function refresh() {
    await Promise.all([
      directoryQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["native-rewards", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["incentive-rewards", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] }),
    ]);
  }

  return (
    <div className="qv:space-y-6">
      <header>
        <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#a99aff]"><Sparkles size={13} /> Position rewards</p>
        <h1 className="qv:mt-2 qv:text-[26px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white qv:sm:text-[32px]">Rewards</h1>
        <p className="qv:mt-2 qv:max-w-[680px] qv:text-[12px] qv:leading-5 qv:text-[#aeb0c0]">Claim native MON staking rewards to your wallet, compound them into the same position, or claim validator incentives earned in completed cycles.</p>
      </header>

      {!address ? <div className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}><Wallet size={17} className="qv:text-[#a99aff]" />Connect a wallet to see rewards for your veMON positions.</div>
        : chain?.id !== protocolChain.id ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>Switch to {protocolChain.name} to view and claim rewards.</div>
          : directoryQuery.isPending ? <div className={`${panel} qv:p-8 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Loading your reward positions…</div>
            : directoryQuery.isError ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</div>
              : positions.length === 0 ? <div className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><Wallet size={20} className="qv:text-[#a99aff]" /><p className="qv:mt-3 qv:text-[13px] qv:font-semibold qv:text-white">Create a veMON position first</p><p className="qv:mt-1 qv:text-[10px] qv:text-[#999bad]">Rewards are attached to the position that backed validators.</p></div>
                : <>
                  <section className={`${panel} qv:p-4 qv:sm:p-5`}>
                    <label className="qv:block qv:max-w-[480px] qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">veMON position</span><select className={field} value={selectedTokenId} onChange={(event) => { setSelectedTokenId(event.target.value); setMessage(null); }}>
                      {positions.map((position) => <option key={position.tokenId} value={position.tokenId}>#{position.tokenId} · {Number(formatEther(BigInt(position.amount))).toLocaleString(undefined, { maximumFractionDigits: 3 })} MON{position.permanent ? " · permanent" : ""}</option>)}
                    </select></label>
                    {message && <p className="qv:mt-3 qv:text-[10px] qv:text-[#a9e2b7]">{message}</p>}
                  </section>

                  <section className="qv:grid qv:items-start qv:gap-5 qv:xl:grid-cols-2">
                    <article className={`${panel} qv:p-5 qv:sm:p-6`}>
                      <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><Coins size={14} className="qv:text-[#a99aff]" /> Native staking rewards</p>
                      <p className="qv:mt-4 qv:text-[29px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white">{nativeQuery.isPending ? "—" : Number(formatEther(nativeQuery.data?.amount ?? BigInt(0))).toLocaleString(undefined, { maximumFractionDigits: 5 })} <span className="qv:text-[12px] qv:text-[#aeb0c0]">MON</span></p>
                      <p className="qv:mt-1 qv:text-[10px] qv:leading-4 qv:text-[#9295a7]">Estimate from this position’s active and historical validator allocations. Claiming syncs the latest Monad rewards.</p>
                      {nativeQuery.isError && <p className="qv:mt-3 qv:text-[10px] qv:text-[#ff9caa]">{nativeQuery.error.message}</p>}
                      <div className="qv:mt-5 qv:flex qv:flex-wrap qv:gap-2">
                        <TransactionButton className={button} disabled={!nativeVaults.length} onComplete={() => { setMessage("Native MON rewards claimed to your wallet."); void refresh(); }} onError={(error) => setMessage(error)} steps={rewardClaimSteps}>Claim MON <ArrowDownToLine size={13} /></TransactionButton>
                        <TransactionButton className="qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-4 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:transition qv:hover:bg-white/[0.07] qv:disabled:cursor-not-allowed qv:disabled:opacity-40" disabled={!nativeVaults.length} onComplete={() => { setMessage("Rewards compounded into this veMON position."); void refresh(); }} onError={(error) => setMessage(error)} steps={compoundSteps}>Compound into position</TransactionButton>
                      </div>
                      {!nativeVaults.length && !nativeQuery.isPending && <p className="qv:mt-3 qv:text-[10px] qv:text-[#9295a7]">This position has no validator rewards to claim yet.</p>}
                    </article>

                    <article className={`${panel} qv:p-5 qv:sm:p-6`}>
                      <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><Sparkles size={14} className="qv:text-[#a99aff]" /> Validator incentives</p>
                      <p className="qv:mt-1 qv:text-[10px] qv:leading-4 qv:text-[#9295a7]">Cycle-funded ERC-20 incentives become claimable after their earning cycle ends.</p>
                      {incentiveQuery.isPending ? <div className="qv:flex qv:items-center qv:gap-2 qv:py-8 qv:text-[10px] qv:text-[#999bad]"><LoaderCircle size={14} className="qv:animate-spin" />Checking completed cycles…</div>
                        : incentiveQuery.isError ? <p className="qv:mt-5 qv:text-[10px] qv:text-[#ff9caa]">Could not load validator incentives.</p>
                          : claimableIncentives.length === 0 ? <div className="qv:mt-5 qv:rounded-lg qv:bg-[#0e1018] qv:p-4 qv:text-[10px] qv:leading-4 qv:text-[#9295a7]">No validator incentives are claimable for this position right now. Rewards funded this cycle are available after the cycle closes.</div>
                            : <div className="qv:mt-4 qv:space-y-2">{claimableIncentives.map((reward) => <div className="qv:flex qv:items-center qv:justify-between qv:gap-3 qv:rounded-lg qv:bg-[#0e1018] qv:px-3 qv:py-2.5" key={`${reward.bribe}-${reward.token}`}><div><p className="qv:text-[10px] qv:font-semibold qv:text-[#e9e9f1]">{reward.validator.validatorId ? `Validator #${reward.validator.validatorId}` : `Validator identity #${reward.validator.tokenId}`}</p><p className="qv:mt-0.5 qv:text-[9px] qv:text-[#898b9c]">{reward.symbol}</p></div><p className="qv:text-right qv:text-[11px] qv:font-semibold qv:text-white">{formatTokenAmount(reward.amount, reward.decimals)} <span className="qv:text-[9px] qv:text-[#aeb0c0]">{reward.symbol}</span></p></div>)}</div>}
                      {claimableIncentives.length > 0 && <TransactionButton className={`${button} qv:mt-4`} onComplete={() => { setMessage("Validator incentives claimed to your wallet."); void refresh(); }} onError={(error) => setMessage(error)} steps={incentiveClaimSteps}>Claim incentives <ArrowDownToLine size={13} /></TransactionButton>}
                    </article>
                  </section>
                  <p className="qv:text-[9px] qv:leading-4 qv:text-[#77798b]">Native rewards are paid in MON. Validator incentives are separate ERC-20 claims. Claim incentives before withdrawing a veMON position.</p>
                </>}
    </div>
  );
}
