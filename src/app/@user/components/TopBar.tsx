export default function TopBar() {
  return (
    <div className="top-bar color-scheme-transparent">
      <div className="fancy-selector-w">
        <div className="fancy-selector-current">
          <div className="fs-img">
            <img alt="" src="/img/logo.png" />
          </div>
          <div className="fs-main-info">
            <div className="fs-name"><span>Quevra Network</span><strong>QVR</strong></div>
            <div className="fs-sub"><span>Environment:</span><strong>Monad Testnet</strong></div>
          </div>
          <div className="fs-selector-trigger">
            <i className="os-icon os-icon-arrow-down4" />
          </div>
        </div>
      </div>

      <div className="top-menu-controls">
        <div className="element-search">
          <input aria-label="Search Quevra" placeholder="Search Quevra..." type="search" />
        </div>
        <div className="logged-user-w">
          <div className="logged-user-i">
            <div className="logged-user-info-w">
              <div className="logged-user-name">Testnet preview</div>
              <div className="logged-user-role">Monad</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
