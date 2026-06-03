import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import { registerCustomer } from "../data/customer-account";
import { useCustomerAccount } from "../context/useCustomerAccount";

type Mode = "email" | "phone";

export default function AccountRegisterPage() {
  const navigate = useNavigate();
  const { setCustomer } = useCustomerAccount();
  const [mode, setMode] = useState<Mode>("phone");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+380");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== repeatPassword) {
      setError("Паролі не збігаються");
      return;
    }
    setBusy(true);
    try {
      const channel = mode === "email" ? "email" : "telegram";
      const result = await registerCustomer({
        fullName,
        email: mode === "email" ? email : undefined,
        phone: mode === "phone" ? phone : undefined,
        password,
        channel,
      });
      if (!result.customer) {
        setError(result.message ?? "Такий акаунт вже існує. Увійдіть у кабінет.");
        return;
      }
      setCustomer(result.customer);
      navigate("/account", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося створити акаунт");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountLayout
      title="Створити акаунт"
      subtitle="Вкажіть номер телефону, щоб ми знайшли ваші заявки. Email можна використати як альтернативу."
    >
      <AccountCard className="mx-auto max-w-[460px]">
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-full bg-light-bg p-1">
            {(["phone", "email"] as Mode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${mode === item ? "bg-primary text-dark" : "text-dark-text"}`}
              >
                {item === "email" ? "Email" : "Телефон"}
              </button>
            ))}
          </div>

          <Field label="Ім'я">
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Як до вас звертатися"
            />
          </Field>

          {mode === "email" ? (
            <Field label="Email">
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            </Field>
          ) : (
            <Field label="Телефон">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" />
            </Field>
          )}

          <Field label="Пароль">
            <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
          </Field>
          <p className="text-xs font-medium text-dark-text">Мінімум 8 символів, літери й цифри.</p>
          <Field label="Повторіть пароль">
            <input className={inputClass} value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} type="password" autoComplete="new-password" />
          </Field>
          {mode === "phone" && (
            <p className="rounded-xl bg-light-bg p-3 text-xs font-semibold text-dark-text">
              Номер телефону пріоритетний: за ним легше підтягнути заявки, які ви залишали раніше.
            </p>
          )}
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60" disabled={busy}>
            {busy ? "Створення..." : "Зареєструватися"}
          </button>
          <p className="text-center text-sm font-medium text-dark-text">
            Вже маєте акаунт? <Link className="font-bold text-dark hover:text-primary" to="/account/login">Увійти</Link>
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
