import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import { AdminButton, AdminCard, AdminInput, AdminPageHeader, AdminSelect, AdminTextarea, ConfirmModal, StatusBadge } from "../components/admin";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import type { Material, SupplierMaterialOffer, SupplierPoint } from "../data/material-delivery";

type ActiveTab = "materials" | "points" | "offers";

interface SupplierPointOfferSummary {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  unitPrice: number;
  isAvailable: boolean;
}

interface SupplierPointWithOffers extends SupplierPoint {
  offers: SupplierPointOfferSummary[];
}

interface MaterialForm {
  id?: string;
  name: string;
  slug: string;
  unit: string;
  isActive: boolean;
  minOrderQuantity: string;
  sortOrder: string;
}

interface SupplierPointForm {
  id?: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  isActive: boolean;
  contactName: string;
  contactPhone: string;
  workHours: string;
  notes: string;
}

interface SupplierOfferForm {
  id?: string;
  supplierPointId: string;
  materialId: string;
  unitPrice: string;
  isAvailable: boolean;
  minOrderQuantity: string;
  lastPriceUpdatedAt: string;
  notes: string;
}

const emptyMaterialForm: MaterialForm = {
  name: "",
  slug: "",
  unit: "т",
  isActive: true,
  minOrderQuantity: "",
  sortOrder: "0",
};

const emptySupplierPointForm: SupplierPointForm = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  isActive: true,
  contactName: "",
  contactPhone: "",
  workHours: "",
  notes: "",
};

