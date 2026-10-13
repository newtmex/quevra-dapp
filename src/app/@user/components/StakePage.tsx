"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowRight, Check, CircleAlert, LoaderCircle, Search, ShieldCheck, Wallet } from "lucide-react";
import { formatEther, parseEther, type Address, type PublicClient } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { fetchHolderDirectory, type HolderPosition, type HolderValidator } from "@/lib/indexer-data";
import { estimateGaugeWeight, readCurrentCycle } from "@/lib/protocol-time";
import { protocolChain } from "@/lib/web3";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeContractWriteStep } from "@/lib/tx-flow/steps";

type Position = HolderPosition;
type Validator = HolderValidator;
type ValidatorStakeState = { active: boolean; intent: bigint; allocation: bigint; pending: bigint };
type StakeState = {
  liquid: bigint;
  principal: bigint;
  lastCycle: bigint;
  currentEpoch: bigint;
  currentCycle: bigint;
  votingPower: bigint;
  validators: Record<string, ValidatorStakeState>;
};

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const field = "qv:h-10 qv:w-full qv:min-w-0 qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";
const input = "qv:h-9 qv:w-[112px] qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-2.5 qv:text-right qv:text-[11px] qv:text-white qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";

async function readStakeState(
  publicClient: PublicClient,
  controllerAddress: Address,
  controllerAbi: readonly unknown[],
  escrowAddress: Address,
  escrowAbi: readonly unknown[],
  tokenId: bigint,
  validators: Validator[],
): Promise<StakeState> {
  const [{ epoch, cycle }, results] = await Promise.all([
    readCurrentCycle(publicClient),
    publicClient.multicall({
      contracts: [
        { address: controllerAddress, abi: controllerAbi, functionName: "balanceOf", args: [tokenId] },
        { address: controllerAddress, abi: controllerAbi, functionName: "veMONPrincipalOf", args: [tokenId] },
        { address: controllerAddress, abi: controllerAbi, functionName: "stakingCycleOf", args: [tokenId] },
        { address: escrowAddress, abi: escrowAbi, functionName: "votingPowerOf", args: [tokenId] },
        ...validators.map(({ vault }) => ({ address: controllerAddress, abi: controllerAbi, functionName: "isValidatorActive", args: [vault!] })),
        ...validators.map(({ vault }) => ({ address: controllerAddress, abi: controllerAbi, functionName: "intentOf", args: [tokenId, vault!] })),
        ...validators.map(({ vault }) => ({ address: controllerAddress, abi: controllerAbi, functionName: "allocationOf", args: [tokenId, vault!] })),
        ...validators.map(({ vault }) => ({ address: controllerAddress, abi: controllerAbi, functionName: "pendingOf", args: [tokenId, vault!] })),
      ] as never,
      allowFailure: true,
    }) as unknown as Promise<Array<{ status: "success"; result: unknown } | { status: "failure"; error: Error }>>,
  ]);
  const read = (index: number) => results[index]?.status === "success" ? results[index].result : undefined;
  const count = validators.length;
  const offset = 4;
  const stateByVault: Record<string, ValidatorStakeState> = {};
  for (let index = 0; index < count; index += 1) {
    const vault = validators[index].vault!.toLowerCase();
    stateByVault[vault] = {
      active: read(offset + index) === true,
      intent: (read(offset + count + index) as bigint | undefined) ?? BigInt(0),
      allocation: (read(offset + 2 * count + index) as bigint | undefined) ?? BigInt(0),
      pending: (read(offset + 3 * count + index) as bigint | undefined) ?? BigInt(0),
    };
  }
  return {
    liquid: (read(0) as bigint | undefined) ?? BigInt(0),
    principal: (read(1) as bigint | undefined) ?? BigInt(0),
    lastCycle: (read(2) as bigint | undefined) ?? BigInt(0),
    votingPower: (read(3) as bigint | undefined) ?? BigInt(0),
    currentEpoch: epoch,
    currentCycle: cycle,
    validators: stateByVault,
  };
}

