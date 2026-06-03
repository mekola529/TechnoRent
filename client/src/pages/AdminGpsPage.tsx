import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import {
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  StatusBadge,
} from "../components/admin";
import type { Status } from "../components/admin";

interface TrackerDevice {
  id: string;
  name: string;
  equipmentId: string | null;
  equipment: {
    id: string;
    name: string;
    slug: string;
  } | null;
  lastAddress: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastEventText: string | null;
  lastTrackerAt: string | null;
  lastTelegramChatId: string | null;
  lastTelegramMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentOption {
  id: string;
  name: string;
  slug: string;
}

const FRESH_THRESHOLD_MIN = 15;
const STALE_THRESHOLD_MIN = 60;

export default function AdminGpsPage() {
  const [devices, setDevices] = useState<TrackerDevice[]>([]);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, {
      name: string;
      equipmentId: string;
      lastAddress: string;
      lastLatitude: string;
      lastLongitude: string;
    }>
  >({});

  async function loadDevices() {
    setLoading(true);
    try {
      const [data, equipmentData] = await Promise.all([
        apiFetch<TrackerDevice[]>("/admin/gps"),
        apiFetch<EquipmentOption[]>("/admin/equipment"),
      ]);
      setDevices(data);
      setEquipment(equipmentData.map((item) => ({ id: item.id, name: item.name, slug: item.slug })));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const device of data) {
          next[device.id] = next[device.id] ?? toDeviceDraft(device);
        }
        return next;
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не вдалося завантажити GPS");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return devices;
    const query = search.toLowerCase();

    return devices.filter((device) => {
      return (
        device.name.toLowerCase().includes(query) ||
        (device.lastAddress ?? "").toLowerCase().includes(query) ||
        formatCoordinates(device.lastLatitude, device.lastLongitude).toLowerCase().includes(query) ||
        (device.equipment?.name ?? "").toLowerCase().includes(query)
      );
    });
  }, [devices, search]);

  function startEdit(device: TrackerDevice) {
    setEditingId(device.id);
    setDrafts((prev) => ({
      ...prev,
      [device.id]: toDeviceDraft(device),
    }));
  }

