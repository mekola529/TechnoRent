import { useState, useEffect } from "react";
import { apiFetch } from "../api/client";

/* ── Types ── */

interface BookedPeriodRef {
  id: string;
  from: string;
  to: string;
  note: string | null;
  equipment: { name: string } | null;
}

interface Order {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  address: string | null;
  comment: string | null;
  status: string;
  createdAt: string;
  equipment: { name: string; slug: string } | null;
  bookedPeriods: BookedPeriodRef[];
}

const statusLabels: Record<string, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджена",
  IN_PROGRESS: "В обробці",
  COMPLETED: "Оброблено",
  CANCELLED: "Скасована",
};

const statusTextColors: Record<string, string> = {
  NEW: "text-[#F59E0B]",
  CONFIRMED: "text-[#2563EB]",
  IN_PROGRESS: "text-[#B45309]",
  COMPLETED: "text-[#16A34A]",
  CANCELLED: "text-[#B91C1C]",
};

const allStatuses = ["NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/* ── Component ── */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);

  async function loadOrders() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<Order[]>(`/admin/orders${qs}`);
      setOrders(data);
      if (!selected && data.length > 0) setSelected(data[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.customerName.toLowerCase().includes(q) || o.phone.includes(q);
  });

  async function markStatus(id: string, status: string) {
    try {
      await apiFetch(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOrders();
      if (selected?.id === id)
        setSelected((prev) => (prev ? { ...prev, status } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити заявку?")) return;
    try {
      await apiFetch(`/admin/orders/${id}`, { method: "DELETE" });
      if (selected?.id === id) setSelected(null);
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
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
    <div className="flex h-full flex-col gap-5 font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 px-0.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#0F172A] sm:text-[32px]">
            Запити клієнтів
          </h1>
          <p className="text-[13px] font-medium text-[#64748B]">
            TechnoRent • обробка нових заявок
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadOrders}
            className="flex-1 rounded-xl border border-[#D1D5DB] bg-white px-4 py-2.5 text-[13px] font-semibold text-dark transition-colors hover:bg-gray-50 sm:flex-none"
          >
            Оновити
          </button>
          <button className="flex-1 rounded-xl bg-[#F59E0B] px-4 py-2.5 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 sm:flex-none">
            Експорт CSV
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-2 px-0.5 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          placeholder="Пошук за ім'ям або телефоном"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 text-[13px] font-medium text-dark outline-none placeholder:text-[#94A3B8] focus:ring-2 focus:ring-primary"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 text-[13px] font-semibold text-[#374151] outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Статус: Усі</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ── Body: table + detail ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        {/* Left — table */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#DDE3EA] bg-white">
          {/* Header row */}
          <div className="hidden gap-2.5 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3 lg:flex">
            <span className="w-[200px] shrink-0 text-xs font-bold text-[#6B7280]">Ім'я</span>
            <span className="w-[140px] shrink-0 text-xs font-bold text-[#6B7280]">Телефон</span>
            <span className="w-[120px] shrink-0 text-xs font-bold text-[#6B7280]">Техніка</span>
            <span className="w-[100px] shrink-0 text-xs font-bold text-[#6B7280]">Дата</span>
            <span className="w-[90px] shrink-0 text-xs font-bold text-[#6B7280]">Статус</span>
            <span className="w-[50px] shrink-0 text-xs font-bold text-[#6B7280]"></span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="py-12 text-center text-sm text-[#64748B]">Завантаження...</p>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#64748B]">Заявок не знайдено</p>
            ) : (
              filtered.map((order) => (
                <div
                  key={order.id}
                  onClick={() => setSelected(order)}
                  className={`flex cursor-pointer flex-col gap-1 border-b border-[#F1F5F9] px-3.5 py-3 transition-colors hover:bg-[#F8FAFC] lg:flex-row lg:items-center lg:gap-2.5 ${
                    selected?.id === order.id ? "bg-[#FFFBEB]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between lg:contents">
                    <span className="truncate text-[13px] font-semibold text-dark lg:w-[200px] lg:shrink-0">
                      {order.customerName}
                    </span>
                    <span
                      className={`text-[13px] font-bold lg:order-5 lg:w-[90px] lg:shrink-0 ${statusTextColors[order.status] ?? "text-dark"}`}
                    >
                      {statusLabels[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between lg:contents">
                    <span className="text-[13px] font-medium text-dark lg:w-[140px] lg:shrink-0">
                      {order.phone}
                    </span>
                    <span className="truncate text-[13px] font-medium text-dark lg:w-[120px] lg:shrink-0">
                      {order.equipment?.name ?? "Загальна заявка"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between lg:contents">
                    <span className="text-[13px] font-medium text-dark lg:w-[100px] lg:shrink-0">
                      {new Date(order.createdAt).toLocaleDateString("uk")}
                    </span>
                    <div className="flex items-center justify-end lg:flex-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                        className="group rounded-lg p-1.5 transition-colors hover:bg-[#FEE2E2]"
                        title="Видалити"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#94A3B8] transition-colors group-hover:text-[#B91C1C]">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right — detail panel */}
        {selected && (
        <div className="flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto rounded-2xl border border-[#DDE3EA] bg-[#FCFCFD] p-[18px] lg:w-[380px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[22px] font-bold text-[#0F172A]">Деталі заявки</h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm font-bold text-[#6B7280] hover:text-dark lg:hidden"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[#6B7280]">Статус</span>
                <select
                  value={selected.status}
                  onChange={(e) => markStatus(selected.id, e.target.value)}
                  className={`w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] font-bold outline-none focus:ring-2 focus:ring-primary ${statusTextColors[selected.status] ?? "text-dark"}`}
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s} className="text-dark font-semibold">
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </div>

              <DetailField label="Клієнт" value={selected.customerName} />
              <DetailField label="Телефон" value={selected.phone} />
              <DetailField label="Техніка" value={selected.equipment?.name ?? "Загальна заявка"} />
              <DetailField label="Дата заявки" value={fmtDate(selected.createdAt)} />
              {(selected.dateFrom || selected.dateTo) && (
                <DetailField
                  label="Період оренди"
                  value={`${selected.dateFrom ? new Date(selected.dateFrom).toLocaleDateString("uk") : "—"} — ${selected.dateTo ? new Date(selected.dateTo).toLocaleDateString("uk") : "—"}`}
                />
              )}
              {selected.email && <DetailField label="Email" value={selected.email} />}
              {selected.address && <DetailField label="Адреса" value={selected.address} />}

              {/* Comment box */}
              {selected.comment && (
                <div className="flex flex-col gap-2 rounded-xl border border-[#FCD9A6] bg-[#FFF7ED] p-3">
                  <span className="text-xs font-bold text-[#6B7280]">Коментар</span>
                  <p className="text-[13px] font-medium leading-[1.4] text-dark">
                    {selected.comment}
                  </p>
                </div>
              )}

              {/* Booked periods */}
              {selected.bookedPeriods && selected.bookedPeriods.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-[#6B7280]">Броні ({selected.bookedPeriods.length})</span>
                  <div className="flex flex-col gap-1.5">
                    {selected.bookedPeriods.map((bp) => {
                      const noteLabel = bp.note?.match(/^\[(.+?)\]/)?.[1];
                      const noteColors: Record<string, { bg: string; text: string; border: string }> = {
                        "Заброньовано": { bg: "#FFF8D6", text: "#7A5B00", border: "#F2D249" },
                        "Оренда": { bg: "#E6F4EA", text: "#1A7F37", border: "#A3D9A5" },
                        "Техобслуговування": { bg: "#FFE9E6", text: "#B42318", border: "#F5A8A0" },
                      };
                      const colors = noteLabel ? noteColors[noteLabel] : null;
                      const fromD = new Date(bp.from).toLocaleDateString("uk");
                      const toD = new Date(bp.to).toLocaleDateString("uk");
                      return (
                        <div
                          key={bp.id}
                          className="flex items-center gap-2 rounded-lg border p-2.5"
                          style={{
                            backgroundColor: colors?.bg ?? "#F9FAFB",
                            borderColor: colors?.border ?? "#E5E7EB",
                          }}
                        >
                          <div className="flex flex-1 flex-col gap-0.5">
                            <span className="text-[12px] font-bold" style={{ color: colors?.text ?? "#374151" }}>
                              {noteLabel ?? "Бронь"}
                            </span>
                            <span className="text-[12px] font-medium text-[#6B7280]">
                              {bp.equipment?.name ?? "—"}
                            </span>
                            <span className="text-[11px] font-medium text-[#94A3B8]">
                              {fromD} — {toD}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-xs font-bold text-[#B91C1C] transition-colors hover:bg-red-200"
                >
                  Видалити
                </button>
              </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* ── Detail field ── */

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-[#6B7280]">{label}</span>
      <span className="text-sm font-semibold text-dark">{value}</span>
    </div>
  );
}
