export default function Sidebar() {
  return (
    <aside className="content-panel compact color-scheme-dark">
      <div className="element-wrapper compact">
        <h6 className="element-header">Network snapshot</h6>
        <div className="element-box less-padding">
          <div className="label">Chain</div>
          <div className="value">Monad</div>
        </div>
        <div className="element-box less-padding">
          <div className="label">Current epoch</div>
          <div className="value">—</div>
        </div>
        <div className="element-box less-padding">
          <div className="label">Active validators</div>
          <div className="value">—</div>
        </div>
        <div className="element-box-tp">
          <p className="text-faded">Network data will appear here when Quevra is connected.</p>
        </div>
      </div>
    </aside>
  );
}
