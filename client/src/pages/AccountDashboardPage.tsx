import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import AccountRequestCard from "../components/account/AccountRequestCard";
import {
  getCustomerRequests,
  logoutCustomer,
  updateCustomerProfile,
  type CustomerRequest,
} from "../data/customer-account";
import { useCustomerAccount } from "../context/useCustomerAccount";

export default function AccountDashboardPage() {
  const navigate = useNavigate();
  const { customer, loading, setCustomer } = useCustomerAccount();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ fullName: "", email: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!customer) {
      navigate("/account/login", { replace: true });
      return;
    }
    Promise.resolve().then(async () => {
      setRequestsLoading(true);
      try {
        setRequests(await getCustomerRequests());
      } finally {
        setRequestsLoading(false);
      }
    });
  }, [customer, loading, navigate]);

  useEffect(() => {
    if (!customer) return;
    setProfileForm({
      fullName: customer.fullName ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
    });
  }, [customer]);

  async function handleLogout() {
    await logoutCustomer();
    setCustomer(null);
    navigate("/account/login", { replace: true });
  }

  async function handleSaveProfile() {
    setProfileError("");
    setProfileMessage("");
    setProfileSaving(true);
    try {
      const updated = await updateCustomerProfile({
        fullName: profileForm.fullName,
        email: profileForm.email,
        phone: profileForm.phone,
      });
      setCustomer(updated);
      setProfileMessage("Профіль оновлено");
      setProfileEditing(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Не вдалося оновити профіль");
    } finally {
      setProfileSaving(false);
    }
  }

  function handleEditProfile() {
    setProfileError("");
    setProfileMessage("");
    setProfileEditing(true);
  }

  function handleCancelProfileEdit() {
    setProfileError("");
    setProfileMessage("");
    setProfileForm({
      fullName: customer?.fullName ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
    });
    setProfileEditing(false);
  }

  return (
    <AccountLayout
      title="Мій кабінет"
      subtitle="Ваші заявки, статуси виконання та погоджені розрахунки."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
            <h2 className="text-[28px] font-bold text-dark">Останні заявки</h2>
            <Link className="rounded-full border border-border bg-white px-5 py-3 text-[13px] font-bold text-dark hover:border-primary max-sm:w-full max-sm:text-center" to="/account/orders">
              Всі заявки
            </Link>
          </div>

          {requestsLoading ? (
            <AccountCard><p className="text-sm font-medium text-dark-text">Завантаження заявок...</p></AccountCard>
          ) : requests.length === 0 ? (
            <EmptyState />
          ) : (
            requests.slice(0, 3).map((request) => (
              <AccountRequestCard
                key={request.id}
                request={request}
                backTo="/account"
                backLabel="До кабінету"
              />
            ))
          )}
        </div>

        <AccountCard className="h-fit">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-bold text-dark">Профіль</h2>
            {!profileEditing ? (
              <button
                onClick={handleEditProfile}
                className="rounded-full border border-border bg-white px-4 py-2 text-xs font-bold text-dark hover:border-primary"
              >
                Редагувати
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {profileEditing ? (
              <>
                <Field label="Ім'я">
                  <input
                    className={inputClass}
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    placeholder="Ваше ім'я"
                  />
                </Field>
                <Field label="Телефон">
                  <input
                    className={inputClass}
                    value={profileForm.phone}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                    type="tel"
                    autoComplete="tel"
                    placeholder="+380"
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputClass}
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                  />
                </Field>
                <div className="rounded-xl bg-light-bg p-3 text-xs font-semibold leading-5 text-dark-text">
                  Якщо змінити телефон або email, ми одразу перевіримо, чи є заявки з цим контактом, і додамо їх у кабінет.
                </div>
              </>
            ) : (
              <>
                <ProfileValue label="Ім'я" value={customer?.fullName} />
                <ProfileValue label="Телефон" value={customer?.phone} />
                <ProfileValue label="Email" value={customer?.email} />
              </>
            )}
            {profileError ? <p className="text-sm font-bold text-red-600">{profileError}</p> : null}
            {profileMessage ? <p className="text-sm font-bold text-emerald-700">{profileMessage}</p> : null}
            {profileEditing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => void handleSaveProfile()}
                  disabled={profileSaving}
                  className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {profileSaving ? "Збереження..." : "Зберегти"}
                </button>
                <button
                  onClick={handleCancelProfileEdit}
                  disabled={profileSaving}
                  className="rounded-full border border-border bg-white px-5 py-3 text-[13px] font-bold text-dark hover:border-primary disabled:opacity-60"
                >
                  Скасувати
                </button>
              </div>
            ) : null}
            <button onClick={handleLogout} className="rounded-full border border-border bg-white px-5 py-3 text-[13px] font-bold text-dark hover:border-primary">
              Вийти
            </button>
          </div>
        </AccountCard>
      </div>
    </AccountLayout>
  );
}

const inputClass = "w-full rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-3 text-sm font-bold text-dark outline-none focus:ring-2 focus:ring-primary";

function ProfileValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-light-bg p-3">
      <p className="text-xs font-bold text-dark-text/70">{label}</p>
      <p className="mt-1 break-all text-sm font-bold text-dark">{value || "Не вказано"}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-bold text-dark-text">
      {label}
      {children}
    </label>
  );
}

function EmptyState() {
  return (
    <AccountCard className="flex flex-col items-start gap-3">
      <h2 className="text-[22px] font-bold text-dark">Заявок поки немає</h2>
      <p className="text-sm font-medium leading-6 text-dark-text">
        Коли ви залишите заявку або підтвердите контакт, вона з'явиться тут.
      </p>
      <Link to="/catalog" className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark">
        Переглянути техніку
      </Link>
    </AccountCard>
  );
}
