import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/admin/dashboard", label: "Техніка" },
  { to: "/admin/orders", label: "Заявки" },
  { to: "/admin/occupancy", label: "Календар зайнятості" },
];

export default function AdminLayout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/admin");
  }

  return (
    <div className="flex h-screen bg-light-bg font-sans">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* ── Mobile top bar ── */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-[#0f1115d6] px-4 py-3 md:hidden">
        <span className="text-lg font-bold text-primary">TechnoRent</span>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
        >
          {sidebarOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-[207px] shrink-0 flex-col gap-4 bg-[#0f1115d6] px-4 py-5 transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex flex-col gap-2 rounded-xl bg-[#171A21] p-3">
          <span className="text-lg font-bold text-primary">TechnoRent</span>
          <span className="text-xs font-semibold text-[#D0D5DD]">
            Admin Panel
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "bg-primary font-bold text-dark"
                    : "bg-[#171A21] text-[#F5F5F5] hover:bg-[#252830]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto" />

        {/* User info */}
        <div className="flex flex-col gap-2 rounded-xl bg-[#171A21] p-3">
          <span className="text-[11px] font-bold text-[#12B76A]">Онлайн</span>
          <span className="text-xs font-semibold text-[#F5F5F5]">
            {admin?.email ?? "Адміністратор"}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="rounded-full bg-primary py-2.5 text-center text-[13px] font-bold text-dark transition-opacity hover:opacity-90"
        >
          Вийти
        </button>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex flex-1 flex-col gap-3.5 overflow-y-auto bg-light-bg p-3 pt-16 md:p-5 md:pt-5">
        <Outlet />
      </main>
    </div>
  );
}
