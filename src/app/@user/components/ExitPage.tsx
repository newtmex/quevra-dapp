"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowDownToLine, ArrowRight, CircleAlert, Clock3, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, formatEther, parseAbi, type Address, type PublicClient } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { monadTestnet } from "@/lib/web3";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeContractWriteStep } from "@/lib/tx-flow/steps";
import { fetchHolderDirectory, readIncentiveRewards } from "./reward-data";

type ExitState = {
  amount: bigint;
  endEpoch: bigint;
  permanent: boolean;
  liquid: bigint;
  lastCycle: bigint;
  currentEpoch: bigint;
  fullyUnstaked: boolean;
  validators: Array<{ address: Address; intent: bigint; allocation: bigint; pending: bigint }>;
};

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const field = "qv:h-10 qv:w-full qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";
const primary = "qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[10px] qv:font-semibold qv:text-white qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-40";
const stakingPrecompileAbi = parseAbi(["function getEpoch() returns (uint64 epoch, bool inEpochDelayPeriod)"]);

async function readCurrentEpoch(publicClient: PublicClient) {
  const result = await publicClient.call({
    to: "0x0000000000000000000000000000000000001000",
    data: encodeFunctionData({ abi: stakingPrecompileAbi, functionName: "getEpoch" }),
  });
  if (!result.data) throw new Error("Monad did not return the current staking epoch.");
  const [epoch] = decodeFunctionResult({ abi: stakingPrecompileAbi, functionName: "getEpoch", data: result.data }) as readonly [bigint, boolean];
  return epoch;
}

async function readExitState(publicClient: PublicClient, tokenId: bigint, vaults: Address[]): Promise<ExitState> {
  const escrow = getContractConfig(monadTestnet.id, "VeMON");
  const controller = getContractConfig(monadTestnet.id, "StakingController");
  if (!escrow || !controller) throw new Error("veMON contracts are not configured on Monad Testnet.");
  const [locked, currentEpoch] = await Promise.all([
    publicClient.readContract({ address: escrow.address, abi: escrow.abi, functionName: "locked", args: [tokenId] }),
    readCurrentEpoch(publicClient),
  ]);
  const position = locked as readonly [bigint, bigint, boolean, bigint];
  const calls = [
    { address: controller.address, abi: controller.abi, functionName: "balanceOf", args: [tokenId] },
    { address: controller.address, abi: controller.abi, functionName: "stakingCycleOf", args: [tokenId] },
    { address: controller.address, abi: controller.abi, functionName: "isFullyUnstaked", args: [tokenId] },
    ...vaults.map((vault) => ({ address: controller.address, abi: controller.abi, functionName: "intentOf", args: [tokenId, vault] })),
    ...vaults.map((vault) => ({ address: controller.address, abi: controller.abi, functionName: "allocationOf", args: [tokenId, vault] })),
    ...vaults.map((vault) => ({ address: controller.address, abi: controller.abi, functionName: "pendingOf", args: [tokenId, vault] })),
  ];
  const results = await publicClient.multicall({ contracts: calls as never, allowFailure: true }) as unknown as Array<
    { status: "success"; result: unknown } | { status: "failure"; error: Error }
  >;
  const read = (index: number) => results[index]?.status === "success" ? results[index].result : undefined;
  const count = vaults.length;
  return {
    amount: position[0],
    endEpoch: position[1],
    permanent: position[2],
    liquid: (read(0) as bigint | undefined) ?? BigInt(0),
    lastCycle: (read(1) as bigint | undefined) ?? BigInt(0),
    fullyUnstaked: read(2) === true,
    currentEpoch,
    validators: vaults.map((address, index) => ({
      address,
      intent: (read(3 + index) as bigint | undefined) ?? BigInt(0),
      allocation: (read(3 + count + index) as bigint | undefined) ?? BigInt(0),
      pending: (read(3 + count * 2 + index) as bigint | undefined) ?? BigInt(0),
    })),
  };
}

