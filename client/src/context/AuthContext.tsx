import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  admin: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setLoading(false);
      return;
    }

    apiFetch<{ id: string; email: string; role: string }>("/auth/me")
      .then((data) => setAdmin(data))
      .catch(() => {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");
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

export function useAuth() {
  return useContext(AuthContext);
}
