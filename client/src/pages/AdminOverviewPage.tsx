import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import Skeleton from "../components/Skeleton";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  StatusBadge,
} from "../components/admin";
import type { Status } from "../components/admin/StatusBadge";

/* ── Types ── */
interface Equipment {
  id: string;
  name: string;
  slug: string;
  bookedPeriods: { id: string; from: string; to: string; note: string | null }[];
}

interface CustomerRequest {
  id: string;
  customerName: string;
  phone: string;
  status: string;
  requestType: string;
  createdAt: string;
  items?: Array<{ titleSnapshot: string }>;
  convertedOrderId: string | null;
}

interface RentOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  status: string;
  finalAgreedPrice: number | null;
  managerClosedAt: string | null;
  createdAt: string;
  items?: Array<{ equipment?: { name: string; slug: string } | null }>;
}

interface BookedPeriod {
  id: string;
  from: string;
  to: string;
  note: string | null;
  equipment: { id: string; name: string };
  order: { id: string; customerName: string; status: string } | null;
}

interface MarketingSummary {
  clicks: number;
  leads: number;
  conversionRate: number;
  topSource: string | null;
}

const requestStatusMap: Record<string, { badge: Status; label: string }> = {
  NEW:         { badge: "new",         label: "Новий" },
  CONFIRMED:   { badge: "confirmed",   label: "Підтверджена" },
  IN_PROGRESS: { badge: "in_progress", label: "В обробці" },
  CONVERTED:   { badge: "rent",        label: "Переведена" },
  COMPLETED:   { badge: "completed",   label: "Оброблено" },
  CANCELLED:   { badge: "cancelled",   label: "Скасована" },
};

const rentOrderStatusMap: Record<string, { badge: Status; label: string }> = {
  NEW: { badge: "new", label: "Нове" },
  CONFIRMED: { badge: "confirmed", label: "Підтверджене" },
  ACTIVE: { badge: "active", label: "Активне" },
  WORKER_COMPLETED: { badge: "inactive", label: "Очікує закриття" },
  COMPLETED: { badge: "completed", label: "Завершене" },
  CANCELLED: { badge: "cancelled", label: "Скасоване" },
};

const requestTypeLabels: Record<string, string> = {
  equipment_rental: "Оренда техніки",
  service: "Послуга",
  tow: "Евакуатор",
  callback: "Зворотний дзвінок",
};

/* ── Stat Card ── */
function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <AdminCard className="flex flex-col gap-1 !p-4">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className={`text-2xl font-bold ${accent}`}>{value}</span>
    </AdminCard>
  );
}

