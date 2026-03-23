import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
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

interface Order {
  id: string;
  customerName: string;
  phone: string;
  status: string;
  createdAt: string;
  equipment: { name: string; slug: string } | null;
}

interface BookedPeriod {
  id: string;
  from: string;
  to: string;
  note: string | null;
  equipment: { id: string; name: string };
  order: { id: string; customerName: string; status: string } | null;
}

const statusMap: Record<string, { badge: Status; label: string }> = {
  NEW:         { badge: "new",         label: "Новий" },
  CONFIRMED:   { badge: "confirmed",   label: "Підтверджена" },
  IN_PROGRESS: { badge: "in_progress", label: "В обробці" },
  COMPLETED:   { badge: "completed",   label: "Оброблено" },
  CANCELLED:   { badge: "cancelled",   label: "Скасована" },
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [periods, setPeriods] = useState<BookedPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, e, p] = await Promise.all([
          apiFetch<Order[]>("/admin/orders"),
          apiFetch<Equipment[]>("/equipment"),
          apiFetch<BookedPeriod[]>("/admin/occupancy"),
        ]);
        setOrders(o);
        setEquipment(e);
        setPeriods(p);
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
    const newOrders = orders.filter((o) => o.status === "NEW").length;
    const activeRentals = periods.filter((p) => {
      const from = new Date(p.from);
      const to = new Date(p.to);
      return from <= now && to >= now;
    }).length;

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

    return { newOrders, activeRentals, freeEquipment, maintenance };
  }, [orders, equipment, periods]);

  /* ── Recent orders (last 5) ── */
  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [orders],
  );

  /* ── Upcoming period endings (next 7 days) ── */
  const upcomingEnds = useMemo(() => {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return periods
      .filter((p) => {
        const to = new Date(p.to);
        return to >= now && to <= weekLater;
      })
      .sort((a, b) => new Date(a.to).getTime() - new Date(b.to).getTime())
      .slice(0, 5);
  }, [periods]);

  if (loading) {
    return <p className="text-sm text-gray-400">Завантаження…</p>;
  }

  return (
    <>
      <AdminPageHeader
        title="Огляд"
        subtitle="Загальна картина вашого бізнесу"
      />

      {/* ── Stat cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Нові заявки" value={stats.newOrders} accent="text-blue-600" />
        <StatCard label="Активні оренди" value={stats.activeRentals} accent="text-emerald-600" />
        <StatCard label="Вільна техніка" value={stats.freeEquipment} accent="text-gray-900" />
        <StatCard label="На обслуговуванні" value={stats.maintenance} accent="text-violet-600" />
      </div>

      {/* ── Content grid ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <AdminCard className="flex flex-col gap-3 !p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Останні заявки</h2>
            <Link to="/admin/orders">
              <AdminButton variant="ghost" size="sm">Усі заявки →</AdminButton>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-400">Заявок ще немає</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentOrders.map((o) => {
                const sm = statusMap[o.status] ?? statusMap.NEW;
                return (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {o.customerName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {o.equipment?.name ?? "Загальна заявка"} • {o.phone}
                      </span>
                    </div>
                    <StatusBadge status={sm.badge} label={sm.label} />
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        {/* Upcoming endings */}
        <AdminCard className="flex flex-col gap-3 !p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Найближчі завершення</h2>
            <Link to="/admin/occupancy">
              <AdminButton variant="ghost" size="sm">Календар →</AdminButton>
            </Link>
          </div>

          {upcomingEnds.length === 0 ? (
            <p className="text-sm text-gray-400">Немає завершень у найближчі 7 днів</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingEnds.map((p) => {
                const to = new Date(p.to);
                const diffDays = Math.ceil(
                  (to.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {p.equipment.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        до {to.toLocaleDateString("uk-UA")}
                        {p.order ? ` • ${p.order.customerName}` : ""}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        diffDays <= 1 ? "text-red-500" : diffDays <= 3 ? "text-amber-500" : "text-gray-500"
                      }`}
                    >
                      {diffDays <= 0 ? "Сьогодні" : `${diffDays} дн.`}
                    </span>
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
          <Link to="/admin/occupancy">
            <AdminButton variant="secondary" size="sm">Зайнятість</AdminButton>
          </Link>
        </div>
      </AdminCard>
    </>
  );
}
