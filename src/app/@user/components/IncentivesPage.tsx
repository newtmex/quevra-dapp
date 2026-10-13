"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowUpRight, CheckCircle2, CircleAlert, Coins, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { formatUnits, isAddress, parseAbi, parseUnits, type Address, type PublicClient } from "viem";
import { erc20Abi } from "viem";
import { getContractConfig, getDeploymentMetadata } from "@/contracts/shared";
import { EPOCHS_PER_CYCLE, epochToCycle, readCurrentEpoch } from "@/lib/protocol-time";
import { protocolChain } from "@/lib/web3";
import TransactionButton from "@/lib/tx-flow/TransactionButton";
import { makeAddressWriteStep, makeTokenApprovalStep } from "@/lib/tx-flow/steps";
import { fetchHolderDirectory } from "./reward-data";

type FundingState = {
  symbol: string;
  decimals: number;
  balance: bigint;
  voterWhitelisted: boolean;
  bribeRegistered: boolean;
  epoch: bigint;
  cycle: bigint;
  cycleStart: bigint;
  fundedThisCycle: bigint;
};

const panel = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const field = "qv:h-11 qv:w-full qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:focus:border-[rgba(141,120,255,0.65)]";
const primary = "qv:inline-flex qv:h-11 qv:w-full qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[11px] qv:font-semibold qv:text-white qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-40";
const bribeAbi = parseAbi([
  "function isReward(address token) view returns (bool)",
  "function tokenRewardsPerCycle(address token, uint256 cycle) view returns (uint256)",
  "function notifyRewardAmount(address token, uint256 amount)",
]);

async function readFundingState(
  publicClient: PublicClient,
  bribe: Address,
  token: Address,
  wallet: Address,
): Promise<FundingState> {
  const voter = getContractConfig(protocolChain.id, "ValidatorsVoter");
  if (!voter) throw new Error(`The validator voter is not configured on ${protocolChain.name}.`);
  const [epoch, symbol, decimals, balance, voterWhitelisted, bribeRegistered] = await Promise.all([
    readCurrentEpoch(publicClient),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    publicClient.readContract({ address: voter.address, abi: voter.abi, functionName: "isWhitelistedToken", args: [token] }),
    publicClient.readContract({ address: bribe, abi: bribeAbi, functionName: "isReward", args: [token] }),
  ]);
  const cycle = epochToCycle(epoch);
  const cycleStart = cycle * EPOCHS_PER_CYCLE;
  const fundedThisCycle = await publicClient.readContract({
    address: bribe,
    abi: bribeAbi,
    functionName: "tokenRewardsPerCycle",
    args: [token, cycleStart],
  });
  return { symbol: String(symbol), decimals: Number(decimals), balance: balance as bigint, voterWhitelisted: Boolean(voterWhitelisted), bribeRegistered, epoch, cycle, cycleStart, fundedThisCycle };
}

function formatToken(value: bigint, decimals: number) {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
}

