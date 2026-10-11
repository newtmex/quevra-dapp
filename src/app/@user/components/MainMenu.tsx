import Link from "next/link";

export const networkSections = [
  { href: "/", icon: "layout", label: "Overview", active: true },
  { href: "/validators", icon: "user-male-circle2", label: "Validators", active: false },
  { href: "/delegations", icon: "layers", label: "Delegations", active: false },
];

export default function MainMenu({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={`menu-w menu-position-side menu-side-left menu-layout-mini sub-menu-style-over sub-menu-color-bright menu-activated-on-click menu-has-selected-link color-scheme-${isDark ? "dark" : "light"} color-style-${isDark ? "transparent" : "bright"} selected-menu-color-${isDark ? "bright" : "light"}`}
    >
      <div className="logo-w">
        <Link aria-label="Quevra home" className="logo" href="/">
          <div className="logo-element" />
          <div className="logo-label">Quevra</div>
        </Link>
      </div>

      <ul className="main-menu">
        <li className="sub-header"><span>Network</span></li>
        {networkSections.map((section) => (
          <li className={section.active ? "selected" : ""} key={section.label}>
            {section.active ? (
              <Link aria-current="page" href={section.href}>
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
  );
}
