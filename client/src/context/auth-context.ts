import { createContext } from "react";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  admin: null,
  loading: true,
  login: () => {},
  logout: () => {},
});
