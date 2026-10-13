"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowRight, BadgeCheck, CircleAlert, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, formatEther, parseAbi, type Address, type PublicClient } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { protocolChain } from "@/lib/web3";
import { fetchHolderDirectory, type HolderValidator } from "@/lib/rpc-data";

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const button = "qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:no-underline qv:transition qv:hover:bg-white/[0.07] qv:disabled:opacity-50";
const nativeStakingAbi = parseAbi([
  "function getValidator(uint64 validatorId) returns (address authAddress, uint64 flags, uint256 stake, uint256 accRewardPerToken, uint256 commission, uint256 unclaimedRewards, uint256 consensusStake, uint256 consensusCommission, uint256 snapshotStake, uint256 snapshotCommission, bytes secpPubkey, bytes blsPubkey)",
]);

type ValidatorStatus = {
  validator: HolderValidator;
  id: bigint;
  minimum: bigint;
  totalBalance: bigint;
  deficit: bigint;
  backing: bigint;
  requiresMinimumStake: boolean;
  registered: boolean;
  nativeRecord: { consensusStake: bigint; snapshotStake: bigint } | null;
  nativeReadFailed: boolean;
};

type MulticallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

function shortAddress(value: Address) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatMon(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function progressPercent(balance: bigint, minimum: bigint) {
  if (minimum === BigInt(0)) return 100;
  const percent = balance * BigInt(100) / minimum;
  return Number(percent > BigInt(100) ? BigInt(100) : percent);
}

async function readValidatorStatuses(publicClient: PublicClient, validators: HolderValidator[]): Promise<ValidatorStatus[]> {
  const controller = getContractConfig(protocolChain.id, "StakingController");
  const vaultConfig = getContractConfig(protocolChain.id, "StakingVault");
  if (!controller || !vaultConfig) throw new Error("Validator contracts are not configured on Monad Testnet.");
  if (validators.length === 0) return [];

  const calls = validators.flatMap((validator) => [
    { address: controller.address, abi: controller.abi, functionName: "isValidatorActive", args: [validator.vault] },
    { address: controller.address, abi: controller.abi, functionName: "validatorBackingOf", args: [BigInt(validator.tokenId)] },
    { address: validator.vault, abi: vaultConfig.abi, functionName: "validatorId" },
    { address: validator.vault, abi: vaultConfig.abi, functionName: "totalBalance" },
    { address: validator.vault, abi: vaultConfig.abi, functionName: "deficit" },
    { address: validator.vault, abi: vaultConfig.abi, functionName: "MIN_AUTH_ADDRESS_STAKE" },
    { address: validator.vault, abi: vaultConfig.abi, functionName: "requiresMinimumStake" },
  ]);
  const results = await publicClient.multicall({ contracts: calls as never, allowFailure: true }) as unknown as MulticallResult[];
  const read = (index: number) => {
    const result = results[index];
    if (result?.status !== "success") throw new Error(result?.error.message ?? "Could not read validator status from Monad.");
    return result.result;
  };
  const statuses = await Promise.all(validators.map(async (validator, index): Promise<ValidatorStatus> => {
    const start = index * 7;
    const registered = read(start) === true;
    const backing = read(start + 1) as bigint;
    const id = read(start + 2) as bigint;
    const totalBalance = read(start + 3) as bigint;
    const deficit = read(start + 4) as bigint;
    const minimum = read(start + 5) as bigint;
    const requiresMinimumStake = read(start + 6) === true;
    let nativeRecord: ValidatorStatus["nativeRecord"] = null;
    let nativeReadFailed = false;
    if (id > BigInt(0)) {
      try {
        const result = await publicClient.call({
          to: "0x0000000000000000000000000000000000001000",
          data: encodeFunctionData({ abi: nativeStakingAbi, functionName: "getValidator", args: [id] }),
        });
        if (!result.data) throw new Error("No validator record returned.");
        const decoded = decodeFunctionResult({ abi: nativeStakingAbi, functionName: "getValidator", data: result.data });
        nativeRecord = { consensusStake: decoded[6], snapshotStake: decoded[8] };
      } catch {
        nativeReadFailed = true;
      }
    }
    return { validator, id, minimum, totalBalance, deficit, backing, requiresMinimumStake, registered, nativeRecord, nativeReadFailed };
  }));
  return statuses;
}

function ValidatorCard({ status }: { status: ValidatorStatus }) {
  const isBuilding = status.requiresMinimumStake && status.id === BigInt(0);
  const percent = progressPercent(status.totalBalance, status.minimum);
  const explorer = `https://testnet.monadexplorer.com/address/${status.validator.vault}`;
  return (
    <article className={`${panel} qv:p-5 qv:sm:p-6`}>
      <div className="qv:flex qv:flex-wrap qv:items-start qv:justify-between qv:gap-3">
        <div>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><ShieldCheck size={14} className="qv:text-[#a99aff]" /> Validator identity #{status.validator.tokenId}</p>
          <h2 className="qv:mb-0 qv:mt-2 qv:text-[18px] qv:font-semibold qv:tracking-[-0.02em] qv:text-white">{status.id > BigInt(0) ? `Monad validator #${status.id}` : "Registration backing"}</h2>
        </div>
        <span className={`qv:inline-flex qv:items-center qv:gap-1.5 qv:rounded-full qv:border qv:px-2.5 qv:py-1 qv:text-[9px] qv:font-semibold ${isBuilding ? "qv:border-[rgba(255,199,105,0.2)] qv:bg-[rgba(255,199,105,0.06)] qv:text-[#ffd48a]" : status.registered ? "qv:border-[rgba(82,221,195,0.2)] qv:bg-[rgba(82,221,195,0.06)] qv:text-[#8de5d4]" : "qv:border-white/10 qv:text-[#aeb0c0]"}`}>
          {isBuilding ? <CircleAlert size={11} /> : <BadgeCheck size={11} />}
          {isBuilding ? "Building backing" : status.registered ? "Registered on Monad" : "Registration status unavailable"}
        </span>
      </div>

      {isBuilding ? <section className="qv:mt-5 qv:rounded-xl qv:bg-[#0e1018] qv:p-4" aria-label="Validator registration backing progress">
        <div className="qv:flex qv:items-end qv:justify-between qv:gap-3">
          <div><p className="qv:text-[9px] qv:font-semibold qv:uppercase qv:tracking-[0.08em] qv:text-[#999bad]">Vault backing</p><p className="qv:mt-1 qv:text-[19px] qv:font-semibold qv:text-white">{formatMon(status.totalBalance)} <span className="qv:text-[10px] qv:font-medium qv:text-[#999bad]">/ {formatMon(status.minimum)} MON</span></p></div>
          <p className="qv:text-right qv:text-[10px] qv:font-semibold qv:text-[#d3caff]">{percent}%</p>
        </div>
        <div className="qv:mt-3 qv:h-2 qv:overflow-hidden qv:rounded-full qv:bg-white/[0.08]"><div className="qv:h-full qv:rounded-full qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#52ddc3] qv:transition-all" style={{ width: `${percent}%` }} /></div>
        <p className="qv:mt-2 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">{status.deficit > BigInt(0) ? `${formatMon(status.deficit)} MON more is needed before the vault can submit the native registration.` : "The threshold is met. The deposit that completes registration backing also submits the native registration call."}</p>
      </section> : <section className="qv:mt-5 qv:grid qv:grid-cols-2 qv:gap-2" aria-label="Native validator staking state">
        <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#9295a7]">Monad consensus stake</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{status.nativeRecord ? `${formatMon(status.nativeRecord.consensusStake)} MON` : status.nativeReadFailed ? "Unavailable" : "—"}</p></div>
        <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#9295a7]">Snapshot stake</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{status.nativeRecord ? `${formatMon(status.nativeRecord.snapshotStake)} MON` : status.nativeReadFailed ? "Unavailable" : "—"}</p></div>
        <p className="qv:col-span-2 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">A native validator record is present. Active-set admission is separate and depends on Monad’s network-wide stake and ranking.</p>
      </section>}

      <dl className="qv:mt-5 qv:grid qv:gap-3 qv:border-t qv:border-white/[0.07] qv:pt-4 qv:sm:grid-cols-2">
        <div><dt className="qv:text-[9px] qv:text-[#898b9c]">Validator vault</dt><dd className="qv:mt-1 qv:break-all qv:font-mono qv:text-[10px] qv:text-[#d6d4e4]">{shortAddress(status.validator.vault)}</dd></div>
        <div><dt className="qv:text-[9px] qv:text-[#898b9c]">Operator</dt><dd className="qv:mt-1 qv:break-all qv:font-mono qv:text-[10px] qv:text-[#d6d4e4]">{shortAddress(status.validator.operator)}</dd></div>
        <div><dt className="qv:text-[9px] qv:text-[#898b9c]">Quevra backing</dt><dd className="qv:mt-1 qv:text-[11px] qv:font-semibold qv:text-white">{formatMon(status.backing)} MON</dd></div>
        <div><dt className="qv:text-[9px] qv:text-[#898b9c]">Gauge / incentives</dt><dd className="qv:mt-1 qv:text-[10px] qv:text-[#d6d4e4]">{shortAddress(status.validator.gauge)} · {shortAddress(status.validator.bribe)}</dd></div>
      </dl>

      <div className="qv:mt-5 qv:flex qv:flex-wrap gap-2">
        <Link className={button} href="/stake">Manage staking allocations <ArrowRight size={12} /></Link>
        <a className={button} href={explorer} rel="noreferrer" target="_blank">Open vault <ExternalLink size={12} /></a>
      </div>
    </article>
  );
}

export default function MyValidatorsPage() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(publicClient!, address as Address),
    enabled: Boolean(address && publicClient && chain?.id === protocolChain.id),
    refetchInterval: 20_000,
  });
  const validators = (directoryQuery.data?.validators ?? []).filter((validator) => validator.owner.toLowerCase() === address?.toLowerCase());
  const statusQuery = useQuery({
    queryKey: ["my-validator-status", address?.toLowerCase(), validators.map((validator) => validator.tokenId).join(",")],
    queryFn: () => readValidatorStatuses(publicClient!, validators),
    enabled: Boolean(publicClient && address && chain?.id === protocolChain.id && validators.length),
    refetchInterval: 20_000,
  });

  return (
    <main className="qv:mx-auto qv:w-full qv:min-w-0 qv:max-w-[1260px] qv:space-y-5">
      <header className="qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
        <div>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:tracking-[0.13em] qv:text-[#9e91eb]"><span className="qv:size-1.5 qv:rounded-full qv:bg-[#52ddc3]" /> QUEVRA · OPERATOR</p>
          <h1 className="qv:mb-1 qv:mt-3 qv:text-[26px] qv:font-semibold qv:tracking-[-0.045em] qv:text-[#f2f2f8] qv:sm:text-[34px]">My validators</h1>
          <p className="qv:m-0 qv:max-w-[620px] qv:text-[11px] qv:leading-relaxed qv:text-[#aeb0c0] qv:sm:text-[13px]">Track registration backing and native Monad status for validator identities you operate.</p>
        </div>
        <button className={button} disabled={directoryQuery.isFetching || statusQuery.isFetching} onClick={() => { void directoryQuery.refetch(); void statusQuery.refetch(); }} type="button"><RefreshCw className={directoryQuery.isFetching || statusQuery.isFetching ? "qv:animate-spin" : ""} size={13} /> Refresh</button>
      </header>

      {!address ? <section className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}><Wallet size={16} className="qv:text-[#a99aff]" />Connect the operator wallet to load your validator identities.</section>
        : chain?.id !== protocolChain.id ? <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>Switch to {protocolChain.name} to view validator status.</section>
          : directoryQuery.isPending ? <section className={`${panel} qv:flex qv:items-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}><LoaderCircle size={15} className="qv:animate-spin" />Reading your validator identities from Monad…</section>
            : directoryQuery.isError ? <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</section>
              : validators.length === 0 ? <section className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><ShieldCheck size={22} className="qv:text-[#a99aff]" /><h2 className="qv:mb-1 qv:mt-3 qv:text-[14px] qv:font-semibold qv:text-white">No validator identities found</h2><p className="qv:max-w-[350px] qv:text-[10px] qv:leading-4 qv:text-[#999bad]">Create a validator identity from the dashboard to start tracking vault backing and native registration.</p><Link className={`${button} qv:mt-4`} href="/">Open validator onboarding <ArrowRight size={12} /></Link></section>
                : statusQuery.isPending ? <section className={`${panel} qv:flex qv:items-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}><LoaderCircle size={15} className="qv:animate-spin" />Reading vault backing and Monad validator records…</section>
                  : statusQuery.isError ? <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{statusQuery.error.message}</section>
                    : <div className="qv:grid qv:gap-4 qv:xl:grid-cols-2">{(statusQuery.data ?? []).map((status) => <ValidatorCard key={status.validator.tokenId} status={status} />)}</div>}

      <p className="qv:text-[9px] qv:leading-4 qv:text-[#77798b]">Quevra registration is a separate step from Monad active-set admission. Meeting the vault backing threshold creates the native validator record; network stake and ranking determine active-set placement.</p>
    </main>
  );
}
