import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

const tabs = [
  {
    to: "/",
    label: "Головна",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.06l-.97-.97V19.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-3.75h-3V19.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-6.868l-.97.97a.75.75 0 1 1-1.06-1.061l8.69-8.69Z" />
      </svg>
    ),
  },
  {
    to: "/catalog",
    label: "Техніка",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375Z" />
        <path fillRule="evenodd" d="m3.087 9 .54 9.176A3 3 0 0 0 6.62 21h10.757a3 3 0 0 0 2.995-2.824L20.913 9H3.087Zm6.163 3.75A.75.75 0 0 1 10 12h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    to: "/services",
    label: "Послуги",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 0 1 6.775-5.025.75.75 0 0 1 .313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.64l3.318-3.319a.75.75 0 0 1 1.248.313 5.25 5.25 0 0 1-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 1 1 2.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.309A5.342 5.342 0 0 1 12 6.75ZM4.117 19.125a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-.008a.75.75 0 0 1-.75-.75v-.008Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    to: "/contacts",
    label: "Контакти",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
];

/** Scroll threshold (px) after which the bar collapses */
const SCROLL_THRESHOLD = 60;

export default function MobileTabBar() {
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > SCROLL_THRESHOLD && y > lastY.current) {
          setCompact(true);
        } else if (y < lastY.current) {
          setCompact(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed left-2.5 right-2.5 z-50 mx-auto max-w-md rounded-full bg-[#111]/92 backdrop-blur-xl md:hidden"
      style={{
        bottom: "max(6px, calc(env(safe-area-inset-bottom) - 6px))",
        boxShadow: "0 6px 32px 0 rgba(0,0,0,.35), 0 1.5px 8px 0 rgba(0,0,0,.18)",
      }}
    >
      <div
        className="flex items-center justify-around"
        style={{
          padding: compact ? "5px 2px" : "9px 4px",
          transition: "padding .3s ease",
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) => {
              const base =
                "relative flex min-w-0 items-center justify-center font-semibold transition-all duration-300 ease-out";
              if (compact) {
                return `${base} px-2 py-1 text-[10.5px] tracking-wide ${
                  isActive
                    ? "text-primary"
                    : "text-white/50 active:text-white/80"
                }`;
              }
              return `${base} flex-col gap-0.5 rounded-full px-3 py-1.5 text-[10px] ${
                isActive
                  ? "bg-primary text-dark"
                  : "text-white/60 active:scale-95 active:text-white/90"
              }`;
            }}
          >
            {() => (
              <>
                {/* Icon — expanded only */}
                <span
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: compact ? 0 : 20,
                    opacity: compact ? 0 : 1,
                    marginBottom: compact ? 0 : 2,
                  }}
                  aria-hidden
                >
                  {tab.icon}
                </span>

                {/* Label */}
                <span className="whitespace-nowrap">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
