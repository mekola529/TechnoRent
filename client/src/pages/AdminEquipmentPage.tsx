import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import {
  AdminPageHeader,
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminSelect,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import { AdminInput, AdminTextarea } from "../components/admin/AdminInput";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ImageItem {
  url: string;
  alt: string;
}

interface SpecItem {
  label: string;
  value: string;
}

interface ApiEquipment {
  id: string;
  slug: string;
  name: string;
  brand: string;
  type: string;
  description: string;
  pricePerHour: number;
  isPopular: boolean;
  specs: { id: string; label: string; value: string }[];
  images: { id: string; url: string; alt: string }[];
  bookedPeriods: { id: string; from: string; to: string; note: string | null }[];
}

interface FormState {
  name: string;
  slug: string;
  brand: string;
  type: string;
  price: string;
  description: string;
  isPopular: boolean;
  images: ImageItem[];
  specs: SpecItem[];
  uiStatus: "active" | "inactive";
}

interface FieldErrors {
  name?: string;
  slug?: string;
  brand?: string;
  type?: string;
  price?: string;
  description?: string;
  images?: string;
}

const typeLabels: Record<string, string> = {
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
  name: "",
  slug: "",
  brand: "",
  type: "excavator",
  price: "",
  description: "",
  isPopular: false,
  images: [],
  specs: [],
  uiStatus: "active",
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['`’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function imageSrc(url: string) {
  if (url.startsWith("http")) return url;
  return `${API_BASE.replace(/\/api$/, "")}${url}`;
}

function serializeForm(form: FormState) {
  return JSON.stringify({
    name: form.name,
    slug: form.slug,
    brand: form.brand,
    type: form.type,
    price: form.price,
    description: form.description,
    isPopular: form.isPopular,
    images: form.images,
    specs: form.specs,
    uiStatus: form.uiStatus,
  });
}

export default function AdminEquipmentPage() {
  const [items, setItems] = useState<ApiEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ApiEquipment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [newSpecLabel, setNewSpecLabel] = useState("");
  const [newSpecValue, setNewSpecValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialSnapshotRef = useRef(serializeForm(emptyForm));

  const existingLabels = useMemo(
    () => Array.from(new Set(items.flatMap((it) => it.specs.map((s) => s.label)))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType && item.type !== filterType) return false;
      return true;
    });
  }, [items, search, filterType]);

  const formMode: "create" | "edit" = editingItem?.id ? "edit" : "create";
  const isDirty = serializeForm(form) !== initialSnapshotRef.current;

  useEffect(() => {
    if (!formOpen || slugTouched) return;
    setForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
  }, [form.name, slugTouched, formOpen]);



  useEffect(() => {
    if (!openActionId) return;
    const handler = () => setOpenActionId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionId]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await apiFetch<ApiEquipment[]>("/equipment");
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

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

  function startEdit(item: ApiEquipment) {
    const nextForm: FormState = {
      name: item.name,
      slug: item.slug,
      brand: item.brand,
      type: item.type,
      price: String(item.pricePerHour),
      description: item.description,
      isPopular: item.isPopular,
      images: item.images.map((img) => ({ url: img.url, alt: img.alt })),
      specs: item.specs.map((spec) => ({ label: spec.label, value: spec.value })),
      uiStatus: "active",
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
    if (isDirty) {
      setDiscardModalOpen(true);
      return;
    }
    closeFormImmediately();
  }

  function closeFormImmediately() {
    setFormOpen(false);
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setDiscardModalOpen(false);
  }

  async function uploadImage(file: File): Promise<ImageItem> {
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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    setSubmitError("");

    try {
      const uploads = await Promise.all(Array.from(files).map(uploadImage));
      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploads] }));
      setFieldErrors((prev) => ({ ...prev, images: undefined }));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка завантаження фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeImage(index: number) {
    const img = form.images[index];

    if (img.url.startsWith("/uploads/")) {
      const token = localStorage.getItem("admin_token");
      try {
        await fetch(`${API_BASE}/admin/upload`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ url: img.url }),
        });
      } catch {
        // best-effort cleanup
      }
    }

    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  }

  function setAsMainImage(index: number) {
    setForm((prev) => {
      const images = [...prev.images];
      const [picked] = images.splice(index, 1);
      images.unshift(picked);
      return { ...prev, images };
    });
  }

  function addImageByUrl() {
    const url = imageUrl.trim();
    if (!url) return;

    setForm((prev) => ({ ...prev, images: [...prev.images, { url, alt: "" }] }));
    setImageUrl("");
    setFieldErrors((prev) => ({ ...prev, images: undefined }));
  }

  function addSpec() {
    const label = newSpecLabel.trim();
    const value = newSpecValue.trim();
    if (!label || !value) return;

    setForm((prev) => ({ ...prev, specs: [...prev.specs, { label, value }] }));
    setNewSpecLabel("");
    setNewSpecValue("");
  }

  function removeSpec(index: number) {
    setForm((prev) => ({
      ...prev,
      specs: prev.specs.filter((_, i) => i !== index),
    }));
  }

  function updateSpec(index: number, field: "label" | "value", value: string) {
    setForm((prev) => ({
      ...prev,
      specs: prev.specs.map((spec, i) => (i === index ? { ...spec, [field]: value } : spec)),
    }));
  }

  function validateForm() {
    const next: FieldErrors = {};

    if (!form.name.trim()) next.name = "Вкажіть назву техніки";
    if (!form.slug.trim()) next.slug = "Slug є обов'язковим";
    if (!form.brand.trim()) next.brand = "Вкажіть бренд";
    if (!form.type.trim()) next.type = "Оберіть тип";

    const priceNum = Number(form.price);
    if (!form.price.trim()) next.price = "Вкажіть ціну за годину";
    else if (Number.isNaN(priceNum) || priceNum <= 0) next.price = "Ціна має бути більше 0";

    if (!form.description.trim()) next.description = "Додайте короткий опис";
    if (form.images.length === 0) next.images = "Додайте щонайменше одне фото";

    setFieldErrors(next);

    const count = Object.keys(next).length;
    if (count > 0) {
      setSubmitError(`Заповніть обов'язкові поля (${count})`);
    }

    return count === 0;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (!validateForm()) return;

    setSaving(true);

    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      brand: form.brand.trim(),
      type: form.type,
      description: form.description.trim(),
      pricePerHour: Number(form.price),
      isPopular: form.isPopular,
      images: form.images,
      specs: form.specs.filter((s) => s.label.trim() && s.value.trim()),
    };

    try {
      if (editingItem?.id) {
        await apiFetch(`/admin/equipment/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/admin/equipment", {
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

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/equipment/${id}`, { method: "DELETE" });
      await loadItems();
      if (editingItem?.id === id) closeFormImmediately();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка видалення");
    }

    setDeleteTarget(null);
  }

  const editSummary = useMemo(() => {
    if (!editingItem?.id) return null;

    return {
      name: form.name || "-",
      type: typeLabels[form.type] ?? form.type,
      price: form.price || "-",
      hasPhoto: form.images.length > 0,
      status: editingItem.bookedPeriods.length > 0 ? "busy" : "available",
      isPopular: form.isPopular,
    };
  }, [editingItem, form]);

  /* ─── Form view (replaces the table when open) ─── */
  if (formOpen) {
    return (
      <>
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          {/* Header bar */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {formMode === "create" ? "Нова техніка" : "Редагування техніки"}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {formMode === "create"
                  ? "Заповніть основні дані про техніку, щоб додати її до каталогу"
                  : "Оновіть інформацію про техніку, статус, характеристики або фото"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {submitError && (
                <span className="text-xs font-medium text-red-600">{submitError}</span>
              )}
              {editingItem?.id && (
                <AdminButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget({ id: editingItem.id, name: form.name || editingItem.name })}
                >
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
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Основна інформація</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <AdminInput
                      label="Назва *"
                      value={form.name}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, name: e.target.value }));
                        setFieldErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder="Напр. CAT 320"
                    />
                    {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
                  </div>

                  <div>
                    <AdminInput
                      label="Slug *"
                      value={form.slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setForm((prev) => ({ ...prev, slug: e.target.value }));
                        setFieldErrors((prev) => ({ ...prev, slug: undefined }));
                      }}
                      placeholder="cat-320"
                    />
                    {fieldErrors.slug && <p className="mt-1 text-xs text-red-600">{fieldErrors.slug}</p>}
                  </div>

                  <div>
                    <AdminInput
                      label="Бренд *"
                      value={form.brand}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, brand: e.target.value }));
                        setFieldErrors((prev) => ({ ...prev, brand: undefined }));
                      }}
                      placeholder="Caterpillar"
                    />
                    {fieldErrors.brand && <p className="mt-1 text-xs text-red-600">{fieldErrors.brand}</p>}
                  </div>

                  <div>
                    <AdminSelect
                      label="Тип *"
                      value={form.type}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, type: e.target.value }));
                        setFieldErrors((prev) => ({ ...prev, type: undefined }));
                      }}
                    >
                      {Object.entries(typeLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </AdminSelect>
                    {fieldErrors.type && <p className="mt-1 text-xs text-red-600">{fieldErrors.type}</p>}
                  </div>

                  <div>
                    <AdminInput
                      label="Ціна / год *"
                      type="number"
                      min={1}
                      value={form.price}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, price: e.target.value }));
                        setFieldErrors((prev) => ({ ...prev, price: undefined }));
                      }}
                      placeholder="800"
                    />
                    {fieldErrors.price && <p className="mt-1 text-xs text-red-600">{fieldErrors.price}</p>}
                  </div>

                  <div>
                    <AdminSelect
                      label="Статус"
                      value={form.uiStatus}
                      onChange={(e) => setForm((prev) => ({ ...prev, uiStatus: e.target.value as FormState["uiStatus"] }))}
                    >
                      <option value="active">Активна</option>
                      <option value="inactive">Неактивна</option>
                    </AdminSelect>
                    <p className="mt-1 text-[11px] text-gray-400">Поки що інформаційне поле (не зберігається у бекенд).</p>
                  </div>
                </div>
              </AdminCard>

              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Опис</h3>
                <AdminTextarea
                  label="Короткий опис *"
                  rows={6}
                  value={form.description}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, description: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, description: undefined }));
                  }}
                  placeholder="Опишіть основні переваги та призначення техніки"
                />
                {fieldErrors.description && <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>}
              </AdminCard>

              <AdminCard className="!p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Характеристики</h3>
                  <AdminButton type="button" size="sm" variant="secondary" onClick={addSpec}>
                    + Додати характеристику
                  </AdminButton>
                </div>

                {form.specs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                    Характеристики ще не додані
                  </div>
                ) : (
                  <div className="mb-3 flex flex-col gap-2">
                    {form.specs.map((spec, i) => (
                      <div key={i} className="grid gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <AdminInput
                          value={spec.label}
                          onChange={(e) => updateSpec(i, "label", e.target.value)}
                          placeholder="Назва характеристики"
                        />
                        <AdminInput
                          value={spec.value}
                          onChange={(e) => updateSpec(i, "value", e.target.value)}
                          placeholder="Значення"
                        />
                        <AdminButton type="button" variant="ghost" size="sm" onClick={() => removeSpec(i)}>
                          Видалити
                        </AdminButton>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div>
                    <AdminInput
                      list="spec-labels"
                      value={newSpecLabel}
                      onChange={(e) => setNewSpecLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSpec();
                        }
                      }}
                      placeholder="Назва характеристики"
                    />
                    <datalist id="spec-labels">
                      {existingLabels.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </div>
                  <AdminInput
                    value={newSpecValue}
                    onChange={(e) => setNewSpecValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSpec();
                      }
                    }}
                    placeholder="Значення"
                  />
                  <AdminButton type="button" variant="secondary" size="sm" onClick={addSpec}>
                    Додати
                  </AdminButton>
                </div>
              </AdminCard>
            </div>

            {/* Right column */}
            <div className="flex min-w-0 flex-col gap-4">
              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Медія</h3>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mb-2 w-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-sm font-semibold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {uploading ? "Завантаження…" : "Перетягніть файл або натисніть, щоб завантажити"}
                </button>

                <p className="mb-2 text-xs text-gray-400">Або вставте URL зображення:</p>
                <div className="mb-3 flex gap-2">
                  <AdminInput
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addImageByUrl();
                      }
                    }}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1"
                  />
                  <AdminButton type="button" variant="secondary" size="sm" onClick={addImageByUrl}>
                    + URL
                  </AdminButton>
                </div>

                {fieldErrors.images && <p className="mb-2 text-xs text-red-600">{fieldErrors.images}</p>}

                {form.images.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                    Фото ще не додані
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {form.images.map((img, i) => (
                      <div key={`${img.url}-${i}`} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <img src={imageSrc(img.url)} alt={img.alt || "Фото техніки"} className="h-28 w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 text-[10px] text-white">
                          <button
                            type="button"
                            onClick={() => setAsMainImage(i)}
                            className="rounded bg-white/20 px-1.5 py-0.5"
                          >
                            {i === 0 ? "Головне" : "Зробити головним"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="rounded bg-red-500/80 px-1.5 py-0.5"
                          >
                            Видалити
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminCard>

              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Додаткові налаштування</h3>
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={form.isPopular}
                    onChange={(e) => setForm((prev) => ({ ...prev, isPopular: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">Популярна техніка</span>
                </label>
              </AdminCard>

              <AdminCard className="!p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Короткий summary</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-2"><span className="text-gray-500">Назва</span><span className="font-medium text-gray-900">{form.name || "-"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-500">Тип</span><span className="font-medium text-gray-900">{typeLabels[form.type] ?? form.type}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-500">Ціна</span><span className="font-medium text-gray-900">{form.price ? `${form.price} грн/год` : "-"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-500">Фото</span><span className="font-medium text-gray-900">{form.images.length}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-gray-500">Популярна</span><span className="font-medium text-gray-900">{form.isPopular ? "Так" : "Ні"}</span></div>
                  {editSummary && (
                    <div className="flex justify-between gap-2"><span className="text-gray-500">Зайнятість</span><StatusBadge status={editSummary.status as "busy" | "available"} /></div>
                  )}
                </div>
              </AdminCard>
            </div>
          </div>
        </form>

        <ConfirmModal
          open={!!deleteTarget}
          title="Видалення техніки"
          message={`Ви впевнені, що хочете видалити "${deleteTarget?.name}"?`}
          confirmLabel="Видалити"
          onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />

        <ConfirmModal
          open={discardModalOpen}
          title="Незбережені зміни"
          message="У вас є незбережені зміни. Ви дійсно хочете вийти без збереження?"
          confirmLabel="Вийти без збереження"
          cancelLabel="Залишитись"
          onConfirm={closeFormImmediately}
          onCancel={() => setDiscardModalOpen(false)}
        />
      </>
    );
  }

  /* ─── Table listing view ─── */
  return (
    <>
      <AdminPageHeader title="Техніка" subtitle={`${items.length} одиниць`}>
        <AdminButton onClick={startCreate}>+ Додати техніку</AdminButton>
      </AdminPageHeader>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за назвою…"
      >
        <div className="w-full sm:w-44">
          <AdminSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Всі типи</option>
            {Object.entries(typeLabels).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </AdminSelect>
        </div>
      </AdminFilterBar>

      <AdminCard className="overflow-hidden p-0">
        <div className="hidden items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 sm:flex">
          <span className="flex-1 text-xs font-semibold text-gray-500">Назва</span>
          <span className="w-24 text-xs font-semibold text-gray-500">Тип</span>
          <span className="w-20 text-xs font-semibold text-gray-500">Ціна/год</span>
          <span className="w-20 text-xs font-semibold text-gray-500">Статус</span>
          <span className="w-16 text-right text-xs font-semibold text-gray-500">Дії</span>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Завантаження…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {items.length === 0 ? "Техніка відсутня" : "Нічого не знайдено"}
          </p>
        ) : (
          filtered.map((item) => {
            const hasBooked = item.bookedPeriods.length > 0;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 transition-colors hover:bg-gray-50/60 sm:flex-row sm:items-center sm:gap-2"
              >
                <div className="flex items-center justify-between sm:flex-1">
                  <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  <span className="text-xs text-gray-500 sm:hidden">{item.pricePerHour} грн</span>
                </div>

                <span className="hidden w-24 text-xs text-gray-500 sm:block">
                  {typeLabels[item.type] ?? item.type}
                </span>

                <span className="hidden w-20 text-sm font-medium text-gray-700 sm:block">
                  {item.pricePerHour}
                </span>

                <div className="flex items-center justify-between sm:contents">
                  <span className="sm:w-20">
                    <StatusBadge status={hasBooked ? "busy" : "available"} />
                  </span>

                  <div className="relative sm:w-16 sm:text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionId(openActionId === item.id ? null : item.id);
                      }}
                      className="rounded-md px-2 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </button>

                    {openActionId === item.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => startEdit(item)}
                          className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Редагувати
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget({ id: item.id, name: item.name });
                            setOpenActionId(null);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          Видалити
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </AdminCard>

      <ConfirmModal
        open={!!deleteTarget}
        title="Видалення техніки"
        message={`Ви впевнені, що хочете видалити "${deleteTarget?.name}"?`}
        confirmLabel="Видалити"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
