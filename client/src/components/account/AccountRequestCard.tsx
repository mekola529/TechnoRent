import { Link } from "react-router-dom";
import type { CustomerRequest } from "../../data/customer-account";
import AccountCard from "./AccountCard";
import AccountStatusBadge from "./AccountStatusBadge";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "Очікує погодження";
  return `${Math.round(value).toLocaleString("uk-UA")} грн`;
}

function getRequestTitle(request: CustomerRequest) {
  return request.items[0]?.titleSnapshot ?? "Заявка TechnoRent";
}

function getRequestTypeLabel(type: string) {
  if (type === "tow") return "Евакуатор";
  if (type === "equipment_rental") return "Оренда техніки";
  if (type === "callback") return "Зворотний дзвінок";
  return "Послуга";
}

function getCustomerRequestNumberLabel(request: CustomerRequest) {
  if (request.convertedOrder?.orderNumber) {
    return `Замовлення №${request.convertedOrder.orderNumber}`;
  }
  return `Заявка №${request.id.slice(0, 8)}`;
}

function formatExecutionDateTime(request: CustomerRequest) {
  if (!request.executionScheduledDate && !request.executionScheduledTime) {
    return "Час погоджує менеджер";
  }

  const date = request.executionScheduledDate
    ? new Date(request.executionScheduledDate).toLocaleDateString("uk-UA")
    : null;
  return [date, request.executionScheduledTime].filter(Boolean).join(", ");
}

function getAddressSummary(request: CustomerRequest) {
  if (request.requestType === "tow") {
    const from = request.executionAddressFrom ?? "Адресу подачі уточнює менеджер";
    const to = request.executionAddressTo ?? "Адресу доставки уточнює менеджер";
    return `Звідки: ${from} • Куди: ${to}`;
  }

  return request.executionAddressFrom ?? "Адресу виконання уточнює менеджер";
}

interface AccountRequestCardProps {
  request: CustomerRequest;
  backTo?: string;
  backLabel?: string;
}

function getDetailUrl(requestId: string, backTo?: string, backLabel?: string) {
  const params = new URLSearchParams();
  if (backTo) params.set("backTo", backTo);
  if (backLabel) params.set("backLabel", backLabel);
  const query = params.toString();
  return `/account/orders/${requestId}${query ? `?${query}` : ""}`;
}

export default function AccountRequestCard({
  request,
  backTo,
  backLabel,
}: AccountRequestCardProps) {
  const agreed = request.finance.agreedTotal ?? request.finance.agreedPrice;
  return (
    <AccountCard className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
            {getRequestTypeLabel(request.requestType)}
          </p>
          <h2 className="mt-1 text-[22px] font-bold text-dark">
            {getRequestTitle(request)}
          </h2>
          <p className="mt-1 text-sm font-bold text-dark-text">
            {getCustomerRequestNumberLabel(request)}
          </p>
        </div>
        <AccountStatusBadge status={request.status} label={request.statusLabel} />
      </div>

      <div className="grid gap-3 text-sm font-medium text-dark-text sm:grid-cols-4">
        <Info label="Створено" value={new Date(request.createdAt).toLocaleDateString("uk-UA")} />
        <Info label="Дата і час виконання" value={formatExecutionDateTime(request)} />
        <Info label="Погоджена вартість" value={formatMoney(agreed)} />
        <Info label="Статус розрахунку" value={request.finance.calculationStatus} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4 max-sm:flex-col max-sm:items-start">
        <p className="text-sm font-medium text-dark-text">
          {getAddressSummary(request)}
        </p>
        <Link
          to={getDetailUrl(request.id, backTo, backLabel)}
          className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 max-sm:w-full max-sm:text-center"
        >
          Детальніше
        </Link>
      </div>
    </AccountCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-light-bg p-3">
      <p className="text-xs font-bold text-dark-text/70">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm font-bold text-dark">{value}</p>
    </div>
  );
}
