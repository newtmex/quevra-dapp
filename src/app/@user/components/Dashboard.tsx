"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { Activity, ArrowUpRight, ExternalLink, Gauge, Layers3, Sparkles, Wallet } from "lucide-react";
import { monadTestnet } from "@/lib/web3";
import { getDeploymentMetadata } from "@/contracts/shared";
import { makeContractWriteStep } from "@/lib/tx-flow/steps";
import TransactionButton, { type TransactionButtonHandle } from "@/lib/tx-flow/TransactionButton";

type RecentTransaction = { hash: `0x${string}`; tokenId: string };

const metricCards = [
  { label: "Your staked MON", value: "—", note: "Connect a wallet to view your positions", icon: Wallet, trend: "neutral" },
  { label: "Rewards available", value: "—", note: "Claimable rewards across your gauges", icon: Sparkles, trend: "up" },
  { label: "Your gauges", value: "—", note: "Gauges linked to your veValidator NFTs", icon: Gauge, trend: "neutral" },
] as const;

const panelClass = "qv:rounded-[14px] qv:border qv:border-white/[0.075] qv:bg-[#12141d]";
const panelTitleClass = "qv:mt-1.5 qv:text-[15px] qv:font-semibold qv:tracking-[-0.015em] qv:text-[#e9e9f1]";
const kickerClass = "qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:font-bold qv:tracking-[0.12em] qv:text-[#77798d]";
const emptyIconClass = "qv:grid qv:size-[38px] qv:place-items-center qv:rounded-xl qv:border qv:border-[rgba(141,120,255,0.18)] qv:bg-[rgba(141,120,255,0.09)] qv:text-[#9f8fff]";
const explorerLinkClass = "qv:inline-flex qv:items-center qv:gap-1 qv:text-[10px] qv:text-[#a99aff] qv:no-underline qv:hover:text-white";

