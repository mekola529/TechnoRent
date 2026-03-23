import { useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface LoginResponse {
  token: string;
  admin: { id: string; email: string; role: string };
}

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      login(data.token, data.admin);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка авторизації");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-light-bg font-sans">
      <Helmet>
        <title>Admin Login | TechnoRent</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <form
        onSubmit={handleSubmit}
        className="flex w-[420px] flex-col gap-5 rounded-2xl border border-border bg-white px-7 pb-6 pt-7 max-sm:mx-4 max-sm:w-full"
      >
        {/* Header */}
        <div className="flex flex-col gap-1.5">
          <span className="text-lg font-bold text-dark">TechnoRent</span>
          <h1 className="text-[30px] font-bold leading-tight text-dark">
            Вхід в панель
          </h1>
          <p className="text-sm font-medium text-dark-text">
            Увійдіть, щоб отримати доступ до адміністрування.
          </p>
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-3.5">
          {/* Login */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-dark">Логін</label>
            <input
              type="text"
              placeholder="admin@technorent.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-[10px] border border-border bg-white px-3.5 text-sm font-medium text-dark outline-none placeholder:text-[#9A9A9A] focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-dark">
              Пароль
            </label>
            <input
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-[10px] border border-border bg-white px-3.5 text-sm font-medium text-dark outline-none placeholder:text-[#9A9A9A] focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Зачекайте..." : "Увійти"}
          </button>
        </div>

        {/* Helper */}
        <p className="text-xs font-medium text-[#6E6E6E]">
          Доступ лише для авторизованого персоналу.
        </p>
      </form>
    </div>
  );
}
