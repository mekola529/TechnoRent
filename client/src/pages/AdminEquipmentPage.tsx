import { useState, useEffect, type FormEvent } from "react";
import { apiFetch } from "../api/client";

/* ── Types ── */

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
  const [saving, setSaving] = useState(false);

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
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold text-dark">Список техніки</h1>
        <button
          onClick={openNew}
          className="rounded-full bg-primary px-3.5 py-2.5 text-[13px] font-bold text-dark transition-opacity hover:opacity-90"
        >
          + Додати нову техніку
        </button>
      </div>

      {/* Equipment List */}
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-white p-3.5">
        <h2 className="text-[22px] font-bold text-dark">Список техніки</h2>

        {/* Header row */}
        <div className="flex items-center gap-2 rounded-lg bg-light-bg px-2.5 py-2">
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
                className="flex items-center gap-2 rounded-lg border border-[#EFEFEF] bg-white px-2.5 py-2.5"
              >
                <span className="flex-1 text-[13px] font-semibold text-dark">
                  {item.name}
                </span>
                <span className="w-24 text-[13px] font-semibold text-dark-text">
                  {item.pricePerHour}
                </span>
                <span className="w-24">
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
                <div className="flex w-44 gap-1.5">
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
          <div className="flex gap-3">
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
