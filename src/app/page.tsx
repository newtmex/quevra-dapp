const metrics = [
  { label: "Active validators", value: "—", note: "Validator set" },
  { label: "Total staked", value: "—", note: "MON delegated" },
  { label: "Network epoch", value: "—", note: "Current epoch" },
];

export default function DashboardPage() {
  return (
    <div className="dashboard container-fluid px-0">
      <div className="page-heading d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <div className="eyebrow">QUEVRA NETWORK</div>
          <h1>Good morning.</h1>
          <p className="page-description">A clear view of what’s happening across the network.</p>
        </div>
        <div className="updated-label"><span className="status-pulse" /> Network status <strong>Operational</strong></div>
      </div>

      <section className="row g-3 g-xl-4 metric-grid" aria-label="Network overview">
        {metrics.map((metric) => (
          <div className="col-12 col-md-4" key={metric.label}>
            <article className="metric-card h-100">
              <div className="metric-label">{metric.label}</div>
              <div className="metric-value">{metric.value}</div>
              <div className="metric-note">{metric.note}</div>
            </article>
          </div>
        ))}
      </section>

      <section className="row g-3 g-xl-4 lower-grid">
        <div className="col-12 col-xl-7">
          <article className="panel-card network-panel h-100">
            <div className="panel-heading">
              <div>
                <h2>Network activity</h2>
                <p>Recent activity will appear here.</p>
              </div>
              <span className="panel-icon" aria-hidden="true">⌁</span>
            </div>
            <div className="empty-chart" aria-label="No network activity available yet">
              <div className="chart-guides"><span /><span /><span /><span /></div>
              <div className="chart-placeholder">
                <span className="chart-dot dot-one" /><span className="chart-dot dot-two" /><span className="chart-dot dot-three" />
                <svg viewBox="0 0 720 160" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 126 C55 118 66 82 118 95 S198 139 245 101 307 57 362 83 431 123 482 75 546 64 590 80 663 28 720 42" />
                </svg>
              </div>
              <div className="chart-axis"><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span></div>
            </div>
            <div className="panel-footnote"><span className="legend-dot" /> Transactions <span className="placeholder-copy">Data will be available when the network is connected.</span></div>
          </article>
        </div>
        <div className="col-12 col-xl-5">
          <article className="panel-card validators-panel h-100">
            <div className="panel-heading">
              <div>
                <h2>Validator set</h2>
                <p>Participating network validators.</p>
              </div>
              <a className="panel-link" href="#validators">View all <span aria-hidden="true">→</span></a>
            </div>
            <div className="empty-state">
              <div className="empty-state-mark" aria-hidden="true">◈</div>
              <div className="empty-state-title">Validator data is on its way</div>
              <p>Validator details will appear here once the network integration is ready.</p>
            </div>
          </article>
        </div>
      </section>
      <footer className="page-footer">Quevra <span>·</span> Network dashboard</footer>
    </div>
  );
}
