import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import AccountStatusBadge from "../components/account/AccountStatusBadge";
import {
  createCustomerMonobankPaymentLink,
  getCustomerRequest,
  type CustomerRequest,
} from "../data/customer-account";
import { useCustomerAccount } from "../context/useCustomerAccount";

export default function AccountOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customer, loading } = useCustomerAccount();
  const [request, setRequest] = useState<CustomerRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!customer) {
      navigate("/account/login", { replace: true });
      return;
    }
    if (!id) return;
    Promise.resolve().then(async () => {
      setBusy(true);
      try {
        setRequest(await getCustomerRequest(id));
      } finally {
        setBusy(false);
      }
    });
  }, [customer, id, loading, navigate]);

  const agreed = request ? request.finance.agreedTotal ?? request.finance.agreedPrice : null;
  const isPaid = request?.finance.paymentStatus === "PAID" || request?.finance.paymentStatus === "OVERPAID";
  const displayNumber = request?.convertedOrder?.orderNumber
    ? `Замовлення №${request.convertedOrder.orderNumber}`
    : request
      ? `Заявка №${request.id.slice(0, 8)}`
      : "Заявка";
  const canPay = Boolean(
    request?.convertedOrder?.id &&
    agreed !== null &&
    !isPaid,
  );
  const backTo = searchParams.get("backTo") === "/account" ? "/account" : "/account/orders";
  const backLabel = backTo === "/account" ? "До кабінету" : "До всіх заявок";

  async function handlePay() {
    if (!request || paying) return;
    setPaymentError(null);
    setPaying(true);
    try {
      const invoice = await createCustomerMonobankPaymentLink(request.id);
      window.location.assign(invoice.pageUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Не вдалося створити посилання на оплату");
      setPaying(false);
    }
  }

  return (
    <AccountLayout title="Деталі заявки" subtitle="Перегляньте статус, позиції заявки та погоджену вартість.">
      <Link to={backTo} className="mb-4 inline-flex text-sm font-bold text-dark hover:text-primary">
        ← {backLabel}
      </Link>
      {busy || !request ? (
        <AccountCard><p className="text-sm font-medium text-dark-text">Завантаження заявки...</p></AccountCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <AccountCard>
              <div className="flex items-start justify-between gap-3 max-sm:flex-col">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                    {request.convertedOrder?.orderNumber ? "Замовлення" : "Заявка"}
                  </p>
                  <h2 className="mt-1 text-[28px] font-bold text-dark">{displayNumber}</h2>
                </div>
                <AccountStatusBadge status={request.status} label={request.statusLabel} />
              </div>
            </AccountCard>

            <AccountCard>
              <h2 className="text-[22px] font-bold text-dark">Що замовлено</h2>
              <div className="mt-4 flex flex-col gap-3">
                {request.items.map((item) => (
                  <div key={item.id} className="rounded-xl bg-light-bg p-3">
                    <p className="font-bold text-dark">{item.titleSnapshot}</p>
                    <p className="text-sm font-medium text-dark-text">
                      {item.quantity} {item.unit ?? "шт"} {item.notes ? `• ${item.notes}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </AccountCard>

            <AccountCard>
              <h2 className="text-[22px] font-bold text-dark">Дані заявки</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info label="Створено" value={new Date(request.createdAt).toLocaleString("uk-UA")} />
                <Info label="Статус замовлення" value={request.statusLabel} />
                <Info label="Дата і час виконання" value={formatExecutionDateTime(request)} />
                {request.requestType === "tow" ? (
                  <>
                    <Info label="Адреса подачі евакуатора" value={request.executionAddressFrom ?? "Уточнюється"} />
                    <Info label="Адреса доставки" value={request.executionAddressTo ?? "Уточнюється"} />
                  </>
                ) : (
                  <Info label="Адреса виконання" value={request.executionAddressFrom ?? "Уточнюється"} />
                )}
                <Info label="Коментар" value={request.comment ?? "Без коментаря"} />
              </dl>
            </AccountCard>

            <AccountCard>
              <h2 className="text-[22px] font-bold text-dark">Працівник</h2>
              {request.workerContact ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Ім'я" value={request.workerContact.fullName} />
                  <Info label="Роль" value={request.workerContact.role ?? "Працівник"} />
                  <Info label="Телефон" value={request.workerContact.phone ?? "Уточнюється"} />
                </dl>
              ) : (
                <p className="mt-3 text-sm font-medium text-dark-text">
                  Контакти працівника з'являться тут, коли менеджер дозволить їх показ у замовленні.
                </p>
              )}
            </AccountCard>
          </div>

          <AccountCard className="h-fit">
            <h2 className="text-[22px] font-bold text-dark">Розрахунок</h2>
            <div className="mt-4 flex flex-col gap-3">
              <Info label="Погоджена вартість" value={agreed === null ? "Очікує погодження" : `${Math.round(agreed).toLocaleString("uk-UA")} грн`} />
              <Info label="Статус розрахунку" value={request.finance.calculationStatus} />
            </div>
            <div className="mt-5 border-t border-border pt-5">
              {canPay ? (
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {paying ? "Створюємо посилання..." : "Оплатити через monobank"}
                </button>
              ) : isPaid ? (
                <p className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-700">
                  Оплату отримано. Дякуємо, статус розрахунку оновлено.
                </p>
              ) : (
                <p className="rounded-xl bg-light-bg p-3 text-sm font-medium text-dark-text">
                  Оплата стане доступною після погодження вартості менеджером.
                </p>
              )}
              {paymentError ? (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  {paymentError}
                </p>
              ) : null}
            </div>
          </AccountCard>
        </div>
      )}
    </AccountLayout>
  );
}

function formatExecutionDateTime(request: CustomerRequest) {
  if (!request.executionScheduledDate && !request.executionScheduledTime) {
    return "Уточнюється";
  }

  const date = request.executionScheduledDate
    ? new Date(request.executionScheduledDate).toLocaleDateString("uk-UA")
    : null;
  return [date, request.executionScheduledTime].filter(Boolean).join(", ");
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-light-bg p-3">
      <dt className="text-xs font-bold text-dark-text/70">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm font-bold text-dark">{value}</dd>
    </div>
  );
}
