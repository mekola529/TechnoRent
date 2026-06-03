import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import {
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminPageHeader,
  ConfirmModal,
  StatusBadge,
  type Status,
} from "../components/admin";
import { AdminTableRowsSkeleton } from "../components/Skeleton";

interface AdminCustomer {
  id: string;
  accountId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  isRegistered: boolean;
  registeredAt: string | null;
  lastLoginAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  ordersCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  orderTotal: number;
  clientPaid: number;
  clientDebt: number;
  paymentState: "none" | "paid" | "partial" | "debt" | "overpaid";
  paymentStateLabel: string;
}

interface AdminCustomerOrder {
  id: string;
  orderNumber: number | null;
  status: string;
  paymentStatus: string | null;
  serviceTitle: string | null;
  orderTotal: number;
  clientPaid: number;
  clientDebt: number;
  scheduledDate: string | null;
  createdAt: string;
}

interface CustomerDetailResponse {
  customer: AdminCustomer;
  orders: AdminCustomerOrder[];
}

const orderStatusLabels: Record<string, string> = {
  NEW: "Нове",
  CONFIRMED: "Підтверджено",
  ACTIVE: "Виконується",
  WORKER_COMPLETED: "Роботу виконано",
  COMPLETED: "Завершено",
  CANCELLED: "Скасовано",
};

const paymentTone: Record<AdminCustomer["paymentState"], Status> = {
  none: "inactive",
  paid: "confirmed",
  partial: "in_progress",
  debt: "cancelled",
  overpaid: "booked",
};

