import Link from "next/link";

const metrics = [
  { label: "Total staked", value: "—", note: "MON delegated" },
  { label: "Active validators", value: "—", note: "Validator set" },
  { label: "Current epoch", value: "—", note: "Network progress" },
];

export default function DashboardPage() {
  return (
    <>
      <div className="os-tabs-w">
        <div className="os-tabs-controls os-tabs-complex">
          <ul aria-label="Network sections" className="nav nav-tabs">
            <li className="nav-item">
              <Link aria-current="page" className="nav-link active" href="/">Network overview</Link>
            </li>
            <li className="nav-item d-none d-sm-block">
              <a aria-disabled="true" className="nav-link">Validator set</a>
            </li>
            <li className="nav-item d-none d-lg-block">
              <a aria-disabled="true" className="nav-link">Delegations</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="element-wrapper compact">
        <div className="element-actions">
          <span className="text-faded">Monad Testnet</span>
        </div>
        <h6 className="element-header">Network overview</h6>
        <p className="text-faded">Monitor validator participation and staking across Quevra.</p>
      </div>

      <div className="row">
        {metrics.map((metric) => (
          <div className="col-sm-6 col-xl-4" key={metric.label}>
            <div className="element-box el-tablo centered smaller">
              <div className="label">{metric.label}</div>
              <div className="value">{metric.value}</div>
              <div className="trending"><span>{metric.note}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <div className="col-xl-8">
          <div className="element-wrapper compact">
            <div className="element-actions">
              <span className="badge badge-light">Last 30 days</span>
            </div>
            <h6 className="element-header">Network activity</h6>
            <div className="element-box">
              <div className="alert alert-light mb-0" role="status">
                Network activity will appear here when Quevra is connected.
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="element-wrapper compact">
            <h6 className="element-header">Validator set</h6>
            <div className="element-box less-padding">
              <div className="table-responsive">
                <table className="table table-lightborder table-clean mb-0">
                  <thead>
                    <tr><th>Validator</th><th className="text-right">Status</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={2} className="text-center text-muted">
                        Validator data will appear when Quevra is connected.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