/* ── Component ── */
export default function AdminOverviewPage() {
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [rentOrders, setRentOrders] = useState<RentOrder[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [periods, setPeriods] = useState<BookedPeriod[]>([]);
  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [requestsData, rentOrdersData, e, p, marketingData] = await Promise.all([
          apiFetch<CustomerRequest[]>("/admin/requests"),
          apiFetch<RentOrder[]>("/admin/rent-orders"),
          apiFetch<Equipment[]>("/equipment"),
          apiFetch<BookedPeriod[]>("/admin/occupancy"),
          apiFetch<MarketingSummary>("/admin/marketing/summary?period=30"),
        ]);
        setRequests(requestsData);
        setRentOrders(rentOrdersData);
        setEquipment(e);
        setPeriods(p);
        setMarketingSummary(marketingData);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Derived stats ── */
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newRequests = requests.filter((request) => request.status === "NEW").length;
    const activeRentals = periods.filter((p) => {
      const from = new Date(p.from);
      const to = new Date(p.to);
      return from <= now && to >= now;
    }).length;
    const ordersInProgress = rentOrders.filter((order) =>
      ["CONFIRMED", "ACTIVE", "WORKER_COMPLETED"].includes(order.status),
    ).length;
    const completedThisMonth = rentOrders.filter((order) => {
      if (order.status !== "COMPLETED" || !order.managerClosedAt) return false;
      return new Date(order.managerClosedAt) >= monthStart;
    });
    const completedRevenue = completedThisMonth.reduce(
      (sum, order) => sum + (order.finalAgreedPrice ?? 0),
      0,
    );

    const busyIds = new Set(
      periods
        .filter((p) => {
          const from = new Date(p.from);
          const to = new Date(p.to);
          return from <= now && to >= now;
        })
        .map((p) => p.equipment.id),
    );
    const freeEquipment = equipment.filter((e) => !busyIds.has(e.id)).length;

    const maintenance = periods.filter((p) => {
      const n = p.note?.toLowerCase() ?? "";
      const from = new Date(p.from);
      const to = new Date(p.to);
      return (
        (n.includes("техобслуговування") || n.includes("[техобслуговування]")) &&
        from <= now &&
        to >= now
      );
    }).length;

    return {
      newRequests,
      activeRentals,
      ordersInProgress,
      completedThisMonth: completedThisMonth.length,
      completedRevenue,
      freeEquipment,
      maintenance,
    };
  }, [requests, rentOrders, equipment, periods]);

  /* ── Recent requests (last 5) ── */
  const recentRequests = useMemo(
    () =>
      [...requests]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [requests],
  );

  const recentCompletedOrders = useMemo(
    () =>
      [...rentOrders]
        .filter((order) => order.status === "COMPLETED")
        .sort((a, b) => {
          const aTime = a.managerClosedAt ? new Date(a.managerClosedAt).getTime() : 0;
          const bTime = b.managerClosedAt ? new Date(b.managerClosedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 5),
    [rentOrders],
  );

  if (loading) {
    return (
      <>
        <AdminPageHeader title="Огляд" subtitle="" />
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AdminCard key={i} className="flex flex-col gap-2 !p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12" />
            </AdminCard>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <AdminCard key={i} className="flex flex-col gap-3 !p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-7 w-24" />
              </div>
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-5 w-16 !rounded-full" />
                </div>
              ))}
            </AdminCard>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Огляд"
        subtitle="Загальна картина вашого бізнесу"
      />

      {/* ── Stat cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Нові заявки" value={stats.newRequests} accent="text-blue-600" />
        <StatCard label="Активні замовлення" value={stats.ordersInProgress} accent="text-emerald-600" />
        <StatCard label="Завершено за місяць" value={stats.completedThisMonth} accent="text-amber-600" />
        <StatCard label="Вільна техніка" value={stats.freeEquipment} accent="text-gray-900" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Дохід за місяць, грн" value={stats.completedRevenue} accent="text-emerald-700" />
        <StatCard label="Активні оренди" value={stats.activeRentals} accent="text-emerald-600" />
        <StatCard label="На обслуговуванні" value={stats.maintenance} accent="text-violet-600" />
      </div>

      <AdminCard className="mb-6 flex flex-col gap-3 !p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Маркетинг за 30 днів</h2>
          <Link to="/admin/marketing">
            <AdminButton variant="ghost" size="sm">Детальніше →</AdminButton>
          </Link>
        </div>
        {marketingSummary ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Кліки</div>
              <div className="mt-1 text-xl font-bold text-gray-900">{marketingSummary.clicks}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Заявки</div>
              <div className="mt-1 text-xl font-bold text-gray-900">{marketingSummary.leads}</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Конверсія</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{marketingSummary.conversionRate.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Топ-джерело</div>
              <div className="mt-1 truncate text-sm font-semibold text-gray-900">{marketingSummary.topSource ?? "—"}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Маркетингових даних поки немає</p>
        )}
      </AdminCard>

      {/* ── Content grid ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent requests */}
        <AdminCard className="flex flex-col gap-3 !p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Останні заявки</h2>
            <Link to="/admin/orders">
              <AdminButton variant="ghost" size="sm">Усі заявки →</AdminButton>
            </Link>
          </div>

          {recentRequests.length === 0 ? (
            <p className="text-sm text-gray-400">Заявок ще немає</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRequests.map((request) => {
                const sm = requestStatusMap[request.status] ?? requestStatusMap.NEW;
                const primaryItem = request.items?.[0]?.titleSnapshot ?? requestTypeLabels[request.requestType] ?? "Заявка";
                return (
                  <div
                    key={request.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {request.customerName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {primaryItem} • {request.phone}
                      </span>
                    </div>
                    <StatusBadge status={sm.badge} label={sm.label} />
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        {/* Recent completed orders */}
        <AdminCard className="flex flex-col gap-3 !p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Останні завершені замовлення</h2>
            <Link to="/admin/rent-orders">
              <AdminButton variant="ghost" size="sm">Усі замовлення →</AdminButton>
            </Link>
          </div>

          {recentCompletedOrders.length === 0 ? (
            <p className="text-sm text-gray-400">Завершених замовлень поки немає</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentCompletedOrders.map((order) => {
                const sm = rentOrderStatusMap[order.status] ?? rentOrderStatusMap.COMPLETED;
                const equipmentName = order.items?.[0]?.equipment?.name ?? "Техніка";
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {order.customerName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {equipmentName}
                        {order.finalAgreedPrice != null ? ` • ${order.finalAgreedPrice} грн` : ""}
                        {order.managerClosedAt ? ` • ${new Date(order.managerClosedAt).toLocaleDateString("uk-UA")}` : ""}
                      </span>
                    </div>
                    <StatusBadge status={sm.badge} label={sm.label} />
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>

      {/* ── Quick actions ── */}
      <AdminCard className="mt-4 !p-4">
        <h2 className="mb-3 text-base font-bold text-gray-900">Швидкі дії</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/equipment">
            <AdminButton variant="secondary" size="sm">Техніка</AdminButton>
          </Link>
          <Link to="/admin/orders">
            <AdminButton variant="secondary" size="sm">Заявки</AdminButton>
          </Link>
          <Link to="/admin/rent-orders">
            <AdminButton variant="secondary" size="sm">Замовлення</AdminButton>
          </Link>
          <Link to="/admin/occupancy">
            <AdminButton variant="secondary" size="sm">Зайнятість</AdminButton>
          </Link>
        </div>
      </AdminCard>
    </>
  );
}