function formatMon(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseMon(value: string) {
  if (!/^\d+(\.\d{0,18})?$/.test(value.trim())) return BigInt(0);
  try { return parseEther(value.trim()); } catch { return BigInt(0); }
}

function shorten(value: string | null | undefined) {
  if (!value) return "Not available";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function StakePage({ initialTokenId }: { initialTokenId?: string }) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [selectedTokenId, setSelectedTokenId] = useState(initialTokenId ?? "");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initializedPosition = useRef("");
  const escrow = getContractConfig(protocolChain.id, "VeMON");
  const controller = getContractConfig(protocolChain.id, "StakingController");
  const directoryKey = ["quevra-directory", address?.toLowerCase(), chain?.id];
  const directoryQuery = useQuery({
    queryKey: directoryKey,
    queryFn: () => fetchHolderDirectory(address as Address),
    enabled: Boolean(address && chain?.id === protocolChain.id),
    refetchInterval: 15_000,
  });
  const positions = directoryQuery.data?.positions ?? [];
  const validators = directoryQuery.data?.validators ?? [];
  const selectedPosition = positions.find((position) => position.tokenId === selectedTokenId);
  const stateQuery = useQuery({
    queryKey: ["stake-position-state", address?.toLowerCase(), selectedTokenId, validators.map((validator) => validator.vault?.toLowerCase()).join(",")],
    queryFn: () => readStakeState(
      publicClient!,
      controller!.address,
      controller!.abi,
      escrow!.address,
      escrow!.abi,
      BigInt(selectedTokenId),
      validators,
    ),
    enabled: Boolean(address && publicClient && selectedPosition && controller?.address && escrow?.address && selectedTokenId),
    refetchInterval: 12_000,
  });
  const stakeState = stateQuery.data;

  useEffect(() => {
    if (!positions.length || initialTokenId) return;
    if (!positions.some((position) => position.tokenId === selectedTokenId)) {
      setSelectedTokenId(positions[0].tokenId);
    }
  }, [positions, selectedTokenId, initialTokenId]);

  useEffect(() => {
    if (!stakeState || initializedPosition.current === selectedTokenId) return;
    setAllocations(Object.fromEntries(validators.map((validator) => {
      const state = stakeState.validators[validator.vault!.toLowerCase()];
      return [validator.vault!.toLowerCase(), state && state.intent > BigInt(0) ? formatEther(state.intent) : ""];
    })));
    initializedPosition.current = selectedTokenId;
  }, [selectedTokenId, stakeState, validators]);

  const totalTarget = useMemo(() => Object.values(allocations).reduce((total, value) => total + parseMon(value), BigInt(0)), [allocations]);
  const hasExistingPosition = validators.some((validator) => {
    const state = stakeState?.validators[validator.vault!.toLowerCase()];
    return Boolean(state && (state.intent > BigInt(0) || state.allocation > BigInt(0) || state.pending > BigInt(0)));
  });
  const maxAllocation = stakeState ? (hasExistingPosition ? stakeState.principal : stakeState.liquid) : BigInt(0);
  const filteredValidators = validators.filter((validator) => {
    const haystack = `${validator.tokenId} ${validator.validatorId ?? ""} ${validator.operator ?? ""} ${validator.vault ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const stakeRows = validators.filter((validator) => parseMon(allocations[validator.vault!.toLowerCase()] ?? "") > BigInt(0));
  const settlementPending = validators.some((validator) => {
    const state = stakeState?.validators[validator.vault!.toLowerCase()];
    return Boolean(state && (state.pending > BigInt(0) || state.intent !== state.allocation));
  });
  const withinBalance = totalTarget <= maxAllocation;
  const cycleBlocked = Boolean(
    stakeState
    && hasExistingPosition
    && stakeState.currentCycle <= stakeState.lastCycle,
  );
  const canSubmit = Boolean(
    address
    && chain?.id === protocolChain.id
    && selectedTokenId
    && stakeRows.length
    && withinBalance
    && controller?.address
    && !cycleBlocked,
  );
  const allocatedPrincipal = useMemo(() => {
    if (!stakeState) return BigInt(0);
    return Object.values(stakeState.validators).reduce((sum, state) => sum + state.allocation, BigInt(0));
  }, [stakeState]);
  const unallocatedPrincipal = stakeState ? (stakeState.principal > allocatedPrincipal ? stakeState.principal - allocatedPrincipal : BigInt(0)) : BigInt(0);
  const voteRows = useMemo(() => {
    if (!stakeState) return [];
    return validators
      .map((validator) => {
        const state = stakeState.validators[validator.vault!.toLowerCase()];
        const allocated = state?.allocation ?? BigInt(0);
        const intent = state?.intent ?? BigInt(0);
        const weight = estimateGaugeWeight(stakeState.votingPower, allocated, stakeState.principal);
        return { validator, allocated, intent, weight };
      })
      .filter((row) => row.allocated > BigInt(0) || row.intent > BigInt(0) || parseMon(allocations[row.validator.vault!.toLowerCase()] ?? "") > BigInt(0));
  }, [allocations, stakeState, validators]);
  const steps = useMemo(() => [makeContractWriteStep({
    key: `set-stake-allocation-${selectedTokenId}`,
    label: "Set validator allocation",
    contractName: "StakingController",
    functionName: "stake",
    args: [
      BigInt(selectedTokenId || "0"),
      stakeRows.map((validator) => validator.vault!) as Address[],
      stakeRows.map((validator) => parseMon(allocations[validator.vault!.toLowerCase()] ?? "")),
    ],
    displayLabelBtn: true,
  })], [selectedTokenId, stakeRows, allocations]);
  const pokeSteps = useMemo(() => [makeContractWriteStep({
    key: `continue-stake-settlement-${selectedTokenId}`,
    label: "Continue stake settlement",
    contractName: "StakingController",
    functionName: "poke",
    args: [BigInt(selectedTokenId || "0")],
    displayLabelBtn: true,
  })], [selectedTokenId]);

  async function refresh() {
    await Promise.all([
      directoryQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["stake-position-state", address?.toLowerCase(), selectedTokenId] }),
      queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] }),
    ]);
  }

  function setAmount(vault: Address, value: string) {
    setError(null);
    setNotice(null);
    setAllocations((current) => ({ ...current, [vault.toLowerCase()]: value }));
  }

  return (
    <div className="qv:space-y-6">
      <header>
        <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#a99aff]"><ShieldCheck size={13} /> Validator backing</p>
        <h1 className="qv:mt-2 qv:text-[26px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white qv:sm:text-[32px]">Stake MON with validators</h1>
        <p className="qv:mt-2 qv:max-w-[660px] qv:text-[12px] qv:leading-5 qv:text-[#aeb0c0]">Choose where your veMON position backs validators. Your allocation also determines its validator voting weight.</p>
      </header>

      {!address ? <div className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}><Wallet size={17} className="qv:text-[#a99aff]" />Connect a wallet to choose a veMON position and validator allocation.</div>
        : chain?.id !== protocolChain.id ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>Switch to {protocolChain.name} to stake.</div>
          : directoryQuery.isPending ? <div className={`${panel} qv:p-8 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Loading positions and validator vaults…</div>
            : directoryQuery.isError ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</div>
              : initialTokenId && !selectedPosition ? <div className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><LoaderCircle size={19} className="qv:animate-spin qv:text-[#a99aff]" /><p className="qv:mt-3 qv:text-[13px] qv:font-semibold qv:text-white">Your new lock is syncing</p><p className="qv:mt-1 qv:max-w-[300px] qv:text-[10px] qv:leading-4 qv:text-[#999bad]">The lock transaction is confirmed. Waiting for Monad RPC to return position #{initialTokenId}.</p></div>
                : positions.length === 0 ? <div className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><Wallet size={20} className="qv:text-[#a99aff]" /><p className="qv:mt-3 qv:text-[13px] qv:font-semibold qv:text-white">Create a veMON position first</p><p className="qv:mt-1 qv:text-[10px] qv:text-[#999bad]">Your locked MON positions will appear here.</p><Link className="qv:mt-4 qv:inline-flex qv:items-center qv:gap-2 qv:text-[11px] qv:font-semibold qv:text-[#bdb2ff] qv:no-underline" href="/lock">Go to lock MON <ArrowRight size={13} /></Link></div>
                : <div className="qv:grid qv:items-start qv:gap-5 qv:xl:grid-cols-[minmax(0,0.74fr)_minmax(0,1.26fr)]">
                  <section className={`${panel} qv:p-4 qv:sm:p-5`}>
                    <label className="qv:block qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">veMON position</span><select className={field} value={selectedTokenId} onChange={(event) => { setSelectedTokenId(event.target.value); setError(null); setNotice(null); }}>
                      {positions.map((position) => <option key={position.tokenId} value={position.tokenId}>#{position.tokenId} · {formatMon(BigInt(position.amount))} MON{position.permanent ? " · permanent" : ""}</option>)}
                    </select></label>
                    <div className="qv:mt-4 qv:grid qv:grid-cols-2 qv:gap-2">
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Liquid MON</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{stakeState ? formatMon(stakeState.liquid) : "—"}</p></div>
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Position principal</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{stakeState ? formatMon(stakeState.principal) : "—"}</p></div>
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Voting power</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{stakeState ? formatMon(stakeState.votingPower) : "—"}</p></div>
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Protocol cycle</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{stakeState ? stakeState.currentCycle.toString() : "—"}</p></div>
                    </div>
                    {stakeState && <p className="qv:mt-3 qv:text-[9px] qv:leading-4 qv:text-[#898b9c]">Epoch {stakeState.currentEpoch.toString()} · last stake write in cycle {stakeState.lastCycle.toString()}. Reallocations are once per Quevra cycle.</p>}
                    {cycleBlocked && <p className="qv:mt-2 qv:flex qv:items-center qv:gap-1.5 qv:text-[10px] qv:text-[#e7c27f]"><CircleAlert size={13} /> This position already wrote allocations in cycle {stakeState?.lastCycle.toString()}. Wait for cycle {(stakeState?.lastCycle ?? BigInt(0)) + BigInt(1)} to change targets.</p>}
                    <div className="qv:mt-5 qv:flex qv:items-end qv:justify-between qv:gap-3"><div><p className="qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.11em] qv:text-[#b9bac8]">Allocation total</p><p className={`qv:mt-1 qv:text-[20px] qv:font-semibold ${withinBalance ? "qv:text-white" : "qv:text-[#ff9caa]"}`}>{formatMon(totalTarget)} <span className="qv:text-[10px] qv:font-normal qv:text-[#999bad]">/ {formatMon(maxAllocation)} MON</span></p></div></div>
                    {!withinBalance && <p className="qv:mt-2 qv:flex qv:items-center qv:gap-1.5 qv:text-[10px] qv:text-[#ff9caa]"><CircleAlert size={13} /> Allocations exceed this position’s available principal.</p>}
                    {error && <p className="qv:mt-3 qv:text-[10px] qv:text-[#ff9caa]">{error}</p>}
                    {notice && <p className="qv:mt-3 qv:flex qv:items-center qv:gap-1.5 qv:text-[10px] qv:text-[#a9e9c1]"><Check size={13} />{notice}</p>}
                    {stateQuery.isError && <p className="qv:mt-3 qv:text-[10px] qv:text-[#ff9caa]">Could not read this position’s current stake state.</p>}
                    <TransactionButton
                      className="qv:mt-4 qv:inline-flex qv:h-11 qv:w-full qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[11px] qv:font-semibold qv:text-white qv:shadow-[0_8px_20px_rgba(112,88,233,0.2)] qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-[0.46]"
                      disabled={!canSubmit || stateQuery.isPending}
                      onComplete={() => { setError(null); setNotice("Allocation submitted. Quevra will continue settlement as Monad permits."); void refresh(); }}
                      onError={(message) => setError(message)}
                      steps={steps}
                    >Set allocation <ArrowRight size={14} /></TransactionButton>
                    {settlementPending && <div className="qv:mt-3 qv:rounded-lg qv:border qv:border-white/[0.07] qv:bg-[#10121a] qv:p-3"><p className="qv:text-[10px] qv:font-semibold qv:text-[#d4d0e6]">Settlement is still in progress</p><p className="qv:mt-1 qv:text-[9px] qv:leading-4 qv:text-[#999bad]">Monad epoch delays can leave some stake pending. Continue settlement after the next protocol update.</p><TransactionButton className="qv:mt-2 qv:inline-flex qv:h-9 qv:w-full qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-medium qv:text-[#d7d3eb] qv:hover:bg-white/[0.07] qv:disabled:opacity-50" onComplete={() => { setNotice("Settlement check submitted."); void refresh(); }} onError={(message) => setError(message)} steps={pokeSteps}>Continue settlement <ArrowRight size={13} /></TransactionButton></div>}
                    {selectedPosition && <Link className="qv:mt-3 qv:block qv:text-center qv:text-[10px] qv:text-[#a99aff] qv:no-underline qv:hover:text-white" href="/lock">Manage veMON locks</Link>}
                  </section>

                  <section className="qv:space-y-3">
                    <div className="qv:flex qv:flex-col qv:gap-3 qv:sm:flex-row qv:sm:items-end qv:sm:justify-between"><div><p className="qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">Validator directory</p><h2 className="qv:mt-1 qv:text-[18px] qv:font-semibold qv:text-[#f0eff8]">Choose where to stake</h2></div><label className="qv:relative qv:block qv:w-full qv:sm:w-[220px]"><Search size={13} className="qv:absolute qv:left-3 qv:top-1/2 qv:-translate-y-1/2 qv:text-[#898b9c]" /><input className={`${field} qv:pl-8`} onChange={(event) => setSearch(event.target.value)} placeholder="Search validators" value={search} /></label></div>
                    {stateQuery.isPending ? <div className={`${panel} qv:flex qv:items-center qv:justify-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}><LoaderCircle size={15} className="qv:animate-spin" />Reading stake allocations…</div>
                      : validators.length === 0 ? <div className={`${panel} qv:p-7 qv:text-center qv:text-[11px] qv:leading-5 qv:text-[#999bad]`}>No validator vaults are indexed yet. Check back when Quevra validators have completed onboarding.</div>
                        : filteredValidators.length === 0 ? <div className={`${panel} qv:p-7 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>No validators match this search.</div>
                          : <div className="qv:space-y-2">{filteredValidators.map((validator) => {
                            const vaultKey = validator.vault!.toLowerCase();
                            const state = stakeState?.validators[vaultKey];
                            const value = allocations[vaultKey] ?? "";
                            return <article className={`${panel} qv:flex qv:flex-col qv:gap-3 qv:p-3.5 qv:sm:flex-row qv:sm:items-center qv:sm:justify-between qv:sm:p-4`} key={validator.id}>
                              <div className="qv:min-w-0"><div className="qv:flex qv:flex-wrap qv:items-center qv:gap-2"><p className="qv:m-0 qv:text-[12px] qv:font-semibold qv:text-[#e9e9f1]">{validator.validatorId ? `Validator #${validator.validatorId}` : `Validator identity #${validator.tokenId}`}</p><span className={`qv:rounded-full qv:px-2 qv:py-0.5 qv:text-[8px] qv:font-semibold ${state?.active ? "qv:bg-[rgba(85,194,127,0.1)] qv:text-[#9adcb0]" : "qv:bg-[rgba(236,183,91,0.1)] qv:text-[#e7c27f]"}`}>{state?.active ? "Active" : "Pre-registration"}</span></div><p className="qv:mt-1 qv:truncate qv:text-[9px] qv:text-[#898b9c]">Operator {shorten(validator.operator ?? validator.owner)} · Vault {shorten(validator.vault)}</p><p className="qv:mt-1 qv:text-[9px] qv:text-[#999bad]">Target {formatMon(state?.intent ?? BigInt(0))} · Current {formatMon(state?.allocation ?? BigInt(0))} · Pending {formatMon(state?.pending ?? BigInt(0))} MON</p>{!state?.active && <p className="qv:mt-1 qv:text-[9px] qv:leading-4 qv:text-[#e7c27f]">Pre-registration vault: stake here builds the 100k MON auth backing before native registration.</p>}</div>
                              <label className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#999bad]"><input className={input} inputMode="decimal" onChange={(event) => setAmount(validator.vault!, event.target.value)} placeholder="0.0" value={value} /><span>MON</span></label>
                            </article>;
                          })}</div>}
                    {stakeState && <section className={`${panel} qv:p-4`}>
                      <p className="qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">Stake-linked vote weight</p>
                      <p className="qv:mt-1 qv:text-[9px] qv:leading-4 qv:text-[#999bad]">Your allocation is your vote. Estimated gauge weight ≈ voting power × allocated MON / principal. Unallocated principal does not vote.</p>
                      <div className="qv:mt-3 qv:grid qv:grid-cols-2 qv:gap-2">
                        <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Allocated</p><p className="qv:mt-1 qv:text-[13px] qv:font-semibold qv:text-white">{formatMon(allocatedPrincipal)} MON</p></div>
                        <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Unallocated (0 vote)</p><p className="qv:mt-1 qv:text-[13px] qv:font-semibold qv:text-white">{formatMon(unallocatedPrincipal)} MON</p></div>
                      </div>
                      {voteRows.length === 0 ? <p className="qv:mt-3 qv:text-[9px] qv:text-[#9295a7]">No validator allocations yet.</p>
                        : <div className="qv:mt-3 qv:space-y-2">{voteRows.map(({ validator, allocated, weight }) => (
                          <div className="qv:flex qv:items-center qv:justify-between qv:gap-3 qv:rounded-lg qv:bg-[#0e1018] qv:px-3 qv:py-2" key={validator.id}>
                            <p className="qv:text-[10px] qv:font-semibold qv:text-[#e9e9f1]">{validator.validatorId ? `Validator #${validator.validatorId}` : `Identity #${validator.tokenId}`}</p>
                            <p className="qv:text-right qv:text-[9px] qv:text-[#999bad]">{formatMon(allocated)} MON · est. weight {formatMon(weight)}</p>
                          </div>
                        ))}</div>}
                    </section>}
                    <div className="qv:flex qv:items-start qv:gap-2 qv:rounded-lg qv:border qv:border-white/[0.07] qv:bg-[#10121a] qv:p-3 qv:text-[9px] qv:leading-4 qv:text-[#999bad]"><ShieldCheck size={13} className="qv:mt-0.5 qv:shrink-0 qv:text-[#a99aff]" />Stake allocations are your validator vote. Changes set a target allocation first; undelegations and redelegations may take multiple Monad epochs to settle. Anyone can help advance settlement.</div>
                  </section>
                </div>}
    </div>
  );
}
