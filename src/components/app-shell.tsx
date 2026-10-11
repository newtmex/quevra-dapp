"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

const navigation = [
  { label: "Overview", icon: "layout", active: true },
  { label: "Validators", icon: "user-male-circle2", active: false },
  { label: "Delegations", icon: "layers", active: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="all-wrapper solid-bg-all">
      {menuOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-menu-scrim"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}

      <div className="layout-w">
        <aside
          aria-label="Main navigation"
          className={`menu-w color-scheme-dark color-style-bright menu-position-side menu-side-left menu-layout-mini selected-menu-color-light menu-activated-on-click menu-has-selected-link${menuOpen ? " mobile-open" : ""}`}
        >
          <div className="logo-w">
            <Link aria-label="Quevra home" className="logo" href="/">
              <div aria-hidden="true" className="logo-element" />
              <div className="logo-label">Quevra</div>
            </Link>
          </div>

          <ul className="main-menu">
            <li className="sub-header"><span>Network</span></li>
            {navigation.map((item) => {
              const content = (
                <>
                  <div aria-hidden="true" className="icon-w">
                    <i className={`os-icon os-icon-${item.icon}`} />
                  </div>
                  <span>{item.label}</span>
                </>
              );

              return (
                <li className={item.active ? "selected" : ""} key={item.label}>
                  {item.active ? (
                    <Link
                      aria-current="page"
                      aria-label={item.label}
                      href="/"
                      onClick={() => setMenuOpen(false)}
                      title={item.label}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div aria-disabled="true" aria-label={`${item.label}, coming soon`} title={`${item.label} · coming soon`}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div aria-label="Monad testnet" className="sidebar-network">
            <i aria-hidden="true" className="os-icon os-icon-globe" />
            <span>Monad testnet</span>
          </div>
        </aside>

        <div className="content-w">
          <header className="top-bar color-scheme-bright">
            <button
              aria-label="Open navigation"
              className="mobile-menu-trigger"
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <i aria-hidden="true" className="os-icon os-icon-hamburger-menu-1" />
            </button>

            <div className="fancy-selector-w">
              <div className="fancy-selector-current">
                <div className="fs-img">
                  <div aria-hidden="true" className="quevra-network-avatar">Q</div>
                </div>
                <div className="fs-main-info">
                  <div className="fs-name"><span>Quevra Network</span><strong>QVR</strong></div>
                  <div className="fs-sub"><span>Environment:</span><strong>Monad Testnet</strong></div>
                </div>
                <div aria-hidden="true" className="fs-selector-trigger">
                  <i className="os-icon os-icon-arrow-down4" />
                </div>
              </div>
            </div>

            <div className="top-menu-controls">
              <div className="element-search">
                <input aria-label="Search Quevra" placeholder="Search Quevra..." type="search" />
              </div>
              <div className="network-status-pill">
                <span className="network-status-dot" />
                Testnet preview
              </div>
            </div>
          </header>

          <div className="content-i">
            <main className="content-box">{children}</main>
            <aside aria-label="Network snapshot" className="content-panel compact color-scheme-dark">
              <div className="element-wrapper compact">
                <h6 className="element-header">Network snapshot</h6>
                <div className="snapshot-row">
                  <div className="snapshot-icon"><i className="os-icon os-icon-layers" /></div>
                  <div>
                    <div className="snapshot-label">Chain</div>
                    <div className="snapshot-value">Monad</div>
                  </div>
                </div>
                <div className="snapshot-row">
                  <div className="snapshot-icon"><i className="os-icon os-icon-basic-2-259-calendar" /></div>
                  <div>
                    <div className="snapshot-label">Epoch</div>
                    <div className="snapshot-value">—</div>
                  </div>
                </div>
                <div className="snapshot-row">
                  <div className="snapshot-icon"><i className="os-icon os-icon-users" /></div>
                  <div>
                    <div className="snapshot-label">Active validators</div>
                    <div className="snapshot-value">—</div>
                  </div>
                </div>
              </div>
              <div className="snapshot-note">
                <span className="network-status-dot" />
                <span>Network data will appear here when Quevra is connected.</span>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
