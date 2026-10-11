const metrics = [
  { label: "Total staked", value: "—", note: "MON delegated" },
  { label: "Active validators", value: "—", note: "Validator set" },
  { label: "Current epoch", value: "—", note: "Network progress" },
];

const validatorRows = ["Validator details", "Stake distribution", "Commission rate"];

export default function DashboardPage() {
  return (
    <div className="quevra-dashboard container-fluid px-0">
      <div className="os-tabs-w">
        <div className="os-tabs-controls os-tabs-complex">
          <ul aria-label="Network sections" className="nav nav-tabs">
            <li className="nav-item">
              <span aria-current="page" className="nav-link active"><span className="tab-label">Network overview</span></span>
            </li>
            <li className="nav-item d-none d-sm-block">
              <span className="nav-link"><span className="tab-label">Validator set</span></span>
            </li>
            <li className="nav-item d-none d-lg-block">
              <span className="nav-link"><span className="tab-label">Delegations</span></span>
            </li>
          </ul>
        </div>
      </div>

      <div className="page-intro">
        <div className="page-intro-eyebrow">QUEVRA NETWORK</div>
        <h1>Network overview</h1>
        <p>Monitor validator participation and staking across Quevra.</p>
      </div>

      <section aria-label="Network metrics" className="row pt-2 g-3 dashboard-metrics">
        {metrics.map((metric) => (
          <div className="col-12 col-sm-6 col-xl-4" key={metric.label}>
            <article className="element-box el-tablo centered smaller metric-box">
              <div className="label">{metric.label}</div>
              <div className="value">{metric.value}</div>
              <div className="metric-note">{metric.note}</div>
            </article>
          </div>
        ))}
      </section>

      <div className="row dashboard-content">
        <div className="col-12 col-xxl-8">
          <section className="element-wrapper compact">
            <div className="element-actions d-none d-sm-block">
              <span className="period-label">Last 30 days</span>
            </div>
            <h2 className="element-header">Network activity</h2>
            <div className="element-box-tp">
              <div aria-label="Network activity chart placeholder" className="el-chart-w activity-chart">
                <div className="activity-chart-grid"><span /><span /><span /><span /></div>
                <svg aria-hidden="true" className="activity-chart-line" preserveAspectRatio="none" viewBox="0 0 720 180">
                  <defs>
                    <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#4b72fa" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#4b72fa" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="activity-chart-area" d="M0 143 C52 138 72 100 122 109 S207 151 255 118 325 62 371 84 431 126 486 83 553 67 598 82 671 38 720 47 V180 H0Z" />
                  <path className="activity-chart-stroke" d="M0 143 C52 138 72 100 122 109 S207 151 255 118 325 62 371 84 431 126 486 83 553 67 598 82 671 38 720 47" />
                </svg>
                <div className="activity-chart-axis"><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span></div>
              </div>
              <div className="activity-chart-caption"><span className="activity-legend" /> Quevra network activity <span className="text-faded">Data will populate when connected.</span></div>
            </div>
          </section>

          <section className="row pt-2 g-3 metric-detail-row" aria-label="Network details">
            {validatorRows.map((label) => (
              <div className="col-12 col-md-4" key={label}>
                <article className="element-box el-tablo centered smaller detail-box">
                  <div className="label">{label}</div>
                  <div className="value">—</div>
                </article>
              </div>
            ))}
          </section>
        </div>

        <div className="col-12 col-xxl-4">
          <section className="element-box less-padding validator-box">
            <h2 className="element-box-header">Validator set</h2>
            <div className="element-box-tp">
              <table className="table table-lightborder table-clean mb-0">
                <thead>
                  <tr><th>Validator</th><th className="text-right">Status</th></tr>
                </thead>
                <tbody>
                  <tr><td colSpan={2}>
                    <div className="validator-empty">
                      <i aria-hidden="true" className="os-icon os-icon-layers" />
                      <div className="validator-empty-title">Validator data is on its way</div>
                      <p>Validator details will appear when the network is connected.</p>
                    </div>
                  </td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <footer className="dashboard-footer">Quevra <span>·</span> Network dashboard</footer>
    </div>
  );
}
