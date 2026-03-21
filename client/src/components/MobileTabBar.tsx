import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Головна" },
  { to: "/catalog", label: "Техніка" },
  { to: "/services", label: "Послуги" },
  { to: "/contacts", label: "Контакти" },
];

export default function MobileTabBar() {
  return (
    <nav
      className="sticky top-[61px] z-40 w-full border-b border-border/60 bg-white/85 backdrop-blur-lg md:hidden"
      aria-label="Мобільна навігація"
    >
      <div className="flex items-center justify-around px-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `relative py-2.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-dark-text/70 active:text-dark"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
