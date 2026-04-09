import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../api/client";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import {
  AdminPageHeader,
  AdminButton,
  AdminCard,
  AdminSelect,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import { AdminInput, AdminTextarea } from "../components/admin/AdminInput";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Types ────────────────────────────────────────

interface ApiService {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: string;
  relatedEquipmentTypes: string[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  sortOrder: number;
}

interface FormState {
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: string;
  relatedEquipmentTypes: string[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  sortOrder: string;
}

interface FieldErrors {
  title?: string;
  slug?: string;
  shortDescription?: string;
  fullDescription?: string;
  image?: string;
  priceInfo?: string;
}

const pricingTypeLabels: Record<string, string> = {
  fixed_from: "Від (фіксована)",
  hourly_from: "Від (погодинна)",
  calculator: "Калькулятор",
  custom: "Індивідуально",
};

const equipmentTypeLabels: Record<string, string> = {
  excavator: "Екскаватор",
  loader: "Навантажувач",
  bulldozer: "Бульдозер",
  crane: "Кран",
  roller: "Каток",
  dump_truck: "Самоскид",
  concrete_mixer: "Бетонозмішувач",
  generator: "Генератор",
  other: "Інше",
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  shortDescription: "",
  fullDescription: "",
  image: "",
  priceInfo: "",
  pricingType: "custom",
  relatedEquipmentTypes: [],
  features: [],
  seoTitle: "",
  seoDescription: "",
  isActive: true,
  sortOrder: "0",
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['`'ʼ]/g, "")
    .replace(/[^a-zа-яіїєґ0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function serializeForm(form: FormState) {
  return JSON.stringify(form);
}

// ─── Component ────────────────────────────────────

export default function AdminServicesPage() {
  const [items, setItems] = useState<ApiService[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ApiService | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [newFeature, setNewFeature] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderValue, setEditingOrderValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialSnapshotRef = useRef(serializeForm(emptyForm));

  const formMode: "create" | "edit" = editingItem?.id ? "edit" : "create";
  const isDirty = serializeForm(form) !== initialSnapshotRef.current;

  // Auto-generate slug from title
  useEffect(() => {
    if (!formOpen || slugTouched) return;
    setForm((prev) => ({ ...prev, slug: slugify(prev.title) }));
  }, [form.title, slugTouched, formOpen]);

  // Close action menu on outside click
  const closeMenu = useCallback(() => { setOpenActionId(null); setMenuPos(null); }, []);
  useEffect(() => {
    if (!openActionId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [openActionId, closeMenu]);

  function openMenu(id: string, btnEl: HTMLButtonElement) {
    if (openActionId === id) { closeMenu(); return; }
    const rect = btnEl.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setOpenActionId(id);
  }

  async function loadItems() {
    setLoading(true);
    try {
      const data = await apiFetch<ApiService[]>("/admin/services");
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

  async function reorderService(id: string, newPosition: number) {
    if (reordering) return;
    setReordering(true);
    try {
      const updated = await apiFetch<ApiService[]>(`/admin/services/${id}/reorder`, {
        method: "PUT",
        body: JSON.stringify({ newPosition }),
      });
      setItems(updated);
    } catch {
      // fallback: reload
      await loadItems();
    } finally {
      setReordering(false);
      setEditingOrderId(null);
    }
  }

  function moveUp(item: ApiService) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx <= 0) return;
    reorderService(item.id, items[idx - 1].sortOrder);
  }

  function moveDown(item: ApiService) {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx < 0 || idx >= items.length - 1) return;
    reorderService(item.id, items[idx + 1].sortOrder);
  }

  function startEditOrder(item: ApiService) {
    setEditingOrderId(item.id);
    setEditingOrderValue(String(item.sortOrder));
  }

  function commitEditOrder(item: ApiService) {
    const newPos = parseInt(editingOrderValue, 10);
    if (!isNaN(newPos) && newPos >= 1 && newPos !== item.sortOrder) {
      reorderService(item.id, Math.min(newPos, items.length));
    } else {
      setEditingOrderId(null);
    }
  }

  function setInitialSnapshot(nextForm: FormState) {
    initialSnapshotRef.current = serializeForm(nextForm);
  }

  function startCreate() {
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setSlugTouched(false);
    setForm(emptyForm);
    setInitialSnapshot(emptyForm);
    setFormOpen(true);
  }

  function startEdit(item: ApiService) {
    const nextForm: FormState = {
      title: item.title,
      slug: item.slug,
      shortDescription: item.shortDescription,
      fullDescription: item.fullDescription,
      image: item.image,
      priceInfo: item.priceInfo,
      pricingType: item.pricingType,
      relatedEquipmentTypes: [...item.relatedEquipmentTypes],
      features: [...item.features],
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      isActive: item.isActive,
      sortOrder: String(item.sortOrder),
    };
    setEditingItem(item);
    setFieldErrors({});
    setSubmitError("");
    setSlugTouched(true);
    setForm(nextForm);
    setInitialSnapshot(nextForm);
    setFormOpen(true);
    setOpenActionId(null);
  }

  function requestCloseForm() {
    if (isDirty) { setDiscardModalOpen(true); return; }
    closeFormImmediately();
  }

  function closeFormImmediately() {
    setFormOpen(false);
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setDiscardModalOpen(false);
  }

  // ── Image upload ──
  async function uploadImage(file: File): Promise<{ url: string; alt: string }> {
    const fd = new FormData();
    fd.append("image", file);
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${API_BASE}/admin/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setSubmitError("");
    try {
      const result = await uploadImage(files[0]);
      setForm((prev) => ({ ...prev, image: result.url }));
      setFieldErrors((prev) => ({ ...prev, image: undefined }));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка завантаження фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Features ──
  function addFeature() {
    const val = newFeature.trim();
    if (!val) return;
    setForm((prev) => ({ ...prev, features: [...prev.features, val] }));
    setNewFeature("");
  }

  function removeFeature(index: number) {
    setForm((prev) => ({ ...prev, features: prev.features.filter((_, i) => i !== index) }));
  }

  // ── Equipment type toggles ──
  function toggleEquipmentType(type: string) {
    setForm((prev) => ({
      ...prev,
      relatedEquipmentTypes: prev.relatedEquipmentTypes.includes(type)
        ? prev.relatedEquipmentTypes.filter((t) => t !== type)
        : [...prev.relatedEquipmentTypes, type],
    }));
  }

  // ── Validation ──
  function validateForm() {
    const next: FieldErrors = {};
    if (!form.title.trim()) next.title = "Вкажіть назву";
    if (!form.slug.trim()) next.slug = "Slug є обов'язковим";
    if (!form.shortDescription.trim()) next.shortDescription = "Вкажіть короткий опис";
    if (!form.fullDescription.trim()) next.fullDescription = "Вкажіть повний опис";
    if (!form.image.trim()) next.image = "Додайте зображення";
    if (!form.priceInfo.trim()) next.priceInfo = "Вкажіть вартість";
    setFieldErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) setSubmitError(`Заповніть обов'язкові поля (${count})`);
    return count === 0;
  }

  // ── Save ──
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validateForm()) return;
    setSaving(true);

    const body = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      shortDescription: form.shortDescription.trim(),
      fullDescription: form.fullDescription.trim(),
      image: form.image.trim(),
      priceInfo: form.priceInfo.trim(),
      pricingType: form.pricingType,
      relatedEquipmentTypes: form.relatedEquipmentTypes,
      features: form.features.filter((f) => f.trim()),
      seoTitle: form.seoTitle.trim(),
      seoDescription: form.seoDescription.trim(),
      isActive: form.isActive,
      sortOrder: editingItem?.id ? editingItem.sortOrder : items.length + 1,
    };

    try {
      if (editingItem?.id) {
        await apiFetch(`/admin/services/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/admin/services", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setInitialSnapshot(form);
      closeFormImmediately();
      await loadItems();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──
  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/services/${id}`, { method: "DELETE" });
      await loadItems();
      if (editingItem?.id === id) closeFormImmediately();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка видалення");
    }
    setDeleteTarget(null);
  }

  function imageSrc(url: string) {
    if (url.startsWith("http")) return url;
    return `${API_BASE.replace(/\/api$/, "")}${url}`;
  }

  // ─── FORM VIEW ──────────────────────────────────
  if (formOpen) {
    return (
      <>
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {formMode === "create" ? "Нова послуга" : "Редагування послуги"}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {formMode === "create"
                  ? "Заповніть дані послуги, щоб додати її на сайт"
                  : "Оновіть інформацію про послугу"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {submitError && <span className="text-xs font-medium text-red-600">{submitError}</span>}
              {editingItem?.id && (
                <AdminButton type="button" variant="danger" size="sm" onClick={() => setDeleteTarget({ id: editingItem.id, name: form.title || editingItem.title })}>
                  Видалити
                </AdminButton>
              )}
              <AdminButton type="button" variant="secondary" size="sm" onClick={requestCloseForm}>
                Скасувати
              </AdminButton>
              <AdminButton type="submit" size="sm" disabled={saving || uploading}>
                {saving ? "Збереження…" : "Зберегти"}
              </AdminButton>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Left column */}
            <div className="flex min-w-0 flex-col gap-4">
              {/* Basic info */}
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Основна інформація</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <AdminInput label="Назва *" value={form.title} onChange={(e) => { setForm((p) => ({ ...p, title: e.target.value })); setFieldErrors((p) => ({ ...p, title: undefined })); }} placeholder="Напр. Копання траншей" />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
                  </div>
                  <div>
                    <AdminInput label="Slug *" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((p) => ({ ...p, slug: e.target.value })); setFieldErrors((p) => ({ ...p, slug: undefined })); }} placeholder="kopannia-transheyi" />
                    {fieldErrors.slug && <p className="mt-1 text-xs text-red-600">{fieldErrors.slug}</p>}
                  </div>
                  <div>
                    <AdminInput label="Вартість *" value={form.priceInfo} onChange={(e) => { setForm((p) => ({ ...p, priceInfo: e.target.value })); setFieldErrors((p) => ({ ...p, priceInfo: undefined })); }} placeholder="від 1 200 грн/год" />
                    {fieldErrors.priceInfo && <p className="mt-1 text-xs text-red-600">{fieldErrors.priceInfo}</p>}
                  </div>
                  <div>
                    <AdminSelect label="Тип ціни" value={form.pricingType} onChange={(e) => setForm((p) => ({ ...p, pricingType: e.target.value }))}>
                      {Object.entries(pricingTypeLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </AdminSelect>
                  </div>
                  <div>
                    <AdminSelect label="Статус" value={form.isActive ? "active" : "inactive"} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "active" }))}>
                      <option value="active">Активна</option>
                      <option value="inactive">Неактивна</option>
                    </AdminSelect>
                  </div>
                </div>
              </AdminCard>

              {/* Descriptions */}
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Описи</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <AdminTextarea label="Короткий опис *" rows={3} value={form.shortDescription} onChange={(e) => { setForm((p) => ({ ...p, shortDescription: e.target.value })); setFieldErrors((p) => ({ ...p, shortDescription: undefined })); }} placeholder="Короткий опис для картки послуги" />
                    {fieldErrors.shortDescription && <p className="mt-1 text-xs text-red-600">{fieldErrors.shortDescription}</p>}
                  </div>
                  <div>
                    <AdminTextarea label="Повний опис *" rows={6} value={form.fullDescription} onChange={(e) => { setForm((p) => ({ ...p, fullDescription: e.target.value })); setFieldErrors((p) => ({ ...p, fullDescription: undefined })); }} placeholder="Детальний опис послуги для окремої сторінки" />
                    {fieldErrors.fullDescription && <p className="mt-1 text-xs text-red-600">{fieldErrors.fullDescription}</p>}
                  </div>
                </div>
              </AdminCard>

              {/* Features */}
              <AdminCard className="!p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Переваги / особливості</h3>
                  <AdminButton type="button" size="sm" variant="secondary" onClick={addFeature}>+ Додати</AdminButton>
                </div>
                {form.features.length === 0 ? (
                  <p className="text-xs text-gray-400">Поки немає переваг. Додайте хоча б одну.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {form.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <span className="flex-1 text-xs text-gray-700">{f}</span>
                        <button type="button" onClick={() => removeFeature(i)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-blue-400"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Напр. Техніка з оператором"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } }}
                  />
                </div>
              </AdminCard>

              {/* SEO */}
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">SEO</h3>
                <div className="flex flex-col gap-3">
                  <AdminInput label="SEO Title" value={form.seoTitle} onChange={(e) => setForm((p) => ({ ...p, seoTitle: e.target.value }))} placeholder="Назва для пошукових систем" />
                  <AdminTextarea label="SEO Description" rows={2} value={form.seoDescription} onChange={(e) => setForm((p) => ({ ...p, seoDescription: e.target.value }))} placeholder="Короткий опис для Google" />
                </div>
              </AdminCard>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Image */}
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Зображення</h3>
                {form.image ? (
                  <div className="group relative mb-2 overflow-hidden rounded-lg">
                    <img src={imageSrc(form.image)} alt="Preview" className="h-40 w-full rounded-lg object-cover" />
                    <button type="button" onClick={() => setForm((p) => ({ ...p, image: "" }))} className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div className="mb-2 flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
                    Без зображення
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
                <div className="flex flex-col gap-2">
                  <AdminButton type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? "Завантаження…" : "Завантажити фото"}
                  </AdminButton>
                  <div className="flex gap-1">
                    <input className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-400" value={form.image} onChange={(e) => { setForm((p) => ({ ...p, image: e.target.value })); setFieldErrors((p) => ({ ...p, image: undefined })); }} placeholder="або вставте URL" />
                  </div>
                </div>
                {fieldErrors.image && <p className="mt-1 text-xs text-red-600">{fieldErrors.image}</p>}
              </AdminCard>

              {/* Equipment types */}
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Типи техніки</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(equipmentTypeLabels).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => toggleEquipmentType(val)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        form.relatedEquipmentTypes.includes(val)
                          ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </AdminCard>
            </div>
          </div>
        </form>

        {/* Discard modal */}
        <ConfirmModal
          open={discardModalOpen}
          title="Скасувати зміни?"
          message="Ви маєте незбережені зміни. Закрити форму без збереження?"
          confirmLabel="Так, закрити"
          variant="danger"
          onConfirm={closeFormImmediately}
          onCancel={() => setDiscardModalOpen(false)}
        />

        {/* Delete modal */}
        {deleteTarget && (
          <ConfirmModal
            open
            title="Видалити послугу?"
            message={`Ви впевнені, що хочете видалити «${deleteTarget.name}»? Цю дію не можна скасувати.`}
            confirmLabel="Видалити"
            variant="danger"
            onConfirm={() => handleDelete(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </>
    );
  }

  // ─── TABLE VIEW ─────────────────────────────────
  return (
    <>
      <AdminPageHeader
        title="Послуги"
        subtitle={`${items.length} послуг`}
      >
        <AdminButton size="sm" onClick={startCreate}>+ Нова послуга</AdminButton>
      </AdminPageHeader>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Назва</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Slug</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Вартість</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Типи техніки</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Статус</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Порядок</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableRowsSkeleton cols={7} rows={5} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                  Послуг ще немає. Додайте першу!
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-900">{item.title}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{item.slug}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{item.priceInfo}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {item.relatedEquipmentTypes.map((t) => (
                        <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {equipmentTypeLabels[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={item.isActive ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={reordering || items.indexOf(item) === 0}
                          onClick={() => moveUp(item)}
                          className="flex h-4 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Вгору"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                        </button>
                        <button
                          type="button"
                          disabled={reordering || items.indexOf(item) === items.length - 1}
                          onClick={() => moveDown(item)}
                          className="flex h-4 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Вниз"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                      </div>
                      {editingOrderId === item.id ? (
                        <input
                          autoFocus
                          type="number"
                          min={1}
                          max={items.length}
                          className="w-10 rounded border border-blue-300 bg-white px-1 py-0.5 text-center text-xs text-gray-900 outline-none"
                          value={editingOrderValue}
                          onChange={(e) => setEditingOrderValue(e.target.value)}
                          onBlur={() => commitEditOrder(item)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEditOrder(item); if (e.key === "Escape") setEditingOrderId(null); }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditOrder(item)}
                          className="min-w-[24px] rounded px-1 py-0.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-100"
                          title="Натисніть, щоб змінити позицію"
                        >
                          {item.sortOrder}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="relative px-2 py-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openMenu(item.id, e.currentTarget); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Action dropdown menu (portal to avoid overflow clipping) */}
      {openActionId && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <button
            onClick={() => { const item = items.find((i) => i.id === openActionId); if (item) startEdit(item); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Редагувати
          </button>
          <button
            onClick={() => { const item = items.find((i) => i.id === openActionId); if (item) { setDeleteTarget({ id: item.id, name: item.title }); closeMenu(); } }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Видалити
          </button>
        </div>,
        document.body
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <ConfirmModal
          open
          title="Видалити послугу?"
          message={`Ви впевнені, що хочете видалити «${deleteTarget.name}»? Цю дію не можна скасувати.`}
          confirmLabel="Видалити"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
