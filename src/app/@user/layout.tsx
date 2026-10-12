import type { ReactNode } from "react";
import MainMenu from "./components/MainMenu";
import MobileMenu from "./components/MobileMenu";
import TopBar from "./components/TopBar";

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <div className="all-wrapper solid-bg-all quevra-app-shell">
      <div className="layout-w">
        <MobileMenu />
        <MainMenu isDark />
        <div className="content-w">
          <TopBar />
          <div className="content-i">
            <main className="content-box">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
