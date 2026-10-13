"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { Activity, ArrowRight, ArrowUpRight, Check, ExternalLink, Gauge, PanelRight, Plus, Sparkles, Wallet, X } from "lucide-react";
import { formatEther, type Address, type Hex } from "viem";
import { explorerTxUrl, protocolChain } from "@/lib/web3";
import { getContractConfig } from "@/contracts/shared";
import { fetchHolderDirectory, fetchWalletActivity, keepPreviousWalletData, type HolderPosition, type HolderValidator, type WalletActivity } from "@/lib/indexer-data";
import { createValidatorSigningRequest, submitValidatedRegistration, validateRegistrationArtifact, validatorRegistrationCall, type ValidatorRegistrationArtifact, type ValidatorSigningRequest } from "@/lib/validator-signing";
import { makeContractWriteStep } from "@/lib/tx-flow/steps";
import TransactionButton, { type TransactionButtonHandle } from "@/lib/tx-flow/TransactionButton";

type DashboardTab = "portfolio" | "validators";
type ValidatorMode = "existing" | "new";
type NewValidatorStep = 1 | 2 | 3 | 4 | 5;

function randomSaltSeed(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const panelClass = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const panelTitleClass = "qv:mt-1.5 qv:text-[15px] qv:font-semibold qv:tracking-[-0.015em] qv:text-[#e9e9f1]";
const kickerClass = "qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:tracking-[0.12em] qv:text-[#aeb0c0]";
const emptyIconClass = "qv:grid qv:size-[38px] qv:place-items-center qv:rounded-xl qv:border qv:border-[rgba(141,120,255,0.18)] qv:bg-[rgba(141,120,255,0.09)] qv:text-[#9f8fff]";
const explorerLinkClass = "qv:inline-flex qv:items-center qv:gap-1 qv:text-[10px] qv:text-[#a99aff] qv:no-underline qv:hover:text-white";
const inputClass = "qv:h-[41px] qv:w-full qv:min-w-0 qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:placeholder:text-[#9b9eaf] qv:focus:border-[rgba(141,120,255,0.65)] qv:focus:shadow-[0_0_0_3px_rgba(141,120,255,0.1)]";
const fieldLabelClass = "qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]";
const softButtonClass = "qv:inline-flex qv:h-9 qv:items-center qv:gap-1.5 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:no-underline qv:hover:bg-white/[0.07]";
const primaryButtonClass = "qv:inline-flex qv:h-9 qv:items-center qv:gap-1.5 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-white qv:no-underline qv:hover:brightness-110";

function activityDescription(activity: WalletActivity) {
  return `${activity.label} · token #${activity.tokenId}`;
}

function shortAddress(value: Address) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  trend = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Wallet;
  trend?: "neutral" | "up";
}) {
  return (
    <article className={`${panelClass} qv:grid qv:min-w-0 qv:grid-cols-[minmax(0,1fr)_auto] qv:items-center qv:gap-x-2 qv:p-[13px_15px] qv:sm:block qv:sm:min-h-[139px] qv:sm:p-[18px_19px_15px]`}>
      <div className="qv:contents qv:sm:flex qv:sm:items-center qv:sm:justify-between">
        <span className="qv:text-[10px] qv:text-[#b5b6c4] qv:sm:text-xs">{label}</span>
        <span className="qv:col-start-2 qv:row-span-2 qv:grid qv:size-7 qv:place-items-center qv:rounded-[10px] qv:border qv:border-[rgba(141,120,255,0.15)] qv:bg-[rgba(141,120,255,0.1)] qv:text-[#a99aff] qv:sm:size-8"><Icon size={17} /></span>
      </div>
      <strong className="qv:col-start-1 qv:row-start-2 qv:mt-1 qv:text-[21px] qv:font-semibold qv:tracking-[-0.03em] qv:text-[#f1f1f8] qv:sm:my-2 qv:sm:block qv:sm:text-[25px]">{value}</strong>
      <div className="qv:col-span-2 qv:mt-2 qv:flex qv:min-w-0 qv:items-start qv:gap-1 qv:wrap-anywhere qv:text-[9px] qv:leading-[1.35] qv:text-[#aeb1c1] qv:sm:mt-0 qv:sm:items-center qv:sm:text-[10px]">
        {trend === "up" ? <ArrowUpRight className="qv:shrink-0 qv:text-[#52ddc3]" size={14} /> : <Activity className="qv:shrink-0 qv:text-[#52ddc3]" size={14} />}
        {note}
      </div>
    </article>
  );
}

