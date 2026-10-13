"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Coins,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  isAddress,
  parseAbi,
  parseUnits,
  type Address,
  type PublicClient,
} from "viem";
import { getContractConfig, getDeploymentMetadata } from "@/contracts/shared";
import { protocolChain } from "@/lib/web3";
import { fetchHolderDirectory, type HolderValidator } from "@/lib/rpc-data";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeAddressWriteStep, makeContractWriteStep, makeTokenApprovalStep } from "@/lib/tx-flow/steps";

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const button = "qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:no-underline qv:transition qv:hover:bg-white/[0.07] qv:disabled:opacity-50";
const primary = "qv:inline-flex qv:h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-white qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-40";
const field = "qv:h-10 qv:w-full qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";

const nativeStakingAbi = parseAbi([
  "function getValidator(uint64 validatorId) returns (address authAddress, uint64 flags, uint256 stake, uint256 accRewardPerToken, uint256 commission, uint256 unclaimedRewards, uint256 consensusStake, uint256 consensusCommission, uint256 snapshotStake, uint256 snapshotCommission, bytes secpPubkey, bytes blsPubkey)",
]);
const gaugeAbi = parseAbi([
  "function rewardToken() view returns (address)",
  "function rewardsBeneficiary() view returns (address)",
  "function rewards(address account) view returns (uint256)",
  "function getReward(address account)",
  "function switchRewardsBeneficiary(address newBeneficiary)",
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
  rewardToken: Address | null;
  rewardSymbol: string;
  rewardDecimals: number;
  rewardBalance: bigint;
  beneficiary: Address | null;
  claimable: bigint;
  liveBoost: bigint;
  storedBoost: bigint;
};

type MulticallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

function shortAddress(value: Address) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatMon(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatToken(value: bigint, decimals: number) {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function progressPercent(balance: bigint, minimum: bigint) {
  if (minimum === BigInt(0)) return 100;
  const percent = (balance * BigInt(100)) / minimum;
  return Number(percent > BigInt(100) ? BigInt(100) : percent);
}

function explorerAddressUrl(address: Address) {
  const base = protocolChain.blockExplorers?.default?.url;
  return base ? `${base}/address/${address}` : null;
}

async function readValidatorStatuses(
  publicClient: PublicClient,
  validators: HolderValidator[],
  wallet: Address,
): Promise<ValidatorStatus[]> {
  const controller = getContractConfig(protocolChain.id, "StakingController");
  const vaultConfig = getContractConfig(protocolChain.id, "StakingVault");
  const voter = getContractConfig(protocolChain.id, "ValidatorsVoter");
  const veValidator = getContractConfig(protocolChain.id, "VeValidator");
  if (!controller || !vaultConfig) throw new Error(`Validator contracts are not configured on ${protocolChain.name}.`);
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
  const results = (await publicClient.multicall({
    contracts: calls as never,
    allowFailure: true,
  })) as unknown as MulticallResult[];
  const read = (index: number) => {
    const result = results[index];
    if (result?.status !== "success") throw new Error(result?.error.message ?? "Could not read validator status from Monad.");
    return result.result;
  };

  return Promise.all(
    validators.map(async (validator, index): Promise<ValidatorStatus> => {
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
          const decoded = decodeFunctionResult({
            abi: nativeStakingAbi,
            functionName: "getValidator",
            data: result.data,
          });
          nativeRecord = { consensusStake: decoded[6], snapshotStake: decoded[8] };
        } catch {
          nativeReadFailed = true;
        }
      }

      let rewardToken: Address | null = null;
      let rewardSymbol = "TOKEN";
      let rewardDecimals = 18;
      let rewardBalance = BigInt(0);
      let beneficiary: Address | null = null;
      let claimable = BigInt(0);
      let liveBoost = BigInt(0);
      let storedBoost = BigInt(0);

      const zero = "0x0000000000000000000000000000000000000000";
      if (validator.gauge && validator.gauge.toLowerCase() !== zero) {
        try {
          const [token, rewardsBeneficiary, boost] = await Promise.all([
            publicClient.readContract({
              address: validator.gauge,
              abi: gaugeAbi,
              functionName: "rewardToken",
            }) as Promise<Address>,
            publicClient.readContract({
              address: validator.gauge,
              abi: gaugeAbi,
              functionName: "rewardsBeneficiary",
            }) as Promise<Address>,
            voter
              ? (publicClient.readContract({
                  address: voter.address,
                  abi: voter.abi,
                  functionName: "getBoost",
                  args: [BigInt(validator.tokenId)],
                }) as Promise<bigint>)
              : Promise.resolve(BigInt(0)),
          ]);
          rewardToken = token;
          beneficiary = rewardsBeneficiary;
          liveBoost = boost;
          const [symbol, decimals, balance, pending, locked] = await Promise.all([
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
            publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [wallet],
            }).catch(() => BigInt(0)),
            publicClient.readContract({
              address: validator.gauge,
              abi: gaugeAbi,
              functionName: "rewards",
              args: [rewardsBeneficiary],
            }).catch(() => BigInt(0)),
            veValidator
              ? publicClient.readContract({
                  address: veValidator.address,
                  abi: veValidator.abi,
                  functionName: "locked",
                  args: [BigInt(validator.tokenId)],
                }).catch(() => null)
              : Promise.resolve(null),
          ]);
          rewardSymbol = String(symbol);
          rewardDecimals = Number(decimals);
          rewardBalance = balance as bigint;
          claimable = pending as bigint;
          if (locked && Array.isArray(locked)) storedBoost = locked[3] as bigint;
        } catch {
          // Gauge reads are best-effort; vault status still renders.
        }
      }

      return {
        validator,
        id,
        minimum,
        totalBalance,
        deficit,
        backing,
        requiresMinimumStake,
        registered,
        nativeRecord,
        nativeReadFailed,
        rewardToken,
        rewardSymbol,
        rewardDecimals,
        rewardBalance,
        beneficiary,
        claimable,
        liveBoost,
        storedBoost,
      };
    }),
  );
}

