import { useEffect, useState, useMemo, useCallback } from "react";
import { apiFetch } from "../api/client";

/* ── Types ───────────────────────────────────────── */
interface EquipmentRef {
  id: string;
  name: string;
  slug: string;
}

interface OrderRef {
  id: string;
  customerName: string;
  status: string;
}

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

interface EquipmentOption {
  id: string;
  name: string;
}

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
  return d === 0 ? 6 : d - 1; // Mon=0
}

function formatShortDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  return `${formatShortDate(f)} — ${formatShortDate(t)}`;
}

function guessStatus(p: BookedPeriod): PeriodStatus {
  const n = p.note?.toLowerCase() ?? "";
  if (n.includes("[техобслуговування]") || n.includes("техобслуговування")) return "maintenance";
  if (n.includes("[оренда]")) return "rent";
  if (n.includes("[заброньовано]")) return "booked";
  if (p.order) return "booked";
  return "booked";
}

function statusLabel(s: PeriodStatus) {
  switch (s) {
    case "booked": return "Заброньовано";
    case "rent": return "Оренда";
    case "maintenance": return "Техобслуговування";
    case "free": return "Вільно";
  }
}

function statusColor(s: PeriodStatus) {
  switch (s) {
    case "booked": return { bg: "#FFF8D6", text: "#7A5B00" };
    case "rent": return { bg: "#E6F4EA", text: "#1A7F37" };
    case "maintenance": return { bg: "#FFE9E6", text: "#B42318" };
    case "free": return { bg: "#F2F4F7", text: "#12B76A" };
  }
}

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
    } catch (e) {
      console.error(e);
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
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Видалити цей період?")) return;
    try {
      await apiFetch(`/admin/occupancy/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      console.error(err);
    }
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
    return <p className="text-sm text-gray-500">Завантаження…</p>;
  }

  /* ── Render ────────────────────────────────────── */
  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark sm:text-[32px]">Керування зайнятістю</h1>
      </div>

      {/* ── Content: Calendar + List ── */}
      <div className="flex flex-1 flex-col gap-3 lg:flex-row">
        {/* ── Calendar card ── */}
        <div className="flex flex-1 flex-col gap-3 rounded-[14px] border border-border bg-white p-4">
          {/* Calendar top */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-dark">Календар зайнятості</span>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="text-sm font-semibold text-[#667085] hover:text-dark"
              >
                ←
              </button>
              <span className="text-[13px] font-semibold text-[#667085]">
                {UA_MONTHS[month]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="text-sm font-semibold text-[#667085] hover:text-dark"
              >
                →
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1">
            {UA_WEEKDAYS_SHORT.map((wd) => (
              <div key={wd} className="py-1 text-center text-[11px] font-semibold text-[#667085]">
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
              const isFree = dayPeriods.length === 0;
              const multipleItems = dayPeriods.length > 1;

              let cellBg = "#F2F4F7";
              let dayColor = "#475467";

              if (hasMaintenance) {
                cellBg = "#FFE9E6";
                dayColor = "#B42318";
              } else if (hasRent) {
                cellBg = "#E6F4EA";
                dayColor = "#1A7F37";
              } else if (hasBooked) {
                cellBg = "#FFF8D6";
                dayColor = "#7A5B00";
              } else if (isFree) {
                cellBg = "#F2F4F7";
                dayColor = "#475467";
              }

              const dayName = dayPeriods[0]?.period.equipment.name;

              return (
                <div
                  key={day}
                  className="relative flex min-h-[48px] flex-col gap-0.5 rounded-[10px] p-1.5 cursor-default sm:min-h-[64px] sm:gap-1 sm:p-2"
                  style={{ backgroundColor: cellBg }}
                  onMouseEnter={() => multipleItems && setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  <span className="text-xs font-bold" style={{ color: dayColor }}>
                    {UA_WEEKDAYS_SHORT[(calendarDays.offset + day - 1) % 7]}, {day}
                  </span>
                  {dayPeriods.length === 0 ? (
                    <span className="text-[11px] font-semibold text-[#12B76A]">Вільно</span>
                  ) : multipleItems ? (
                    <span className="text-[11px] font-semibold text-dark">
                      {dayPeriods.length} од. техніки
                    </span>
                  ) : (
                    <span className="truncate text-[11px] font-semibold text-dark">
                      {dayName}
                    </span>
                  )}

                  {/* ── Tooltip ── */}
                  {hoveredDay === day && multipleItems && (
                    <div className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-xl border border-border bg-white p-3 shadow-lg">
                      <p className="mb-1.5 text-xs font-bold text-dark">Зайнято {dayPeriods.length} од.:</p>
                      <ul className="flex flex-col gap-1.5">
                        {dayPeriods.map((dp) => {
                          const sc = statusColor(dp.status);
                          return (
                            <li key={dp.period.id} className="flex items-start gap-1.5">
                              <span
                                className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: sc.text }}
                              />
                              <div className="flex flex-col">
                                <span className="text-[11px] font-semibold text-dark">
                                  {dp.period.equipment.name}
                                </span>
                                <span className="text-[10px] font-medium" style={{ color: sc.text }}>
                                  {statusLabel(dp.status)}
                                  {dp.period.order ? ` • ${dp.period.order.customerName}` : ""}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:gap-2.5">
            {(["booked", "rent", "maintenance", "free"] as PeriodStatus[]).map((s) => {
              const c = statusColor(s);
              return (
                <span
                  key={s}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: c.bg, color: c.text }}
                >
                  {statusLabel(s)}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Schedule list (right panel) ── */}
        <div className="flex w-full shrink-0 flex-col gap-3 rounded-[14px] border border-border bg-white p-4 lg:w-[420px]">
          <h2 className="text-lg font-bold text-dark">Заявки та зайнятість</h2>

          {/* Equipment filter */}
          <div className="flex flex-col gap-2">
            <select
              value={selectedEquipmentId ?? ""}
              onChange={(e) =>
                setSelectedEquipmentId(e.target.value || null)
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-dark"
            >
              <option value="">Вся техніка</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>

            {selectedEquipmentId && (
              <button
                onClick={() => setSelectedEquipmentId(null)}
                className="self-start rounded-full border border-border bg-[#F9FAFB] px-3 py-1.5 text-xs font-semibold text-[#344054] transition-colors hover:bg-[#F2F4F7]"
              >
                ↩ Загальний календар
              </button>
            )}
          </div>

          {monthPeriods.length === 0 && (
            <p className="text-sm text-[#667085]">Немає записів за цей місяць</p>
          )}

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {monthPeriods.map((p) => {
              const st = guessStatus(p);
              const sc = statusColor(st);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedEquipmentId(p.equipmentId)}
                  className={`flex cursor-pointer flex-col gap-2 rounded-[10px] border p-3 transition-colors ${
                    selectedEquipmentId === p.equipmentId
                      ? "border-primary bg-[#FFFDF0]"
                      : "border-border bg-white hover:bg-[#F9FAFB]"
                  }`}
                >
                  <span className="text-[13px] font-bold text-dark">
                    {p.equipment.name} • {formatDateRange(p.from, p.to)}
                  </span>
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs font-semibold" style={{ color: sc.text }}>
                      Статус: {statusLabel(st)}
                      {p.order ? ` (${p.order.customerName})` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-full bg-[#171A21] px-2.5 py-1.5 text-xs font-semibold text-[#F5F5F5]"
                      >
                        Редагувати
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="rounded-full bg-[#FFE9E6] px-2.5 py-1.5 text-xs font-semibold text-[#B42318]"
                      >
                        Видалити
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add occupancy */}
          <button
            onClick={openCreate}
            className="w-full rounded-full bg-primary py-2.5 text-center text-[13px] font-bold text-dark"
          >
            Додати зайнятість
          </button>
        </div>
      </div>

      {/* ── Modal (create / edit) ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form
            onSubmit={handleSubmit}
            className="flex w-[calc(100vw-2rem)] max-w-[460px] flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl sm:p-6"
          >
            <h2 className="text-xl font-bold text-dark">
              {editId ? "Редагувати період" : "Додати зайнятість"}
            </h2>

            <label className="flex flex-col gap-1 text-sm font-semibold text-dark">
              Техніка
              <select
                value={form.equipmentId}
                onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-dark">
                Від
                <input
                  type="date"
                  required
                  value={form.from}
                  onChange={(e) => setForm({ ...form, from: e.target.value })}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-dark">
                До
                <input
                  type="date"
                  required
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Occupant source */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-dark">Ким зайнята</span>
              <div className="flex flex-wrap gap-2">
                {(["none", "order", "manual"] as OccupantSource[]).map((src) => {
                  const labels = { none: "Не вказано", order: "Із заявки", manual: "Вручну" };
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        setOccupantSource(src);
                        if (src !== "order") setForm((f) => ({ ...f, orderId: "" }));
                        if (src !== "manual") setForm((f) => ({ ...f, customerName: "" }));
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        occupantSource === src
                          ? "bg-primary text-dark"
                          : "border border-border bg-white text-[#344054] hover:bg-[#F9FAFB]"
                      }`}
                    >
                      {labels[src]}
                    </button>
                  );
                })}
              </div>

              {occupantSource === "order" && (
                <select
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
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <option value="">— Оберіть заявку —</option>
                  {processedOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.customerName} — {o.equipment?.name ?? "Загальна заявка"} ({o.phone})
                    </option>
                  ))}
                </select>
              )}

              {occupantSource === "manual" && (
                <input
                  type="text"
                  placeholder="Ім'я клієнта / компанія"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              )}
            </div>

            {/* Note type selector */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-dark">Тип зайнятості</span>
              <div className="flex flex-wrap gap-2">
                {(["booked", "rent", "maintenance"] as const).map((t) => {
                  const labels = { booked: "📋 Заброньовано", rent: "🔧 Оренда", maintenance: "⚙️ Техобслуговування" };
                  const activeStyles = {
                    booked: "bg-[#FFF8D6] text-[#7A5B00]",
                    rent: "bg-[#E6F4EA] text-[#1A7F37]",
                    maintenance: "bg-[#FFE9E6] text-[#B42318]",
                  };
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, noteType: t })}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        form.noteType === t
                          ? activeStyles[t]
                          : "border border-border bg-white text-[#344054] hover:bg-[#F9FAFB]"
                      }`}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-1 text-sm font-semibold text-dark">
              Додаткова примітка
              <input
                type="text"
                placeholder="необов'язково"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[#344054]"
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-dark"
              >
                {editId ? "Зберегти" : "Додати"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