const emptySupplierOfferForm: SupplierOfferForm = {
  supplierPointId: "",
  materialId: "",
  unitPrice: "",
  isAvailable: true,
  minOrderQuantity: "",
  lastPriceUpdatedAt: "",
  notes: "",
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

function toNullableNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function AdminSupplyPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("materials");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierPoints, setSupplierPoints] = useState<SupplierPointWithOffers[]>([]);
  const [offers, setOffers] = useState<SupplierMaterialOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [materialForm, setMaterialForm] = useState<MaterialForm>(emptyMaterialForm);
  const [pointForm, setPointForm] = useState<SupplierPointForm>(emptySupplierPointForm);
  const [offerForm, setOfferForm] = useState<SupplierOfferForm>(emptySupplierOfferForm);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: ActiveTab;
    id: string;
    name: string;
  } | null>(null);

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.isActive),
    [materials],
  );

  const activeSupplierPoints = useMemo(
    () => supplierPoints.filter((point) => point.isActive),
    [supplierPoints],
  );

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [materialsData, pointsData, offersData] = await Promise.all([
        apiFetch<Material[]>("/admin/supply/materials"),
        apiFetch<SupplierPointWithOffers[]>("/admin/supply/supplier-points"),
        apiFetch<SupplierMaterialOffer[]>("/admin/supply/supplier-offers"),
      ]);
      setMaterials(materialsData);
      setSupplierPoints(pointsData);
      setOffers(offersData);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не вдалося завантажити постачання");
    } finally {
      setLoading(false);
    }
  }

  async function saveMaterial(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSubmitError("");
    try {
      const body = {
        name: materialForm.name.trim(),
        slug: materialForm.slug.trim(),
        unit: materialForm.unit.trim(),
        isActive: materialForm.isActive,
        minOrderQuantity: toNullableNumber(materialForm.minOrderQuantity),
        sortOrder: Number(materialForm.sortOrder || 0),
      };

      await apiFetch(materialForm.id ? `/admin/supply/materials/${materialForm.id}` : "/admin/supply/materials", {
        method: materialForm.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setMaterialForm(emptyMaterialForm);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не вдалося зберегти матеріал");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupplierPoint(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSubmitError("");
    try {
      const body = {
        name: pointForm.name.trim(),
        address: pointForm.address.trim(),
        latitude: Number(pointForm.latitude),
        longitude: Number(pointForm.longitude),
        isActive: pointForm.isActive,
        contactName: pointForm.contactName.trim() || null,
        contactPhone: pointForm.contactPhone.trim() || null,
        workHours: pointForm.workHours.trim() || null,
        notes: pointForm.notes.trim() || null,
      };

      await apiFetch(pointForm.id ? `/admin/supply/supplier-points/${pointForm.id}` : "/admin/supply/supplier-points", {
        method: pointForm.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setPointForm(emptySupplierPointForm);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не вдалося зберегти точку");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupplierOffer(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSubmitError("");
    try {
      const body = {
        supplierPointId: offerForm.supplierPointId,
        materialId: offerForm.materialId,
        unitPrice: Number(offerForm.unitPrice),
        isAvailable: offerForm.isAvailable,
        minOrderQuantity: toNullableNumber(offerForm.minOrderQuantity),
        lastPriceUpdatedAt: offerForm.lastPriceUpdatedAt,
        notes: offerForm.notes.trim() || null,
      };

      await apiFetch(offerForm.id ? `/admin/supply/supplier-offers/${offerForm.id}` : "/admin/supply/supplier-offers", {
        method: offerForm.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setOfferForm(emptySupplierOfferForm);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не вдалося зберегти ціну");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const endpoint = deleteTarget.type === "materials"
      ? `/admin/supply/materials/${deleteTarget.id}`
      : deleteTarget.type === "points"
        ? `/admin/supply/supplier-points/${deleteTarget.id}`
        : `/admin/supply/supplier-offers/${deleteTarget.id}`;

    try {
      await apiFetch(endpoint, { method: "DELETE" });
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не вдалося видалити запис");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Постачання"
        subtitle="Матеріали, точки завантаження і ціни для калькулятора доставки"
      >
        <AdminButton variant="secondary" onClick={loadAll} disabled={loading}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      {submitError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {submitError}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Матеріали" value={materials.length} activeValue={activeMaterials.length} />
        <SummaryCard label="Точки" value={supplierPoints.length} activeValue={activeSupplierPoints.length} />
        <SummaryCard label="Ціни" value={offers.length} activeValue={offers.filter((offer) => offer.isAvailable).length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton active={activeTab === "materials"} onClick={() => setActiveTab("materials")}>
          Матеріали
        </TabButton>
        <TabButton active={activeTab === "points"} onClick={() => setActiveTab("points")}>
          Точки постачання
        </TabButton>
        <TabButton active={activeTab === "offers"} onClick={() => setActiveTab("offers")}>
          Пропозиції / ціни
        </TabButton>
      </div>

      {activeTab === "materials" && (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <MaterialFormCard
            form={materialForm}
            saving={saving}
            onSubmit={saveMaterial}
            onCancel={() => setMaterialForm(emptyMaterialForm)}
            onChange={setMaterialForm}
          />
          <AdminCard className="overflow-hidden p-0">
            <ListHeader title="Матеріали" />
            {loading ? <AdminTableRowsSkeleton rows={5} cols={4} /> : (
              <div className="divide-y divide-gray-100">
                {materials.map((material) => (
                  <div key={material.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_100px_120px] sm:items-center">
                    <div>
                      <p className="font-semibold text-gray-900">{material.name}</p>
                      <p className="text-xs text-gray-500">{material.slug}</p>
                    </div>
                    <span className="text-gray-600">{material.unit}</span>
                    <StatusBadge status={material.isActive ? "active" : "inactive"} />
                    <RowActions
                      onEdit={() => setMaterialForm({
                        id: material.id,
                        name: material.name,
                        slug: material.slug,
                        unit: material.unit,
                        isActive: material.isActive,
                        minOrderQuantity: material.minOrderQuantity != null ? String(material.minOrderQuantity) : "",
                        sortOrder: String(material.sortOrder),
                      })}
                      onDelete={() => setDeleteTarget({ type: "materials", id: material.id, name: material.name })}
                    />
                  </div>
                ))}
                {materials.length === 0 && <EmptyState text="Матеріали ще не додані" />}
              </div>
            )}
          </AdminCard>
        </div>
      )}

      {activeTab === "points" && (
        <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
          <SupplierPointFormCard
            form={pointForm}
            saving={saving}
            onSubmit={saveSupplierPoint}
            onCancel={() => setPointForm(emptySupplierPointForm)}
            onChange={setPointForm}
          />
          <AdminCard className="overflow-hidden p-0">
            <ListHeader title="Точки постачання" />
            {loading ? <AdminTableRowsSkeleton rows={5} cols={4} /> : (
              <div className="divide-y divide-gray-100">
                {supplierPoints.map((point) => (
                  <div key={point.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_160px_90px_120px] lg:items-center">
                    <div>
                      <p className="font-semibold text-gray-900">{point.name}</p>
                      <p className="line-clamp-2 text-xs text-gray-500">{point.address}</p>
                      {point.offers.length > 0 && (
                        <p className="mt-1 text-xs text-gray-400">
                          {point.offers.map((offer) => `${offer.materialName}: ${offer.unitPrice} грн/${offer.unit}`).join(" • ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{point.contactPhone || "Контакт не вказано"}</span>
                    <StatusBadge status={point.isActive ? "active" : "inactive"} />
                    <RowActions
                      onEdit={() => setPointForm({
                        id: point.id,
                        name: point.name,
                        address: point.address,
                        latitude: String(point.latitude),
                        longitude: String(point.longitude),
                        isActive: point.isActive,
                        contactName: point.contactName ?? "",
                        contactPhone: point.contactPhone ?? "",
                        workHours: point.workHours ?? "",
                        notes: point.notes ?? "",
                      })}
                      onDelete={() => setDeleteTarget({ type: "points", id: point.id, name: point.name })}
                    />
                  </div>
                ))}
                {supplierPoints.length === 0 && <EmptyState text="Точки постачання ще не додані" />}
              </div>
            )}
          </AdminCard>
        </div>
      )}

      {activeTab === "offers" && (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <SupplierOfferFormCard
            form={offerForm}
            materials={materials}
            supplierPoints={supplierPoints}
            saving={saving}
            onSubmit={saveSupplierOffer}
            onCancel={() => setOfferForm(emptySupplierOfferForm)}
            onChange={setOfferForm}
          />
          <AdminCard className="overflow-hidden p-0">
            <ListHeader title="Пропозиції / ціни" />
            {loading ? <AdminTableRowsSkeleton rows={5} cols={4} /> : (
              <div className="divide-y divide-gray-100">
                {offers.map((offer) => (
                  <div key={offer.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_130px_90px_120px] lg:items-center">
                    <div>
                      <p className="font-semibold text-gray-900">{offer.material?.name ?? "Матеріал"}</p>
                      <p className="text-xs text-gray-500">{offer.supplierPoint?.name ?? "Точка постачання"}</p>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {offer.unitPrice} грн/{offer.material?.unit ?? "од."}
                    </span>
                    <StatusBadge status={offer.isAvailable ? "active" : "inactive"} />
                    <RowActions
                      onEdit={() => setOfferForm({
                        id: offer.id,
                        supplierPointId: offer.supplierPointId,
                        materialId: offer.materialId,
                        unitPrice: String(offer.unitPrice),
                        isAvailable: offer.isAvailable,
                        minOrderQuantity: offer.minOrderQuantity != null ? String(offer.minOrderQuantity) : "",
                        lastPriceUpdatedAt: toDateInputValue(offer.lastPriceUpdatedAt),
                        notes: offer.notes ?? "",
                      })}
                      onDelete={() => setDeleteTarget({
                        type: "offers",
                        id: offer.id,
                        name: `${offer.material?.name ?? "Матеріал"} / ${offer.supplierPoint?.name ?? "точка"}`,
                      })}
                    />
                  </div>
                ))}
                {offers.length === 0 && <EmptyState text="Ціни ще не додані" />}
              </div>
            )}
          </AdminCard>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Видалити запис?"
        message={`Видалити "${deleteTarget?.name}"? Пов'язані ціни можуть бути також видалені.`}
        confirmLabel="Видалити"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

function SummaryCard({ label, value, activeValue }: { label: string; value: number; activeValue: number }) {
  return (
    <AdminCard className="!p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">Активні: {activeValue}</p>
    </AdminCard>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-primary text-dark" : "bg-white text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function ListHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-sm text-gray-400">{text}</p>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <AdminButton type="button" size="sm" variant="secondary" onClick={onEdit}>
        Редагувати
      </AdminButton>
      <AdminButton type="button" size="sm" variant="danger" onClick={onDelete}>
        Видалити
      </AdminButton>
    </div>
  );
}

function MaterialFormCard({
  form,
  saving,
  onSubmit,
  onCancel,
  onChange,
}: {
  form: MaterialForm;
  saving: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onChange: (form: MaterialForm) => void;
}) {
  return (
    <AdminCard>
      <h3 className="mb-4 text-sm font-bold text-gray-900">
        {form.id ? "Редагування матеріалу" : "Новий матеріал"}
      </h3>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <AdminInput
          label="Назва *"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value, slug: form.id ? form.slug : slugify(event.target.value) })}
          placeholder="Пісок, щебінь, чорнозем"
          required
        />
        <AdminInput
          label="Slug *"
          value={form.slug}
          onChange={(event) => onChange({ ...form, slug: event.target.value })}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminInput
            label="Одиниця *"
            value={form.unit}
            onChange={(event) => onChange({ ...form, unit: event.target.value })}
            placeholder="т, м3, шт"
            required
          />
          <AdminInput
            label="Порядок"
            type="number"
            value={form.sortOrder}
            onChange={(event) => onChange({ ...form, sortOrder: event.target.value })}
          />
        </div>
        <AdminInput
          label="Мін. кількість"
          type="number"
          min={0}
          step="0.01"
          value={form.minOrderQuantity}
          onChange={(event) => onChange({ ...form, minOrderQuantity: event.target.value })}
        />
        <AdminSelect
          label="Статус"
          value={form.isActive ? "active" : "inactive"}
          onChange={(event) => onChange({ ...form, isActive: event.target.value === "active" })}
        >
          <option value="active">Активний</option>
          <option value="inactive">Неактивний</option>
        </AdminSelect>
        <FormActions editing={!!form.id} saving={saving} onCancel={onCancel} />
      </form>
    </AdminCard>
  );
}

function SupplierPointFormCard({
  form,
  saving,
  onSubmit,
  onCancel,
  onChange,
}: {
  form: SupplierPointForm;
  saving: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onChange: (form: SupplierPointForm) => void;
}) {
  return (
    <AdminCard>
      <h3 className="mb-4 text-sm font-bold text-gray-900">
        {form.id ? "Редагування точки" : "Нова точка постачання"}
      </h3>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <AdminInput
          label="Назва *"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="Кар'єр, склад, база"
          required
        />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Адреса *</label>
          <AddressAutocompleteInput
            value={form.address}
            onChange={(value) => onChange({ ...form, address: value, latitude: "", longitude: "" })}
            onSelect={(suggestion) => onChange({
              ...form,
              address: suggestion.label,
              latitude: String(suggestion.lat),
              longitude: String(suggestion.lon),
            })}
            placeholder="Почніть вводити адресу"
            inputClassName="!rounded-lg !border-gray-200 !px-3 !py-2 !text-sm !text-gray-900"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminInput
            label="Широта *"
            type="number"
            step="any"
            value={form.latitude}
            onChange={(event) => onChange({ ...form, latitude: event.target.value })}
            required
          />
          <AdminInput
            label="Довгота *"
            type="number"
            step="any"
            value={form.longitude}
            onChange={(event) => onChange({ ...form, longitude: event.target.value })}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminInput
            label="Контакт"
            value={form.contactName}
            onChange={(event) => onChange({ ...form, contactName: event.target.value })}
          />
          <AdminInput
            label="Телефон"
            value={form.contactPhone}
            onChange={(event) => onChange({ ...form, contactPhone: event.target.value })}
          />
        </div>
        <AdminInput
          label="Графік"
          value={form.workHours}
          onChange={(event) => onChange({ ...form, workHours: event.target.value })}
          placeholder="Пн-Пт 08:00-18:00"
        />
        <AdminTextarea
          label="Нотатки"
          rows={3}
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
        />
        <AdminSelect
          label="Статус"
          value={form.isActive ? "active" : "inactive"}
          onChange={(event) => onChange({ ...form, isActive: event.target.value === "active" })}
        >
          <option value="active">Активна</option>
          <option value="inactive">Неактивна</option>
        </AdminSelect>
        <FormActions editing={!!form.id} saving={saving} onCancel={onCancel} />
      </form>
    </AdminCard>
  );
}

function SupplierOfferFormCard({
  form,
  materials,
  supplierPoints,
  saving,
  onSubmit,
  onCancel,
  onChange,
}: {
  form: SupplierOfferForm;
  materials: Material[];
  supplierPoints: SupplierPointWithOffers[];
  saving: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onChange: (form: SupplierOfferForm) => void;
}) {
  return (
    <AdminCard>
      <h3 className="mb-4 text-sm font-bold text-gray-900">
        {form.id ? "Редагування ціни" : "Нова ціна"}
      </h3>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <AdminSelect
          label="Точка *"
          value={form.supplierPointId}
          onChange={(event) => onChange({ ...form, supplierPointId: event.target.value })}
          required
        >
          <option value="">Оберіть точку</option>
          {supplierPoints.map((point) => (
            <option key={point.id} value={point.id}>{point.name}</option>
          ))}
        </AdminSelect>
        <AdminSelect
          label="Матеріал *"
          value={form.materialId}
          onChange={(event) => onChange({ ...form, materialId: event.target.value })}
          required
        >
          <option value="">Оберіть матеріал</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>
          ))}
        </AdminSelect>
        <AdminInput
          label="Ціна за одиницю *"
          type="number"
          min={0}
          step="0.01"
          value={form.unitPrice}
          onChange={(event) => onChange({ ...form, unitPrice: event.target.value })}
          required
        />
        <AdminInput
          label="Мін. кількість"
          type="number"
          min={0}
          step="0.01"
          value={form.minOrderQuantity}
          onChange={(event) => onChange({ ...form, minOrderQuantity: event.target.value })}
        />
        <AdminInput
          label="Дата оновлення ціни"
          type="date"
          value={form.lastPriceUpdatedAt}
          onChange={(event) => onChange({ ...form, lastPriceUpdatedAt: event.target.value })}
        />
        <AdminTextarea
          label="Нотатки"
          rows={3}
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
        />
        <AdminSelect
          label="Наявність"
          value={form.isAvailable ? "available" : "unavailable"}
          onChange={(event) => onChange({ ...form, isAvailable: event.target.value === "available" })}
        >
          <option value="available">Доступно</option>
          <option value="unavailable">Недоступно</option>
        </AdminSelect>
        <FormActions editing={!!form.id} saving={saving} onCancel={onCancel} />
      </form>
    </AdminCard>
  );
}

function FormActions({ editing, saving, onCancel }: { editing: boolean; saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      {editing && (
        <AdminButton type="button" variant="secondary" onClick={onCancel}>
          Скасувати
        </AdminButton>
      )}
      <AdminButton type="submit" disabled={saving}>
        {saving ? "Збереження..." : editing ? "Зберегти" : "Додати"}
      </AdminButton>
    </div>
  );
}
