"use client";

import Link from "next/link";
import { useState } from "react";
import { networkSections } from "./MainMenu";

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="menu-mobile menu-activated-on-click color-scheme-dark">
      <div className="mm-logo-buttons-w">
        <Link className="mm-logo" href="/">
          <img alt="" src="/img/logo.png" />
          <span>Quevra</span>
        </Link>
        <div className="mm-buttons">
          <button
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            className="mobile-menu-trigger"
            onClick={() => setOpen((visible) => !visible)}
            type="button"
          >
            <i className="os-icon os-icon-hamburger-menu-1" />
          </button>
        </div>
      </div>

      <div className="menu-and-user" style={open ? { display: "block" } : undefined}>
        <ul className="main-menu">
          {networkSections.map((section) => (
            <li className={section.active ? "selected" : ""} key={section.label}>
              {section.active ? (
                <Link href={section.href} onClick={() => setOpen(false)}>
                  <div className="icon-w"><i className={`os-icon os-icon-${section.icon}`} /></div>
                  <span>{section.label}</span>
                </Link>
              ) : (
                <a aria-disabled="true">
                  <div className="icon-w"><i className={`os-icon os-icon-${section.icon}`} /></div>
                  <span>{section.label}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
