import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import {
  AdminPageHeader,
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminSelect,
  AdminInput,
  AdminTextarea,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import type { Status } from "../components/admin/StatusBadge";

/* ── Types ── */

interface EquipmentRef {
  id: string;
  name: string;
  slug: string;
}

interface SourceRequestRef {
  id: string;
  customerName: string;
  phone: string;
}

interface RentOrderItem {
  id: string;
  equipmentId: string;
  equipment: EquipmentRef | null;
  startDate: string;
  endDate: string;
}

interface RentOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  items: RentOrderItem[];
  status: string;
  comment: string | null;
  sourceType: string;
  sourceRequestId: string | null;
  sourceRequest: SourceRequestRef | null;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentOption {
  id: string;
  name: string;
  slug: string;
}

/* Form item — one equipment row */
interface FormItem {
  key: string; // unique key for React
  equipmentId: string;
  startDate: string;
  endDate: string;
}

interface FormState {
  customerName: string;
  customerPhone: string;
  items: FormItem[];
  status: string;
  comment: string;
  sourceType: string;
  sourceRequestId: string;
}

interface ItemError {
  equipmentId?: string;
  startDate?: string;
  endDate?: string;
}

interface FieldErrors {
  customerName?: string;
  customerPhone?: string;
  items?: Record<number, ItemError>;
  itemsGlobal?: string;
}

/* ── Constants ── */

const statusMap: Record<string, { badge: Status; label: string }> = {
  NEW:       { badge: "new",       label: "Нове" },
  CONFIRMED: { badge: "confirmed", label: "Підтверджене" },
  ACTIVE:    { badge: "active",    label: "Активне" },
  COMPLETED: { badge: "completed", label: "Завершене" },
  CANCELLED: { badge: "cancelled", label: "Скасоване" },
};

const allStatuses = ["NEW", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];

let keyCounter = 0;
function newItemKey() {
  return `item_${++keyCounter}`;
}

function makeEmptyItem(): FormItem {
  return { key: newItemKey(), equipmentId: "", startDate: "", endDate: "" };
}

const emptyForm: FormState = {
  customerName: "",
  customerPhone: "",
  items: [makeEmptyItem()],
  status: "NEW",
  comment: "",
  sourceType: "manual",
  sourceRequestId: "",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("uk") +
    " " +
    d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })
  );
}

function toInputDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

/** Summarise equipment names for the list row */
function equipmentSummary(items: RentOrderItem[]): string {
  if (items.length === 0) return "—";
  const first = items[0].equipment?.name ?? "—";
  if (items.length === 1) return first;
  return `${first} +${items.length - 1}`;
}

/** Earliest start / latest end across items */
function periodSummary(items: RentOrderItem[]): string {
  if (items.length === 0) return "—";
  const starts = items.map((i) => new Date(i.startDate).getTime());
  const ends = items.map((i) => new Date(i.endDate).getTime());
  return `${fmtDate(new Date(Math.min(...starts)).toISOString())} — ${fmtDate(new Date(Math.max(...ends)).toISOString())}`;
}

/* ── Component ── */

