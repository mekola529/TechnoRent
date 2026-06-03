import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import { loginCustomer } from "../data/customer-account";
import { useCustomerAccount } from "../context/useCustomerAccount";

export default function AccountLoginPage() {
  const navigate = useNavigate();
  const { setCustomer } = useCustomerAccount();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await loginCustomer({ login, password });
      setCustomer(result.customer);
      navigate("/account", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося увійти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountLayout
      title="Вхід у кабінет"
      subtitle="Переглядайте свої заявки, статус виконання та погоджену вартість."
    >
      <AccountCard className="mx-auto max-w-[420px]">
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <h2 className="text-[24px] font-bold text-dark">Увійти</h2>
          <Field label="Email або телефон">
            <input className={inputClass} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Пароль">
            <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60" disabled={busy}>
            {busy ? "Вхід..." : "Увійти"}
          </button>
          <p className="text-center text-sm font-medium text-dark-text">
            Ще немає акаунта? <Link className="font-bold text-dark hover:text-primary" to="/account/register">Зареєструватися</Link>
          </p>
        </form>
      </AccountCard>
    </AccountLayout>
  );
}

const inputClass = "w-full rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-3 text-base font-medium text-dark outline-none focus:ring-2 focus:ring-primary md:text-[13px]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-bold text-dark-text">
      {label}
      {children}
    </label>
  );
}