function fmtMoney(value: number | null | undefined) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Number(value ?? 0))} грн`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("uk-UA");
}

function orderStatusTone(status: string): Status {
  if (status === "COMPLETED" || status === "WORKER_COMPLETED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "ACTIVE") return "active";
  if (status === "CONFIRMED") return "confirmed";
  return "new";
}

function getOrderLink(order: AdminCustomerOrder) {
  return `/admin/rent-orders/${encodeURIComponent(String(order.orderNumber ?? order.id))}`;
}

export default function AdminCustomersPage() {
  const { customerId } = useParams<{ customerId?: string }>();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminCustomer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (customerId) {
          const data = await apiFetch<CustomerDetailResponse>(`/admin/customers/${encodeURIComponent(customerId)}`);
          if (!cancelled) setDetail(data);
        } else {
          const data = await apiFetch<AdminCustomer[]>("/admin/customers");
          if (!cancelled) setCustomers(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не вдалося завантажити клієнтів");
          setCustomers([]);
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) =>
      [
        customer.name,
        customer.phone ?? "",
        customer.email ?? "",
        customer.isRegistered ? "зареєстрований" : "незареєстрований",
        customer.paymentStateLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [customers, search]);

  async function confirmDeleteCustomer() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setError(null);
    try {
      await apiFetch<{ status: string }>(`/admin/customers/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });

      setCustomers((current) => current.filter((customer) => customer.id !== deleteTarget.id));
      setDeleteTarget(null);

      if (customerId) {
        navigate("/admin/customers");
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не вдалося видалити клієнта");
    } finally {
      setDeleting(false);
    }
  }

  const deleteModal = (
    <ConfirmModal
      open={Boolean(deleteTarget)}
      title="Видалити клієнта?"
      message={`Клієнт ${deleteTarget?.name ?? ""} буде прибраний зі списку клієнтів, а його акаунт буде видалено. Історія замовлень залишиться в адмінці.`}
      confirmLabel={deleting ? "Видалення..." : "Видалити"}
      cancelLabel="Скасувати"
      variant="danger"
      onConfirm={confirmDeleteCustomer}
      onCancel={() => {
        if (!deleting) setDeleteTarget(null);
      }}
    />
  );

  if (customerId) {
    return (
      <div>
        <AdminPageHeader
          title={detail?.customer.name ?? "Клієнт"}
          subtitle="Усі замовлення клієнта та стан розрахунків."
        >
          {detail?.customer ? (
            <AdminButton variant="danger" onClick={() => setDeleteTarget(detail.customer)}>
              Видалити клієнта
            </AdminButton>
          ) : null}
          <AdminButton variant="secondary" onClick={() => navigate("/admin/customers")}>
            До списку клієнтів
          </AdminButton>
        </AdminPageHeader>
        {deleteModal}

        {error ? (
          <AdminCard>
            <p className="text-sm font-semibold text-red-600">{error}</p>
          </AdminCard>
        ) : loading || !detail ? (
          <AdminCard><AdminTableRowsSkeleton rows={6} cols={5} /></AdminCard>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Стан" value={detail.customer.paymentStateLabel} tone={paymentTone[detail.customer.paymentState]} />
              <MetricCard label="Активні замовлення" value={String(detail.customer.activeOrdersCount)} />
              <MetricCard label="Виконані" value={String(detail.customer.completedOrdersCount)} />
              <MetricCard label="Борг" value={fmtMoney(detail.customer.clientDebt)} tone={detail.customer.clientDebt > 0 ? "cancelled" : "confirmed"} />
            </div>

            <AdminCard>
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <Info label="Реєстрація" value={detail.customer.isRegistered ? "Зареєстрований" : "Без акаунту"} />
                <Info label="Телефон" value={detail.customer.phone ?? "—"} />
                <Info label="Email" value={detail.customer.email ?? "—"} />
                <Info label="Остання активність" value={fmtDate(detail.customer.lastSeenAt)} />
              </div>
            </AdminCard>

            <AdminCard className="overflow-hidden p-0">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-bold text-gray-900">Замовлення клієнта</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Замовлення</th>
                      <th className="px-5 py-3">Послуга</th>
                      <th className="px-5 py-3">Статус</th>
                      <th className="px-5 py-3">Сума</th>
                      <th className="px-5 py-3">Оплачено</th>
                      <th className="px-5 py-3">Борг</th>
                      <th className="px-5 py-3">Дата</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {detail.orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <Link to={getOrderLink(order)} className="font-bold text-primary hover:underline">
                            №{order.orderNumber ?? order.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{order.serviceTitle ?? "—"}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={orderStatusTone(order.status)} label={orderStatusLabels[order.status] ?? order.status} />
                        </td>
                        <td className="px-5 py-3 text-gray-700">{fmtMoney(order.orderTotal)}</td>
                        <td className="px-5 py-3 text-gray-700">{fmtMoney(order.clientPaid)}</td>
                        <td className="px-5 py-3 font-semibold text-gray-900">{fmtMoney(order.clientDebt)}</td>
                        <td className="px-5 py-3 text-gray-500">{fmtDate(order.scheduledDate ?? order.createdAt)}</td>
                      </tr>
                    ))}
                    {detail.orders.length === 0 ? (
                      <tr>
                        <td className="px-5 py-8 text-center text-sm text-gray-500" colSpan={7}>
                          Замовлень ще немає.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader title="Клієнти" subtitle="Зареєстровані та незареєстровані клієнти, розрахунки й замовлення." />
      {deleteModal}
      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за ім'ям, телефоном, email або статусом"
      />

      <AdminCard className="overflow-hidden p-0">
        {loading ? (
          <div className="p-5"><AdminTableRowsSkeleton rows={8} cols={7} /></div>
        ) : error ? (
          <div className="p-5 text-sm font-semibold text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Клієнт</th>
                  <th className="px-5 py-3">Акаунт</th>
                  <th className="px-5 py-3">Стан розрахунку</th>
                  <th className="px-5 py-3">Активні</th>
                  <th className="px-5 py-3">Виконані</th>
                  <th className="px-5 py-3">Борг</th>
                  <th className="px-5 py-3">Остання активність</th>
                  <th className="px-5 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/customers/${encodeURIComponent(customer.id)}`} className="font-bold text-gray-900 hover:text-primary">
                        {customer.name}
                      </Link>
                      <div className="mt-1 text-xs text-gray-500">
                        {[customer.phone, customer.email].filter(Boolean).join(" • ") || "Контакт не вказано"}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        status={customer.isRegistered ? "confirmed" : "inactive"}
                        label={customer.isRegistered ? "Зареєстрований" : "Без акаунту"}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={paymentTone[customer.paymentState]} label={customer.paymentStateLabel} />
                      <div className="mt-1 text-xs text-gray-500">
                        {fmtMoney(customer.clientPaid)} / {fmtMoney(customer.orderTotal)}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{customer.activeOrdersCount}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{customer.completedOrdersCount}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{fmtMoney(customer.clientDebt)}</td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(customer.lastSeenAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <AdminButton variant="danger" size="sm" onClick={() => setDeleteTarget(customer)}>
                        Видалити
                      </AdminButton>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-sm text-gray-500" colSpan={8}>
                      Клієнтів не знайдено.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

function MetricCard({ label, value, tone = "inactive" }: { label: string; value: string; tone?: Status }) {
  return (
    <AdminCard>
      <div className="mb-3"><StatusBadge status={tone} label={label} /></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </AdminCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 break-all font-semibold text-gray-900">{value}</p>
    </div>
  );
}