function ValidatorCard({
  status,
  wallet,
  onRefresh,
}: {
  status: ValidatorStatus;
  wallet: Address;
  onRefresh: () => void;
}) {
  const [fundAmount, setFundAmount] = useState("");
  const [beneficiaryInput, setBeneficiaryInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const isBuilding = status.requiresMinimumStake && status.id === BigInt(0);
  const percent = progressPercent(status.totalBalance, status.minimum);
  const explorer = explorerAddressUrl(status.validator.vault);
  const voter = getContractConfig(protocolChain.id, "ValidatorsVoter");
  const isBeneficiary =
    Boolean(status.beneficiary && status.beneficiary.toLowerCase() === wallet.toLowerCase());
  const amountValid = Boolean(fundAmount.trim() && /^(?:\d+)(?:\.\d+)?$/.test(fundAmount.trim()));
  let parsedAmount = BigInt(0);
  if (amountValid) {
    try {
      parsedAmount = parseUnits(fundAmount.trim(), status.rewardDecimals);
    } catch {
      parsedAmount = BigInt(0);
    }
  }
  const canFund = Boolean(
    voter?.address
    && status.rewardToken
    && status.validator.gauge
    && parsedAmount > BigInt(0)
    && parsedAmount <= status.rewardBalance,
  );
  const fundSteps = useMemo(() => {
    if (!voter?.address || !status.rewardToken || !status.validator.gauge || parsedAmount <= BigInt(0)) return [];
    return [
      makeTokenApprovalStep({
        key: `approve-gauge-reward-${status.validator.gauge}-${status.rewardToken}`,
        label: `Approve ${status.rewardSymbol}`,
        approval: {
          standard: "erc20",
          token: status.rewardToken,
          spender: voter.address,
          amount: parsedAmount,
        },
      }),
      makeContractWriteStep({
        key: `notify-gauge-reward-${status.validator.gauge}`,
        label: "Fund gauge emissions",
        contractName: "ValidatorsVoter",
        functionName: "notifyGaugeReward",
        args: [status.validator.gauge, parsedAmount],
        displayLabelBtn: true,
      }),
    ];
  }, [parsedAmount, status.rewardSymbol, status.rewardToken, status.validator.gauge, voter?.address]);

  const claimSteps = useMemo(() => {
    if (!status.validator.gauge) return [];
    return [
      makeAddressWriteStep({
        key: `claim-gauge-reward-${status.validator.gauge}`,
        label: "Claim gauge rewards",
        address: status.validator.gauge,
        abi: gaugeAbi,
        functionName: "getReward",
        args: [wallet],
        displayLabelBtn: true,
      }),
    ];
  }, [status.validator.gauge, wallet]);

  const beneficiaryValid = isAddress(beneficiaryInput.trim());
  const switchSteps = useMemo(() => {
    if (!status.validator.gauge || !beneficiaryValid) return [];
    return [
      makeAddressWriteStep({
        key: `switch-beneficiary-${status.validator.gauge}`,
        label: "Switch rewards beneficiary",
        address: status.validator.gauge,
        abi: gaugeAbi,
        functionName: "switchRewardsBeneficiary",
        args: [beneficiaryInput.trim() as Address],
        displayLabelBtn: true,
      }),
    ];
  }, [beneficiaryInput, beneficiaryValid, status.validator.gauge]);

  const pokeSteps = useMemo(
    () => [
      makeContractWriteStep({
        key: `poke-boost-${status.validator.tokenId}`,
        label: "Refresh boost",
        contractName: "ValidatorsVoter",
        functionName: "pokeBoost",
        args: [BigInt(status.validator.tokenId)],
        displayLabelBtn: true,
      }),
    ],
    [status.validator.tokenId],
  );

  return (
    <article className={`${panel} qv:p-5 qv:sm:p-6`}>
      <div className="qv:flex qv:flex-wrap qv:items-start qv:justify-between qv:gap-3">
        <div>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">
            <ShieldCheck size={14} className="qv:text-[#a99aff]" /> Validator identity #{status.validator.tokenId}
          </p>
          <h2 className="qv:mb-0 qv:mt-2 qv:text-[18px] qv:font-semibold qv:tracking-[-0.02em] qv:text-white">
            {status.id > BigInt(0) ? `Monad validator #${status.id}` : "Registration backing"}
          </h2>
        </div>
        <span
          className={`qv:inline-flex qv:items-center qv:gap-1.5 qv:rounded-full qv:border qv:px-2.5 qv:py-1 qv:text-[9px] qv:font-semibold ${
            isBuilding
              ? "qv:border-[rgba(255,199,105,0.2)] qv:bg-[rgba(255,199,105,0.06)] qv:text-[#ffd48a]"
              : status.registered
                ? "qv:border-[rgba(82,221,195,0.2)] qv:bg-[rgba(82,221,195,0.06)] qv:text-[#8de5d4]"
                : "qv:border-white/10 qv:text-[#aeb0c0]"
          }`}
        >
          {isBuilding ? <CircleAlert size={11} /> : <BadgeCheck size={11} />}
          {isBuilding ? "Building backing" : status.registered ? "Registered on Monad" : "Registration status unavailable"}
        </span>
      </div>

      {isBuilding ? (
        <section className="qv:mt-5 qv:rounded-xl qv:bg-[#0e1018] qv:p-4" aria-label="Validator registration backing progress">
          <div className="qv:flex qv:items-end qv:justify-between qv:gap-3">
            <div>
              <p className="qv:text-[9px] qv:font-semibold qv:uppercase qv:tracking-[0.08em] qv:text-[#999bad]">Vault backing</p>
              <p className="qv:mt-1 qv:text-[19px] qv:font-semibold qv:text-white">
                {formatMon(status.totalBalance)}{" "}
                <span className="qv:text-[10px] qv:font-medium qv:text-[#999bad]">/ {formatMon(status.minimum)} MON</span>
              </p>
            </div>
            <p className="qv:text-right qv:text-[10px] qv:font-semibold qv:text-[#d3caff]">{percent}%</p>
          </div>
          <div className="qv:mt-3 qv:h-2 qv:overflow-hidden qv:rounded-full qv:bg-white/[0.08]">
            <div
              className="qv:h-full qv:rounded-full qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#52ddc3] qv:transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="qv:mt-2 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">
            {status.deficit > BigInt(0)
              ? `${formatMon(status.deficit)} MON more is needed before the vault can submit the native registration.`
              : "The threshold is met. The deposit that completes registration backing also submits the native registration call."}
          </p>
        </section>
      ) : (
        <section className="qv:mt-5 qv:grid qv:grid-cols-2 qv:gap-2" aria-label="Native validator staking state">
          <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3">
            <p className="qv:text-[9px] qv:text-[#9295a7]">Monad consensus stake</p>
            <p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">
              {status.nativeRecord
                ? `${formatMon(status.nativeRecord.consensusStake)} MON`
                : status.nativeReadFailed
                  ? "Unavailable"
                  : "—"}
            </p>
          </div>
          <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3">
            <p className="qv:text-[9px] qv:text-[#9295a7]">Snapshot stake</p>
            <p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">
              {status.nativeRecord
                ? `${formatMon(status.nativeRecord.snapshotStake)} MON`
                : status.nativeReadFailed
                  ? "Unavailable"
                  : "—"}
            </p>
          </div>
          <p className="qv:col-span-2 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">
            A native validator record is present. Active-set admission is separate and depends on Monad’s network-wide stake and ranking.
          </p>
        </section>
      )}

      <dl className="qv:mt-5 qv:grid qv:gap-3 qv:border-t qv:border-white/[0.07] qv:pt-4 qv:sm:grid-cols-2">
        <div>
          <dt className="qv:text-[9px] qv:text-[#898b9c]">Validator vault</dt>
          <dd className="qv:mt-1 qv:break-all qv:font-mono qv:text-[10px] qv:text-[#d6d4e4]">{shortAddress(status.validator.vault)}</dd>
        </div>
        <div>
          <dt className="qv:text-[9px] qv:text-[#898b9c]">Operator</dt>
          <dd className="qv:mt-1 qv:break-all qv:font-mono qv:text-[10px] qv:text-[#d6d4e4]">{shortAddress(status.validator.operator)}</dd>
        </div>
        <div>
          <dt className="qv:text-[9px] qv:text-[#898b9c]">Quevra backing</dt>
          <dd className="qv:mt-1 qv:text-[11px] qv:font-semibold qv:text-white">{formatMon(status.backing)} MON</dd>
        </div>
        <div>
          <dt className="qv:text-[9px] qv:text-[#898b9c]">Gauge / incentives</dt>
          <dd className="qv:mt-1 qv:text-[10px] qv:text-[#d6d4e4]">
            {shortAddress(status.validator.gauge)} · {shortAddress(status.validator.bribe)}
          </dd>
        </div>
      </dl>

      <section className="qv:mt-5 qv:rounded-xl qv:border qv:border-white/[0.07] qv:bg-[#0e1018] qv:p-4">
        <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">
          <Sparkles size={13} className="qv:text-[#a99aff]" /> Compete · boost
        </p>
        <p className="qv:mt-1 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">
          Boost amplifies gauge weight up to 5× voting power. Anyone can poke to refresh the stored boost from the live calculation.
        </p>
        <div className="qv:mt-3 qv:grid qv:grid-cols-2 qv:gap-2">
          <div className="qv:rounded-lg qv:bg-[#12141d] qv:p-3">
            <p className="qv:text-[9px] qv:text-[#898b9c]">Live boost</p>
            <p className="qv:mt-1 qv:text-[13px] qv:font-semibold qv:text-white">{formatMon(status.liveBoost)}</p>
          </div>
          <div className="qv:rounded-lg qv:bg-[#12141d] qv:p-3">
            <p className="qv:text-[9px] qv:text-[#898b9c]">Stored boost</p>
            <p className="qv:mt-1 qv:text-[13px] qv:font-semibold qv:text-white">{formatMon(status.storedBoost)}</p>
          </div>
        </div>
        <div className="qv:mt-3">
          <TransactionButton
            className={primary}
            disabled={!voter?.address}
            onComplete={() => {
              setMessage("Boost refreshed.");
              onRefresh();
            }}
            onError={(error) => setMessage(error)}
            steps={pokeSteps}
          >
            Refresh boost <Sparkles size={12} />
          </TransactionButton>
        </div>
      </section>

      {status.rewardToken && (
        <section className="qv:mt-4 qv:rounded-xl qv:border qv:border-white/[0.07] qv:bg-[#0e1018] qv:p-4">
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]">
            <Coins size={13} className="qv:text-[#a99aff]" /> Gauge emissions
          </p>
          <p className="qv:mt-1 qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">
            Fund through the voter (`notifyGaugeReward`). Approve the gauge reward token, then notify. Claim goes to the current beneficiary.
          </p>
          <div className="qv:mt-3 qv:grid qv:grid-cols-2 qv:gap-2">
            <div className="qv:rounded-lg qv:bg-[#12141d] qv:p-3">
              <p className="qv:text-[9px] qv:text-[#898b9c]">Reward token</p>
              <p className="qv:mt-1 qv:text-[12px] qv:font-semibold qv:text-white">{status.rewardSymbol}</p>
              <p className="qv:mt-0.5 qv:font-mono qv:text-[9px] qv:text-[#898b9c]">{shortAddress(status.rewardToken)}</p>
            </div>
            <div className="qv:rounded-lg qv:bg-[#12141d] qv:p-3">
              <p className="qv:text-[9px] qv:text-[#898b9c]">Claimable (beneficiary)</p>
              <p className="qv:mt-1 qv:text-[12px] qv:font-semibold qv:text-white">
                {formatToken(status.claimable, status.rewardDecimals)} {status.rewardSymbol}
              </p>
              <p className="qv:mt-0.5 qv:text-[9px] qv:text-[#898b9c]">
                {status.beneficiary ? shortAddress(status.beneficiary) : "—"}
              </p>
            </div>
          </div>
          <label className="qv:mt-3 qv:block qv:space-y-1.5">
            <span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Fund amount ({status.rewardSymbol})</span>
            <input
              className={field}
              inputMode="decimal"
              onChange={(event) => {
                setFundAmount(event.target.value);
                setMessage(null);
              }}
              placeholder="0.0"
              value={fundAmount}
            />
            <span className="qv:block qv:text-[9px] qv:text-[#898b9c]">
              Wallet balance: {formatToken(status.rewardBalance, status.rewardDecimals)} {status.rewardSymbol}
            </span>
          </label>
          {amountValid && parsedAmount > status.rewardBalance && (
            <p className="qv:mt-2 qv:text-[9px] qv:text-[#ff9caa]">Amount exceeds your token balance.</p>
          )}
          <div className="qv:mt-3 qv:flex qv:flex-wrap qv:gap-2">
            <TransactionButton
              className={primary}
              disabled={!canFund}
              onComplete={() => {
                setMessage("Gauge emissions funded.");
                setFundAmount("");
                onRefresh();
              }}
              onError={(error) => setMessage(error)}
              steps={fundSteps}
            >
              Approve and fund gauge <Coins size={12} />
            </TransactionButton>
            <TransactionButton
              className={button}
              disabled={!isBeneficiary || status.claimable === BigInt(0)}
              onComplete={() => {
                setMessage("Gauge rewards claimed.");
                onRefresh();
              }}
              onError={(error) => setMessage(error)}
              steps={claimSteps}
            >
              Claim gauge rewards
            </TransactionButton>
          </div>
          {!isBeneficiary && status.beneficiary && (
            <p className="qv:mt-2 qv:text-[9px] qv:leading-4 qv:text-[#e7c27f]">
              Connected wallet is not the current beneficiary ({shortAddress(status.beneficiary)}). Only the beneficiary can claim or switch.
            </p>
          )}
          {isBeneficiary && (
            <div className="qv:mt-4 qv:border-t qv:border-white/[0.07] qv:pt-3">
              <label className="qv:block qv:space-y-1.5">
                <span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">New rewards beneficiary</span>
                <input
                  className={field}
                  autoCapitalize="off"
                  autoComplete="off"
                  onChange={(event) => {
                    setBeneficiaryInput(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="0x…"
                  spellCheck={false}
                  value={beneficiaryInput}
                />
              </label>
              <div className="qv:mt-2">
                <TransactionButton
                  className={button}
                  disabled={!beneficiaryValid}
                  onComplete={() => {
                    setMessage("Rewards beneficiary updated.");
                    setBeneficiaryInput("");
                    onRefresh();
                  }}
                  onError={(error) => setMessage(error)}
                  steps={switchSteps}
                >
                  Switch beneficiary
                </TransactionButton>
              </div>
            </div>
          )}
        </section>
      )}

      {message && <p className="qv:mt-3 qv:text-[10px] qv:text-[#a9e2b7]">{message}</p>}

      <div className="qv:mt-5 qv:flex qv:flex-wrap qv:gap-2">
        <Link className={button} href="/stake">
          Manage staking allocations <ArrowRight size={12} />
        </Link>
        <Link className={button} href="/incentives">
          Fund bribes <ArrowRight size={12} />
        </Link>
        {explorer ? (
          <a className={button} href={explorer} rel="noreferrer" target="_blank">
            Open vault <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function MyValidatorsPage() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const metadata = getDeploymentMetadata(protocolChain.id);
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(publicClient!, address as Address),
    enabled: Boolean(address && publicClient && chain?.id === protocolChain.id),
    refetchInterval: 20_000,
  });
  const validators = (directoryQuery.data?.validators ?? []).filter(
    (validator) => validator.owner.toLowerCase() === address?.toLowerCase(),
  );
  const statusQuery = useQuery({
    queryKey: [
      "my-validator-status",
      address?.toLowerCase(),
      validators.map((validator) => validator.tokenId).join(","),
    ],
    queryFn: () => readValidatorStatuses(publicClient!, validators, address as Address),
    enabled: Boolean(publicClient && address && chain?.id === protocolChain.id && validators.length),
    refetchInterval: 20_000,
  });

  async function refresh() {
    await Promise.all([
      directoryQuery.refetch(),
      statusQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] }),
    ]);
  }

  return (
    <main className="qv:mx-auto qv:w-full qv:min-w-0 qv:max-w-[1260px] qv:space-y-5">
      <header className="qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
        <div>
          <p className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:tracking-[0.13em] qv:text-[#9e91eb]">
            <span className="qv:size-1.5 qv:rounded-full qv:bg-[#52ddc3]" /> QUEVRA · OPERATOR
          </p>
          <h1 className="qv:mb-1 qv:mt-3 qv:text-[26px] qv:font-semibold qv:tracking-[-0.045em] qv:text-[#f2f2f8] qv:sm:text-[34px]">
            My validators
          </h1>
          <p className="qv:m-0 qv:max-w-[620px] qv:text-[11px] qv:leading-relaxed qv:text-[#aeb0c0] qv:sm:text-[13px]">
            Track registration backing, fund gauge emissions, claim operator rewards, and refresh boost for identities you operate.
            {metadata?.config.rewardToken
              ? ` Default gauge reward token: ${metadata.config.rewardToken.slice(0, 8)}…`
              : ""}
          </p>
        </div>
        <button
          className={button}
          disabled={directoryQuery.isFetching || statusQuery.isFetching}
          onClick={() => {
            void refresh();
          }}
          type="button"
        >
          <RefreshCw className={directoryQuery.isFetching || statusQuery.isFetching ? "qv:animate-spin" : ""} size={13} />{" "}
          Refresh
        </button>
      </header>

      {!address ? (
        <section className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}>
          <Wallet size={16} className="qv:text-[#a99aff]" />
          Connect the operator wallet to load your validator identities.
        </section>
      ) : chain?.id !== protocolChain.id ? (
        <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>
          Switch to {protocolChain.name} to view validator status.
        </section>
      ) : directoryQuery.isPending ? (
        <section className={`${panel} qv:flex qv:items-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}>
          <LoaderCircle size={15} className="qv:animate-spin" />
          Reading your validator identities from Monad…
        </section>
      ) : directoryQuery.isError ? (
        <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</section>
      ) : validators.length === 0 ? (
        <section className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}>
          <ShieldCheck size={22} className="qv:text-[#a99aff]" />
          <h2 className="qv:mb-1 qv:mt-3 qv:text-[14px] qv:font-semibold qv:text-white">No validator identities found</h2>
          <p className="qv:max-w-[350px] qv:text-[10px] qv:leading-4 qv:text-[#999bad]">
            Create a validator identity from the dashboard to start tracking vault backing and native registration.
          </p>
          <Link className={`${button} qv:mt-4`} href="/">
            Open validator onboarding <ArrowRight size={12} />
          </Link>
        </section>
      ) : statusQuery.isPending ? (
        <section className={`${panel} qv:flex qv:items-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}>
          <LoaderCircle size={15} className="qv:animate-spin" />
          Reading vault backing, gauge, and Monad validator records…
        </section>
      ) : statusQuery.isError ? (
        <section className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{statusQuery.error.message}</section>
      ) : (
        <div className="qv:grid qv:gap-4 qv:xl:grid-cols-2">
          {(statusQuery.data ?? []).map((status) => (
            <ValidatorCard
              key={status.validator.tokenId}
              onRefresh={() => {
                void refresh();
              }}
              status={status}
              wallet={address}
            />
          ))}
        </div>
      )}

      <p className="qv:text-[9px] qv:leading-4 qv:text-[#77798b]">
        Quevra registration is a separate step from Monad active-set admission. Gauge emissions go through ValidatorsVoter.notifyGaugeReward;
        bribes are funded on the Incentives page. Boost ≤ 5× voting power and is not MON principal.
      </p>
    </main>
  );
}
