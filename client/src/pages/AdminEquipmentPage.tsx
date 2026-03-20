import { useState, useEffect, useRef, type FormEvent } from "react";
import { apiFetch } from "../api/client";

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

  function addImageByUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    setFormImages((prev) => [...prev, { url, alt: "" }]);
    setImageUrl("");
  }

  /** Upload image via FormData (not apiFetch — needs multipart) */
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

  /* Collect all unique spec labels used across equipment */
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
    // Delete from server if it's an uploaded file
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
        // ignore — file cleanup is best-effort
      }
    }
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function loadItems() {
    setLoading(true);
    try {
      const data = await apiFetch<ApiEquipment[]>("/equipment");
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Видалити "${name}"?`)) return;
    try {
      await apiFetch(`/admin/equipment/${id}`, { method: "DELETE" });
      await loadItems();
      if (editing?.id === id) closeEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка видалення");
    }
  }

  /* ── Render ── */

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-dark sm:text-[32px]">Список техніки</h1>
        <button
          onClick={openNew}
          className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 sm:w-auto"
        >
          + Додати нову техніку
        </button>
      </div>

      {/* Equipment List */}
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-white p-3.5">
        <h2 className="text-[22px] font-bold text-dark">Список техніки</h2>

        {/* Header row */}
        <div className="hidden items-center gap-2 rounded-lg bg-light-bg px-2.5 py-2 sm:flex">
          <span className="flex-1 text-xs font-bold text-dark-text">Назва</span>
          <span className="w-24 text-xs font-bold text-dark-text">Ціна/год</span>
          <span className="w-24 text-xs font-bold text-dark-text">Статус</span>
          <span className="w-44 text-xs font-bold text-dark-text">Дії</span>
        </div>

        {/* Rows */}
        {loading ? (
          <p className="py-8 text-center text-sm text-dark-text">
            Завантаження...
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-dark-text">
            Техніка відсутня
          </p>
        ) : (
          items.map((item) => {
            const hasBooked = item.bookedPeriods.length > 0;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-[#EFEFEF] bg-white px-2.5 py-2.5 sm:flex-row sm:items-center sm:gap-2"
              >
                <div className="flex items-center justify-between sm:flex-1">
                  <span className="text-[13px] font-semibold text-dark">
                    {item.name}
                  </span>
                  <span className="text-[13px] font-semibold text-dark-text sm:hidden">
                    {item.pricePerHour} грн/год
                  </span>
                </div>
                <span className="hidden w-24 text-[13px] font-semibold text-dark-text sm:block">
                  {item.pricePerHour}
                </span>
                <div className="flex items-center justify-between sm:contents">
                  <span className="sm:w-24">
                    {hasBooked ? (
                      <span className="text-xs font-bold text-[#B42318]">
                        Зайнято
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-[#1F7A1F]">
                        Вільно
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1.5 sm:w-44">
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-full bg-light-bg px-2.5 py-1.5 text-[11px] font-bold text-dark transition-colors hover:bg-gray-200"
                    >
                      Редагувати
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="rounded-full bg-[#FFE7E7] px-2.5 py-1.5 text-[11px] font-bold text-[#B42318] transition-colors hover:bg-red-200"
                    >
                      Видалити
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit / Create panel */}
      {editing && (
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-3 rounded-[14px] border border-border bg-white p-4"
        >
          {/* Edit header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-dark">
              {editing.id ? `Редагування: ${editing.name}` : "Нова техніка"}
            </h2>
            <button
              type="button"
              onClick={closeEdit}
              className="text-sm font-bold text-dark-text hover:text-dark"
            >
              ✕
            </button>
          </div>

          {/* Form grid */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Left fields */}
            <div className="flex flex-1 flex-col gap-2">
              <Field label="Назва" value={formName} onChange={setFormName} />
              <Field label="Slug" value={formSlug} onChange={setFormSlug} />
              <Field label="Бренд" value={formBrand} onChange={setFormBrand} />

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-dark-text">Тип</span>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="rounded-[10px] bg-light-bg px-3 py-2.5 text-[13px] font-semibold text-dark outline-none"
                >
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <Field
                label="Ціна / год"
                value={formPrice}
                onChange={setFormPrice}
                type="number"
              />

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-dark-text">Опис</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  className="rounded-[10px] bg-light-bg px-3 py-2.5 text-[13px] font-semibold text-dark outline-none"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formPopular}
                  onChange={(e) => setFormPopular(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-xs font-bold text-dark-text">
                  Популярна техніка
                </span>
              </label>

              {/* Image upload */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-dark-text">Фото</span>

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
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#B42318] text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
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
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full rounded-[10px] border-2 border-dashed border-gray-300 py-3 text-xs font-bold text-dark-text transition-colors hover:border-primary hover:text-dark disabled:opacity-50"
                >
                  {uploading ? "Завантаження..." : "+ Завантажити фото"}
                </button>

                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageByUrl(); } }}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 rounded-[10px] bg-light-bg px-3 py-2.5 text-[13px] font-semibold text-dark outline-none"
                  />
                  <button
                    type="button"
                    onClick={addImageByUrl}
                    className="rounded-[10px] bg-light-bg px-3 py-2.5 text-xs font-bold text-dark-text transition-colors hover:bg-gray-200"
                  >
                    + URL
                  </button>
                </div>
              </div>

              {/* Specs */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-dark-text">Характеристики</span>

                {formSpecs.map((spec, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={spec.label}
                      onChange={(e) => updateSpec(i, "label", e.target.value)}
                      placeholder="Назва"
                      className="w-2/5 rounded-[10px] bg-light-bg px-3 py-2 text-[13px] font-semibold text-dark outline-none"
                    />
                    <input
                      value={spec.value}
                      onChange={(e) => updateSpec(i, "value", e.target.value)}
                      placeholder="Значення"
                      className="flex-1 rounded-[10px] bg-light-bg px-3 py-2 text-[13px] font-semibold text-dark outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpec(i)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFE7E7] text-[11px] font-bold text-[#B42318] transition-colors hover:bg-red-200"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="flex items-end gap-1.5">
                  <div className="flex w-2/5 flex-col gap-1">
                    <input
                      list="spec-labels"
                      value={newSpecLabel}
                      onChange={(e) => setNewSpecLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSpec(); } }}
                      placeholder="Назва характеристики"
                      className="w-full rounded-[10px] bg-light-bg px-3 py-2 text-[13px] font-semibold text-dark outline-none"
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
                    className="flex-1 rounded-[10px] bg-light-bg px-3 py-2 text-[13px] font-semibold text-dark outline-none"
                  />
                  <button
                    type="button"
                    onClick={addSpec}
                    className="shrink-0 rounded-[10px] bg-light-bg px-3 py-2 text-xs font-bold text-dark-text transition-colors hover:bg-gray-200"
                  >
                    + Додати
                  </button>
                </div>
              </div>
            </div>

            {/* Right — booked periods */}
            {editing.id && editing.bookedPeriods?.length > 0 && (
              <div className="flex flex-1 flex-col gap-2 rounded-[10px] bg-light-bg p-3">
                <span className="text-sm font-bold text-dark">
                  Керування зайнятістю
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {editing.bookedPeriods.map((bp) => (
                    <span
                      key={bp.id}
                      className="rounded-full bg-[#FFE7E7] px-2.5 py-2 text-[11px] font-bold text-[#B42318]"
                    >
                      {bp.from.split("T")[0]} — {bp.to.split("T")[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={closeEdit}
              className="flex-1 rounded-full bg-light-bg py-2.5 text-center text-xs font-bold text-dark transition-colors hover:bg-gray-200"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-primary py-2.5 text-center text-xs font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/* ── Reusable field ── */

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-dark-text">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] bg-light-bg px-3 py-2.5 text-[13px] font-semibold text-dark outline-none"
        required
      />
    </div>
  );
}
