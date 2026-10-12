"use client";

import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";
import { networkSections } from "./MainMenu";

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="qv:flex qv:flex-col qv:border-b qv:border-white/[0.075] qv:bg-[#0e0f16] qv:lg:hidden">
      <div className="qv:flex qv:min-h-16 qv:items-center qv:justify-between qv:px-4">
        <Link className="qv:flex qv:items-center qv:gap-3 qv:text-white qv:no-underline" href="/">
          <span className="qv:grid qv:size-9 qv:place-items-center qv:rounded-xl qv:bg-gradient-to-br qv:from-[#a291ff] qv:to-[#644ce1] qv:text-lg qv:font-bold qv:text-white">Q</span>
          <span className="qv:font-semibold">Quevra</span>
        </Link>
        <button
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="qv:grid qv:size-10 qv:place-items-center qv:rounded-lg qv:text-[#b7aaff] qv:transition-colors qv:hover:bg-white/[0.06]"
          onClick={() => setOpen((visible) => !visible)}
          type="button"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <nav aria-label="Main navigation" className={`${open ? "qv:block" : "qv:hidden"} qv:border-t qv:border-white/[0.075] qv:px-3 qv:py-3`}>
          {networkSections.map((section) => (
            <Link
              aria-current={section.active ? "page" : undefined}
              aria-disabled={!section.active || undefined}
              className="qv:flex qv:min-h-11 qv:items-center qv:gap-3 qv:rounded-lg qv:bg-[rgba(141,120,255,0.12)] qv:px-3 qv:text-[13px] qv:font-medium qv:text-[#c5bbff] qv:no-underline"
              href={section.href}
              key={section.label}
              onClick={() => setOpen(false)}
              tabIndex={section.active ? undefined : -1}
            >
              <LayoutDashboard aria-hidden="true" size={17} className="qv:text-[#a99aff]" />
              <span>{section.label}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}
