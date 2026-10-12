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
    <div className="crypto-dashboard">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> QUEVRA · MONAD TESTNET</div>
          <h1>Your onchain portfolio</h1>
          <p>Track staking, rewards, and gauge activity from one place.</p>
        </div>
      </header>

      <section className="portfolio-banner" aria-label="Portfolio overview">
        <div className="portfolio-banner__top">
          <div><span className="banner-label">Portfolio overview</span><span className="live-pill"><span /> TESTNET</span></div>
          <span className="banner-caption">Monad · chain 10143</span>
        </div>
        <div className="portfolio-banner__bottom">
          <div>
            <span className="banner-label">Connected positions</span>
            <div className="portfolio-value">{isConnected ? "—" : "Connect wallet"}</div>
            <span className="banner-caption">Your Quevra staking and gauge positions</span>
          </div>
          <div className="banner-mark" aria-hidden="true"><span>Q</span><i /><i /><i /></div>
        </div>
        <div className="banner-orb banner-orb--one" aria-hidden="true" /><div className="banner-orb banner-orb--two" aria-hidden="true" />
      </section>

      <section className="metric-grid" aria-label="Portfolio metrics">
        {metricCards.map(({ label, value, note, icon: Icon, trend }) => (
          <article className="metric-card" key={label}>
            <div className="metric-card__top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
            <strong>{value}</strong>
            <div className="metric-card__note">{trend === "up" ? <ArrowUpRight size={14} /> : <Activity size={14} />}{note}</div>
          </article>
        ))}
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel activity-panel">
          <div className="panel-heading"><div><span className="panel-kicker">PORTFOLIO</span><h2>Activity overview</h2></div><span className="panel-period">Your account</span></div>
          <div className="activity-chart" role="img" aria-label="Activity chart will be available when wallet positions are indexed">
            <div className="chart-y-labels"><span>—</span><span>—</span><span>—</span><span>—</span></div>
            <div className="chart-area">
              <div className="chart-gridline chart-gridline--1" /><div className="chart-gridline chart-gridline--2" /><div className="chart-gridline chart-gridline--3" />
              <div className="chart-empty"><span className="chart-empty__icon"><Layers3 size={20} /></span><strong>{isConnected ? "No indexed positions yet" : "Connect your wallet to get started"}</strong><span>Your staking and reward history will appear here.</span></div>
            </div>
            <div className="chart-x-labels"><span>30d ago</span><span>20d ago</span><span>10d ago</span><span>Today</span></div>
          </div>
          <div className="chart-legend"><span><i className="legend-dot legend-dot--purple" /> Staked balance</span><span><i className="legend-dot legend-dot--teal" /> Rewards</span></div>
        </section>

        <section className="dashboard-panel gauge-panel">
          <div className="panel-heading"><div><span className="panel-kicker">ONCHAIN ACTION</span><h2>Create a validator gauge</h2></div><span className="gauge-badge"><Gauge size={15} /> veValidator</span></div>
          <p className="panel-description">Create a rewards gauge for a validator position you own. The transaction uses Quevra’s configured reward token.</p>
          <form className="gauge-form" onSubmit={submitGauge}>
            <label htmlFor="token-id">veValidator token ID</label>
            <input id="token-id" inputMode="numeric" min="1" pattern="[1-9][0-9]*" required placeholder="Enter your token ID" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
            <TransactionButton
              ref={transactionButton}
              className="transaction-button"
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
          <div className="gauge-footnote"><span className="status-dot" /> Requires ownership of the veValidator NFT</div>
        </section>
      </div>

      <section className="dashboard-panel transactions-panel">
        <div className="panel-heading"><div><span className="panel-kicker">ONCHAIN HISTORY</span><h2>Recent transactions</h2></div><a className="explorer-link" href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Monad Explorer <ExternalLink size={13} /></a></div>
        {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
          <div className="transaction-row" key={transaction.hash}>
            <span className="transaction-row__icon"><Gauge size={16} /></span>
            <div className="transaction-row__details"><strong>Created validator gauge</strong><span>veValidator #{transaction.tokenId} · Confirmed</span></div>
            <a className="explorer-link" href={`${monadTestnet.blockExplorers.default.url}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">{transaction.hash.slice(0, 6)}…{transaction.hash.slice(-4)} <ExternalLink size={12} /></a>
          </div>
        )) : (
          <div className="empty-transactions"><span className="empty-transactions__icon"><Activity size={18} /></span><div><strong>{isConnected ? "No recent transactions found" : "Your activity will show here"}</strong><span>{isConnected ? "Transactions from your Quevra positions will appear here." : "Connect your wallet to view your Quevra history."}</span></div></div>
        )}
      </section>
    </div>
  );
}