  function updateDraft(deviceId: string, patch: Partial<TrackerDeviceDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [deviceId]: {
        name: prev[deviceId]?.name ?? "",
        equipmentId: prev[deviceId]?.equipmentId ?? "",
        lastAddress: prev[deviceId]?.lastAddress ?? "",
        lastLatitude: prev[deviceId]?.lastLatitude ?? "",
        lastLongitude: prev[deviceId]?.lastLongitude ?? "",
        ...patch,
      },
    }));
  }

  async function saveDevice(deviceId: string) {
    const draft = drafts[deviceId];
    if (!draft?.name.trim()) {
      alert("Вкажіть назву GPS-маячка");
      return;
    }

    const latitude = parseOptionalNumber(draft.lastLatitude);
    const longitude = parseOptionalNumber(draft.lastLongitude);
    if (latitude === "invalid" || longitude === "invalid") {
      alert("Координати мають бути числами");
      return;
    }

    setBusyId(deviceId);
    try {
      await apiFetch(`/admin/gps/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          equipmentId: draft.equipmentId || null,
          lastAddress: draft.lastAddress.trim() || null,
          lastLatitude: latitude,
          lastLongitude: longitude,
        }),
      });
      setEditingId(null);
      await loadDevices();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDevice(device: TrackerDevice) {
    if (!window.confirm(`Видалити GPS-маячок "${device.name}"?\nІсторія повідомлень маячка буде очищена, а GPS-звіти залишаться без прив’язки до маячка.`)) {
      return;
    }

    setBusyId(device.id);
    try {
      await apiFetch(`/admin/gps/${device.id}`, {
        method: "DELETE",
      });
      await loadDevices();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      <AdminPageHeader
        title="GPS"
        subtitle={`${devices.length} пристроїв${devices.length > 0 ? " • актуальні місця розташування" : ""}`}
      >
        <AdminButton variant="secondary" size="sm" onClick={loadDevices}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за пристроєм, адресою або координатами…"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Усього пристроїв"
          value={devices.length}
          accent="text-gray-900"
        />
        <SummaryCard
          label="Оновлено до 15 хв"
          value={devices.filter((device) => getFreshness(device.lastTrackerAt).badge === "confirmed").length}
          accent="text-emerald-600"
        />
        <SummaryCard
          label="Без свіжого сигналу"
          value={devices.filter((device) => {
            const badge = getFreshness(device.lastTrackerAt).badge;
            return badge === "cancelled" || badge === "in_progress";
          }).length}
          accent="text-amber-600"
        />
      </div>

      <AdminCard className="flex flex-1 flex-col overflow-hidden p-0">
        <div className="hidden gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 lg:flex">
          <span className="w-[190px] shrink-0 text-xs font-semibold text-gray-500">Пристрій</span>
          <span className="w-[190px] shrink-0 text-xs font-semibold text-gray-500">Техніка</span>
          <span className="flex-1 text-xs font-semibold text-gray-500">Розташування</span>
          <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Оновлено</span>
          <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Минуло часу</span>
          <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Статус</span>
          <span className="w-[160px] shrink-0 text-right text-xs font-semibold text-gray-500">Дії</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <AdminTableRowsSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              {devices.length === 0 ? "GPS-пристрої ще не збережені" : "Нічого не знайдено"}
            </p>
          ) : (
            filtered.map((device) => {
              const freshness = getFreshness(device.lastTrackerAt);
              const updatedLabel = formatDateTime(device.lastTrackerAt);
              const draft = drafts[device.id] ?? toDeviceDraft(device);
              const isEditing = editingId === device.id;

              return (
                <div
                  key={device.id}
                  className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/60 lg:flex-row lg:items-center lg:gap-2"
                >
                  {isEditing ? (
                    <div className="grid w-full gap-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                        <AdminInput
                          label="Назва GPS-маячка"
                          value={draft.name}
                          onChange={(event) => updateDraft(device.id, { name: event.target.value })}
                        />
                        <AdminSelect
                          label="Прив’язана техніка"
                          value={draft.equipmentId}
                          onChange={(event) => updateDraft(device.id, { equipmentId: event.target.value })}
                        >
                          <option value="">Не прив’язано</option>
                          {equipment.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </AdminSelect>
                      </div>
                      <AdminTextarea
                        label="Остання адреса"
                        rows={2}
                        value={draft.lastAddress}
                        onChange={(event) => updateDraft(device.id, { lastAddress: event.target.value })}
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <AdminInput
                          label="Широта"
                          value={draft.lastLatitude}
                          onChange={(event) => updateDraft(device.id, { lastLatitude: event.target.value })}
                        />
                        <AdminInput
                          label="Довгота"
                          value={draft.lastLongitude}
                          onChange={(event) => updateDraft(device.id, { lastLongitude: event.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AdminButton size="sm" onClick={() => saveDevice(device.id)} disabled={busyId === device.id}>
                          {busyId === device.id ? "Збереження…" : "Зберегти"}
                        </AdminButton>
                        <AdminButton variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Скасувати
                        </AdminButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between lg:contents">
                        <span className="truncate text-sm font-semibold text-gray-900 lg:w-[190px] lg:shrink-0">
                          {device.name}
                        </span>
                        <span className="hidden truncate text-sm text-gray-600 lg:block lg:w-[190px] lg:shrink-0">
                          {device.equipment?.name ?? "Не прив'язано"}
                        </span>
                        <span className="lg:w-[120px] lg:shrink-0">
                          <StatusBadge status={freshness.badge} label={freshness.label} />
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 lg:flex-1">
                        <span className="text-xs text-gray-400 lg:hidden">
                          Техніка: {device.equipment?.name ?? "Не прив'язано"}
                        </span>
                        <span className="text-sm text-gray-700">
                          {device.lastAddress ?? (formatCoordinates(device.lastLatitude, device.lastLongitude) || "Координати ще не визначені")}
                        </span>
                        {device.lastEventText && (
                          <span className="text-xs text-gray-400">{device.lastEventText}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 lg:contents">
                        <span className="lg:w-[120px] lg:shrink-0">{updatedLabel}</span>
                        <span className="lg:w-[120px] lg:shrink-0">{freshness.elapsedLabel}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:w-[160px] lg:shrink-0 lg:justify-end">
                        <AdminButton variant="secondary" size="sm" onClick={() => startEdit(device)}>
                          Редагувати
                        </AdminButton>
                        <AdminButton
                          variant="danger"
                          size="sm"
                          onClick={() => deleteDevice(device)}
                          disabled={busyId === device.id}
                        >
                          {busyId === device.id ? "Видалення…" : "Видалити"}
                        </AdminButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </AdminCard>
    </div>
  );
}

type TrackerDeviceDraft = {
  name: string;
  equipmentId: string;
  lastAddress: string;
  lastLatitude: string;
  lastLongitude: string;
};

function toDeviceDraft(device: TrackerDevice): TrackerDeviceDraft {
  return {
    name: device.name,
    equipmentId: device.equipmentId ?? "",
    lastAddress: device.lastAddress ?? "",
    lastLatitude: typeof device.lastLatitude === "number" ? String(device.lastLatitude) : "",
    lastLongitude: typeof device.lastLongitude === "number" ? String(device.lastLongitude) : "",
  };
}

function parseOptionalNumber(value: string): number | null | "invalid" {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : "invalid";
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <AdminCard className="flex flex-col gap-1 !p-4">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className={`text-2xl font-bold ${accent}`}>{value}</span>
    </AdminCard>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFreshness(value: string | null): {
  badge: Status;
  label: string;
  elapsedLabel: string;
} {
  if (!value) {
    return {
      badge: "cancelled",
      label: "Немає даних",
      elapsedLabel: "—",
    };
  }

  const updatedAt = new Date(value).getTime();
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - updatedAt) / (1000 * 60)));

  if (diffMinutes <= FRESH_THRESHOLD_MIN) {
    return {
      badge: "confirmed",
      label: "Актуально",
      elapsedLabel: formatElapsed(diffMinutes),
    };
  }

  if (diffMinutes <= STALE_THRESHOLD_MIN) {
    return {
      badge: "in_progress",
      label: "Очікується",
      elapsedLabel: formatElapsed(diffMinutes),
    };
  }

  return {
    badge: "cancelled",
    label: "Застаріло",
    elapsedLabel: formatElapsed(diffMinutes),
  };
}

function formatElapsed(diffMinutes: number): string {
  if (diffMinutes < 1) return "щойно";
  if (diffMinutes < 60) return `${diffMinutes} хв тому`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours} год ${minutes} хв тому` : `${hours} год тому`;
  }

  const days = Math.floor(hours / 24);
  return `${days} дн тому`;
}

function formatCoordinates(latitude: number | null, longitude: number | null): string {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return "";
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