export default function AdminRentOrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems] = useState<RentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  /* View modes: "list" | "detail" | "form" */
  const [viewMode, setViewMode] = useState<"list" | "detail" | "form">("list");
  const [detailOrder, setDetailOrder] = useState<RentOrder | null>(null);

  const [editingItem, setEditingItem] = useState<RentOrder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  const formMode: "create" | "edit" = editingItem?.id ? "edit" : "create";

  /* ── Data loading ── */

  async function loadItems() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<RentOrder[]>(`/admin/rent-orders${qs}`);
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function loadEquipment() {
    try {
      const data = await apiFetch<EquipmentOption[]>("/equipment");
      setEquipmentList(data);
    } catch {
      /* */
    }
  }

  useEffect(() => {
    loadItems();
  }, [statusFilter]);

  useEffect(() => {
    loadEquipment();
  }, []);

  /* ── Handle "from request" navigation ── */
  useEffect(() => {
    const fromRequest = (location.state as { fromRequest?: Record<string, unknown> } | null)?.fromRequest;
    if (!fromRequest) return;

    const req = fromRequest as {
      id?: string;
      customerName?: string;
      phone?: string;
      equipmentId?: string;
      dateFrom?: string | null;
      dateTo?: string | null;
    };

    // Check duplicate
    const existingOrder = items.find((o) => o.sourceRequestId === req.id);
    if (existingOrder) {
      setDetailOrder(existingOrder);
      setViewMode("detail");
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const firstItem: FormItem = {
      key: newItemKey(),
      equipmentId: req.equipmentId ?? "",
      startDate: req.dateFrom ? toInputDate(req.dateFrom) : "",
      endDate: req.dateTo ? toInputDate(req.dateTo) : "",
    };

    const prefilled: FormState = {
      customerName: req.customerName ?? "",
      customerPhone: req.phone ?? "",
      items: [firstItem],
      status: "NEW",
      comment: "",
      sourceType: "request",
      sourceRequestId: req.id ?? "",
    };

    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setForm(prefilled);
    setViewMode("form");

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, items.length]);

  /* ── Form helpers ── */

  function startCreate() {
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setForm({ ...emptyForm, items: [makeEmptyItem()] });
    setViewMode("form");
  }

  function startEdit(order: RentOrder) {
    const formItems: FormItem[] = order.items.map((it) => ({
      key: newItemKey(),
      equipmentId: it.equipmentId,
      startDate: toInputDate(it.startDate),
      endDate: toInputDate(it.endDate),
    }));
    if (formItems.length === 0) formItems.push(makeEmptyItem());

    const nextForm: FormState = {
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: formItems,
      status: order.status,
      comment: order.comment ?? "",
      sourceType: order.sourceType,
      sourceRequestId: order.sourceRequestId ?? "",
    };
    setEditingItem(order);
    setFieldErrors({});
    setSubmitError("");
    setForm(nextForm);
    setViewMode("form");
  }

  function requestCloseForm() {
    setDiscardModalOpen(true);
  }

  function closeFormImmediately() {
    setViewMode("list");
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setDiscardModalOpen(false);
  }

  function backToList() {
    setDetailOrder(null);
    setViewMode("list");
  }

  /* Item management */
  function updateItem(index: number, patch: Partial<FormItem>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, makeEmptyItem()] }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!form.customerName.trim()) errors.customerName = "Обов'язкове поле";
    if (!form.customerPhone.trim()) errors.customerPhone = "Обов'язкове поле";

    if (form.items.length === 0) {
      errors.itemsGlobal = "Додайте хоча б одну техніку";
    } else {
      const itemErrors: Record<number, ItemError> = {};
      form.items.forEach((it, i) => {
        const ie: ItemError = {};
        if (!it.equipmentId) ie.equipmentId = "Оберіть техніку";
        if (!it.startDate) ie.startDate = "Вкажіть дату";
        if (!it.endDate) ie.endDate = "Вкажіть дату";
        if (it.startDate && it.endDate && it.startDate > it.endDate) {
          ie.endDate = "Завершення раніше початку";
        }
        if (Object.keys(ie).length > 0) itemErrors[i] = ie;
      });
      if (Object.keys(itemErrors).length > 0) errors.items = itemErrors;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSubmitError("");
    try {
      const body = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        items: form.items.map((it) => ({
          equipmentId: it.equipmentId,
          startDate: it.startDate,
          endDate: it.endDate,
        })),
        status: form.status,
        comment: form.comment.trim() || undefined,
        sourceType: form.sourceType,
        sourceRequestId: form.sourceRequestId || undefined,
      };

      if (formMode === "edit" && editingItem) {
        await apiFetch(`/admin/rent-orders/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/admin/rent-orders", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      closeFormImmediately();
      await loadItems();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  /* ── Actions ── */

  async function markStatus(id: string, status: string) {
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadItems();
      if (detailOrder?.id === id) setDetailOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/rent-orders/${id}`, { method: "DELETE" });
      if (detailOrder?.id === id) backToList();
      await loadItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
    setDeleteTarget(null);
  }

  /* ── Counts & filter ── */

  const newCount = items.filter((o) => o.status === "NEW").length;
  const filtered = items.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.includes(q) ||
      o.items.some((it) => it.equipment?.name.toLowerCase().includes(q))
    );
  });

  /* ═══════════════════ FORM VIEW ═══════════════════ */

  if (viewMode === "form") {
    return (
      <div className="flex h-full flex-col font-sans">
        <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={requestCloseForm}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="text-lg font-bold text-gray-900">
                {formMode === "edit" ? "Редагування замовлення" : "Нове замовлення"}
              </h1>
              {submitError && (
                <span className="ml-3 text-sm font-medium text-red-600">{submitError}</span>
              )}
            </div>
            <AdminButton type="submit" disabled={saving}>
              {saving ? "Збереження…" : "Зберегти"}
            </AdminButton>
          </div>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-8">

              {/* Source badge */}
              {form.sourceType === "request" && form.sourceRequestId && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.87-3.566a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757" />
                  </svg>
                  <span className="text-sm font-medium text-blue-700">Створено із заявки</span>
                </div>
              )}

              {/* Section: Client */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Клієнт</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <AdminInput
                      label="Ім'я клієнта"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      placeholder="Введіть ім'я"
                    />
                    {fieldErrors.customerName && (
                      <span className="text-xs text-red-500">{fieldErrors.customerName}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <AdminInput
                      label="Телефон"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                      placeholder="+380…"
                    />
                    {fieldErrors.customerPhone && (
                      <span className="text-xs text-red-500">{fieldErrors.customerPhone}</span>
                    )}
                  </div>
                </div>
              </section>

              {/* Section: Equipment items */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                    Техніка ({form.items.length})
                  </h2>
                  <AdminButton type="button" variant="secondary" size="sm" onClick={addItem}>
                    + Додати техніку
                  </AdminButton>
                </div>

                {fieldErrors.itemsGlobal && (
                  <span className="text-xs text-red-500">{fieldErrors.itemsGlobal}</span>
                )}

                <div className="flex flex-col gap-4">
                  {form.items.map((formItem, idx) => {
                    const ie = fieldErrors.items?.[idx];
                    return (
                      <div
                        key={formItem.key}
                        className="relative rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                      >
                        {/* Remove button (only if > 1 item) */}
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="absolute top-3 right-3 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}

                        <div className="mb-1 text-xs font-semibold text-gray-400">
                          Техніка {idx + 1}
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <AdminSelect
                              label="Обладнання"
                              value={formItem.equipmentId}
                              onChange={(e) => updateItem(idx, { equipmentId: e.target.value })}
                            >
                              <option value="">— Оберіть техніку —</option>
                              {equipmentList.map((eq) => (
                                <option key={eq.id} value={eq.id}>{eq.name}</option>
                              ))}
                            </AdminSelect>
                            {ie?.equipmentId && (
                              <span className="text-xs text-red-500">{ie.equipmentId}</span>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <AdminInput
                                label="Дата початку"
                                type="date"
                                value={formItem.startDate}
                                onChange={(e) => updateItem(idx, { startDate: e.target.value })}
                              />
                              {ie?.startDate && (
                                <span className="text-xs text-red-500">{ie.startDate}</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <AdminInput
                                label="Дата завершення"
                                type="date"
                                value={formItem.endDate}
                                onChange={(e) => updateItem(idx, { endDate: e.target.value })}
                              />
                              {ie?.endDate && (
                                <span className="text-xs text-red-500">{ie.endDate}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Section: Status & Comment */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  Статус і коментар
                </h2>
                <AdminSelect
                  label="Статус"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>{statusMap[s]?.label ?? s}</option>
                  ))}
                </AdminSelect>
                <AdminTextarea
                  label="Коментар"
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="Додатковий коментар…"
                  rows={3}
                />
              </section>
            </div>
          </div>
        </form>

        <ConfirmModal
          open={discardModalOpen}
          title="Скасувати зміни?"
          message="Незбережені зміни буде втрачено."
          confirmLabel="Так, скасувати"
          onConfirm={closeFormImmediately}
          onCancel={() => setDiscardModalOpen(false)}
        />
      </div>
    );
  }

  /* ═══════════════════ DETAIL VIEW ═══════════════════ */

  if (viewMode === "detail" && detailOrder) {
    const order = detailOrder;
    return (
      <div className="flex h-full flex-col font-sans">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={backToList}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">Деталі замовлення</h1>
            <StatusBadge
              status={statusMap[order.status]?.badge ?? "new"}
              label={statusMap[order.status]?.label}
            />
          </div>
          <div className="flex gap-2">
            <AdminButton variant="secondary" size="sm" onClick={() => startEdit(order)}>
              Редагувати
            </AdminButton>
            <AdminButton
              variant="danger"
              size="sm"
              onClick={() => setDeleteTarget(order.id)}
            >
              Видалити
            </AdminButton>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">

            {/* Client & Status row */}
            <div className="grid gap-6 sm:grid-cols-2">
              <AdminCard className="flex flex-col gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Клієнт</h3>
                <DetailField label="Ім'я" value={order.customerName} />
                <DetailField label="Телефон" value={order.customerPhone} />
              </AdminCard>

              <AdminCard className="flex flex-col gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Інформація</h3>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">Статус</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={statusMap[order.status]?.badge ?? "new"}
                      label={statusMap[order.status]?.label}
                    />
                    <select
                      value={order.status}
                      onChange={(e) => markStatus(order.id, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-primary"
                    >
                      {allStatuses.map((s) => (
                        <option key={s} value={s}>{statusMap[s]?.label ?? s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <DetailField label="Створено" value={fmtDateTime(order.createdAt)} />
                {order.sourceType === "request" && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                    <span className="text-xs font-medium text-blue-700">
                      Із заявки: {order.sourceRequest?.customerName ?? order.sourceRequestId}
                    </span>
                  </div>
                )}
              </AdminCard>
            </div>

            {/* Equipment items */}
            <AdminCard className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                Техніка ({order.items.length})
              </h3>
              {order.items.length === 0 ? (
                <p className="text-sm text-gray-400">Немає техніки</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {order.items.map((it, idx) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {idx + 1}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                        <span className="text-sm font-semibold text-gray-900">
                          {it.equipment?.name ?? "—"}
                        </span>
                        <span className="text-sm text-gray-500">
                          {fmtDate(it.startDate)} — {fmtDate(it.endDate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>

            {/* Comment */}
            {order.comment && (
              <AdminCard className="flex flex-col gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Коментар</h3>
                <p className="text-sm leading-relaxed text-gray-700">{order.comment}</p>
              </AdminCard>
            )}

            {/* Quick status actions */}
            <div className="flex flex-wrap gap-2">
              {order.status !== "CONFIRMED" && (
                <AdminButton size="sm" onClick={() => markStatus(order.id, "CONFIRMED")}>
                  Підтвердити
                </AdminButton>
              )}
              {order.status !== "ACTIVE" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(order.id, "ACTIVE")}>
                  Активувати
                </AdminButton>
              )}
              {order.status !== "COMPLETED" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(order.id, "COMPLETED")}>
                  Завершити
                </AdminButton>
              )}
              {order.status !== "CANCELLED" && (
                <AdminButton variant="ghost" size="sm" onClick={() => markStatus(order.id, "CANCELLED")}>
                  Скасувати
                </AdminButton>
              )}
            </div>
          </div>
        </div>

        <ConfirmModal
          open={!!deleteTarget}
          title="Видалення замовлення"
          message="Ви впевнені, що хочете видалити це замовлення? Цю дію неможливо скасувати."
          confirmLabel="Видалити"
          onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    );
  }

  /* ═══════════════════ LIST VIEW ═══════════════════ */

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      {/* Header */}
      <AdminPageHeader
        title="Замовлення"
        subtitle={`${items.length} замовлень${newCount > 0 ? ` • ${newCount} нових` : ""}`}
      >
        <div className="flex gap-2">
          <AdminButton variant="secondary" size="sm" onClick={loadItems}>
            Оновити
          </AdminButton>
          <AdminButton size="sm" onClick={startCreate}>
            + Нове замовлення
          </AdminButton>
        </div>
      </AdminPageHeader>

      {/* Filters */}
      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за ім'ям, телефоном або технікою…"
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

      {/* Table */}
      <AdminCard className="flex flex-1 flex-col overflow-hidden p-0">
        {/* Header row */}
        <div className="hidden gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 lg:flex">
          <span className="w-[160px] shrink-0 text-xs font-semibold text-gray-500">Клієнт</span>
          <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Телефон</span>
          <span className="w-[180px] shrink-0 text-xs font-semibold text-gray-500">Техніка</span>
          <span className="w-[170px] shrink-0 text-xs font-semibold text-gray-500">Період</span>
          <span className="w-[100px] shrink-0 text-xs font-semibold text-gray-500">Статус</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-12 text-center text-sm text-gray-400">Завантаження…</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">Замовлень не знайдено</p>
          ) : (
            filtered.map((order) => {
              const isNew = order.status === "NEW";
              return (
                <div
                  key={order.id}
                  onClick={() => {
                    setDetailOrder(order);
                    setViewMode("detail");
                  }}
                  className={`flex cursor-pointer flex-col gap-1 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/60 lg:flex-row lg:items-center lg:gap-2 ${
                    isNew ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between lg:contents">
                    <span className={`truncate text-sm lg:w-[160px] lg:shrink-0 ${isNew ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                      {order.customerName}
                    </span>
                    <span className="lg:order-5 lg:w-[100px] lg:shrink-0">
                      <StatusBadge
                        status={statusMap[order.status]?.badge ?? "new"}
                        label={statusMap[order.status]?.label}
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between lg:contents">
                    <span className="text-sm text-gray-600 lg:w-[120px] lg:shrink-0">
                      {order.customerPhone}
                    </span>
                    <span className="truncate text-sm text-gray-600 lg:w-[180px] lg:shrink-0">
                      {equipmentSummary(order.items)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 lg:w-[170px] lg:shrink-0">
                    {periodSummary(order.items)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </AdminCard>

      <ConfirmModal
        open={!!deleteTarget}
        title="Видалення замовлення"
        message="Ви впевнені, що хочете видалити це замовлення? Цю дію неможливо скасувати."
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
