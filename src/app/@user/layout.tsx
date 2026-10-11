"use client";

import { useEffect, useState, type ReactNode } from "react";
import MainMenu from "./components/MainMenu";
import MobileMenu from "./components/MobileMenu";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";

export default function UserLayout({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [contentPanelActive, setContentPanelActive] = useState(true);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("quevra-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setIsDark(savedTheme === "dark");
    }
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    document.body.classList.toggle("color-scheme-dark", isDark);
    window.localStorage.setItem("quevra-theme", isDark ? "dark" : "light");
  }, [isDark, themeLoaded]);

  return (
    <div className={`all-wrapper with-side-panel solid-bg-all${contentPanelActive ? " content-panel-active" : ""}`}>
      <div className="layout-w">
        <MobileMenu />
        <MainMenu isDark={isDark} />

        <div className="content-w">
          <TopBar />
          <button
            aria-label={contentPanelActive ? "Hide network snapshot" : "Show network snapshot"}
            className="content-panel-toggler"
            onClick={() => setContentPanelActive((active) => !active)}
            type="button"
          >
            <i aria-hidden="true" className="os-icon os-icon-grid-squares-22" />
            <span>Sidebar</span>
          </button>
          <div className="content-i">
            <main className="content-box">{children}</main>
            <Sidebar />
          </div>
        </div>
      </div>

      <button
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        aria-pressed={isDark}
        className="floated-colors-btn"
        onClick={() => setIsDark((dark) => !dark)}
        type="button"
      >
        <span aria-hidden="true" className={`os-toggler-w${isDark ? " on" : ""}`}>
          <span className="os-toggler-i"><span className="os-toggler-pill" /></span>
        </span>
        <span>Dark</span><span>Colors</span>
      </button>
      <div className="display-type" />
    </div>
  );
}
