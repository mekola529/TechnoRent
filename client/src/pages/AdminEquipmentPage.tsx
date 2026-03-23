import { useState, useEffect, useRef, type FormEvent } from "react";
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

/* ── Types ── */

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

/* ── Component ── */

export default function AdminEquipmentPage() {
  const [items, setItems] = useState<ApiEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ApiEquipment | null>(null);

  /* filters */
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  /* confirm modal */
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  /* form state */
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formType, setFormType] = useState("excavator");
  const [formPrice, setFormPrice] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPopular, setFormPopular] = useState(false);
  const [formImages, setFormImages] = useState<ImageItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [formSpecs, setFormSpecs] = useState<SpecItem[]>([]);
  const [newSpecLabel, setNewSpecLabel] = useState("");
  const [newSpecValue, setNewSpecValue] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* actions dropdown */
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  function addImageByUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    setFormImages((prev) => [...prev, { url, alt: "" }]);
    setImageUrl("");
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
    try {
      const uploads = await Promise.all(Array.from(files).map(uploadImage));
      setFormImages((prev) => [...prev, ...uploads]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка завантаження фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const existingLabels = Array.from(
    new Set(items.flatMap((it) => it.specs.map((s) => s.label)))
  ).sort();

  function addSpec() {
    const label = newSpecLabel.trim();
    const value = newSpecValue.trim();
    if (!label || !value) return;
    setFormSpecs((prev) => [...prev, { label, value }]);
    setNewSpecLabel("");
    setNewSpecValue("");
  }

  function removeSpec(index: number) {
    setFormSpecs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSpec(index: number, field: "label" | "value", val: string) {
    setFormSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: val } : s)));
  }

  async function removeImage(index: number) {
    const img = formImages[index];
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
        // best-effort
      }
    }
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  }

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

  /* Close actions dropdown on outside click */
  useEffect(() => {
    if (!openActionId) return;
    const handler = () => setOpenActionId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionId]);

  function openEdit(item: ApiEquipment) {
    setEditing(item);
    setFormName(item.name);
    setFormSlug(item.slug);
    setFormBrand(item.brand);
    setFormType(item.type);
    setFormPrice(String(item.pricePerHour));
    setFormDesc(item.description);
    setFormPopular(item.isPopular);
    setFormImages(item.images.map(({ url, alt }) => ({ url, alt })));
    setFormSpecs(item.specs.map(({ label, value }) => ({ label, value })));
    setOpenActionId(null);
  }

  function openNew() {
    setEditing({} as ApiEquipment);
    setFormName("");
    setFormSlug("");
    setFormBrand("");
    setFormType("excavator");
    setFormPrice("");
    setFormDesc("");
    setFormPopular(false);
    setFormImages([]);
    setFormSpecs([]);
  }

  function closeEdit() {
    setEditing(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body = {
      name: formName,
      slug: formSlug,
      brand: formBrand,
      type: formType,
      description: formDesc,
      pricePerHour: Number(formPrice),
      isPopular: formPopular,
      images: formImages,
      specs: formSpecs,
    };

    try {
      if (editing?.id) {
        await apiFetch(`/admin/equipment/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/admin/equipment", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      closeEdit();
      await loadItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/equipment/${id}`, { method: "DELETE" });
      await loadItems();
      if (editing?.id === id) closeEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка видалення");
    }
    setDeleteTarget(null);
  }

  /* ── Filtered list ── */
  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && item.type !== filterType) return false;
    return true;
  });

  /* ── Render ── */

  return (
    <>
      {/* Header */}
      <AdminPageHeader title="Техніка" subtitle={`${items.length} одиниць`}>
        <AdminButton onClick={openNew}>+ Додати техніку</AdminButton>
      </AdminPageHeader>

      {/* Filters */}
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

      {/* Equipment table */}
      <AdminCard className="overflow-hidden p-0">
        {/* Table header */}
        <div className="hidden items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 sm:flex">
          <span className="flex-1 text-xs font-semibold text-gray-500">Назва</span>
          <span className="w-24 text-xs font-semibold text-gray-500">Тип</span>
          <span className="w-20 text-xs font-semibold text-gray-500">Ціна/год</span>
          <span className="w-20 text-xs font-semibold text-gray-500">Статус</span>
          <span className="w-16 text-xs font-semibold text-gray-500 text-right">Дії</span>
        </div>

        {/* Rows */}
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
                className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-2 hover:bg-gray-50/60 transition-colors"
              >
                {/* Name */}
                <div className="flex items-center justify-between sm:flex-1">
                  <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  <span className="text-xs text-gray-500 sm:hidden">{item.pricePerHour} грн</span>
                </div>
                {/* Type */}
                <span className="hidden w-24 text-xs text-gray-500 sm:block">
                  {typeLabels[item.type] ?? item.type}
                </span>
                {/* Price */}
                <span className="hidden w-20 text-sm font-medium text-gray-700 sm:block">
                  {item.pricePerHour}
                </span>
                {/* Status + Actions */}
                <div className="flex items-center justify-between sm:contents">
                  <span className="sm:w-20">
                    <StatusBadge status={hasBooked ? "busy" : "available"} />
                  </span>
                  {/* Actions dropdown */}
                  <div className="relative sm:w-16 sm:text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionId(openActionId === item.id ? null : item.id);
                      }}
                      className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </button>
                    {openActionId === item.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => openEdit(item)}
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

      {/* Confirm delete modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Видалення техніки"
        message={`Ви впевнені, що хочете видалити "${deleteTarget?.name}"?`}
        confirmLabel="Видалити"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Edit / Create panel */}
      {editing && (
        <AdminCard className="mt-4">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Edit header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing.id ? `Редагування: ${editing.name}` : "Нова техніка"}
              </h2>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form grid */}
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Left fields */}
              <div className="flex flex-1 flex-col gap-3">
                <AdminInput label="Назва" value={formName} onChange={(e) => setFormName(e.target.value)} required />
                <AdminInput label="Slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} required />
                <AdminInput label="Бренд" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} required />

                <AdminSelect
                  label="Тип"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </AdminSelect>

                <AdminInput
                  label="Ціна / год"
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  required
                />

                <AdminTextarea
                  label="Опис"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                />

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formPopular}
                    onChange={(e) => setFormPopular(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-xs font-medium text-gray-600">Популярна техніка</span>
                </label>

                {/* Image upload */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-600">Фото</span>

                  {formImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formImages.map((img, i) => (
                        <div key={i} className="group relative">
                          <img
                            src={
                              img.url.startsWith("http")
                                ? img.url
                                : `${API_BASE.replace(/\/api$/, "")}${img.url}`
                            }
                            alt={img.alt}
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

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
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-xs font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {uploading ? "Завантаження…" : "+ Завантажити фото"}
                  </button>

                  <div className="flex gap-2">
                    <AdminInput
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageByUrl(); } }}
                      placeholder="https://example.com/photo.jpg"
                      className="flex-1"
                    />
                    <AdminButton type="button" variant="secondary" size="sm" onClick={addImageByUrl}>
                      + URL
                    </AdminButton>
                  </div>
                </div>

                {/* Specs */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-600">Характеристики</span>

                  {formSpecs.map((spec, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={spec.label}
                        onChange={(e) => updateSpec(i, "label", e.target.value)}
                        placeholder="Назва"
                        className="w-2/5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
                      />
                      <input
                        value={spec.value}
                        onChange={(e) => updateSpec(i, "value", e.target.value)}
                        placeholder="Значення"
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeSpec(i)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-500 transition-colors hover:bg-red-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex items-end gap-2">
                    <div className="flex w-2/5 flex-col gap-1">
                      <input
                        list="spec-labels"
                        value={newSpecLabel}
                        onChange={(e) => setNewSpecLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSpec(); } }}
                        placeholder="Назва характеристики"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
                      />
                      <datalist id="spec-labels">
                        {existingLabels.map((l) => (
                          <option key={l} value={l} />
                        ))}
                      </datalist>
                    </div>
                    <input
                      value={newSpecValue}
                      onChange={(e) => setNewSpecValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSpec(); } }}
                      placeholder="Значення"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
                    />
                    <AdminButton type="button" variant="secondary" size="sm" onClick={addSpec}>
                      + Додати
                    </AdminButton>
                  </div>
                </div>
              </div>

              {/* Right — booked periods */}
              {editing.id && editing.bookedPeriods?.length > 0 && (
                <div className="flex flex-1 flex-col gap-2 rounded-lg bg-gray-50 p-4">
                  <span className="text-sm font-semibold text-gray-700">Зайнятість</span>
                  <div className="flex flex-wrap gap-1.5">
                    {editing.bookedPeriods.map((bp) => (
                      <StatusBadge
                        key={bp.id}
                        status="busy"
                        label={`${bp.from.split("T")[0]} — ${bp.to.split("T")[0]}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <AdminButton type="button" variant="secondary" onClick={closeEdit} className="flex-1">
                Скасувати
              </AdminButton>
              <AdminButton type="submit" disabled={saving} className="flex-1">
                {saving ? "Збереження…" : "Зберегти"}
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      )}
    </>
  );
}
