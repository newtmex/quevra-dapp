"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

const navigation = [
  { label: "Overview", icon: "▦", active: true },
  { label: "Validators", icon: "◈" },
  { label: "Delegations", icon: "⇄" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-frame">
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`} aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Quevra home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">quevra</span>
        </Link>

        <div className="nav-caption">Network</div>
        <nav className="main-nav">
          {navigation.map((item) => (
            <Link
              key={item.label}
              className={`nav-link${item.active ? " active" : ""}`}
              href={item.active ? "/" : "#"}
              aria-current={item.active ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {!item.active && <span className="soon-label">Soon</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className="network-dot" />
          <span>Monad testnet</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="menu-toggle" type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
          <div className="breadcrumb-label">Network <span>/</span> Overview</div>
          <div className="topbar-status"><span className="status-pulse" /> Testnet</div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
