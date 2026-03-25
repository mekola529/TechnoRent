import { useState, useEffect } from "react";
import { apiFetch } from "../api/client";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import {
  AdminPageHeader,
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminSelect,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import type { Status } from "../components/admin/StatusBadge";

/* ── Types ── */

interface ServiceRequest {
  id: string;
  serviceType: string;
  customerName: string;
  phone: string;
  address: string;
  date: string;
  time: string;
  comment: string | null;
  status: string;
  createdAt: string;
}

const statusMap: Record<string, { badge: Status; label: string }> = {
  NEW:         { badge: "new",         label: "Новий" },
  CONFIRMED:   { badge: "confirmed",   label: "Підтверджена" },
  IN_PROGRESS: { badge: "in_progress", label: "В обробці" },
  COMPLETED:   { badge: "completed",   label: "Оброблено" },
  CANCELLED:   { badge: "cancelled",   label: "Скасована" },
};

const serviceTypeLabels: Record<string, string> = {
  debris_removal: "Вивіз будівельного сміття",
};

const allStatuses = ["NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/* ── Component ── */

export default function AdminServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<ServiceRequest[]>(`/admin/service-requests${qs}`);
      setRequests(data);
      if (!selected && data.length > 0) setSelected(data[0]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const newCount = requests.filter((r) => r.status === "NEW").length;

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.customerName.toLowerCase().includes(q) || r.phone.includes(q) || r.address.toLowerCase().includes(q);
  });

  async function markStatus(id: string, status: string) {
    try {
      await apiFetch(`/admin/service-requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadRequests();
      if (selected?.id === id)
        setSelected((prev) => (prev ? { ...prev, status } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/service-requests/${id}`, { method: "DELETE" });
      if (selected?.id === id) setSelected(null);
      await loadRequests();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
    setDeleteTarget(null);
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("uk") +
      " " +
      d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })
    );
  }

  /* ── Render ── */

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      {/* Header */}
      <AdminPageHeader
        title="Заявки на послуги"
        subtitle={`${requests.length} заявок${newCount > 0 ? ` • ${newCount} нових` : ""}`}
      >
        <AdminButton variant="secondary" size="sm" onClick={loadRequests}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      {/* Filters */}
      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за ім'ям, телефоном або адресою…"
      >
        <div className="w-full sm:w-44">
          <AdminSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всі статуси</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{statusMap[s]?.label ?? s}</option>
            ))}
          </AdminSelect>
        </div>
        {newCount > 0 && (
          <AdminButton
            variant={statusFilter === "NEW" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatusFilter(statusFilter === "NEW" ? "all" : "NEW")}
          >
            Лише нові ({newCount})
          </AdminButton>
        )}
      </AdminFilterBar>

      {/* Body: table + detail */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Left — table */}
        <AdminCard className="flex flex-1 flex-col overflow-hidden p-0">
          {/* Header row */}
          <div className="hidden gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 lg:flex">
            <span className="w-[170px] shrink-0 text-xs font-semibold text-gray-500">Ім'я</span>
            <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Телефон</span>
            <span className="w-[140px] shrink-0 text-xs font-semibold text-gray-500">Адреса</span>
            <span className="w-[90px] shrink-0 text-xs font-semibold text-gray-500">Дата</span>
            <span className="w-[100px] shrink-0 text-xs font-semibold text-gray-500">Статус</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <AdminTableRowsSkeleton rows={6} cols={5} />
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">Заявок не знайдено</p>
            ) : (
              filtered.map((req) => {
                const isNew = req.status === "NEW";
                const isSelected = selected?.id === req.id;
                return (
                  <div
                    key={req.id}
                    onClick={() => setSelected(req)}
                    className={`flex cursor-pointer flex-col gap-1 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/60 lg:flex-row lg:items-center lg:gap-2 ${
                      isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
                    } ${isNew && !isSelected ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex items-center justify-between lg:contents">
                      <span className={`truncate text-sm lg:w-[170px] lg:shrink-0 ${isNew ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                        {req.customerName}
                      </span>
                      <span className="lg:order-5 lg:w-[100px] lg:shrink-0">
                        <StatusBadge status={statusMap[req.status]?.badge ?? "new"} label={statusMap[req.status]?.label} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between lg:contents">
                      <span className="text-sm text-gray-600 lg:w-[120px] lg:shrink-0">
                        {req.phone}
                      </span>
                      <span className="truncate text-sm text-gray-600 lg:w-[140px] lg:shrink-0">
                        {req.address}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 lg:w-[90px] lg:shrink-0">
                      {new Date(req.date).toLocaleDateString("uk")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </AdminCard>

        {/* Right — detail panel */}
        {selected && (
          <AdminCard className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-[360px]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Деталі заявки</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Status select */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-500">Статус</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={statusMap[selected.status]?.badge ?? "new"} label={statusMap[selected.status]?.label} />
                <select
                  value={selected.status}
                  onChange={(e) => markStatus(selected.id, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-primary"
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>{statusMap[s]?.label ?? s}</option>
                  ))}
                </select>
              </div>
            </div>

            <DetailField label="Послуга" value={serviceTypeLabels[selected.serviceType] ?? selected.serviceType} />
            <DetailField label="Клієнт" value={selected.customerName} />
            <DetailField label="Телефон" value={selected.phone} />
            <DetailField label="Адреса" value={selected.address} />
            <DetailField label="Дата вивозу" value={new Date(selected.date).toLocaleDateString("uk")} />
            <DetailField label="Час" value={selected.time} />
            <DetailField label="Дата заявки" value={fmtDate(selected.createdAt)} />

            {/* Comment */}
            {selected.comment && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50 p-3">
                <span className="text-xs font-medium text-gray-500">Коментар</span>
                <p className="text-sm leading-relaxed text-gray-700">{selected.comment}</p>
              </div>
            )}

            {/* Quick status actions */}
            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              {selected.status !== "CONFIRMED" && (
                <AdminButton size="sm" onClick={() => markStatus(selected.id, "CONFIRMED")}>
                  Підтвердити
                </AdminButton>
              )}
              {selected.status !== "IN_PROGRESS" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(selected.id, "IN_PROGRESS")}>
                  В обробку
                </AdminButton>
              )}
              {selected.status !== "COMPLETED" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(selected.id, "COMPLETED")}>
                  Завершити
                </AdminButton>
              )}
              {selected.status !== "CANCELLED" && (
                <AdminButton variant="ghost" size="sm" onClick={() => markStatus(selected.id, "CANCELLED")}>
                  Скасувати
                </AdminButton>
              )}
              <AdminButton
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget(selected.id)}
              >
                Видалити
              </AdminButton>
            </div>
          </AdminCard>
        )}
      </div>

      {/* Confirm delete */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Видалення заявки"
        message="Ви впевнені, що хочете видалити цю заявку? Цю дію неможливо скасувати."
        confirmLabel="Видалити"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ── Detail field ── */

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
