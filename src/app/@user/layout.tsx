import type { ReactNode } from "react";
import MainMenu from "./components/MainMenu";
import MobileMenu from "./components/MobileMenu";
import TopBar from "./components/TopBar";

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <div className="qv:min-h-screen qv:bg-[#0b0c12]">
      <div className="qv:flex qv:min-h-screen qv:flex-col qv:lg:flex-row">
        <MobileMenu />
        <MainMenu />
        <div className="qv:min-w-0 qv:flex-1 qv:bg-[#0b0c12]">
          <TopBar />
          <main className="qv:mx-auto qv:w-full qv:max-w-[1600px] qv:px-[14px] qv:py-[27px] qv:pb-[42px] qv:sm:px-[18px] qv:sm:py-[34px] qv:sm:pb-[60px] qv:lg:px-[3vw] qv:lg:py-[34px]">{children}</main>
        </div>
      </div>
    </div>
  );
}