function amountLabel(amount: bigint) {
  return Number(formatEther(amount)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function shorten(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function ExitPage({ initialTokenId }: { initialTokenId?: string }) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [selectedTokenId, setSelectedTokenId] = useState(initialTokenId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(publicClient!, address as Address),
    enabled: Boolean(address && chain?.id === monadTestnet.id),
    refetchInterval: 15_000,
  });
  const positions = directoryQuery.data?.positions ?? [];
  const validators = directoryQuery.data?.validators ?? [];
  const selected = positions.find((position) => position.tokenId === selectedTokenId);
  const vaults = validators.map((validator) => validator.vault).filter((vault): vault is Address => Boolean(vault));
  useEffect(() => {
    if (positions.length && !positions.some((position) => position.tokenId === selectedTokenId)) {
      setSelectedTokenId(positions[0].tokenId);
    }
  }, [positions, selectedTokenId]);

  const stateQuery = useQuery({
    queryKey: ["exit-position", address?.toLowerCase(), selectedTokenId, vaults.join(",")],
    queryFn: () => readExitState(publicClient!, BigInt(selectedTokenId), vaults),
    enabled: Boolean(publicClient && selected && selectedTokenId && chain?.id === monadTestnet.id),
    refetchInterval: 12_000,
  });
  const incentiveQuery = useQuery({
    queryKey: ["incentive-rewards", address?.toLowerCase(), selectedTokenId, validators.map((validator) => validator.bribe).join(",")],
    queryFn: () => readIncentiveRewards(publicClient!, validators, BigInt(selectedTokenId)),
    enabled: Boolean(publicClient && selected && selectedTokenId && chain?.id === monadTestnet.id),
    refetchInterval: 30_000,
  });
  const state = stateQuery.data;
  const pendingIncentives = (incentiveQuery.data ?? []).filter((reward) => reward.amount > BigInt(0));
  const hasTargetAllocations = Boolean(state?.validators.some((validator) => validator.intent > BigInt(0)));
  const readyToUnstake = Boolean(state?.validators.filter((validator) => validator.intent > BigInt(0))
    .every((validator) => validator.allocation >= validator.intent && validator.pending === BigInt(0)));
  const currentCycle = state ? state.currentEpoch / BigInt(5) : BigInt(0);
  const canRequestUnstake = Boolean(state && hasTargetAllocations && readyToUnstake && currentCycle > state.lastCycle);
  const settlementComplete = state?.fullyUnstaked === true;
  const unlockReached = Boolean(state && !state.permanent && state.currentEpoch >= state.endEpoch);
  const canWithdraw = Boolean(state && unlockReached && settlementComplete && incentiveQuery.isSuccess && pendingIncentives.length === 0);
  const targets = state?.validators.filter((validator) => validator.intent > BigInt(0)) ?? [];
  const unstakeSteps = useMemo(() => targets.length ? [makeContractWriteStep({
    key: `unstake-all-${selectedTokenId}`,
    label: "Begin full unstaking",
    contractName: "StakingController",
    functionName: "unstake",
    args: [BigInt(selectedTokenId || "0"), targets.map((validator) => validator.address), targets.map((validator) => validator.intent)],
    displayLabelBtn: true,
  })] : [], [selectedTokenId, targets]);
  const pokeSteps = useMemo(() => [makeContractWriteStep({
    key: `settle-exit-${selectedTokenId}`,
    label: "Advance unstaking settlement",
    contractName: "StakingController",
    functionName: "poke",
    args: [BigInt(selectedTokenId || "0")],
    displayLabelBtn: true,
  })], [selectedTokenId]);
  const unlockPermanentSteps = useMemo(() => [makeContractWriteStep({
    key: `convert-permanent-for-exit-${selectedTokenId}`,
    label: "Convert permanent lock to finite",
    contractName: "VeMON",
    functionName: "unlockPermanent",
    args: [BigInt(selectedTokenId || "0")],
    displayLabelBtn: true,
  })], [selectedTokenId]);
  const withdrawSteps = useMemo(() => [makeContractWriteStep({
    key: `redeem-exited-position-${selectedTokenId}`,
    label: "Redeem MON and close position",
    contractName: "VeMON",
    functionName: "withdraw",
    args: [BigInt(selectedTokenId || "0")],
    displayLabelBtn: true,
  })], [selectedTokenId]);

  async function refresh() {
    await Promise.all([
      directoryQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["exit-position", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["native-rewards", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["incentive-rewards", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["stake-position-state", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] }),
    ]);
  }

  return (
    <div className="qv:space-y-6">
      <header>
        <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#a99aff]"><ArrowDownToLine size={13} /> Position exit</p>
        <h1 className="qv:mt-2 qv:text-[26px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white qv:sm:text-[32px]">Exit a veMON position</h1>
        <p className="qv:mt-2 qv:max-w-[680px] qv:text-[12px] qv:leading-5 qv:text-[#aeb0c0]">Unstake validator allocations, let Monad withdrawals settle, then redeem MON after the lock expires.</p>
      </header>

      {!address ? <div className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}><Wallet size={17} className="qv:text-[#a99aff]" />Connect a wallet to manage position exits.</div>
        : chain?.id !== monadTestnet.id ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>Switch to Monad Testnet to exit a position.</div>
          : directoryQuery.isPending ? <div className={`${panel} qv:p-8 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Loading your positions…</div>
            : directoryQuery.isError ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</div>
              : positions.length === 0 ? <div className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><Wallet size={20} className="qv:text-[#a99aff]" /><p className="qv:mt-3 qv:text-[13px] qv:font-semibold qv:text-white">No veMON positions found</p><Link className="qv:mt-3 qv:inline-flex qv:items-center qv:gap-2 qv:text-[10px] qv:text-[#bdb2ff] qv:no-underline" href="/lock">Go to locks <ArrowRight size={13} /></Link></div>
                : <>
                  <section className={`${panel} qv:p-4 qv:sm:p-5`}>
                    <label className="qv:block qv:max-w-[480px] qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">veMON position</span><select className={field} value={selectedTokenId} onChange={(event) => { setSelectedTokenId(event.target.value); setMessage(null); }}>
                      {positions.map((position) => <option key={position.tokenId} value={position.tokenId}>#{position.tokenId} · {amountLabel(BigInt(position.amount))} MON{position.permanent ? " · permanent" : ""}</option>)}
                    </select></label>
                    {message && <p className="qv:mt-3 qv:text-[10px] qv:text-[#a9e2b7]">{message}</p>}
                  </section>

                  {stateQuery.isPending ? <div className={`${panel} qv:flex qv:items-center qv:justify-center qv:gap-2 qv:p-9 qv:text-[11px] qv:text-[#999bad]`}><LoaderCircle size={15} className="qv:animate-spin" />Reading lock and staking state…</div>
                    : stateQuery.isError ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{stateQuery.error.message}</div>
                      : state && <>
                        <section className="qv:grid qv:gap-3 qv:sm:grid-cols-3">
                          <div className={`${panel} qv:p-4`}><p className="qv:text-[9px] qv:uppercase qv:tracking-[0.1em] qv:text-[#898b9c]">Position principal</p><p className="qv:mt-2 qv:text-[17px] qv:font-semibold qv:text-white">{amountLabel(state.amount)} MON</p></div>
                          <div className={`${panel} qv:p-4`}><p className="qv:text-[9px] qv:uppercase qv:tracking-[0.1em] qv:text-[#898b9c]">Liquid and settled</p><p className="qv:mt-2 qv:text-[17px] qv:font-semibold qv:text-white">{amountLabel(state.liquid)} MON</p></div>
                          <div className={`${panel} qv:p-4`}><p className="qv:text-[9px] qv:uppercase qv:tracking-[0.1em] qv:text-[#898b9c]">Lock status</p><p className="qv:mt-2 qv:text-[17px] qv:font-semibold qv:text-white">{state.permanent ? "Permanent" : unlockReached ? "Unlocked" : `Epoch ${state.currentEpoch} / ${state.endEpoch}`}</p></div>
                        </section>

                        <section className={`${panel} qv:p-5 qv:sm:p-6`}>
                          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><ShieldCheck size={14} className="qv:text-[#a99aff]" /> Exit progress</p>
                          <ol className="qv:mt-4 qv:space-y-3">{[
                            { done: !hasTargetAllocations, title: "Request unstaking", detail: hasTargetAllocations ? "Remove the position’s validator allocations." : "No validator target allocations remain." },
                            { done: settlementComplete, title: "Settle pending withdrawals", detail: settlementComplete ? "All validator positions are fully unstaked." : "Monad’s epoch withdrawal delay may require another settlement check." },
                            { done: unlockReached, title: "Wait for lock expiry", detail: state.permanent ? "Convert this to a finite lock before it can expire." : unlockReached ? "The finite lock has reached its unlock epoch." : `Unlocks at epoch ${state.endEpoch}; current epoch is ${state.currentEpoch}.` },
                            { done: pendingIncentives.length === 0 && incentiveQuery.isSuccess, title: "Claim validator incentives", detail: incentiveQuery.isPending ? "Checking cycle rewards before the NFT can be closed." : incentiveQuery.isError ? "Could not verify incentive claims; retry on Rewards before closing." : pendingIncentives.length ? `${pendingIncentives.length} incentive reward${pendingIncentives.length === 1 ? " is" : "s are"} still claimable.` : "No eligible incentives are waiting to be claimed." },
                          ].map((step, index) => <li className="qv:flex qv:items-start qv:gap-3" key={step.title}><span className={`qv:grid qv:size-6 qv:shrink-0 qv:place-items-center qv:rounded-full qv:text-[10px] qv:font-semibold ${step.done ? "qv:bg-[rgba(85,194,127,0.12)] qv:text-[#9adcb0]" : "qv:bg-white/[0.06] qv:text-[#9b9eaf]"}`}>{step.done ? "✓" : index + 1}</span><div><p className="qv:text-[11px] qv:font-semibold qv:text-[#e9e9f1]">{step.title}</p><p className="qv:mt-0.5 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">{step.detail}</p></div></li>)}</ol>

                          <div className="qv:mt-5 qv:flex qv:flex-wrap qv:gap-2">
                            {hasTargetAllocations && <TransactionButton className={primary} disabled={!canRequestUnstake} onComplete={() => { setMessage("Unstaking requested. Continue settlement as Monad’s withdrawal delay clears."); void refresh(); }} onError={(error) => setMessage(error)} steps={unstakeSteps}>Request full unstake <ArrowRight size={13} /></TransactionButton>}
                            {hasTargetAllocations && !readyToUnstake && <TransactionButton className={primary} onComplete={() => { setMessage("Stake settlement advanced. Retry after the allocation and pending status update."); void refresh(); }} onError={(error) => setMessage(error)} steps={pokeSteps}>Settle stake before exit <ArrowRight size={13} /></TransactionButton>}
                            {!hasTargetAllocations && !settlementComplete && <TransactionButton className={primary} onComplete={() => { setMessage("Settlement checked. Refresh after the next Monad epoch if funds remain pending."); void refresh(); }} onError={(error) => setMessage(error)} steps={pokeSteps}>Continue settlement <ArrowRight size={13} /></TransactionButton>}
                            {state.permanent && <TransactionButton className={primary} onComplete={() => { setMessage("Permanent position converted to a finite lock."); void refresh(); }} onError={(error) => setMessage(error)} steps={unlockPermanentSteps}>Convert to finite lock <Clock3 size={13} /></TransactionButton>}
                            {!state.permanent && unlockReached && settlementComplete && ((incentiveQuery.isSuccess && pendingIncentives.length > 0) || incentiveQuery.isError) && <Link className="qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-4 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:no-underline" href={`/rewards?tokenId=${selectedTokenId}`}>{incentiveQuery.isError ? "Retry reward check" : "Claim incentives"} <ArrowRight size={13} /></Link>}
                            {!state.permanent && <TransactionButton className={primary} disabled={!canWithdraw} onComplete={() => { setMessage("Position redeemed. Refreshing your veMON positions…"); void refresh(); }} onError={(error) => setMessage(error)} steps={withdrawSteps}>Redeem MON and close position <ArrowDownToLine size={13} /></TransactionButton>}
                          </div>
                          {hasTargetAllocations && readyToUnstake && currentCycle <= state.lastCycle && <p className="qv:mt-3 qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#e7c27f]"><Clock3 size={12} />Unstaking is available in the next Quevra cycle. Current cycle {currentCycle}; last allocation cycle {state.lastCycle}.</p>}
                          {hasTargetAllocations && !readyToUnstake && <p className="qv:mt-3 qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#9295a7]"><Clock3 size={12} />Let the requested stake allocation finish settling before unstaking it.</p>}
                          {!state.permanent && !unlockReached && <p className="qv:mt-3 qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#9295a7]"><Clock3 size={12} />You can begin unstaking before expiry; redemption waits until epoch {state.endEpoch}.</p>}
                          {state.permanent && <p className="qv:mt-3 qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#e7c27f]"><CircleAlert size={12} />A permanent lock has no expiry. Convert it to a finite lock, then wait for its unlock epoch.</p>}
                          {incentiveQuery.isError && <p className="qv:mt-3 qv:text-[9px] qv:text-[#ff9caa]">Could not verify cycle incentives, so redemption stays disabled. Open Rewards and retry the reward check.</p>}
                          {incentiveQuery.isPending && !state.permanent && unlockReached && settlementComplete && <p className="qv:mt-3 qv:text-[9px] qv:text-[#9295a7]">Checking for unclaimed validator incentives before allowing the NFT to close…</p>}
                        </section>

                        <section className={`${panel} qv:p-4 qv:sm:p-5`}>
                          <p className="qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">Validator positions</p>
                          {state.validators.every((validator) => validator.intent === BigInt(0) && validator.allocation === BigInt(0) && validator.pending === BigInt(0))
                            ? <p className="qv:mt-3 qv:text-[10px] qv:text-[#9295a7]">No validator allocations or pending withdrawals.</p>
                            : <div className="qv:mt-3 qv:space-y-2">{state.validators.filter((validator) => validator.intent > BigInt(0) || validator.allocation > BigInt(0) || validator.pending > BigInt(0)).map((validator) => <div className="qv:grid qv:grid-cols-2 qv:gap-2 qv:rounded-lg qv:bg-[#0e1018] qv:px-3 qv:py-2.5 qv:sm:grid-cols-4" key={validator.address}><p className="qv:col-span-2 qv:text-[10px] qv:font-semibold qv:text-[#e9e9f1] qv:sm:col-span-1">{shorten(validator.address)}</p><p className="qv:text-[9px] qv:text-[#9295a7]">Target {amountLabel(validator.intent)} MON</p><p className="qv:text-[9px] qv:text-[#9295a7]">Active {amountLabel(validator.allocation)} MON</p><p className="qv:text-[9px] qv:text-[#9295a7]">Pending {amountLabel(validator.pending)} MON</p></div>)}</div>}
                        </section>
                      </>}
                </>}
    </div>
  );
}
