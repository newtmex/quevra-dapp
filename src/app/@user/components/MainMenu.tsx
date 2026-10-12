import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export const networkSections = [
  { href: "/", icon: "layout", label: "Dashboard", active: true },
];

export default function MainMenu() {
  return (
    <aside className="qv:hidden qv:w-[260px] qv:shrink-0 qv:border-r qv:border-white/[0.075] qv:bg-[#0e0f16] qv:lg:flex qv:lg:flex-col">
      <div className="qv:flex qv:h-[76px] qv:items-center qv:border-b qv:border-white/[0.075] qv:px-6">
        <Link aria-label="Quevra home" className="qv:flex qv:items-center qv:gap-3 qv:no-underline" href="/">
          <span className="qv:grid qv:size-9 qv:place-items-center qv:rounded-xl qv:bg-gradient-to-br qv:from-[#a291ff] qv:to-[#644ce1] qv:text-lg qv:font-bold qv:text-white qv:shadow-[0_5px_18px_rgba(114,91,238,0.35)]">Q</span>
          <span className="qv:text-sm qv:font-bold qv:uppercase qv:tracking-[0.12em] qv:text-white">Quevra</span>
        </Link>
      </div>

      <nav aria-label="Main navigation" className="qv:p-4">
        <p className="qv:mb-2 qv:px-3 qv:pt-3 qv:text-[10px] qv:font-bold qv:uppercase qv:tracking-[0.14em] qv:text-[#77798d]">Network</p>
        {networkSections.map((section) => (
          <Link
            aria-current={section.active ? "page" : undefined}
            aria-disabled={!section.active || undefined}
            className={`qv:flex qv:min-h-11 qv:items-center qv:gap-3 qv:rounded-lg qv:px-3 qv:text-[13px] qv:font-medium qv:no-underline qv:transition-colors ${section.active ? "qv:bg-[rgba(141,120,255,0.12)] qv:text-[#c5bbff]" : "qv:text-[#85879a] qv:hover:bg-white/[0.04] qv:hover:text-white"}`}
            href={section.href}
            key={section.label}
            tabIndex={section.active ? undefined : -1}
          >
            <LayoutDashboard aria-hidden="true" size={17} className={section.active ? "qv:text-[#a99aff]" : ""} />
            <span>{section.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