export default function IncentivesPage() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [selectedValidatorId, setSelectedValidatorId] = useState("");
  const [tokenAddress, setTokenAddress] = useState<string>(() => getDeploymentMetadata(protocolChain.id)?.config.rewardToken ?? "");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(address as Address),
    enabled: Boolean(address && chain?.id === protocolChain.id),
    refetchInterval: 30_000,
  });
  const validators = (directoryQuery.data?.validators ?? []).filter((validator) => validator.bribe);
  const selectedValidator = validators.find((validator) => validator.id === selectedValidatorId) ?? validators[0];

  useEffect(() => {
    if (validators.length && !validators.some((validator) => validator.id === selectedValidatorId)) {
      setSelectedValidatorId(validators[0].id);
    }
  }, [selectedValidatorId, validators]);

  const normalizedToken = tokenAddress.trim();
  const validToken = isAddress(normalizedToken);
  const token = validToken ? normalizedToken as Address : undefined;
  const fundingQuery = useQuery({
    queryKey: ["incentive-funding-state", selectedValidator?.bribe?.toLowerCase(), token?.toLowerCase(), address?.toLowerCase()],
    queryFn: () => readFundingState(publicClient!, selectedValidator!.bribe!, token!, address as Address),
    enabled: Boolean(publicClient && address && chain?.id === protocolChain.id && selectedValidator?.bribe && token),
    refetchInterval: 20_000,
  });
  const state = fundingQuery.data;
  const amountValid = Boolean(amount.trim() && /^(?:\d+)(?:\.\d+)?$/.test(amount.trim()));
  let parsedAmount = BigInt(0);
  if (amountValid && state) {
    try { parsedAmount = parseUnits(amount.trim(), state.decimals); } catch { parsedAmount = BigInt(0); }
  }
  const supportedToken = Boolean(state && (state.voterWhitelisted || state.bribeRegistered));
  const canFund = Boolean(address && chain?.id === protocolChain.id && selectedValidator?.bribe && token && state
    && supportedToken && parsedAmount > BigInt(0) && parsedAmount <= state.balance);
  const fundingSteps = useMemo(() => {
    if (!selectedValidator?.bribe || !token || parsedAmount <= BigInt(0)) return [];
    return [
      makeTokenApprovalStep({
        key: `approve-bribe-token-${selectedValidator.bribe}-${token}`,
        label: `Approve ${state?.symbol ?? "incentive token"}`,
        approval: { standard: "erc20", token, spender: selectedValidator.bribe, amount: parsedAmount },
      }),
      makeAddressWriteStep({
        key: `fund-validator-incentive-${selectedValidator.bribe}-${token}`,
        label: "Fund validator incentive",
        address: selectedValidator.bribe,
        abi: bribeAbi,
        functionName: "notifyRewardAmount",
        args: [token, parsedAmount],
        displayLabelBtn: true,
      }),
    ];
  }, [parsedAmount, selectedValidator?.bribe, state?.symbol, token]);

  async function refresh() {
    await Promise.all([
      fundingQuery.refetch(),
      directoryQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] }),
    ]);
  }

  return (
    <div className="qv:space-y-6">
      <header>
        <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#a99aff]"><Coins size={13} /> Validator incentives</p>
        <h1 className="qv:mt-2 qv:text-[26px] qv:font-semibold qv:tracking-[-0.04em] qv:text-white qv:sm:text-[32px]">Fund a validator</h1>
        <p className="qv:mt-2 qv:max-w-[700px] qv:text-[12px] qv:leading-5 qv:text-[#aeb0c0]">Sponsor a validator with an approved ERC-20 incentive. Supporters who allocated voting weight can claim their share after the funded cycle closes.</p>
      </header>

      {!address ? <div className={`${panel} qv:flex qv:items-center qv:gap-3 qv:p-5 qv:text-[11px] qv:text-[#b9bac8]`}><Wallet size={17} className="qv:text-[#a99aff]" />Connect a wallet to fund validator incentives.</div>
        : chain?.id !== protocolChain.id ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ffcf7a]`}>Switch to {protocolChain.name} to fund incentives.</div>
          : directoryQuery.isPending ? <div className={`${panel} qv:flex qv:items-center qv:justify-center qv:gap-2 qv:p-8 qv:text-[11px] qv:text-[#999bad]`}><LoaderCircle size={14} className="qv:animate-spin" />Loading validator bribe contracts…</div>
            : directoryQuery.isError ? <div className={`${panel} qv:p-5 qv:text-[11px] qv:text-[#ff9caa]`}>{directoryQuery.error.message}</div>
              : validators.length === 0 ? <div className={`${panel} qv:flex qv:flex-col qv:items-center qv:p-9 qv:text-center`}><ShieldCheck size={20} className="qv:text-[#a99aff]" /><p className="qv:mt-3 qv:text-[13px] qv:font-semibold qv:text-white">No validator incentive contracts yet</p><p className="qv:mt-1 qv:max-w-[360px] qv:text-[10px] qv:leading-4 qv:text-[#999bad]">Validator identities receive a bribe contract during onboarding. Once indexed, you can fund it here.</p></div>
                : <div className="qv:grid qv:items-start qv:gap-5 qv:xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <section className={`${panel} qv:p-5 qv:sm:p-6`}>
                    <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><ArrowUpRight size={14} className="qv:text-[#a99aff]" /> New incentive</p>
                    <h2 className="qv:mt-2 qv:text-[18px] qv:font-semibold qv:text-[#f0eff8]">Choose a validator and amount</h2>
                    <div className="qv:mt-5 qv:space-y-4">
                      <label className="qv:block qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Validator</span><select className={field} onChange={(event) => { setSelectedValidatorId(event.target.value); setMessage(null); }} value={selectedValidator?.id ?? ""}>
                        {validators.map((validator) => <option key={validator.id} value={validator.id}>{validator.validatorId ? `Validator #${validator.validatorId}` : `Identity #${validator.tokenId}`} · {validator.operator ? `${validator.operator.slice(0, 6)}…${validator.operator.slice(-4)}` : `${validator.owner.slice(0, 6)}…${validator.owner.slice(-4)}`}</option>)}
                      </select></label>
                      <label className="qv:block qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Reward token address</span><input className={field} autoCapitalize="off" autoComplete="off" onChange={(event) => { setTokenAddress(event.target.value); setMessage(null); }} placeholder="0x…" spellCheck={false} value={tokenAddress} /><span className="qv:block qv:text-[9px] qv:leading-4 qv:text-[#898b9c]">The token must be enabled by Quevra or already registered on this bribe contract.</span></label>
                      {fundingQuery.isPending && token && <p className="qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#999bad]"><LoaderCircle size={12} className="qv:animate-spin" />Checking token support and wallet balance…</p>}
                      {!token && normalizedToken && <p className="qv:text-[9px] qv:text-[#ff9caa]">Enter a valid ERC-20 address.</p>}
                      {fundingQuery.isError && <p className="qv:text-[9px] qv:text-[#ff9caa]">Could not read this token on {protocolChain.name}. Check the address and try again.</p>}
                      {state && !supportedToken && <p className="qv:flex qv:items-start qv:gap-2 qv:rounded-lg qv:border qv:border-[rgba(255,156,170,0.16)] qv:bg-[rgba(255,156,170,0.05)] qv:p-3 qv:text-[9px] qv:leading-4 qv:text-[#ffb3bd]"><CircleAlert size={13} className="qv:mt-0.5 qv:shrink-0" />This token is not currently approved by Quevra and has not been used on this validator’s bribe contract.</p>}
                      {state && supportedToken && <p className="qv:flex qv:items-start qv:gap-2 qv:rounded-lg qv:border qv:border-[rgba(85,194,127,0.14)] qv:bg-[rgba(85,194,127,0.05)] qv:p-3 qv:text-[9px] qv:leading-4 qv:text-[#a9e2b7]"><CheckCircle2 size={13} className="qv:mt-0.5 qv:shrink-0" />{state.voterWhitelisted ? "Approved by Quevra" : "Already registered on this bribe"} · {state.symbol} has {state.decimals} decimals.</p>}
                      <label className="qv:block qv:space-y-2"><span className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]">Amount {state ? `(${state.symbol})` : ""}</span><input className={field} inputMode="decimal" onChange={(event) => { setAmount(event.target.value); setMessage(null); }} placeholder="0.0" value={amount} /><span className="qv:block qv:text-[9px] qv:text-[#898b9c]">Wallet balance: {state ? `${formatToken(state.balance, state.decimals)} ${state.symbol}` : "—"}</span></label>
                      {amountValid && state && parsedAmount > state.balance && <p className="qv:text-[9px] qv:text-[#ff9caa]">Amount exceeds your token balance.</p>}
                      {message && <p className="qv:text-[10px] qv:text-[#a9e2b7]">{message}</p>}
                      <TransactionButton className={primary} disabled={!canFund} onComplete={() => { setMessage(`Incentive funded for cycle ${state?.cycle.toString()}. Supporters can claim after the cycle closes.`); setAmount(""); void refresh(); }} onError={(error) => setMessage(error)} steps={fundingSteps}>Approve and fund {state?.symbol ?? "incentive"} <ArrowUpRight size={14} /></TransactionButton>
                    </div>
                  </section>

                  {selectedValidator && state && <section className={`${panel} qv:p-5 qv:sm:p-6`}>
                    <p className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-[#aeb0c0]"><Coins size={14} className="qv:text-[#a99aff]" /> Funding details</p>
                    <h2 className="qv:mt-2 qv:text-[18px] qv:font-semibold qv:text-[#f0eff8]">{selectedValidator.validatorId ? `Validator #${selectedValidator.validatorId}` : `Validator identity #${selectedValidator.tokenId}`}</h2>
                    <p className="qv:mt-1 qv:break-all qv:text-[9px] qv:text-[#898b9c]">Bribe contract {selectedValidator.bribe}</p>
                    <div className="qv:mt-5 qv:grid qv:grid-cols-2 qv:gap-2">
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Current Monad epoch</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{state.epoch.toString()}</p></div>
                      <div className="qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">Funding cycle</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{state.cycle.toString()}</p></div>
                      <div className="qv:col-span-2 qv:rounded-lg qv:bg-[#0e1018] qv:p-3"><p className="qv:text-[9px] qv:text-[#898b9c]">{state.symbol} already funded this cycle</p><p className="qv:mt-1 qv:text-[14px] qv:font-semibold qv:text-white">{formatToken(state.fundedThisCycle, state.decimals)} {state.symbol}</p></div>
                    </div>
                    <div className="qv:mt-4 qv:flex qv:items-start qv:gap-2 qv:rounded-lg qv:border qv:border-[rgba(141,120,255,0.16)] qv:bg-[rgba(141,120,255,0.055)] qv:p-3 qv:text-[9px] qv:leading-4 qv:text-[#b5b1d0]"><ShieldCheck size={13} className="qv:mt-0.5 qv:shrink-0 qv:text-[#a99aff]" />Funding transfers tokens directly into the validator’s bribe contract and is recorded for cycle {state.cycle.toString()}. It does not mint or stream new tokens. Eligible supporters can claim beginning in cycle {(state.cycle + BigInt(1)).toString()}.</div>
                  </section>}
                </div>}
      <p className="qv:text-[9px] qv:leading-4 qv:text-[#77798b]">Only send tokens you intend to sponsor. Incentives are distributed by the validator’s recorded voting weight, and transfers cannot be reversed.</p>
    </div>
  );
}
