import {
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";
import { AuthContext, type AdminUser } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("admin_token")));

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;

    apiFetch<{ id: string; email: string; role: string }>("/auth/me")
      .then((data) => setAdmin(data))
      .catch(() => {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token: string, user: AdminUser) {
    localStorage.setItem("admin_token", token);
    localStorage.setItem("admin_user", JSON.stringify(user));
    setAdmin(user);
  }

  function logout() {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
