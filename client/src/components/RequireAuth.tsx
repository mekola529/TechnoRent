import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light-bg font-sans">
        <p className="text-lg font-medium text-dark-text">Завантаження...</p>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
