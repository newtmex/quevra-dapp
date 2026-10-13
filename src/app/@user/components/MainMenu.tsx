"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, Coins, KeyRound, Landmark, LayoutDashboard } from "lucide-react";

export const networkSections = [
  { href: "/", icon: "layout", label: "Dashboard" },
  { href: "/stake", icon: "stake", label: "Stake MON" },
  { href: "/rewards", icon: "rewards", label: "Rewards" },
  { href: "/lock", icon: "lock", label: "Lock veMON" },
  { href: "/exit", icon: "exit", label: "Exit position" },
];

export default function MainMenu() {
  const pathname = usePathname();
  return (
    <aside className="qv:hidden qv:w-[260px] qv:shrink-0 qv:border-r qv:border-white/[0.075] qv:bg-[#0e0f16] qv:lg:flex qv:lg:flex-col">
      <div className="qv:flex qv:h-[76px] qv:items-center qv:border-b qv:border-white/[0.075] qv:px-6">
        <Link aria-label="Quevra home" className="qv:flex qv:items-center qv:gap-3 qv:no-underline" href="/">
          <span className="qv:grid qv:size-9 qv:place-items-center qv:rounded-xl qv:bg-gradient-to-br qv:from-[#a291ff] qv:to-[#644ce1] qv:text-lg qv:font-bold qv:text-white qv:shadow-[0_5px_18px_rgba(114,91,238,0.35)]">Q</span>
          <span className="qv:text-sm qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-white">Quevra</span>
        </Link>
      </div>

      <nav aria-label="Main navigation" className="qv:p-4">
        <p className="qv:mb-2 qv:px-3 qv:pt-3 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#aeb0c0]">Network</p>
        {networkSections.map((section) => (
          <Link
            aria-current={(section.href === "/" ? pathname === "/" : pathname.startsWith(section.href)) ? "page" : undefined}
            className={`qv:flex qv:min-h-11 qv:items-center qv:gap-3 qv:rounded-lg qv:px-3 qv:text-[13px] qv:font-medium qv:no-underline qv:transition-colors ${((section.href === "/" && pathname === "/") || (section.href !== "/" && pathname.startsWith(section.href))) ? "qv:bg-[rgba(141,120,255,0.12)] qv:text-[#c5bbff]" : "qv:text-[#b0b2c2] qv:hover:bg-white/[0.04] qv:hover:text-white"}`}
            href={section.href}
            key={section.label}
          >
            {section.icon === "layout" ? <LayoutDashboard aria-hidden="true" size={17} /> : section.icon === "stake" ? <Landmark aria-hidden="true" size={17} /> : section.icon === "rewards" ? <Coins aria-hidden="true" size={17} /> : section.icon === "exit" ? <ArrowDownToLine aria-hidden="true" size={17} /> : <KeyRound aria-hidden="true" size={17} />}
            <span>{section.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