function TransactionsPanel({
  recentTransactions,
  activityQueryPending,
  activityQueryError,
  isConnected,
  compact = false,
}: {
  recentTransactions: WalletActivity[];
  activityQueryPending: boolean;
  activityQueryError: boolean;
  isConnected: boolean;
  compact?: boolean;
}) {
  return (
    <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5 ${compact ? "qv:h-full qv:rounded-none qv:border-0 qv:bg-transparent qv:p-0 qv:sm:p-0" : ""}`}>
      <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
        <div>
          <span className={kickerClass}>ONCHAIN HISTORY</span>
          <h2 className={panelTitleClass}>Recent transactions</h2>
        </div>
        {protocolChain.blockExplorers?.default.url ? (
          <a className={explorerLinkClass} href={protocolChain.blockExplorers.default.url} target="_blank" rel="noreferrer">
            {protocolChain.blockExplorers.default.name} <ExternalLink size={13} />
          </a>
        ) : (
          <span className="qv:text-[10px] qv:text-[#a9acbd]">{protocolChain.name}</span>
        )}
      </div>
      {recentTransactions.length > 0 ? recentTransactions.map((transaction) => {
        const txUrl = explorerTxUrl(protocolChain.id, transaction.transactionHash);
        return (
          <div className="qv:flex qv:min-h-[66px] qv:min-w-0 qv:flex-wrap qv:items-center qv:gap-3 qv:border-t qv:border-white/[0.075] qv:py-2" key={transaction.transactionHash}>
            <span className="qv:grid qv:size-[34px] qv:shrink-0 qv:place-items-center qv:rounded-[10px] qv:border qv:border-[rgba(82,221,195,0.14)] qv:bg-[rgba(82,221,195,0.08)] qv:text-[#52ddc3]"><Gauge size={16} /></span>
            <div className="qv:flex qv:min-w-0 qv:flex-1 qv:flex-col qv:gap-1">
              <strong className="qv:text-[11px] qv:font-semibold qv:text-[#d5d5e0]">{activityDescription(transaction)}</strong>
              <span className="qv:text-[10px] qv:text-[#a9acbd]">{transaction.tokenId ? `Token #${transaction.tokenId} · ` : ""}block {transaction.blockNumber}</span>
            </div>
            {txUrl ? (
              <a className={`${explorerLinkClass} qv:min-w-0 qv:wrap-anywhere`} href={txUrl} target="_blank" rel="noreferrer">
                {transaction.transactionHash.slice(0, 6)}…{transaction.transactionHash.slice(-4)} <ExternalLink size={12} />
              </a>
            ) : (
              <span className="qv:min-w-0 qv:wrap-anywhere qv:text-[10px] qv:text-[#a9acbd]">{transaction.transactionHash.slice(0, 6)}…{transaction.transactionHash.slice(-4)}</span>
            )}
          </div>
        );
      }) : (
        <div className="qv:mt-2.5 qv:flex qv:min-h-[81px] qv:items-center qv:gap-3 qv:border-t qv:border-white/[0.075]">
          <span className={`${emptyIconClass} qv:size-[34px] qv:rounded-[10px]`}><Activity size={18} /></span>
          <div className="qv:flex qv:flex-col qv:gap-1">
            <strong className="qv:text-[11px] qv:font-semibold qv:text-[#d5d5e0]">
              {activityQueryError ? "RPC activity unavailable" : isConnected ? activityQueryPending ? "Loading transactions…" : "No recent transactions found" : "Your activity will show here"}
            </strong>
            <span className="qv:text-[10px] qv:text-[#a9acbd]">
              {activityQueryError
                ? "Monad RPC could not return veNFT transfer history."
                : isConnected
                  ? "Recent veNFT transfers and position creation appear here."
                  : "Connect your wallet to view your Quevra history."}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { address, chain, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const transactionButton = useRef<TransactionButtonHandle>(null);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("portfolio");
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const directoryQuery = useQuery({
    queryKey: ["quevra-directory", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchHolderDirectory(address as Address),
    enabled: Boolean(address && publicClient && chain?.id === protocolChain.id),
    refetchInterval: 15_000,
    placeholderData: keepPreviousWalletData(address),
  });
  const activityQuery = useQuery({
    queryKey: ["quevra-activity", address?.toLowerCase(), chain?.id],
    queryFn: () => fetchWalletActivity(address as Address),
    enabled: Boolean(address && publicClient && chain?.id === protocolChain.id),
    refetchInterval: 15_000,
    placeholderData: keepPreviousWalletData(address),
  });
  const indexedVeMonPositions = directoryQuery.data?.positions ?? [];
  const indexedValidators = directoryQuery.data?.validators.filter((validator) => validator.owner.toLowerCase() === address?.toLowerCase()) ?? [];
  const indexedActivities = activityQuery.data ?? [];
  const lockedMon = indexedVeMonPositions.reduce((sum, position) => sum + BigInt(position.amount), BigInt(0));
  const indexedGauges = indexedValidators.filter((validator) => validator.gauge !== "0x0000000000000000000000000000000000000000").length;
  const lockedMonLabel = directoryQuery.isPending ? "—" : `${Number(formatEther(lockedMon)).toLocaleString(undefined, { maximumFractionDigits: 3 })} MON`;
  const portfolioMetrics = [
    { label: "Locked MON", value: lockedMonLabel, note: `${indexedVeMonPositions.length} veMON positions`, icon: Wallet, trend: "neutral" as const },
    { label: "veMON positions", value: directoryQuery.isPending ? "—" : String(indexedVeMonPositions.length), note: "Current positions owned by this wallet", icon: Activity, trend: "neutral" as const },
  ];
  const validatorMetrics = [
    { label: "Validator identities", value: directoryQuery.isPending ? "—" : String(indexedValidators.length), note: "veValidator identities owned by this wallet", icon: Gauge, trend: "neutral" as const },
    { label: "Your gauges", value: directoryQuery.isPending ? "—" : String(indexedGauges), note: "Gauges linked to your validator identities", icon: Sparkles, trend: "up" as const },
  ];
  const recentTransactions = Array.from(new Map(indexedActivities.map((activity) => [activity.transactionHash, activity])).values()).slice(0, 8);
  const [validatorMode, setValidatorMode] = useState<ValidatorMode>("new");
  const [newValidatorStep, setNewValidatorStep] = useState<NewValidatorStep>(1);
  const [validatorId, setValidatorId] = useState("");
  const [saltSeed, setSaltSeed] = useState<Hex | "">("");
  const [expectedAuthAddress, setExpectedAuthAddress] = useState<Address | null>(null);
  const [registrationAmount, setRegistrationAmount] = useState<bigint | null>(null);
  const [commission, setCommission] = useState<bigint | null>(null);
  const [registrationArtifact, setRegistrationArtifact] = useState<ValidatorRegistrationArtifact | null>(null);
  const [signedMessageInput, setSignedMessageInput] = useState("");
  const [requestCopied, setRequestCopied] = useState(false);
  const [signingRequest, setSigningRequest] = useState<ValidatorSigningRequest | null>(null);
  const [preparingSigningDetails, setPreparingSigningDetails] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const validExistingId = /^[1-9]\d*$/.test(validatorId)
    && BigInt(validatorId || "0") <= BigInt("18446744073709551615");
  const canCreateValidator = Boolean(
    saltSeed && (validatorMode === "existing"
      ? validExistingId
      : expectedAuthAddress && registrationArtifact),
  );

  async function prepareValidatorDetails() {
    setCreationError(null);
    const nextSaltSeed = randomSaltSeed();
    setSaltSeed(nextSaltSeed);
    setExpectedAuthAddress(null);
    setRegistrationAmount(null);
    setCommission(null);
    setRegistrationArtifact(null);
    setSignedMessageInput("");
    setRequestCopied(false);
    setSigningRequest(null);
    if (validatorMode === "existing") return;
    if (!address || chain?.id !== protocolChain.id || !publicClient) {
      setCreationError(`Connect a wallet on ${protocolChain.name} to prepare a new validator request.`);
      return;
    }

    const controller = getContractConfig(protocolChain.id, "StakingController");
    if (!controller?.address) {
      setCreationError(`The staking controller is not configured for ${protocolChain.name}.`);
      return;
    }

    setPreparingSigningDetails(true);
    try {
      const [auth, effectiveCommission, amount] = await publicClient.readContract({
        address: controller.address,
        abi: controller.abi,
        functionName: "signingConfigFor",
        args: [address, nextSaltSeed],
      } as never) as readonly [Address, bigint, bigint];
      setExpectedAuthAddress(auth);
      setCommission(effectiveCommission);
      setRegistrationAmount(amount);
      setSigningRequest(createValidatorSigningRequest({
        chainId: protocolChain.id,
        operator: address,
        saltSeed: nextSaltSeed,
        authAddress: auth,
        amount: amount.toString(),
        commission: effectiveCommission.toString(),
      }));
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Could not load validator signing details.");
    } finally {
      setPreparingSigningDetails(false);
    }
  }

  async function copySigningRequest() {
    if (!signingRequest) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(signingRequest, null, 2));
      setRequestCopied(true);
      setCreationError(null);
    } catch {
      setCreationError("Clipboard access was unavailable. Select and copy the signing data shown below.");
    }
  }

  function validatePastedSigningMessage() {
    setCreationError(null);
    setRegistrationArtifact(null);
    if (!signedMessageInput.trim() || !signingRequest) {
      setCreationError("Generate the Quevra signing data, then paste the signed message here.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(signedMessageInput);
      const validated = validateRegistrationArtifact(parsed, signingRequest);
      setRegistrationArtifact(validated);
      setNewValidatorStep(5);
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Could not validate the signed message.");
    }
  }

  async function refreshRegistrationConfig() {
    if (!address || !saltSeed || chain?.id !== protocolChain.id || !publicClient) throw new Error(`Reconnect the operator wallet to ${protocolChain.name} before submitting.`);
    const controller = getContractConfig(protocolChain.id, "StakingController");
    if (!controller?.address) throw new Error(`The staking controller is not configured for ${protocolChain.name}.`);
    const [auth, freshCommission, amount] = await publicClient.readContract({
      address: controller.address,
      abi: controller.abi,
      functionName: "signingConfigFor",
      args: [address, saltSeed],
    } as never) as readonly [Address, bigint, bigint];
    return createValidatorSigningRequest({
      chainId: protocolChain.id,
      operator: address,
      saltSeed,
      authAddress: auth,
      amount: amount.toString(),
      commission: freshCommission.toString(),
    });
  }

  const validatorSteps = () => {
    if (!saltSeed) throw new Error("Generate a vault salt before creating the validator.");
    if (validatorMode === "existing") {
      if (!validExistingId) throw new Error("Enter a valid Monad validator ID.");
      return [makeContractWriteStep({
        key: "create-existing-validator",
        label: "Create validator identity",
        contractName: "VeValidator",
        functionName: "createExistingValidator",
        args: [BigInt(validatorId), saltSeed],
        displayLabelBtn: true,
      })];
    }

    if (!expectedAuthAddress || !registrationArtifact) {
      throw new Error("Import a valid signed registration artifact before submitting.");
    }
    const registrationCall = validatorRegistrationCall(registrationArtifact);
    return [makeContractWriteStep({
      key: "create-new-validator",
      label: "Create validator identity",
      contractName: "VeValidator",
      functionName: registrationCall.functionName,
      args: registrationCall.args,
      displayLabelBtn: true,
    })];
  };

  function submitValidator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreationError(null);
    if (!canCreateValidator) return;
    if (validatorMode === "new") {
      const artifact = registrationArtifact;
      if (!artifact) {
        setCreationError("Import a valid signed registration artifact before submitting.");
        return;
      }
      void refreshRegistrationConfig().then((currentRequest) => submitValidatedRegistration(
        artifact,
        currentRequest,
        async () => { await transactionButton.current?.run(); },
      )).catch((error) => {
        setCreationError(error instanceof Error ? error.message : "Could not refresh the signed registration parameters.");
      });
      return;
    }
    void transactionButton.current?.run();
  }

  function refreshIndexedActivity() {
    void queryClient.invalidateQueries({ queryKey: ["quevra-directory", address?.toLowerCase()] });
    void queryClient.invalidateQueries({ queryKey: ["quevra-activity", address?.toLowerCase()] });
  }

  function resetValidatorForm(mode: ValidatorMode) {
    setValidatorMode(mode);
    setNewValidatorStep(1);
    setSaltSeed("");
    setExpectedAuthAddress(null);
    setRegistrationAmount(null);
    setCommission(null);
    setRegistrationArtifact(null);
    setSignedMessageInput("");
    setRequestCopied(false);
    setSigningRequest(null);
    setCreationError(null);
  }

  const transactionsPanel = (
    <TransactionsPanel
      activityQueryError={activityQuery.isError}
      activityQueryPending={activityQuery.isPending}
      isConnected={isConnected}
      recentTransactions={recentTransactions}
      compact
    />
  );

  return (
    <div className="qv:relative qv:mx-auto qv:w-full qv:min-w-0 qv:max-w-[1510px]">
      <div className="qv:flex qv:min-w-0 qv:flex-col qv:gap-4 qv:xl:flex-row qv:xl:items-start qv:xl:gap-5">
        <div className="qv:min-w-0 qv:flex-1 qv:space-y-5">
          <header className="qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
            <div>
              <div className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:tracking-[0.13em] qv:text-[#9e91eb]">
                <span className="qv:size-1.5 qv:rounded-full qv:bg-[#52ddc3]" /> QUEVRA · {protocolChain.name.toUpperCase()}
              </div>
              <h1 className="qv:mb-1.5 qv:mt-3 qv:text-[26px] qv:font-semibold qv:tracking-[-0.045em] qv:text-[#f2f2f8] qv:sm:text-[34px]">Your onchain portfolio</h1>
              <p className="qv:m-0 qv:max-w-[420px] qv:text-[11px] qv:leading-relaxed qv:text-[#b0b3c3] qv:sm:text-[13px]">
                Track staking, rewards, and gauge activity from one place.
              </p>
            </div>
            <button
              className="qv:inline-flex qv:h-10 qv:items-center qv:gap-2 qv:rounded-lg qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#d7d3eb] qv:xl:hidden"
              onClick={() => setTransactionsOpen(true)}
              type="button"
            >
              <PanelRight size={14} /> Transactions
            </button>
          </header>

          <div className="qv:overflow-x-auto qv:border-b qv:border-white/[0.075]">
            <div aria-label="Dashboard views" className="qv:flex qv:min-w-0 qv:items-end qv:gap-1" role="tablist">
              <DashboardTabButton
                active={dashboardTab === "portfolio"}
                badge={directoryQuery.isPending ? undefined : String(indexedVeMonPositions.length)}
                label="Your portfolio"
                onClick={() => setDashboardTab("portfolio")}
                value={lockedMonLabel}
              />
              <DashboardTabButton
                active={dashboardTab === "validators"}
                badge={directoryQuery.isPending ? undefined : String(indexedValidators.length)}
                label="Validators"
                onClick={() => setDashboardTab("validators")}
                value={directoryQuery.isPending ? "—" : `${indexedValidators.length} identities`}
              />
              <div className="qv:ml-auto qv:hidden qv:pb-3 qv:sm:block">
                <Link className={softButtonClass} href={dashboardTab === "validators" ? "/validators" : "/lock"}>
                  <Plus size={12} />
                  {dashboardTab === "validators" ? "Open my validators" : "Lock MON"}
                </Link>
              </div>
            </div>
          </div>

          {dashboardTab === "portfolio" ? (
            <PortfolioTab
              activityPending={activityQuery.isPending}
              activityError={activityQuery.isError}
              chainOk={chain?.id === protocolChain.id}
              indexedActivities={indexedActivities}
              indexedVeMonPositions={indexedVeMonPositions}
              isConnected={isConnected}
              lockedMonLabel={lockedMonLabel}
              metrics={portfolioMetrics}
              pending={directoryQuery.isPending}
            />
          ) : (
            <ValidatorsTab
              canCreateValidator={canCreateValidator}
              canPrepareSigning={Boolean(address && chain?.id === protocolChain.id)}
              commission={commission}
              creationError={creationError}
              expectedAuthAddress={expectedAuthAddress}
              indexedValidators={indexedValidators}
              metrics={validatorMetrics}
              newValidatorStep={newValidatorStep}
              pending={directoryQuery.isPending}
              preparingSigningDetails={preparingSigningDetails}
              registrationAmount={registrationAmount}
              registrationArtifact={registrationArtifact}
              requestCopied={requestCopied}
              saltSeed={Boolean(saltSeed)}
              signedMessageInput={signedMessageInput}
              signingRequest={signingRequest}
              transactionButton={transactionButton}
              validatorId={validatorId}
              validatorMode={validatorMode}
              onCopySigningRequest={() => void copySigningRequest()}
              onPrepareValidatorDetails={() => void prepareValidatorDetails()}
              onRefreshIndexedActivity={refreshIndexedActivity}
              onResetValidatorForm={resetValidatorForm}
              onSetNewValidatorStep={setNewValidatorStep}
              onSetSignedMessageInput={(value) => {
                setSignedMessageInput(value);
                setRegistrationArtifact(null);
                setCreationError(null);
              }}
              onSetValidatorId={setValidatorId}
              onSubmitValidator={submitValidator}
              onValidatePastedSigningMessage={validatePastedSigningMessage}
              validatorSteps={validatorSteps}
            />
          )}

          <div className="qv:xl:hidden">
            <TransactionsPanel
              activityQueryError={activityQuery.isError}
              activityQueryPending={activityQuery.isPending}
              isConnected={isConnected}
              recentTransactions={recentTransactions}
            />
          </div>
        </div>

        <aside className={`${panelClass} qv:sticky qv:top-5 qv:hidden qv:w-[320px] qv:shrink-0 qv:self-start qv:p-5 qv:xl:block qv:2xl:w-[360px]`}>
          {transactionsPanel}
        </aside>
      </div>

      {transactionsOpen ? (
        <div className="qv:fixed qv:inset-0 qv:z-40 qv:xl:hidden">
          <button aria-label="Close transactions panel" className="qv:absolute qv:inset-0 qv:bg-black/55" onClick={() => setTransactionsOpen(false)} type="button" />
          <aside className="qv:absolute qv:inset-y-0 qv:right-0 qv:flex qv:w-[min(100%,360px)] qv:flex-col qv:border-l qv:border-white/[0.075] qv:bg-[#12141d] qv:p-5 qv:shadow-[-20px_0_50px_rgba(0,0,0,0.35)]">
            <div className="qv:mb-4 qv:flex qv:items-center qv:justify-between">
              <span className="qv:text-[11px] qv:font-semibold qv:text-[#e9e9f1]">Transactions</span>
              <button className="qv:grid qv:size-8 qv:place-items-center qv:rounded-md qv:border qv:border-white/10 qv:text-[#c5bbff]" onClick={() => setTransactionsOpen(false)} type="button">
                <X size={14} />
              </button>
            </div>
            <div className="qv:min-h-0 qv:flex-1 qv:overflow-y-auto">{transactionsPanel}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function DashboardTabButton({
  active,
  badge,
  label,
  onClick,
  value,
}: {
  active: boolean;
  badge?: string;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      aria-selected={active}
      className={`qv:relative qv:min-w-[150px] qv:shrink-0 qv:border-b-2 qv:px-3 qv:pb-3 qv:pt-1 qv:text-left qv:transition-colors ${active ? "qv:border-[#8c76ff] qv:text-[#f2f2f8]" : "qv:border-transparent qv:text-[#9294a5] qv:hover:text-[#d7d3eb]"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span className="qv:flex qv:items-center qv:gap-2">
        <span className="qv:text-[12px] qv:font-semibold">{label}</span>
        {badge !== undefined ? (
          <span className={`qv:rounded-full qv:px-1.5 qv:py-0.5 qv:text-[9px] qv:font-bold ${active ? "qv:bg-[rgba(82,221,195,0.16)] qv:text-[#8de5d4]" : "qv:bg-white/[0.06] qv:text-[#aeb0c0]"}`}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="qv:mt-1 qv:block qv:text-[10px] qv:text-[#9295a7]">{value}</span>
    </button>
  );
}

function PortfolioTab({
  activityError,
  activityPending,
  chainOk,
  indexedActivities,
  indexedVeMonPositions,
  isConnected,
  lockedMonLabel,
  metrics,
  pending,
}: {
  activityError: boolean;
  activityPending: boolean;
  chainOk: boolean;
  indexedActivities: WalletActivity[];
  indexedVeMonPositions: HolderPosition[];
  isConnected: boolean;
  lockedMonLabel: string;
  metrics: Array<{ label: string; value: string; note: string; icon: typeof Wallet; trend: "neutral" | "up" }>;
  pending: boolean;
}) {
  return (
    <div className="qv:space-y-5">
      <section aria-label="Portfolio overview" className="qv:relative qv:min-h-[180px] qv:overflow-hidden qv:rounded-[17px] qv:border qv:border-[rgba(172,152,255,0.24)] qv:bg-[linear-gradient(112deg,#282052_0%,#242044_43%,#172933_100%)] qv:px-[19px] qv:py-5 qv:shadow-[0_20px_55px_rgba(0,0,0,0.16)] qv:sm:min-h-[206px] qv:sm:px-[29px] qv:sm:py-6">
        <div className="qv:relative qv:z-10 qv:flex qv:flex-wrap qv:items-center qv:justify-between qv:gap-x-3 qv:gap-y-2">
          <div className="qv:flex qv:min-w-0 qv:items-center qv:gap-3">
            <span className="qv:block qv:text-xs qv:text-[#c1bbdf]">Your portfolio balance</span>
            <span className="qv:inline-flex qv:items-center qv:gap-1.5 qv:rounded-full qv:border qv:border-[rgba(82,221,195,0.22)] qv:px-2 qv:py-1 qv:text-[9px] qv:font-bold qv:tracking-[0.08em] qv:text-[#8de5d4]">
              <span className="qv:size-[5px] qv:rounded-full qv:bg-[#52ddc3]" /> {protocolChain.testnet ? "TESTNET" : "MAINNET"}
            </span>
          </div>
          <span className="qv:ml-auto qv:text-right qv:text-[9px] qv:text-[rgba(238,236,248,0.88)] qv:sm:text-[11px]">{`${protocolChain.name} · chain ${protocolChain.id}`}</span>
        </div>
        <div className="qv:relative qv:z-10 qv:mt-7 qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
          <div className="qv:min-w-0">
            <span className="qv:block qv:text-xs qv:text-[#c1bbdf]">Locked MON</span>
            <div className="qv:my-1.5 qv:text-[28px] qv:font-semibold qv:tracking-[-0.045em] qv:text-white qv:sm:text-[38px]">
              {isConnected ? lockedMonLabel : "Connect wallet"}
            </div>
            <span className="qv:block qv:text-[9px] qv:text-[rgba(238,236,248,0.88)] qv:sm:text-[11px]">
              {isConnected
                ? pending
                  ? "Loading veMON positions…"
                  : `${indexedVeMonPositions.length} veMON position${indexedVeMonPositions.length === 1 ? "" : "s"} on ${protocolChain.name}`
                : "Connect to view your locked MON balance"}
            </span>
          </div>
          <div className="qv:flex qv:flex-wrap qv:gap-2">
            <Link className={primaryButtonClass} href="/lock">Lock MON</Link>
            <Link className={softButtonClass} href="/stake">Manage stake</Link>
            <Link className={`${softButtonClass} qv:hidden qv:sm:inline-flex`} href="/rewards">Open rewards</Link>
          </div>
        </div>
        <div aria-hidden="true" className="qv:absolute qv:-right-[6%] qv:-top-[145px] qv:size-[260px] qv:rounded-full qv:border qv:border-[rgba(200,190,255,0.08)]" />
        <div aria-hidden="true" className="qv:absolute qv:-right-[2%] qv:-top-[205px] qv:size-[330px] qv:rounded-full qv:border qv:border-[rgba(200,190,255,0.08)]" />
      </section>

      <section aria-label="Portfolio metrics" className="qv:grid qv:grid-cols-1 qv:gap-2.5 qv:min-[520px]:grid-cols-2 qv:sm:gap-[15px]">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section className={`${panelClass} qv:p-[17px_15px] qv:sm:p-5`}>
        <div className="qv:flex qv:flex-wrap qv:items-start qv:justify-between qv:gap-3">
          <div>
            <span className={kickerClass}>HOLDER JOURNEY</span>
            <h2 className={panelTitleClass}>Lock → stake → earn → exit</h2>
            <p className="qv:mt-1 qv:max-w-[640px] qv:text-[11px] qv:leading-[1.65] qv:text-[#b0b2c2]">
              Follow the Quevra product path. Allocations are your validator vote; incentives and native staking rewards accrue by cycle.
            </p>
          </div>
          <div className="qv:flex qv:flex-wrap qv:gap-2">
            <Link className={softButtonClass} href="/rewards">Open rewards <ArrowRight size={12} /></Link>
            <Link className={primaryButtonClass} href="/stake">Manage stake <ArrowRight size={12} /></Link>
          </div>
        </div>
        <ol className="qv:mt-4 qv:grid qv:gap-2 qv:sm:grid-cols-2 qv:xl:grid-cols-3">
          {[
            { step: "1", title: "Lock MON", done: indexedVeMonPositions.length > 0, href: "/lock", detail: "Create a veMON position" },
            { step: "2", title: "Back validators", done: indexedVeMonPositions.length > 0, href: "/stake", detail: "Allocate principal to vaults" },
            { step: "3", title: "Vote by staking", done: indexedVeMonPositions.length > 0, href: "/stake", detail: "Allocation weight is your vote" },
            { step: "4", title: "Earn & claim", done: false, href: "/rewards", detail: "Native MON + ERC-20 incentives" },
            { step: "5", title: "Reallocate / poke", done: false, href: "/stake", detail: "Once per Quevra cycle" },
            { step: "6", title: "Exit cleanly", done: false, href: "/exit", detail: "Unstake, claim bribes, then redeem" },
          ].map((item) => (
            <li key={item.step}>
              <Link className="qv:flex qv:items-start qv:gap-3 qv:rounded-lg qv:border qv:border-white/[0.06] qv:bg-[#0e1018] qv:p-3 qv:no-underline qv:transition qv:hover:border-[rgba(141,120,255,0.35)]" href={item.href}>
                <span className={`qv:mt-0.5 qv:grid qv:size-6 qv:shrink-0 qv:place-items-center qv:rounded-full qv:text-[10px] qv:font-bold ${item.done ? "qv:bg-[rgba(82,221,195,0.16)] qv:text-[#8de5d4]" : "qv:bg-[rgba(141,120,255,0.14)] qv:text-[#c5bbff]"}`}>
                  {item.done ? <Check size={12} /> : item.step}
                </span>
                <span className="qv:min-w-0">
                  <span className="qv:block qv:text-[12px] qv:font-semibold qv:text-[#e9e9f1]">{item.title}</span>
                  <span className="qv:mt-0.5 qv:block qv:text-[9px] qv:leading-4 qv:text-[#9295a7]">{item.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
        <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
          <div>
            <span className={kickerClass}>POSITIONS</span>
            <h2 className={panelTitleClass}>Your veMON summary</h2>
          </div>
          <span className="qv:rounded-md qv:border qv:border-white/[0.075] qv:px-[9px] qv:py-1.5 qv:text-[10px] qv:text-[#a3a5b5]">Your account</span>
        </div>
        <div className="qv:mt-4 qv:space-y-2">
          {!isConnected ? <EmptyNote>Connect your wallet to view Quevra positions.</EmptyNote> : null}
          {isConnected && !chainOk ? <EmptyNote tone="warn">Switch to {protocolChain.name} to view position activity.</EmptyNote> : null}
          {isConnected && chainOk && pending ? <EmptyNote>Loading veMON positions…</EmptyNote> : null}
          {isConnected && chainOk && !pending && indexedVeMonPositions.length === 0 ? <EmptyNote>No veMON positions found for this wallet.</EmptyNote> : null}
          {indexedVeMonPositions.map((position) => (
            <div className="qv:flex qv:min-w-0 qv:flex-wrap qv:items-center qv:justify-between qv:gap-3 qv:rounded-lg qv:border qv:border-white/[0.055] qv:bg-[#0e1018] qv:px-3 qv:py-3" key={position.id}>
              <div className="qv:min-w-0">
                <strong className="qv:block qv:text-[12px] qv:text-[#e9e9f1]">veMON #{position.tokenId}</strong>
                <span className="qv:mt-0.5 qv:block qv:text-[10px] qv:text-[#a9acbd]">
                  {Number(formatEther(BigInt(position.amount))).toLocaleString(undefined, { maximumFractionDigits: 4 })} MON · {position.permanent ? "permanent lock" : `unlock epoch ${position.unlockEpoch ?? "—"}`}
                </span>
              </div>
              <Link className={softButtonClass} href="/stake">Allocate</Link>
            </div>
          ))}
        </div>
        <div className="qv:mt-4 qv:rounded-lg qv:border qv:border-white/[0.055] qv:bg-[#0e1018] qv:p-3">
          <p className="qv:text-[10px] qv:font-semibold qv:text-[#d7d0ff]">Recent position activity</p>
          <div className="qv:mt-2 qv:space-y-1.5">
            {!isConnected ? <EmptyNote>Connect your wallet to view Quevra activity.</EmptyNote> : null}
            {isConnected && !chainOk ? <EmptyNote tone="warn">Switch to {protocolChain.name} to view position activity.</EmptyNote> : null}
            {isConnected && chainOk && activityPending ? <EmptyNote>Loading recent position activity…</EmptyNote> : null}
            {isConnected && chainOk && activityError ? <EmptyNote tone="warn">Could not read recent position activity from Monad RPC.</EmptyNote> : null}
            {isConnected && chainOk && !activityPending && !activityError && indexedActivities.length === 0 ? <EmptyNote>No veNFT activity found for this wallet.</EmptyNote> : null}
            {indexedActivities.slice(0, 4).map((activity) => (
              <div className="qv:flex qv:items-center qv:justify-between qv:gap-3 qv:rounded-md qv:border qv:border-white/[0.04] qv:px-2.5 qv:py-2" key={activity.id}>
                <span className="qv:min-w-0 qv:truncate qv:text-[10px] qv:text-[#d5d5e0]">{activityDescription(activity)}</span>
                <span className="qv:shrink-0 qv:text-[9px] qv:text-[#9b9eb0]">Block {activity.blockNumber}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ValidatorsTab({
  canCreateValidator,
  canPrepareSigning,
  commission,
  creationError,
  expectedAuthAddress,
  indexedValidators,
  metrics,
  newValidatorStep,
  pending,
  preparingSigningDetails,
  registrationAmount,
  registrationArtifact,
  requestCopied,
  saltSeed,
  signedMessageInput,
  signingRequest,
  transactionButton,
  validatorId,
  validatorMode,
  onCopySigningRequest,
  onPrepareValidatorDetails,
  onRefreshIndexedActivity,
  onResetValidatorForm,
  onSetNewValidatorStep,
  onSetSignedMessageInput,
  onSetValidatorId,
  onSubmitValidator,
  onValidatePastedSigningMessage,
  validatorSteps,
}: {
  canCreateValidator: boolean;
  canPrepareSigning: boolean;
  commission: bigint | null;
  creationError: string | null;
  expectedAuthAddress: Address | null;
  indexedValidators: HolderValidator[];
  metrics: Array<{ label: string; value: string; note: string; icon: typeof Wallet; trend: "neutral" | "up" }>;
  newValidatorStep: NewValidatorStep;
  pending: boolean;
  preparingSigningDetails: boolean;
  registrationAmount: bigint | null;
  registrationArtifact: ValidatorRegistrationArtifact | null;
  requestCopied: boolean;
  saltSeed: boolean;
  signedMessageInput: string;
  signingRequest: ValidatorSigningRequest | null;
  transactionButton: RefObject<TransactionButtonHandle | null>;
  validatorId: string;
  validatorMode: ValidatorMode;
  onCopySigningRequest: () => void;
  onPrepareValidatorDetails: () => void;
  onRefreshIndexedActivity: () => void;
  onResetValidatorForm: (mode: ValidatorMode) => void;
  onSetNewValidatorStep: (step: NewValidatorStep) => void;
  onSetSignedMessageInput: (value: string) => void;
  onSetValidatorId: (value: string) => void;
  onSubmitValidator: (event: FormEvent<HTMLFormElement>) => void;
  onValidatePastedSigningMessage: () => void;
  validatorSteps: () => ReturnType<typeof makeContractWriteStep>[];
}) {
  return (
    <div className="qv:space-y-5">
      <section aria-label="Validator overview" className="qv:relative qv:min-h-[160px] qv:overflow-hidden qv:rounded-[17px] qv:border qv:border-[rgba(82,221,195,0.18)] qv:bg-[linear-gradient(112deg,#17302c_0%,#1a2438_48%,#241f45_100%)] qv:px-[19px] qv:py-5 qv:sm:px-[29px] qv:sm:py-6">
        <div className="qv:relative qv:z-10 qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
          <div>
            <span className="qv:block qv:text-xs qv:text-[#b7d9d1]">Validator summary</span>
            <div className="qv:my-1.5 qv:text-[28px] qv:font-semibold qv:tracking-[-0.045em] qv:text-white qv:sm:text-[34px]">
              {pending ? "—" : `${indexedValidators.length} identit${indexedValidators.length === 1 ? "y" : "ies"}`}
            </div>
            <span className="qv:block qv:text-[10px] qv:text-[rgba(238,236,248,0.88)]">
              Create and manage veValidator identities, vaults, gauges, and bribe contracts.
            </span>
          </div>
          <div className="qv:flex qv:flex-wrap qv:gap-2">
            <Link className={primaryButtonClass} href="/validators">Open my validators</Link>
            <Link className={softButtonClass} href="/incentives">Fund bribes</Link>
          </div>
        </div>
      </section>

      <section aria-label="Validator metrics" className="qv:grid qv:grid-cols-1 qv:gap-2.5 qv:min-[520px]:grid-cols-2 qv:sm:gap-[15px]">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
        <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
          <div>
            <span className={kickerClass}>YOUR VALIDATORS</span>
            <h2 className={panelTitleClass}>Owned identities</h2>
          </div>
          <span className="qv:inline-flex qv:items-center qv:gap-1 qv:rounded-md qv:border qv:border-[rgba(82,221,195,0.15)] qv:px-2 qv:py-1.5 qv:text-[9px] qv:text-[#87daca]"><Gauge size={15} /> veValidator</span>
        </div>
        <div className="qv:mt-4 qv:space-y-2">
          {pending ? <EmptyNote>Loading validator identities…</EmptyNote> : null}
          {!pending && indexedValidators.length === 0 ? <EmptyNote>No validator identities owned by this wallet yet.</EmptyNote> : null}
          {indexedValidators.map((validator) => (
            <div className="qv:rounded-lg qv:border qv:border-white/[0.055] qv:bg-[#0e1018] qv:p-3" key={validator.id}>
              <div className="qv:flex qv:flex-wrap qv:items-start qv:justify-between qv:gap-3">
                <div>
                  <strong className="qv:block qv:text-[12px] qv:text-[#e9e9f1]">veValidator #{validator.tokenId}</strong>
                  <span className="qv:mt-0.5 qv:block qv:text-[10px] qv:text-[#a9acbd]">
                    Monad ID {validator.validatorId ?? "pending"} · operator {shortAddress(validator.operator)}
                  </span>
                </div>
                <Link className={softButtonClass} href="/validators">Manage</Link>
              </div>
              <div className="qv:mt-2 qv:grid qv:gap-1 qv:text-[9px] qv:text-[#9295a7] qv:sm:grid-cols-3">
                <span className="qv:truncate">Vault {shortAddress(validator.vault)}</span>
                <span className="qv:truncate">Gauge {shortAddress(validator.gauge)}</span>
                <span className="qv:truncate">Bribe {shortAddress(validator.bribe)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
        <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
          <div>
            <span className={kickerClass}>VALIDATOR ONBOARDING</span>
            <h2 className={panelTitleClass}>Create a validator</h2>
          </div>
          <span className="qv:inline-flex qv:items-center qv:gap-1 qv:rounded-md qv:border qv:border-[rgba(82,221,195,0.15)] qv:px-2 qv:py-1.5 qv:text-[9px] qv:text-[#87daca]"><Gauge size={15} /> veValidator</span>
        </div>
        <p className="qv:mb-4 qv:mt-3 qv:max-w-[490px] qv:text-[11px] qv:leading-[1.65] qv:text-[#b0b2c2]">
          Create a soulbound veValidator identity with its own staking vault, validator gauge, and bribe rewards contract.
        </p>
        <div aria-label="Validator type" className="qv:mb-4 qv:grid qv:grid-cols-2 qv:gap-2" role="tablist">
          {(["new", "existing"] as const).map((mode) => (
            <button
              aria-selected={validatorMode === mode}
              className={`qv:min-h-10 qv:rounded-lg qv:border qv:px-3 qv:text-[10px] qv:font-semibold qv:transition-colors ${validatorMode === mode ? "qv:border-[rgba(141,120,255,0.5)] qv:bg-[rgba(141,120,255,0.14)] qv:text-[#d7d0ff]" : "qv:border-white/10 qv:bg-[#0e1018] qv:text-[#9294a5] qv:hover:text-white"}`}
              key={mode}
              onClick={() => onResetValidatorForm(mode)}
              role="tab"
              type="button"
            >
              {mode === "existing" ? "Existing validator" : "New validator"}
            </button>
          ))}
        </div>
        <form className="qv:flex qv:flex-col qv:gap-[9px]" onSubmit={onSubmitValidator}>
          {validatorMode === "existing" ? (
            <>
              <label className={fieldLabelClass} htmlFor="validator-id">Monad validator ID</label>
              <input className={inputClass} id="validator-id" inputMode="numeric" min="1" max="18446744073709551615" pattern="[1-9][0-9]*" required placeholder="Enter an existing validator ID" value={validatorId} onChange={(event) => onSetValidatorId(event.target.value)} />
              <p className="qv:m-0 qv:text-[10px] qv:leading-relaxed qv:text-[#a9acbd]">The contract checks that this validator exists on Monad before creating the linked Quevra identity.</p>
              <p className="qv:m-0 qv:text-[10px] qv:leading-relaxed qv:text-[#e6b971]">Existing validator onboarding does not yet prove that you control its native auth address.</p>
            </>
          ) : (
            <div className="qv:space-y-2.5">
              <div className="qv:flex qv:items-center qv:justify-between qv:gap-3 qv:text-[9px] qv:text-[#aeb1c1]" aria-live="polite">
                <span>New validator setup</span>
                <span>Step {newValidatorStep} of 5</span>
              </div>
              {newValidatorStep === 1 ? (
                <article className="qv:grid qv:gap-2 qv:rounded-lg qv:border qv:border-white/[0.075] qv:bg-[#0e1018] qv:p-3">
                  <strong className="qv:text-[10px] qv:text-[#d5d5e0]">Step 1 · Prepare your Monad consensus keys</strong>
                  <p className="qv:m-0 qv:text-[9px] qv:leading-relaxed qv:text-[#aeb1c1]">If you already operate a validator, keep using its SECP256K1 and BLS keystores. To create new keys, use the Docker-backed wrapper for Monad’s official <code className="qv:text-[#c5bbff]">monad-keystore</code>. It prompts for the encryption password and stores keys outside the repo at <code>~/.quevra/validator/</code>.</p>
                  <pre className="qv:m-0 qv:overflow-x-auto qv:rounded-md qv:bg-[#090b11] qv:p-2.5 qv:text-[9px] qv:leading-relaxed qv:text-[#c5bbff]">{`pnpm --filter @quevra/ops keystore:build
pnpm --filter @quevra/ops keystore:create
pnpm --filter @quevra/ops keystore:public`}</pre>
                  <p className="qv:m-0 qv:text-[9px] qv:leading-relaxed qv:text-[#e6b971]">The public command prints public keys only. Keep encrypted keystores and the password on the operator machine; never paste private material into this app.</p>
                  <button className="qv:mt-1 qv:min-h-9 qv:rounded-md qv:border qv:border-[rgba(141,120,255,0.35)] qv:bg-[rgba(141,120,255,0.08)] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff]" onClick={() => onSetNewValidatorStep(2)} type="button">I have my keys · Continue</button>
                </article>
              ) : null}

              {newValidatorStep === 2 ? (
                <article className="qv:grid qv:gap-2 qv:rounded-lg qv:border qv:border-white/[0.075] qv:bg-[#0e1018] qv:p-3">
                  <strong className="qv:text-[10px] qv:text-[#d5d5e0]">Step 2 · Copy Quevra’s signing data</strong>
                  <p className="qv:m-0 qv:text-[9px] qv:leading-relaxed qv:text-[#aeb1c1]">Generate the request below. It contains the network, operator, salt, auth address, stake amount, and commission read from Quevra’s contracts. Copy it into a JSON file on the operator machine; do not change these values.</p>
                  <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff] qv:disabled:opacity-40" disabled={preparingSigningDetails || !canPrepareSigning} onClick={onPrepareValidatorDetails} type="button">{preparingSigningDetails ? "Reading Quevra contracts…" : signingRequest ? "Generate fresh signing data" : "Generate signing data"}</button>
                  <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff] qv:disabled:opacity-40" disabled={!signingRequest} onClick={onCopySigningRequest} type="button">{requestCopied ? "Signing data copied" : "Copy signing data"}</button>
                  {signingRequest ? <textarea aria-label="Quevra signing data" className={`${inputClass} qv:h-[144px] qv:resize-y qv:py-2 qv:font-mono qv:text-[9px]`} readOnly value={JSON.stringify(signingRequest, null, 2)} /> : <p className="qv:m-0 qv:text-[9px] qv:text-[#a9acbd]">Generate signing data to continue.</p>}
                  {expectedAuthAddress ? <span className="qv:text-[9px] qv:text-[#9294a5]">Configured stake {registrationAmount !== null ? `${formatEther(registrationAmount)} MON` : "—"} · commission {commission?.toString() ?? "—"}</span> : null}
                  <div className="qv:flex qv:gap-2">
                    <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:px-3 qv:text-[10px] qv:text-[#9294a5]" onClick={() => onSetNewValidatorStep(1)} type="button">Back</button>
                    <button className="qv:min-h-9 qv:flex-1 qv:rounded-md qv:border qv:border-[rgba(141,120,255,0.35)] qv:bg-[rgba(141,120,255,0.08)] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff] qv:disabled:opacity-40" disabled={!signingRequest} onClick={() => onSetNewValidatorStep(3)} type="button">Continue to signing</button>
                  </div>
                </article>
              ) : null}

              {newValidatorStep === 3 ? (
                <article className="qv:grid qv:gap-2 qv:rounded-lg qv:border qv:border-white/[0.075] qv:bg-[#0e1018] qv:p-3">
                  <strong className="qv:text-[10px] qv:text-[#d5d5e0]">Step 3 · Sign with Monad’s official tools</strong>
                  <p className="qv:m-0 qv:text-[9px] qv:leading-relaxed qv:text-[#aeb1c1]">The Docker image built in Step 1 contains Monad’s official <a className="qv:text-[#c5bbff] qv:underline" href="https://github.com/monad-developers/staking-sdk-cli" rel="noreferrer" target="_blank">staking-sdk-cli</a> and keystore binary. From the Quevra repo root, save the copied request as <code>quevra-validator-request.json</code>; then run the signer (it uses that request file by default):</p>
                  <pre className="qv:m-0 qv:overflow-x-auto qv:rounded-md qv:bg-[#090b11] qv:p-2.5 qv:text-[9px] qv:leading-relaxed qv:text-[#c5bbff]">{`pnpm validator:sign`}</pre>
                  <p className="qv:m-0 qv:text-[9px] qv:leading-relaxed qv:text-[#a9acbd]">The signer prompts for the keystore password, or reads <code>KEYSTORE_PASSWORD</code> from the shell or repo-root <code>.env</code>. Docker runs offline with the encrypted keystores mounted read-only; recovered keys stay in the container’s memory and are never printed or saved. Only the public signed message is returned. Copy it into the next step.</p>
                  <div className="qv:flex qv:gap-2">
                    <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:px-3 qv:text-[10px] qv:text-[#9294a5]" onClick={() => onSetNewValidatorStep(2)} type="button">Back</button>
                    <button className="qv:min-h-9 qv:flex-1 qv:rounded-md qv:border qv:border-[rgba(141,120,255,0.35)] qv:bg-[rgba(141,120,255,0.08)] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff]" onClick={() => onSetNewValidatorStep(4)} type="button">I have signed · Continue</button>
                  </div>
                </article>
              ) : null}

              {newValidatorStep === 4 ? (
                <article className="qv:grid qv:gap-2 qv:rounded-lg qv:border qv:border-white/[0.075] qv:bg-[#0e1018] qv:p-3">
                  <strong className="qv:text-[10px] qv:text-[#d5d5e0]">Step 4 · Paste and validate the signed message</strong>
                  <label className={fieldLabelClass} htmlFor="validator-signed-message">Signed JSON message from the ops command</label>
                  <textarea className={`${inputClass} qv:min-h-[150px] qv:resize-y qv:py-2 qv:font-mono qv:text-[9px]`} id="validator-signed-message" placeholder="Paste the complete JSON message printed by pnpm validator:sign" value={signedMessageInput} onChange={(event) => onSetSignedMessageInput(event.target.value)} />
                  <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:bg-white/[0.035] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff] qv:disabled:opacity-40" disabled={!signingRequest || !signedMessageInput.trim()} onClick={onValidatePastedSigningMessage} type="button">Validate signed message</button>
                  {registrationArtifact ? <p className="qv:m-0 qv:text-[10px] qv:text-[#8de5d4]" role="status">Signed message verified for this network and current Quevra parameters. Both consensus signatures and the packed payload are valid.</p> : null}
                  <button className="qv:min-h-9 qv:rounded-md qv:border qv:border-white/10 qv:px-3 qv:text-[10px] qv:text-[#9294a5]" onClick={() => onSetNewValidatorStep(3)} type="button">Back to signing instructions</button>
                </article>
              ) : null}

              {newValidatorStep === 5 && registrationArtifact ? (
                <article className="qv:grid qv:gap-1 qv:rounded-lg qv:border qv:border-[rgba(82,221,195,0.16)] qv:bg-[rgba(82,221,195,0.035)] qv:p-3">
                  <strong className="qv:text-[10px] qv:text-[#d5d5e0]">Step 5 · Review before wallet submission</strong>
                  <span className="qv:break-all qv:font-mono qv:text-[9px] qv:text-[#b9bac8]">SECP256K1 public key: {registrationArtifact.secpPubkey}</span>
                  <span className="qv:break-all qv:font-mono qv:text-[9px] qv:text-[#b9bac8]">BLS public key: {registrationArtifact.blsPubkey}</span>
                  <span className="qv:text-[9px] qv:text-[#b9bac8]">Stake {formatEther(BigInt(registrationArtifact.amount))} MON · commission {registrationArtifact.commission}</span>
                  <span className="qv:break-all qv:font-mono qv:text-[9px] qv:text-[#a9acbd]">Auth {registrationArtifact.authAddress}</span>
                  <span className="qv:text-[9px] qv:leading-relaxed qv:text-[#9294a5]">Your connected wallet signs the Quevra <code>createValidator</code> transaction. It does not sign the Monad payload. This confirms Quevra registration only; Monad <code>addValidator</code> is not executed here.</span>
                  <button className="qv:mt-2 qv:min-h-9 qv:justify-self-start qv:rounded-md qv:border qv:border-white/10 qv:px-3 qv:text-[10px] qv:text-[#9294a5]" onClick={() => onSetNewValidatorStep(4)} type="button">Back to signed message</button>
                </article>
              ) : null}
            </div>
          )}
          {validatorMode === "existing" ? (
            <button
              className="qv:mt-1 qv:inline-flex qv:min-h-10 qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:border qv:border-[rgba(141,120,255,0.35)] qv:bg-[rgba(141,120,255,0.08)] qv:px-3 qv:text-[10px] qv:font-semibold qv:text-[#c5bbff] qv:transition qv:hover:bg-[rgba(141,120,255,0.15)] qv:disabled:cursor-wait qv:disabled:opacity-60"
              disabled={preparingSigningDetails}
              onClick={onPrepareValidatorDetails}
              type="button"
            >
              <Plus size={14} />{preparingSigningDetails ? "Loading signing parameters…" : "Generate vault salt"}
            </button>
          ) : null}
          {creationError ? <p className="qv:m-0 qv:break-words qv:text-[10px] qv:text-[#ff8293]" role="alert">{creationError}</p> : null}
          {(validatorMode === "existing" || newValidatorStep === 5) ? (
            <TransactionButton
              ref={transactionButton}
              className="qv:mt-0.5 qv:inline-flex qv:min-h-[42px] qv:w-full qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[11px] qv:font-semibold qv:text-white qv:shadow-[0_8px_20px_rgba(112,88,233,0.2)] qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-[0.46] qv:disabled:shadow-none"
              disabled={!canCreateValidator || preparingSigningDetails || (validatorMode === "existing" && !saltSeed)}
              icon={<Plus size={16} />}
              steps={validatorSteps}
              type="submit"
              onComplete={onRefreshIndexedActivity}
            >
              {validatorMode === "new" ? "Submit Quevra registration" : "Create validator identity"}
            </TransactionButton>
          ) : null}
        </form>
        <p className="qv:mb-0 qv:mt-3 qv:text-[9px] qv:leading-relaxed qv:text-[#a9acbd]">
          The transaction ends when Quevra confirms this registration. It creates the veValidator identity, vault, gauge, and bribe contract; a later Monad registration or validator activation is not performed here.
        </p>
      </section>
    </div>
  );
}

function EmptyNote({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" }) {
  return <p className={`qv:text-[10px] ${tone === "warn" ? "qv:text-[#e6b971]" : "qv:text-[#a9acbd]"}`}>{children}</p>;
}