export default function Dashboard() {
  const { isConnected } = useAccount();
  const transactionButton = useRef<TransactionButtonHandle>(null);
  const [tokenId, setTokenId] = useState("");
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const deployment = getDeploymentMetadata(monadTestnet.id);
  const rewardToken = deployment?.config.rewardToken;

  function submitGauge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[1-9]\d*$/.test(tokenId)) return;
    void transactionButton.current?.run();
  }

  const gaugeSteps = () => {
    if (!rewardToken) throw new Error("The reward token is not configured for this deployment.");
    return [makeContractWriteStep({
      key: "create-validator-gauge",
      label: "Create validator gauge",
      contractName: "ValidatorsVoter",
      functionName: "createBoostGauge",
      args: [BigInt(tokenId), rewardToken],
      displayLabelBtn: true,
    })];
  };

  return (
    <div className="qv:mx-auto qv:w-full qv:min-w-0 qv:max-w-[1260px] qv:space-y-5">
      <header className="qv:mb-6 qv:flex qv:items-end qv:justify-between qv:gap-5">
        <div>
          <div className="qv:flex qv:items-center qv:gap-2 qv:text-[10px] qv:font-bold qv:tracking-[0.13em] qv:text-[#9e91eb]"><span className="qv:size-1.5 qv:rounded-full qv:bg-[#52ddc3]" /> QUEVRA · MONAD TESTNET</div>
          <h1 className="qv:mb-1.5 qv:mt-3 qv:text-[26px] qv:font-semibold qv:tracking-[-0.045em] qv:text-[#f2f2f8] qv:sm:text-[34px]">Your onchain portfolio</h1>
          <p className="qv:m-0 qv:max-w-[265px] qv:text-[11px] qv:leading-relaxed qv:text-[#888b9e] qv:sm:max-w-none qv:sm:text-[13px]">Track staking, rewards, and gauge activity from one place.</p>
        </div>
      </header>

      <section aria-label="Portfolio overview" className="qv:relative qv:min-h-[180px] qv:overflow-hidden qv:rounded-[17px] qv:border qv:border-[rgba(172,152,255,0.24)] qv:bg-[linear-gradient(112deg,#282052_0%,#242044_43%,#172933_100%)] qv:px-[19px] qv:py-5 qv:shadow-[0_20px_55px_rgba(0,0,0,0.16)] qv:sm:min-h-[206px] qv:sm:px-[29px] qv:sm:py-6">
        <div className="qv:relative qv:z-10 qv:flex qv:flex-wrap qv:items-center qv:justify-between qv:gap-x-3 qv:gap-y-2">
          <div className="qv:flex qv:min-w-0 qv:items-center qv:gap-3">
            <span className="qv:block qv:text-xs qv:text-[#c1bbdf]">Portfolio overview</span>
            <span className="qv:inline-flex qv:items-center qv:gap-1.5 qv:rounded-full qv:border qv:border-[rgba(82,221,195,0.22)] qv:px-2 qv:py-1 qv:text-[9px] qv:font-bold qv:tracking-[0.08em] qv:text-[#8de5d4]"><span className="qv:size-[5px] qv:rounded-full qv:bg-[#52ddc3]" /> TESTNET</span>
          </div>
          <span className="qv:ml-auto qv:text-right qv:text-[9px] qv:text-[rgba(219,217,235,0.61)] qv:sm:text-[11px]">Monad · chain 10143</span>
        </div>
        <div className="qv:relative qv:z-10 qv:mt-7 qv:flex qv:flex-wrap qv:items-end qv:justify-between qv:gap-4">
          <div className="qv:min-w-0">
            <span className="qv:block qv:text-xs qv:text-[#c1bbdf]">Connected positions</span>
            <div className="qv:my-1.5 qv:text-[28px] qv:font-semibold qv:tracking-[-0.045em] qv:text-white qv:sm:text-[38px]">{isConnected ? "—" : "Connect wallet"}</div>
            <span className="qv:block qv:text-[9px] qv:text-[rgba(219,217,235,0.61)] qv:sm:text-[11px]">Your Quevra staking and gauge positions</span>
          </div>
          <div aria-hidden="true" className="qv:relative qv:hidden qv:h-[94px] qv:w-[115px] qv:items-center qv:justify-center qv:text-[rgba(238,233,255,0.78)] qv:sm:flex">
            <span className="qv:z-10 qv:text-[58px] qv:font-light qv:leading-none">Q</span>
            <i className="qv:absolute qv:size-[65px] qv:rounded-full qv:border qv:border-[rgba(192,179,255,0.35)] qv:[transform:rotateX(65deg)]" />
            <i className="qv:absolute qv:size-[65px] qv:rounded-full qv:border qv:border-[rgba(192,179,255,0.35)] qv:[transform:rotateX(65deg)_rotate(60deg)]" />
            <i className="qv:absolute qv:size-[65px] qv:rounded-full qv:border qv:border-[rgba(192,179,255,0.35)] qv:[transform:rotateX(65deg)_rotate(120deg)]" />
          </div>
        </div>
        <div aria-hidden="true" className="qv:absolute qv:-right-[6%] qv:-top-[145px] qv:size-[260px] qv:rounded-full qv:border qv:border-[rgba(200,190,255,0.08)]" />
        <div aria-hidden="true" className="qv:absolute qv:-right-[2%] qv:-top-[205px] qv:size-[330px] qv:rounded-full qv:border qv:border-[rgba(200,190,255,0.08)]" />
      </section>

      <section aria-label="Portfolio metrics" className="qv:grid qv:grid-cols-1 qv:gap-2.5 qv:min-[520px]:grid-cols-3 qv:sm:gap-[15px]">
        {metricCards.map(({ label, value, note, icon: Icon, trend }) => (
          <article className={`${panelClass} qv:grid qv:min-w-0 qv:grid-cols-[minmax(0,1fr)_auto] qv:items-center qv:gap-x-2 qv:p-[13px_15px] qv:sm:block qv:sm:min-h-[139px] qv:sm:p-[18px_19px_15px]`} key={label}>
            <div className="qv:contents qv:sm:flex qv:sm:items-center qv:sm:justify-between">
              <span className="qv:text-[10px] qv:text-[#b5b6c4] qv:sm:text-xs">{label}</span>
              <span className="qv:col-start-2 qv:row-span-2 qv:grid qv:size-7 qv:place-items-center qv:rounded-[10px] qv:border qv:border-[rgba(141,120,255,0.15)] qv:bg-[rgba(141,120,255,0.1)] qv:text-[#a99aff] qv:sm:size-8"><Icon size={17} /></span>
            </div>
            <strong className="qv:col-start-1 qv:row-start-2 qv:mt-1 qv:text-[21px] qv:font-semibold qv:tracking-[-0.03em] qv:text-[#f1f1f8] qv:sm:my-2 qv:sm:block qv:sm:text-[25px]">{value}</strong>
            <div className="qv:col-span-2 qv:mt-2 qv:flex qv:min-w-0 qv:items-start qv:gap-1 qv:wrap-anywhere qv:text-[9px] qv:leading-[1.35] qv:text-[#85889b] qv:sm:mt-0 qv:sm:items-center qv:sm:text-[10px]">{trend === "up" ? <ArrowUpRight className="qv:shrink-0 qv:text-[#52ddc3]" size={14} /> : <Activity className="qv:shrink-0 qv:text-[#52ddc3]" size={14} />}{note}</div>
          </article>
        ))}
      </section>

      <div className="qv:grid qv:min-w-0 qv:grid-cols-1 qv:gap-4 qv:lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)]">
        <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
          <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
            <div><span className={kickerClass}>PORTFOLIO</span><h2 className={panelTitleClass}>Activity overview</h2></div>
            <span className="qv:rounded-md qv:border qv:border-white/[0.075] qv:px-[9px] qv:py-1.5 qv:text-[10px] qv:text-[#a3a5b5]">Your account</span>
          </div>
          <div aria-label="Activity chart will be available when wallet positions are indexed" className="qv:mt-5 qv:grid qv:min-w-0 qv:grid-cols-[28px_minmax(0,1fr)]" role="img">
            <div className="qv:flex qv:flex-col qv:justify-between qv:pb-[22px] qv:text-[9px] qv:text-[#626577]"><span>—</span><span>—</span><span>—</span><span>—</span></div>
            <div className="qv:relative qv:h-[174px]">
              <div className="qv:absolute qv:inset-x-0 qv:top-0 qv:border-t qv:border-dashed qv:border-white/[0.07]" />
              <div className="qv:absolute qv:inset-x-0 qv:top-1/3 qv:border-t qv:border-dashed qv:border-white/[0.07]" />
              <div className="qv:absolute qv:inset-x-0 qv:top-2/3 qv:border-t qv:border-dashed qv:border-white/[0.07]" />
              <div className="qv:absolute qv:inset-0 qv:flex qv:flex-col qv:items-center qv:justify-center qv:gap-2 qv:px-2 qv:text-center">
                <span className={emptyIconClass}><Layers3 size={20} /></span>
                <strong className="qv:text-[11px] qv:font-semibold qv:text-[#d5d5e0]">{isConnected ? "No indexed positions yet" : "Connect your wallet to get started"}</strong>
                <span className="qv:text-[10px] qv:text-[#777a8c]">Your staking and reward history will appear here.</span>
              </div>
            </div>
            <div className="qv:col-start-2 qv:flex qv:justify-between qv:pt-2 qv:text-[9px] qv:text-[#626577]"><span>30d ago</span><span>20d ago</span><span>10d ago</span><span>Today</span></div>
          </div>
          <div className="qv:mt-4 qv:flex qv:gap-4 qv:border-t qv:border-white/[0.075] qv:pt-3.5 qv:text-[10px] qv:text-[#85889a]">
            <span className="qv:flex qv:items-center qv:gap-1.5"><i className="qv:size-1.5 qv:rounded-full qv:bg-[#8d78ff]" /> Staked balance</span>
            <span className="qv:flex qv:items-center qv:gap-1.5"><i className="qv:size-1.5 qv:rounded-full qv:bg-[#52ddc3]" /> Rewards</span>
          </div>
        </section>

        <section className={`${panelClass} qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
          <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
            <div><span className={kickerClass}>ONCHAIN ACTION</span><h2 className={panelTitleClass}>Create a validator gauge</h2></div>
            <span className="qv:inline-flex qv:items-center qv:gap-1 qv:rounded-md qv:border qv:border-[rgba(82,221,195,0.15)] qv:px-2 qv:py-1.5 qv:text-[9px] qv:text-[#87daca]"><Gauge size={15} /> veValidator</span>
          </div>
          <p className="qv:mb-[19px] qv:mt-[15px] qv:max-w-[390px] qv:text-[11px] qv:leading-[1.65] qv:text-[#8b8d9d]">Create a rewards gauge for a validator position you own. The transaction uses Quevra’s configured reward token.</p>
          <form className="qv:flex qv:flex-col qv:gap-[9px]" onSubmit={submitGauge}>
            <label className="qv:text-[10px] qv:font-semibold qv:text-[#b9bac8]" htmlFor="token-id">veValidator token ID</label>
            <input className="qv:h-[41px] qv:w-full qv:min-w-0 qv:rounded-lg qv:border qv:border-white/10 qv:bg-[#0e1018] qv:px-3 qv:text-[11px] qv:text-[#f0f0f6] qv:outline-none qv:placeholder:text-[#5f6272] qv:focus:border-[rgba(141,120,255,0.65)] qv:focus:shadow-[0_0_0_3px_rgba(141,120,255,0.1)]" id="token-id" inputMode="numeric" min="1" pattern="[1-9][0-9]*" required placeholder="Enter your token ID" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
            <TransactionButton
              ref={transactionButton}
              className="qv:mt-0.5 qv:inline-flex qv:h-[42px] qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:text-[11px] qv:font-semibold qv:text-white qv:shadow-[0_8px_20px_rgba(112,88,233,0.2)] qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-[0.46] qv:disabled:shadow-none"
              disabled={!tokenId || !rewardToken}
              icon={<Sparkles size={16} />}
              steps={gaugeSteps}
              type="submit"
              onComplete={(results) => {
                const hash = results.find((result) => result.key === "create-validator-gauge")?.hash;
                if (hash) setRecentTransactions((current) => [{ hash, tokenId }, ...current].slice(0, 5));
              }}
            >Create gauge</TransactionButton>
          </form>
          <div className="qv:mt-[13px] qv:flex qv:items-center qv:gap-2 qv:text-[9px] qv:text-[#777a8c]"><span className="qv:size-[5px] qv:rounded-full qv:bg-[#52ddc3]" /> Requires ownership of the veValidator NFT</div>
        </section>
      </div>

      <section className={`${panelClass} qv:mt-4 qv:min-w-0 qv:p-[17px_15px] qv:sm:p-5`}>
        <div className="qv:flex qv:items-start qv:justify-between qv:gap-3">
          <div><span className={kickerClass}>ONCHAIN HISTORY</span><h2 className={panelTitleClass}>Recent transactions</h2></div>
          <a className={explorerLinkClass} href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Monad Explorer <ExternalLink size={13} /></a>
        </div>
        {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
          <div className="qv:flex qv:min-h-[66px] qv:min-w-0 qv:flex-wrap qv:items-center qv:gap-3 qv:border-t qv:border-white/[0.075] qv:py-2" key={transaction.hash}>
            <span className="qv:grid qv:size-[34px] qv:shrink-0 qv:place-items-center qv:rounded-[10px] qv:border qv:border-[rgba(82,221,195,0.14)] qv:bg-[rgba(82,221,195,0.08)] qv:text-[#52ddc3]"><Gauge size={16} /></span>
            <div className="qv:flex qv:min-w-0 qv:flex-1 qv:flex-col qv:gap-1"><strong className="qv:text-[11px] qv:font-semibold qv:text-[#d5d5e0]">Created validator gauge</strong><span className="qv:text-[10px] qv:text-[#777a8c]">veValidator #{transaction.tokenId} · Confirmed</span></div>
            <a className={`${explorerLinkClass} qv:min-w-0 qv:wrap-anywhere`} href={`${monadTestnet.blockExplorers.default.url}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">{transaction.hash.slice(0, 6)}…{transaction.hash.slice(-4)} <ExternalLink size={12} /></a>
          </div>
        )) : (
          <div className="qv:mt-2.5 qv:flex qv:min-h-[81px] qv:items-center qv:gap-3 qv:border-t qv:border-white/[0.075]">
            <span className={`${emptyIconClass} qv:size-[34px] qv:rounded-[10px]`}><Activity size={18} /></span>
            <div className="qv:flex qv:flex-col qv:gap-1"><strong className="qv:text-[11px] qv:font-semibold qv:text-[#d5d5e0]">{isConnected ? "No recent transactions found" : "Your activity will show here"}</strong><span className="qv:text-[10px] qv:text-[#777a8c]">{isConnected ? "Transactions from your Quevra positions will appear here." : "Connect your wallet to view your Quevra history."}</span></div>
          </div>
        )}
      </section>
    </div>
  );
}
