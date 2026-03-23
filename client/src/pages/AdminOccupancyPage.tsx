import { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../api/client";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminSelect,
  AdminInput,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import type { Status } from "../components/admin";

/* ── Types ───────────────────────────────────────── */
interface EquipmentRef { id: string; name: string; slug: string }
interface OrderRef { id: string; customerName: string; status: string }

interface BookedPeriod {
  id: string;
  from: string;
  to: string;
  note: string | null;
  equipmentId: string;
  equipment: EquipmentRef;
  orderId: string | null;
  order: OrderRef | null;
}

interface EquipmentOption { id: string; name: string }

interface OrderOption {
  id: string;
  customerName: string;
  phone: string;
  equipmentId: string | null;
  equipment: { name: string } | null;
  status: string;
}

type OccupantSource = "order" | "manual" | "none";
type PeriodStatus = "booked" | "rent" | "maintenance" | "free";

/* ── Helpers ─────────────────────────────────────── */
const UA_MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
const UA_WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function startDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function formatShortDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatDateRange(from: string, to: string) {
  return `${formatShortDate(new Date(from))} — ${formatShortDate(new Date(to))}`;
}

function guessStatus(p: BookedPeriod): PeriodStatus {
  const n = p.note?.toLowerCase() ?? "";
  if (n.includes("[техобслуговування]") || n.includes("техобслуговування")) return "maintenance";
  if (n.includes("[оренда]")) return "rent";
  if (n.includes("[заброньовано]")) return "booked";
  if (p.order) return "booked";
  return "booked";
}

/** Map PeriodStatus → StatusBadge Status type */
const badgeStatus: Record<PeriodStatus, Status> = {
  booked: "booked",
  rent: "rent",
  maintenance: "maintenance",
  free: "available",
};

/** Tailwind classes for calendar day cells */
const cellColors: Record<PeriodStatus, { bg: string; text: string }> = {
  booked:      { bg: "bg-orange-50",  text: "text-orange-700" },
  rent:        { bg: "bg-sky-50",     text: "text-sky-700" },
  maintenance: { bg: "bg-violet-50",  text: "text-violet-700" },
  free:        { bg: "bg-gray-50",    text: "text-gray-500" },
};

/* ── Component ───────────────────────────────────── */
export default function AdminOccupancyPage() {
  const [periods, setPeriods] = useState<BookedPeriod[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [processedOrders, setProcessedOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Equipment filter for calendar
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);

  // Tooltip hover
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [occupantSource, setOccupantSource] = useState<OccupantSource>("none");
  const [form, setForm] = useState({
    equipmentId: "",
    from: "",
    to: "",
    note: "",
    noteType: "booked" as "booked" | "rent" | "maintenance",
    orderId: "" as string,
    customerName: "",
  });

  /* ── Fetch ─────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, eq, allOrders] = await Promise.all([
        apiFetch<BookedPeriod[]>("/admin/occupancy"),
        apiFetch<EquipmentOption[]>("/equipment?limit=100"),
        apiFetch<OrderOption[]>("/admin/orders").catch(() => [] as OrderOption[]),
      ]);
      setPeriods(p);
      setEquipmentList(eq.map((e) => ({ id: e.id, name: e.name })));
      // Exclude cancelled orders
      setProcessedOrders(allOrders.filter((o) => o.status !== "CANCELLED"));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Calendar data (filtered by selected equipment) ── */
  const filteredPeriods = useMemo(() => {
    if (!selectedEquipmentId) return periods;
    return periods.filter((p) => p.equipmentId === selectedEquipmentId);
  }, [periods, selectedEquipmentId]);

  const calendarDays = useMemo(() => {
    const total = daysInMonth(year, month);
    const offset = startDayOfWeek(year, month);
    const days: { day: number; periods: { period: BookedPeriod; status: PeriodStatus }[] }[] = [];

    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month, d);
      const dayEnd = new Date(year, month, d, 23, 59, 59);

      const matching = filteredPeriods
        .filter((p) => {
          const pFrom = new Date(p.from);
          const pTo = new Date(p.to);
          return pFrom <= dayEnd && pTo >= date;
        })
        .map((p) => ({ period: p, status: guessStatus(p) }));

      days.push({ day: d, periods: matching });
    }

    return { days, offset };
  }, [filteredPeriods, year, month]);

  /* ── Filtered list for right panel ─────────────── */
  const monthPeriods = useMemo(() => {
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0, 23, 59, 59);

    return periods.filter((p) => {
      const pFrom = new Date(p.from);
      const pTo = new Date(p.to);
      return pFrom <= mEnd && pTo >= mStart;
    });
  }, [periods, year, month]);

  /* ── Actions ───────────────────────────────────── */
  function openCreate() {
    setEditId(null);
    setOccupantSource("none");
    setForm({ equipmentId: equipmentList[0]?.id ?? "", from: "", to: "", note: "", noteType: "booked", orderId: "", customerName: "" });
    setShowModal(true);
  }

  function openEdit(p: BookedPeriod) {
    setEditId(p.id);
    if (p.orderId && p.order) {
      setOccupantSource("order");
    } else if (p.note && !p.note.toLowerCase().includes("техобслуговування")) {
      setOccupantSource("manual");
    } else {
      setOccupantSource("none");
    }
    const n = p.note?.toLowerCase() ?? "";
    let detectedType: "booked" | "rent" | "maintenance" = "booked";
    if (n.includes("[техобслуговування]") || n.includes("техобслуговування")) detectedType = "maintenance";
    else if (n.includes("[оренда]")) detectedType = "rent";
    // Strip the type prefix from the note for the free-text field
    const cleanNote = (p.note ?? "")
      .replace(/^\[Заброньовано\]\s*/i, "")
      .replace(/^\[Оренда\]\s*/i, "")
      .replace(/^\[Техобслуговування\]\s*/i, "")
      .replace(/^Техобслуговування\s*\|?\s*/i, "")
      .replace(/Клієнт:.*$/i, "")
      .replace(/\|\s*$/,"")
      .trim();
    setForm({
      equipmentId: p.equipmentId,
      from: new Date(p.from).toISOString().split("T")[0],
      to: new Date(p.to).toISOString().split("T")[0],
      note: cleanNote,
      noteType: detectedType,
      orderId: p.orderId ?? "",
      customerName: p.order?.customerName ?? "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const typeLabels = { booked: "Заброньовано", rent: "Оренда", maintenance: "Техобслуговування" };
      const typeLabel = typeLabels[form.noteType];
      let noteText = `[${typeLabel}]`;
      if (form.note.trim()) noteText += ` ${form.note.trim()}`;
      if (occupantSource === "manual" && form.customerName) {
        noteText += ` | Клієнт: ${form.customerName}`;
      }

      const payload = {
        equipmentId: form.equipmentId,
        from: form.from,
        to: form.to,
        note: noteText,
        orderId: occupantSource === "order" && form.orderId ? form.orderId : undefined,
      };

      if (editId) {
        await apiFetch(`/admin/occupancy/${editId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/occupancy", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      load();
    } catch {
      // silent
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/admin/occupancy/${deleteTarget}`, { method: "DELETE" });
      load();
    } catch {
      // silent
    }
    setDeleteTarget(null);
  }

  /* ── Month navigation ──────────────────────────── */
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Завантаження…</p>;
  }

  /* ── Render ────────────────────────────────────── */
  return (
    <>
      {/* ── Header ── */}
      <AdminPageHeader
        title="Керування зайнятістю"
        subtitle={`${monthPeriods.length} записів за ${UA_MONTHS[month].toLowerCase()} ${year}`}
      >
        <AdminButton onClick={openCreate}>Додати зайнятість</AdminButton>
      </AdminPageHeader>

      {/* ── Content: Calendar + List ── */}
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        {/* ── Calendar card ── */}
        <AdminCard className="flex flex-1 flex-col gap-3 !p-4">
          {/* Calendar top */}
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-gray-900">Календар</span>
            <div className="flex items-center gap-1">
              <AdminButton variant="ghost" size="sm" onClick={prevMonth}>←</AdminButton>
              <span className="text-sm font-medium text-gray-500">
                {UA_MONTHS[month]} {year}
              </span>
              <AdminButton variant="ghost" size="sm" onClick={nextMonth}>→</AdminButton>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1">
            {UA_WEEKDAYS_SHORT.map((wd) => (
              <div key={wd} className="py-1 text-center text-[11px] font-semibold text-gray-400">
                {wd}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty offset cells */}
            {Array.from({ length: calendarDays.offset }).map((_, i) => (
              <div key={`off-${i}`} />
            ))}

            {calendarDays.days.map(({ day, periods: dayPeriods }) => {
              const hasMaintenance = dayPeriods.some((dp) => dp.status === "maintenance");
              const hasRent = dayPeriods.some((dp) => dp.status === "rent");
              const hasBooked = dayPeriods.some((dp) => dp.status === "booked");
              const multipleItems = dayPeriods.length > 1;

              let status: PeriodStatus = "free";
              if (hasMaintenance) status = "maintenance";
              else if (hasRent) status = "rent";
              else if (hasBooked) status = "booked";

              const colors = cellColors[status];
              const dayName = dayPeriods[0]?.period.equipment.name;

              return (
                <div
                  key={day}
                  className={`relative flex min-h-[48px] flex-col gap-0.5 rounded-lg p-1.5 cursor-default sm:min-h-[64px] sm:gap-1 sm:p-2 ${colors.bg}`}
                  onMouseEnter={() => multipleItems && setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  <span className={`text-xs font-bold ${colors.text}`}>
                    {UA_WEEKDAYS_SHORT[(calendarDays.offset + day - 1) % 7]}, {day}
                  </span>
                  {dayPeriods.length === 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-500">Вільно</span>
                  ) : multipleItems ? (
                    <span className="text-[11px] font-semibold text-gray-700">
                      {dayPeriods.length} од. техніки
                    </span>
                  ) : (
                    <span className="truncate text-[11px] font-semibold text-gray-700">
                      {dayName}
                    </span>
                  )}

                  {/* ── Tooltip ── */}
                  {hoveredDay === day && multipleItems && (
                    <div className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                      <p className="mb-1.5 text-xs font-bold text-gray-900">Зайнято {dayPeriods.length} од.:</p>
                      <ul className="flex flex-col gap-1.5">
                        {dayPeriods.map((dp) => (
                          <li key={dp.period.id} className="flex items-start gap-1.5">
                            <StatusBadge status={badgeStatus[dp.status]} className="mt-0.5 shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-semibold text-gray-900">
                                {dp.period.equipment.name}
                              </span>
                              {dp.period.order && (
                                <span className="text-[10px] text-gray-500">
                                  {dp.period.order.customerName}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(["booked", "rent", "maintenance", "free"] as PeriodStatus[]).map((s) => (
              <StatusBadge key={s} status={badgeStatus[s]} />
            ))}
          </div>
        </AdminCard>

        {/* ── Schedule list (right panel) ── */}
        <AdminCard className="flex w-full shrink-0 flex-col gap-3 lg:w-[420px] !p-4">
          <h2 className="text-base font-bold text-gray-900">Заявки та зайнятість</h2>

          {/* Equipment filter */}
          <AdminSelect
            value={selectedEquipmentId ?? ""}
            onChange={(e) => setSelectedEquipmentId(e.target.value || null)}
          >
            <option value="">Вся техніка</option>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </AdminSelect>

          {selectedEquipmentId && (
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEquipmentId(null)}
              className="self-start"
            >
              ↩ Загальний календар
            </AdminButton>
          )}

          {monthPeriods.length === 0 && (
            <p className="text-sm text-gray-400">Немає записів за цей місяць</p>
          )}

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {monthPeriods.map((p) => {
              const st = guessStatus(p);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedEquipmentId(p.equipmentId)}
                  className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${
                    selectedEquipmentId === p.equipmentId
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      {p.equipment.name} • {formatDateRange(p.from, p.to)}
                    </span>
                    <StatusBadge status={badgeStatus[st]} />
                  </div>
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-gray-500">
                      {p.order ? p.order.customerName : ""}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                      >
                        Редагувати
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p.id); }}
                      >
                        Видалити
                      </AdminButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      </div>

      {/* ── ConfirmModal ── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Видалити період"
        message="Ви впевнені, що хочете видалити цей період зайнятості?"
        confirmLabel="Видалити"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Modal (create / edit) ── */}
      {showModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="flex w-full max-w-[460px] flex-col gap-4 overflow-x-hidden rounded-xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 className="text-lg font-bold text-gray-900">
              {editId ? "Редагувати період" : "Додати зайнятість"}
            </h2>

            <AdminSelect
              label="Техніка"
              value={form.equipmentId}
              onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}
            >
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </AdminSelect>

            <div className="flex gap-3">
              <AdminInput
                label="Від"
                type="date"
                required
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
              <AdminInput
                label="До"
                type="date"
                required
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </div>

            {/* Occupant source */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-600">Ким зайнята</span>
              <div className="flex flex-wrap gap-2">
                {(["none", "order", "manual"] as OccupantSource[]).map((src) => {
                  const labels = { none: "Не вказано", order: "Із заявки", manual: "Вручну" };
                  return (
                    <AdminButton
                      key={src}
                      type="button"
                      variant={occupantSource === src ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => {
                        setOccupantSource(src);
                        if (src !== "order") setForm((f) => ({ ...f, orderId: "" }));
                        if (src !== "manual") setForm((f) => ({ ...f, customerName: "" }));
                      }}
                    >
                      {labels[src]}
                    </AdminButton>
                  );
                })}
              </div>

              {occupantSource === "order" && (
                <AdminSelect
                  value={form.orderId}
                  onChange={(e) => {
                    const ordId = e.target.value;
                    const ord = processedOrders.find((o) => o.id === ordId);
                    setForm({
                      ...form,
                      orderId: ordId,
                      customerName: ord?.customerName ?? "",
                    equipmentId: ord?.equipmentId ?? form.equipmentId,
                    });
                  }}
                >
                  <option value="">— Оберіть заявку —</option>
                  {processedOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.customerName} — {o.equipment?.name ?? "Загальна заявка"} ({o.phone})
                    </option>
                  ))}
                </AdminSelect>
              )}

              {occupantSource === "manual" && (
                <AdminInput
                  placeholder="Ім'я клієнта / компанія"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              )}
            </div>

            {/* Note type selector */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-600">Тип зайнятості</span>
              <div className="flex flex-wrap gap-2">
                {(["booked", "rent", "maintenance"] as const).map((t) => {
                  const labels = { booked: "📋 Заброньовано", rent: "🔧 Оренда", maintenance: "⚙️ Техобслуговування" };
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, noteType: t })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        form.noteType === t
                          ? `${cellColors[t].bg} ${cellColors[t].text}`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <AdminInput
              label="Додаткова примітка"
              placeholder="необов'язково"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <AdminButton type="button" variant="ghost" onClick={() => setShowModal(false)}>
                Скасувати
              </AdminButton>
              <AdminButton type="submit">
                {editId ? "Зберегти" : "Додати"}
              </AdminButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
