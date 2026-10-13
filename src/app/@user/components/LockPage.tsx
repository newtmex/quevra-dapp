"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Clock3, KeyRound, LockKeyhole, Plus, UnlockKeyhole } from "lucide-react";
import { decodeEventLog, formatEther, parseEther, type Address, type PublicClient } from "viem";
import { getContractConfig, getDeploymentMetadata } from "@/contracts/shared";
import { monadTestnet } from "@/lib/web3";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeContractWriteStep } from "@/lib/tx-flow/steps";

type VeMonPosition = {
  id: string;
  tokenId: string;
  owner: Address | null;
  kind: string;
  amount: string;
  unlockEpoch: string | null;
  permanent: boolean;
  votingPower?: string;
};

type IndexerPayload = { positions: VeMonPosition[] };

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const field = "qv:h-11 qv:w-full qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[12px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";

async function fetchPositions(wallet: Address, publicClient: PublicClient, escrowAddress: Address, escrowAbi: readonly unknown[]) {
  const response = await fetch(`/api/indexer?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
  const payload = await response.json() as IndexerPayload | { error?: string };
  if (!response.ok || !("positions" in payload)) throw new Error("Could not load your veMON positions.");
  const positions = payload.positions.filter((position) => position.kind === "VE_MON");
  if (positions.length === 0) return positions;

  // veMON principal and voting power are read from the deployed escrow so the cards
  // reflect the current contract state while the indexer supplies the owned token IDs.
  const calls = positions.flatMap((position) => [
    { address: escrowAddress, abi: escrowAbi, functionName: "locked", args: [BigInt(position.tokenId)] },
    { address: escrowAddress, abi: escrowAbi, functionName: "votingPowerOf", args: [BigInt(position.tokenId)] },
  ]);
  const results = await publicClient.multicall({ contracts: calls as never, allowFailure: true }) as unknown as Array<
    { status: "success"; result: unknown } | { status: "failure"; error: Error }
  >;
  return positions.map((position, index) => {
    const lockResult = results[index * 2];
    const powerResult = results[index * 2 + 1];
    if (lockResult.status !== "success") return position;
    const [amount, end, permanent] = lockResult.result as readonly [bigint, bigint, boolean, bigint];
    return {
      ...position,
      amount: amount.toString(),
      unlockEpoch: permanent ? null : end.toString(),
      permanent,
      votingPower: powerResult.status === "success" ? (powerResult.result as bigint).toString() : undefined,
    };
  });
}

function amountLabel(value: string) {
  return Number(formatEther(BigInt(value))).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function LockPage() {
  const router = useRouter();
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [cycles, setCycles] = useState("4");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const escrow = getContractConfig(monadTestnet.id, "VeMON");
  const metadata = getDeploymentMetadata(monadTestnet.id);
  const maxCycles = Number(metadata?.config.maxLockCycles ?? 4);
  const queryKey = ["ve-mon-positions", address?.toLowerCase(), chain?.id];
  const positionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchPositions(address as Address, publicClient!, escrow!.address, escrow!.abi),
    enabled: Boolean(address && publicClient && chain?.id === monadTestnet.id && escrow?.address),
    refetchInterval: 12_000,
  });
  const positions = positionsQuery.data ?? [];
  const totalLocked = useMemo(() => positions.reduce((sum, position) => sum + BigInt(position.amount), BigInt(0)), [positions]);
  const parsedAmount = (() => {
    try { return amount.trim() ? parseEther(amount) : BigInt(0); } catch { return BigInt(0); }
  })();
  const amountValid = parsedAmount > BigInt(0) && /^\d+(\.\d{0,18})?$/.test(amount.trim());
  const canCreate = Boolean(address && chain?.id === monadTestnet.id && escrow?.address && amountValid && Number(cycles) >= 1 && Number(cycles) <= maxCycles);
  const createSteps = useMemo(() => [makeContractWriteStep({
    key: "create-ve-mon-lock",
    label: "Create veMON lock",
    contractName: "VeMON",
    functionName: "createLock",
    args: [parsedAmount, BigInt(cycles)],
    value: parsedAmount,
    displayLabelBtn: true,
  })], [parsedAmount, cycles]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["quevra-indexer", address?.toLowerCase()] }),
    ]);
  }

  function actionSteps(tokenId: string, functionName: "lockPermanent" | "unlockPermanent" | "withdraw", label: string) {
    return [makeContractWriteStep({
      key: `${functionName}-${tokenId}`,
      label,
      contractName: "VeMON",
      functionName,
      args: [BigInt(tokenId)],
      displayLabelBtn: true,
    })];
  }

  return (
    <div className="qv:space-y-6">
      <header className="qv:flex qv:flex-col qv:gap-4 qv:sm:flex-row qv:sm:items-end qv:sm:justify-between">
        <div>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#a99aff]"><KeyRound size={13} /> Voting escrow</p>
          <h1 className="qv:mt-2 qv:text-[26px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white qv:sm:text-[32px]">Lock MON for veMON</h1>
          <p className="qv:mt-2 qv:max-w-[620px] qv:text-[12px] qv:leading-5 qv:text-[#aeb0c0]">Create a veMON position by locking MON. Longer locks carry voting power for longer; each position is managed as its own NFT.</p>
        </div>
        <div className="qv:flex qv:gap-3">
          <div className={`${panel} qv:min-w-[128px] qv:px-4 qv:py-3`}>
            <p className="qv:text-[9px] qv:font-bold qv:uppercase qv:tracking-[0.1em] qv:text-[#999bad]">Total locked</p>
            <p className="qv:mt-1 qv:text-[17px] qv:font-semibold qv:text-white">{positionsQuery.isPending ? "—" : amountLabel(totalLocked.toString())} <span className="qv:text-[10px] qv:text-[#aaaabd]">MON</span></p>
          </div>
          <div className={`${panel} qv:min-w-[112px] qv:px-4 qv:py-3`}>
            <p className="qv:text-[9px] qv:font-bold qv:uppercase qv:tracking-[0.1em] qv:text-[#999bad]">Positions</p>
            <p className="qv:mt-1 qv:text-[17px] qv:font-semibold qv:text-white">{positionsQuery.isPending ? "—" : positions.length}</p>
          </div>
        </div>
      </header>

      <section className="qv:grid qv:gap-5 qv:xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className={`${panel} qv:p-5 qv:sm:p-6`}>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><Plus size={14} className="qv:text-[#a99aff]" /> New lock</p>
          <h2 className="qv:mt-2 qv:text-[18px] qv:font-semibold qv:text-[#f0eff8]">Create a veMON position</h2>
          <p className="qv:mt-1 qv:text-[11px] qv:leading-5 qv:text-[#9b9eaf]">MON is deposited into the staking controller and represented by a veMON NFT.</p>

          <div className="qv:mt-5 qv:space-y-4">
            <label className="qv:block qv:space-y-2">
              <span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Amount <span className="qv:text-[#87899a]">(MON)</span></span>
              <input className={field} inputMode="decimal" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="0.0" value={amount} />
            </label>
            <label className="qv:block qv:space-y-2">
              <span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Lock duration</span>
              <select className={field} onChange={(event) => setCycles(event.target.value)} value={cycles}>
                {Array.from({ length: maxCycles }, (_, index) => index + 1).map((cycle) => <option key={cycle} value={cycle}>{cycle} {cycle === 1 ? "cycle" : "cycles"}{cycle === maxCycles ? " · maximum" : ""}</option>)}
              </select>
              <span className="qv:block qv:text-[9px] qv:text-[#898b9c]">A cycle is 5 Monad staking epochs. The maximum lock is {maxCycles} cycles.</span>
            </label>
            <div className="qv:flex qv:items-start qv:gap-2 qv:rounded-lg qv:border qv:border-[rgba(141,120,255,0.16)] qv:bg-[rgba(141,120,255,0.055)] qv:p-3 qv:text-[10px] qv:leading-4 qv:text-[#b5b1d0]"><Clock3 size={14} className="qv:mt-0.5 qv:shrink-0 qv:text-[#a99aff]" />Lock duration is measured in protocol cycles, not calendar time. MON can be withdrawn after the position reaches its unlock epoch.</div>
            {formError && <p className="qv:text-[10px] qv:text-[#ff9caa]">{formError}</p>}
            {chain && chain.id !== monadTestnet.id && <p className="qv:text-[10px] qv:text-[#ffcf7a]">Switch to Monad Testnet to create a lock.</p>}
            <TransactionButton
              disabled={!canCreate}
              onComplete={(results) => {
                setAmount("");
                setFormError(null);
                void refresh();
                let tokenId: string | undefined;
                for (const result of results) {
                  for (const log of result.receipt?.logs ?? []) {
                    if (!escrow?.address || log.address.toLowerCase() !== escrow.address.toLowerCase()) continue;
                    try {
                      const event = decodeEventLog({ abi: escrow.abi, data: log.data, topics: log.topics }) as { eventName: string; args: { tokenId?: bigint } };
                      if (event.eventName === "LockCreated" && event.args.tokenId !== undefined) tokenId = event.args.tokenId.toString();
                    } catch { /* This receipt log belongs to a different VeMON event. */ }
                  }
                }
                router.push(tokenId ? `/stake?tokenId=${tokenId}` : "/stake");
              }}
              onError={(message) => setFormError(message)}
              steps={createSteps}
              className="qv:inline-flex qv:h-11 qv:w-full qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[11px] qv:font-semibold qv:text-white qv:shadow-[0_8px_20px_rgba(112,88,233,0.2)] qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-[0.46]"
            >Lock MON <ArrowUpRight size={14} /></TransactionButton>
            {!address && <p className="qv:text-center qv:text-[10px] qv:text-[#999bad]">Connect your wallet to create a lock.</p>}
          </div>
        </div>

        <div className="qv:space-y-3">
          <div className="qv:flex qv:items-end qv:justify-between">
            <div><p className="qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">Your positions</p><h2 className="qv:mt-1 qv:text-[18px] qv:font-semibold qv:text-[#f0eff8]">Manage veMON</h2></div>
            {address && <button className="qv:text-[10px] qv:text-[#a99aff] qv:hover:text-white" onClick={() => void positionsQuery.refetch()} type="button">Refresh</button>}
          </div>
          {!address ? <div className={`${panel} qv:px-5 qv:py-10 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Connect your wallet to see your veMON positions.</div>
            : chain?.id !== monadTestnet.id ? <div className={`${panel} qv:px-5 qv:py-10 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Switch to Monad Testnet to view your positions.</div>
              : positionsQuery.isPending ? <div className={`${panel} qv:px-5 qv:py-10 qv:text-center qv:text-[11px] qv:text-[#999bad]`}>Loading your veMON positions…</div>
                : positionsQuery.isError ? <div className={`${panel} qv:px-5 qv:py-8 qv:text-center qv:text-[11px] qv:text-[#ff9caa]`}>{positionsQuery.error.message}</div>
                  : positions.length === 0 ? <div className={`${panel} qv:flex qv:min-h-[240px] qv:flex-col qv:items-center qv:justify-center qv:px-6 qv:text-center`}><span className="qv:grid qv:size-11 qv:place-items-center qv:rounded-xl qv:bg-[rgba(141,120,255,0.09)] qv:text-[#a99aff]"><LockKeyhole size={19} /></span><p className="qv:mt-4 qv:text-[13px] qv:font-semibold qv:text-[#e9e9f1]">No locks yet</p><p className="qv:mt-1 qv:max-w-[260px] qv:text-[10px] qv:leading-4 qv:text-[#999bad]">Create a lock to receive veMON voting power and start managing your positions here.</p></div>
                    : <div className="qv:space-y-3">{positions.map((position) => (
                      <article className={`${panel} qv:p-4 qv:sm:p-5`} key={position.tokenId}>
                        <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
                          <div><p className="qv:text-[9px] qv:font-bold qv:uppercase qv:tracking-[0.1em] qv:text-[#999bad]">Position #{position.tokenId}</p><p className="qv:mt-1.5 qv:text-[20px] qv:font-semibold qv:tracking-[-0.03em] qv:text-white">{amountLabel(position.amount)} <span className="qv:text-[10px] qv:text-[#aeb0c0]">MON</span></p></div>
                          <span className="qv:rounded-full qv:border qv:border-[rgba(141,120,255,0.2)] qv:bg-[rgba(141,120,255,0.08)] qv:px-2.5 qv:py-1 qv:text-[9px] qv:font-semibold qv:text-[#c5bbff]">{position.permanent ? "Permanent" : "Finite lock"}</span>
                        </div>
                        <div className="qv:mt-4 qv:grid qv:grid-cols-2 qv:gap-2">
                          <div className="qv:rounded-lg qv:bg-[#0e1018] qv:px-3 qv:py-2.5"><p className="qv:text-[9px] qv:text-[#898b9c]">Voting power</p><p className="qv:mt-1 qv:text-[12px] qv:font-medium qv:text-[#d9d5f5]">{position.votingPower ? amountLabel(position.votingPower) : "—"}</p></div>
                          <div className="qv:rounded-lg qv:bg-[#0e1018] qv:px-3 qv:py-2.5"><p className="qv:text-[9px] qv:text-[#898b9c]">Unlock epoch</p><p className="qv:mt-1 qv:text-[12px] qv:font-medium qv:text-[#d9d5f5]">{position.permanent ? "Never" : position.unlockEpoch ?? "—"}</p></div>
                        </div>
                        {actionError && <p className="qv:mt-3 qv:text-[10px] qv:text-[#ff9caa]">{actionError}</p>}
                        <div className="qv:mt-4 qv:flex qv:flex-wrap qv:gap-2">
                          <Link className="qv:inline-flex qv:h-9 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-white qv:no-underline qv:hover:brightness-110" href={`/stake?tokenId=${position.tokenId}`}>Stake this position <ArrowRight size={13} /></Link>
                          {position.permanent
                            ? <TransactionButton onComplete={() => { setActionError(null); void refresh(); }} onError={(message) => setActionError(message)} steps={actionSteps(position.tokenId, "unlockPermanent", "Convert to finite lock")} className="qv:inline-flex qv:h-9 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-medium qv:text-[#d7d3eb] qv:hover:bg-white/[0.07] qv:disabled:opacity-50"><UnlockKeyhole size={13} /> Convert to finite</TransactionButton>
                            : <TransactionButton onComplete={() => { setActionError(null); void refresh(); }} onError={(message) => setActionError(message)} steps={actionSteps(position.tokenId, "lockPermanent", "Make lock permanent")} className="qv:inline-flex qv:h-9 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-medium qv:text-[#d7d3eb] qv:hover:bg-white/[0.07] qv:disabled:opacity-50"><LockKeyhole size={13} /> Make permanent</TransactionButton>}
                          {!position.permanent && <TransactionButton onComplete={() => { setActionError(null); void refresh(); }} onError={(message) => setActionError(message)} steps={actionSteps(position.tokenId, "withdraw", "Withdraw MON")} className="qv:inline-flex qv:h-9 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-medium qv:text-[#d7d3eb] qv:hover:bg-white/[0.07] qv:disabled:opacity-50"><ArrowDownToLine size={13} /> Withdraw</TransactionButton>}
                        </div>
                        {!position.permanent && <p className="qv:mt-2 qv:text-[9px] qv:text-[#898b9c]">Withdraw becomes available once the lock reaches epoch {position.unlockEpoch ?? "shown above"} and staking funds are unstaked.</p>}
                      </article>
                    ))}</div>}
        </div>
      </section>
      <p className="qv:text-[9px] qv:leading-4 qv:text-[#77798b]">Lock creation and management run on Monad Testnet. Withdrawal is subject to the lock expiry and the staking controller’s unstaking state.</p>
    </div>
  );
}
