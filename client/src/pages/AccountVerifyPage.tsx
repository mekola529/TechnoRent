import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import { verifyCustomer } from "../data/customer-account";

interface VerifyState {
  channel?: "email" | "telegram" | "viber";
  target?: string;
  debugCode?: string;
}

export default function AccountVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as VerifyState;
  const [code, setCode] = useState(state.debugCode ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!state.channel || !state.target) {
      setError("Немає контакту для підтвердження. Почніть реєстрацію ще раз.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyCustomer({ channel: state.channel, target: state.target, code });
      navigate("/account/login", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося підтвердити код");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountLayout
      title="Підтвердження контакту"
      subtitle="Ми покажемо старі заявки тільки після підтвердження email або телефону."
    >
      <AccountCard className="mx-auto max-w-[420px]">
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <h2 className="text-[24px] font-bold text-dark">
            {state.channel === "email" ? "Підтвердіть email" : "Підтвердіть телефон"}
          </h2>
          <p className="text-sm font-medium leading-6 text-dark-text">
            Код надіслано для контакту <span className="font-bold text-dark">{state.target ?? "не вказано"}</span>.
          </p>
          {state.debugCode && (
            <p className="rounded-xl bg-light-bg p-3 text-xs font-semibold text-dark-text">
              Dev-код для локальної перевірки: <span className="font-bold text-dark">{state.debugCode}</span>
            </p>
          )}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-4 text-center text-2xl font-bold tracking-[0.4em] text-dark outline-none focus:ring-2 focus:ring-primary"
            inputMode="numeric"
            placeholder="000000"
          />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60" disabled={busy}>
            {busy ? "Перевірка..." : "Підтвердити"}
          </button>
          <Link className="text-center text-sm font-bold text-dark hover:text-primary" to="/account/register">
            Змінити контакт
          </Link>
        </form>
      </AccountCard>
    </AccountLayout>
  );
}
