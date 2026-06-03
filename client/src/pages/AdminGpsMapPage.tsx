import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "../api/client";
import { AdminButton, AdminCard, AdminFilterBar, AdminPageHeader, StatusBadge } from "../components/admin";
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
  createdAt: string;
  updatedAt: string;
}

interface SupplierPointOfferSummary {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  unitPrice: number;
  isAvailable: boolean;
}

interface SupplierPoint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  contactName: string | null;
  contactPhone: string | null;
  workHours: string | null;
  notes: string | null;
  updatedAt: string;
  offers: SupplierPointOfferSummary[];
}

interface DayPoint {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  odometer: number | null;
}

interface MapFocusTarget {
  latitude: number;
  longitude: number;
  title: string;
  address: string | null;
  token: number;
}

interface DayTrip {
  id: string;
  tripStart: string;
  tripEnd: string;
  durationMs: number;
  distanceKm: number | null;
  startPoint: DayPoint;
  endPoint: DayPoint;
}

interface DayStop {
  id: string;
  stopStart: string;
  stopEnd: string | null;
  durationMs: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
}

interface DayTimelineTrip extends DayTrip {
  type: "trip";
}

interface DayTimelineStop extends DayStop {
  type: "stop";
}

interface TrackerDayResponse {
  date: string;
  device: {
    id: string;
    name: string;
    equipment: TrackerDevice["equipment"];
    lastTrackerAt: string | null;
  };
  summary: {
    totalDistanceKm: number;
    tripCount: number;
    tripDurationMs: number;
    stopCount: number;
    stopDurationMs: number;
    engineHoursMs: number | null;
  };
  trips: DayTrip[];
  stops: DayStop[];
  timeline: Array<DayTimelineTrip | DayTimelineStop>;
}

const FRESH_THRESHOLD_MIN = 15;
const STALE_THRESHOLD_MIN = 60;
const DEFAULT_CENTER: [number, number] = [49.8397, 24.0297];
const AUTO_REFRESH_MS = 60_000;

export default function AdminGpsMapPage() {
  const [devices, setDevices] = useState<TrackerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => formatDateForInput(new Date()));
  const [dayData, setDayData] = useState<TrackerDayResponse | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [expandedTripIds, setExpandedTripIds] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [supplierPoints, setSupplierPoints] = useState<SupplierPoint[]>([]);
  const [showGpsLayer, setShowGpsLayer] = useState(true);
  const [showSupplierLayer, setShowSupplierLayer] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<TrackerDevice[]>("/admin/gps");
      setDevices(data);
      setSelectedId((currentId) => currentId ?? data.find(hasCoordinates)?.id ?? data[0]?.id ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSupplierPoints = useCallback(async () => {
    try {
      const data = await apiFetch<SupplierPoint[]>("/admin/supply/supplier-points");
      setSupplierPoints(data);
    } catch {
      setSupplierPoints([]);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    void loadSupplierPoints();
    const intervalId = window.setInterval(loadDevices, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [loadDevices, loadSupplierPoints]);

  const filtered = useMemo(() => {
    if (!search.trim()) return devices;
    const query = search.toLowerCase();

    return devices.filter((device) => {
      return (
        device.name.toLowerCase().includes(query) ||
        (device.equipment?.name ?? "").toLowerCase().includes(query) ||
        (device.lastAddress ?? "").toLowerCase().includes(query) ||
        formatCoordinates(device.lastLatitude, device.lastLongitude).toLowerCase().includes(query)
      );
    });
  }, [devices, search]);

  const devicesWithCoordinates = useMemo(
    () => filtered.filter(hasCoordinates),
    [filtered],
  );

  const devicesWithoutCoordinates = useMemo(
    () => filtered.filter((device) => !hasCoordinates(device)),
    [filtered],
  );

  const selectedDevice = useMemo(() => {
    return filtered.find((device) => device.id === selectedId)
      ?? devicesWithCoordinates[0]
      ?? filtered[0]
      ?? null;
  }, [devicesWithCoordinates, filtered, selectedId]);

  const loadDayData = useCallback(async () => {
    if (!selectedDevice) {
      setDayData(null);
      return;
    }

    setLoadingDay(true);
    try {
      const data = await apiFetch<TrackerDayResponse>(
        `/admin/gps/${selectedDevice.id}/day?date=${encodeURIComponent(selectedDate)}`,
      );
      setDayData(data);
    } catch {
      setDayData(null);
    } finally {
      setLoadingDay(false);
    }
  }, [selectedDate, selectedDevice]);

  useEffect(() => {
    setExpandedTripIds({});
    void loadDayData();
  }, [loadDayData]);

  useEffect(() => {
    if (!selectedDevice) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadDayData();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [loadDayData, selectedDevice]);

  const selectedDayStopsWithCoordinates = useMemo(
    () =>
      (dayData?.stops ?? []).filter(
        (stop) => typeof stop.latitude === "number" && typeof stop.longitude === "number",
      ),
    [dayData?.stops],
  );

  const supplierPointsWithCoordinates = useMemo(
    () =>
      supplierPoints.filter(
        (point) =>
          typeof point.latitude === "number" &&
          typeof point.longitude === "number" &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude),
      ),
    [supplierPoints],
  );

  const toggleTripDetails = useCallback((tripId: string) => {
    setExpandedTripIds((current) => ({
      ...current,
      [tripId]: !current[tripId],
    }));
  }, []);

  const shiftDay = useCallback((days: number) => {
    setSelectedDate((current) => {
      const nextDate = new Date(`${current}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + days);
      return formatDateForInput(nextDate);
    });
  }, []);

  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFetch("/admin/gps/sync", {
        method: "POST",
      });
      await loadDevices();
      await loadSupplierPoints();
      await loadDayData();
    } finally {
      setSyncing(false);
    }
  }, [loadDayData, loadDevices, loadSupplierPoints]);

  const focusOnPoint = useCallback((point: DayPoint, title: string) => {
    if (typeof point.latitude !== "number" || typeof point.longitude !== "number") {
      return;
    }

    setFocusTarget({
      latitude: point.latitude,
      longitude: point.longitude,
      title,
      address: point.address,
      token: Date.now(),
    });
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      <AdminPageHeader
        title="Мапа"
        subtitle={`${devicesWithCoordinates.length} активних точок${devicesWithoutCoordinates.length > 0 ? ` • ${devicesWithoutCoordinates.length} без координат` : ""}`}
      >
        <AdminButton variant="primary" size="sm" onClick={() => { void handleManualSync(); }} disabled={syncing}>
          {syncing ? "Підтягуємо GPS…" : "Підтягнути GPS"}
        </AdminButton>
        <AdminButton variant="secondary" size="sm" onClick={() => { void loadDevices(); void loadDayData(); }}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за технікою, GPS-пристроєм, адресою або координатами…"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="На мапі" value={devicesWithCoordinates.length} accent="text-emerald-600" />
        <SummaryCard
          label="Оновлено до 15 хв"
          value={devicesWithCoordinates.filter((device) => getFreshness(device.lastTrackerAt).badge === "confirmed").length}
          accent="text-sky-600"
        />
        <SummaryCard
          label="Точки постачання"
          value={supplierPointsWithCoordinates.length}
          accent="text-rose-600"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <LayerToggle active={showGpsLayer} onClick={() => setShowGpsLayer((value) => !value)}>
          GPS техніки
        </LayerToggle>
        <LayerToggle active={showSupplierLayer} onClick={() => setShowSupplierLayer((value) => !value)}>
          Точки постачання
        </LayerToggle>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AdminCard className="admin-gps-map relative isolate z-0 min-h-[420px] overflow-hidden p-0 sm:min-h-[560px]">
          {loading ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-gray-400 sm:h-[560px]">
              Завантаження мапи…
            </div>
          ) : devicesWithCoordinates.length === 0 && (!showSupplierLayer || supplierPointsWithCoordinates.length === 0) ? (
            <div className="flex h-[420px] items-center justify-center px-6 text-center text-sm text-gray-400 sm:h-[560px]">
              Немає точок з координатами для відображення на мапі.
            </div>
          ) : (
            <MapContainer center={DEFAULT_CENTER} zoom={11} scrollWheelZoom className="h-[420px] w-full sm:h-[560px]">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitMapToDevices
                devices={showGpsLayer ? devicesWithCoordinates : []}
                selectedDevice={showGpsLayer ? selectedDevice : null}
                selectedDayStops={showGpsLayer ? selectedDayStopsWithCoordinates : []}
                supplierPoints={showSupplierLayer ? supplierPointsWithCoordinates : []}
              />

              <FocusMapTargetMarker target={focusTarget} />

              {showGpsLayer && selectedDayStopsWithCoordinates.map((stop, index) => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.latitude as number, stop.longitude as number]}
                  radius={6}
                  pathOptions={{
                    color: "#92400e",
                    fillColor: "#f59e0b",
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="min-w-[220px] space-y-2 text-sm">
                      <div>
                        <p className="font-semibold text-gray-900">Стоянка #{index + 1}</p>
                        <p className="text-xs text-gray-500">{selectedDevice?.equipment?.name ?? selectedDevice?.name}</p>
                      </div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>{stop.address ?? formatCoordinates(stop.latitude, stop.longitude)}</p>
                        <p>Період: {formatStopPeriod(stop.stopStart, stop.stopEnd)}</p>
                        <p>Тривалість: {formatDuration(stop.durationMs)}</p>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {showGpsLayer && devicesWithCoordinates.map((device) => {
                const freshness = getFreshness(device.lastTrackerAt);
                const selected = device.id === selectedDevice?.id;

                return (
                  <CircleMarker
                    key={device.id}
                    center={[device.lastLatitude as number, device.lastLongitude as number]}
                    radius={selected ? 11 : 8}
                    pathOptions={{
                      color: getMarkerColor(freshness.badge),
                      fillColor: getMarkerColor(freshness.badge),
                      fillOpacity: selected ? 0.95 : 0.75,
                      weight: selected ? 3 : 2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedId(device.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] space-y-2 text-sm">
                        <div>
                          <p className="font-semibold text-gray-900">{device.equipment?.name ?? device.name}</p>
                          <p className="text-xs text-gray-500">{device.name}</p>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <p>{device.lastAddress ?? formatCoordinates(device.lastLatitude, device.lastLongitude)}</p>
                          <p>Оновлено: {formatDateTime(device.lastTrackerAt)}</p>
                          <p>Статус: {freshness.label}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <a
                            href={buildGoogleMapsPointLink(device.lastLatitude as number, device.lastLongitude as number)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-dark"
                          >
                            Google Maps
                          </a>
                          {device.equipment?.slug ? (
                            <Link
                              to="/admin/equipment"
                              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700"
                            >
                              До техніки
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {showSupplierLayer && supplierPointsWithCoordinates.map((point) => (
                <CircleMarker
                  key={point.id}
                  center={[point.latitude, point.longitude]}
                  radius={point.isActive ? 8 : 6}
                  pathOptions={{
                    color: point.isActive ? "#7c3aed" : "#6b7280",
                    fillColor: point.isActive ? "#a855f7" : "#9ca3af",
                    fillOpacity: 0.82,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="min-w-[240px] space-y-2 text-sm">
                      <div>
                        <p className="font-semibold text-gray-900">{point.name}</p>
                        <p className="text-xs text-gray-500">{point.isActive ? "Активна точка" : "Неактивна точка"}</p>
                      </div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>{point.address}</p>
                        {point.workHours ? <p>Графік: {point.workHours}</p> : null}
                        {point.contactPhone ? <p>Телефон: {point.contactPhone}</p> : null}
                      </div>
                      {point.offers.length > 0 ? (
                        <div className="space-y-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                          {point.offers.slice(0, 4).map((offer) => (
                            <p key={offer.id}>
                              {offer.materialName}: {formatMoney(offer.unitPrice)} / {offer.unit}
                              {!offer.isAvailable ? " • немає" : ""}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={buildGoogleMapsPointLink(point.latitude, point.longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-dark"
                        >
                          Google Maps
                        </a>
                        <Link
                          to="/admin/supply"
                          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700"
                        >
                          До постачання
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          )}
        </AdminCard>

        <div className="flex min-h-0 flex-col gap-4">
          <AdminCard className="flex flex-col gap-3 !p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Активні точки</h3>
                <p className="mt-1 text-xs text-gray-500">Натисни на техніку, щоб змінити дані у блоці дня.</p>
              </div>
              {selectedDevice ? (
                <StatusBadge
                  status={getFreshness(selectedDevice.lastTrackerAt).badge}
                  label={getFreshness(selectedDevice.lastTrackerAt).label}
                />
              ) : null}
            </div>

            <div className="max-h-[220px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-4 text-sm text-gray-400">Немає GPS-пристроїв для відображення.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((device) => {
                    const freshness = getFreshness(device.lastTrackerAt);
                    const selected = device.id === selectedDevice?.id;
                    const deviceHasCoordinates = hasCoordinates(device);

                    return (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => setSelectedId(device.id)}
                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                          selected
                            ? "border-primary/40 bg-primary/10"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {device.equipment?.name ?? device.name}
                            </p>
                            <p className="truncate text-xs text-gray-500">{device.name}</p>
                          </div>
                          <span
                            className="mt-1 inline-flex h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: deviceHasCoordinates ? getMarkerColor(freshness.badge) : "#94a3b8" }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-gray-600">
                          {device.lastAddress ?? (deviceHasCoordinates ? formatCoordinates(device.lastLatitude, device.lastLongitude) : "Координати ще не отримано")}
                        </p>
                        <p className="mt-2 text-[11px] text-gray-400">
                          {formatDateTime(device.lastTrackerAt)} • {freshness.elapsedLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </AdminCard>

          {showSupplierLayer && (
            <AdminCard className="flex flex-col gap-3 !p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Точки постачання</h3>
                  <p className="mt-1 text-xs text-gray-500">Матеріали, ціни та швидкий перехід до довідника.</p>
                </div>
                <StatusBadge
                  status="confirmed"
                  label={`${supplierPointsWithCoordinates.length} точок`}
                />
              </div>

              <div className="max-h-[220px] overflow-y-auto">
                {supplierPointsWithCoordinates.length === 0 ? (
                  <p className="py-4 text-sm text-gray-400">Точок постачання з координатами поки немає.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {supplierPointsWithCoordinates.map((point) => (
                      <div
                        key={point.id}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{point.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-gray-600">{point.address}</p>
                          </div>
                          <span
                            className="mt-1 inline-flex h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: point.isActive ? "#a855f7" : "#9ca3af" }}
                          />
                        </div>
                        {point.offers.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {point.offers.slice(0, 3).map((offer) => (
                              <span
                                key={offer.id}
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                  offer.isAvailable
                                    ? "bg-violet-50 text-violet-700"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {offer.materialName} {formatMoney(offer.unitPrice)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AdminCard>
          )}

          <AdminCard className="flex min-h-0 flex-col gap-4 !p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Дані за день</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedDevice ? `${selectedDevice.equipment?.name ?? selectedDevice.name}` : "Оберіть GPS-пристрій"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AdminButton variant="ghost" size="sm" onClick={() => shiftDay(-1)} aria-label="Попередній день">
                  ←
                </AdminButton>
                <div className="min-w-[130px] text-center text-sm font-semibold text-gray-800">
                  {formatDateLabel(selectedDate)}
                </div>
                <AdminButton variant="ghost" size="sm" onClick={() => shiftDay(1)} aria-label="Наступний день">
                  →
                </AdminButton>
              </div>
            </div>

            {loadingDay ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                Завантаження даних за день…
              </div>
            ) : !selectedDevice ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                Обери GPS-пристрій, щоб побачити денну хронологію.
              </div>
            ) : !dayData ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                Дані за вибраний день поки недоступні.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2">
                  <DailyMetricRow label="Загальний пробіг" value={`${formatKm(dayData.summary.totalDistanceKm)} км`} />
                  <DailyMetricRow
                    label="Поїздки"
                    value={`${dayData.summary.tripCount} • ${formatDuration(dayData.summary.tripDurationMs)}`}
                  />
                  <DailyMetricRow
                    label="Стоянки"
                    value={`${dayData.summary.stopCount} • ${formatDuration(dayData.summary.stopDurationMs)}`}
                  />
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-gray-900">Хронологія дня</h4>
                    <span className="text-[11px] font-medium text-gray-400">
                      {dayData.timeline.length} записів
                    </span>
                  </div>

                  {dayData.timeline.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                      За цей день ще немає поїздок або стоянок.
                    </div>
                  ) : (
                    <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
                      {dayData.timeline.map((item, index) =>
                        item.type === "trip" ? (
                          <TripTimelineCard
                            key={item.id}
                            trip={item}
                            order={countTypeBefore(dayData.timeline, index, "trip") + 1}
                            expanded={Boolean(expandedTripIds[item.id])}
                            onToggle={() => toggleTripDetails(item.id)}
                            onFocusPoint={focusOnPoint}
                          />
                        ) : (
                          <StopTimelineCard
                            key={item.id}
                            stop={item}
                            order={countTypeBefore(dayData.timeline, index, "stop") + 1}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
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

function LayerToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
        active
          ? "border-primary bg-primary text-dark"
          : "border-gray-200 bg-white text-gray-600 hover:border-primary/50"
      }`}
    >
      {active ? "✓ " : ""}{children}
    </button>
  );
}

function DailyMetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  );
}

function TripTimelineCard({
  trip,
  order,
  expanded,
  onToggle,
  onFocusPoint,
}: {
  trip: DayTimelineTrip;
  order: number;
  expanded: boolean;
  onToggle: () => void;
  onFocusPoint: (point: DayPoint, label: string) => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Поїздка #{order}</p>
          <p className="mt-1 text-xs text-gray-500">{formatRange(trip.tripStart, trip.tripEnd)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-sky-700">{formatDuration(trip.durationMs)}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            {trip.distanceKm !== null ? `${formatKm(trip.distanceKm)} км` : "Відстань невідома"}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <AdminButton variant="secondary" size="sm" onClick={onToggle}>
          {expanded ? "Сховати" : "Детальніше"}
        </AdminButton>
      </div>

      {expanded ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <PointCard
            title="Стартова точка"
            point={trip.startPoint}
            onFocus={() => onFocusPoint(trip.startPoint, "Стартова точка")}
          />
          <PointCard
            title="Фінішна точка"
            point={trip.endPoint}
            onFocus={() => onFocusPoint(trip.endPoint, "Фінішна точка")}
          />
        </div>
      ) : null}
    </div>
  );
}

function StopTimelineCard({
  stop,
  order,
}: {
  stop: DayTimelineStop;
  order: number;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Стоянка #{order}</p>
          <p className="mt-1 text-xs text-gray-600">
            {(stop.address ?? formatCoordinates(stop.latitude, stop.longitude)) || "Адреса не визначена"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-amber-700">{formatDuration(stop.durationMs)}</p>
          <p className="mt-1 text-[11px] text-gray-500">{formatRange(stop.stopStart, stop.stopEnd)}</p>
        </div>
      </div>
    </div>
  );
}

function PointCard({
  title,
  point,
  onFocus,
}: {
  title: string;
  point: DayPoint;
  onFocus: () => void;
}) {
  const label = point.address ?? "Адреса не визначена";
  const canFocus = typeof point.latitude === "number" && typeof point.longitude === "number";

  return (
    <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{title}</p>
      <button
        type="button"
        onClick={onFocus}
        disabled={!canFocus}
        className={`mt-2 text-left text-sm ${
          canFocus ? "font-medium text-sky-700 hover:text-sky-800 hover:underline" : "text-gray-800"
        } disabled:cursor-default disabled:no-underline`}
      >
        {label}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        {typeof point.odometer === "number" ? <span>Одометр: {formatMeters(point.odometer)}</span> : null}
        {typeof point.latitude === "number" && typeof point.longitude === "number" ? (
          <a
            href={buildGoogleMapsPointLink(point.latitude, point.longitude)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-gray-200 px-2 py-1 font-semibold text-gray-700"
          >
            Google Maps
          </a>
        ) : null}
      </div>
    </div>
  );
}

function FitMapToDevices({
  devices,
  selectedDevice,
  selectedDayStops,
  supplierPoints,
}: {
  devices: TrackerDevice[];
  selectedDevice: TrackerDevice | null;
  selectedDayStops: DayStop[];
  supplierPoints: SupplierPoint[];
}) {
  const map = useMap();

  useEffect(() => {
    const supplierCoordinates = supplierPoints.map((point) => [point.latitude, point.longitude] as [number, number]);

    if (selectedDevice && hasCoordinates(selectedDevice)) {
      const points: [number, number][] = [
        [selectedDevice.lastLatitude as number, selectedDevice.lastLongitude as number],
        ...selectedDayStops
          .filter((stop) => typeof stop.latitude === "number" && typeof stop.longitude === "number")
          .map((stop) => [stop.latitude as number, stop.longitude as number] as [number, number]),
        ...supplierCoordinates,
      ];

      if (points.length === 1) {
        map.setView(points[0], 13, { animate: true });
        return;
      }

      const bounds = new LatLngBounds(points);
      map.fitBounds(bounds, { padding: [36, 36], animate: true });
      return;
    }

    const allPoints: [number, number][] = [
      ...devices.map((device) => [device.lastLatitude as number, device.lastLongitude as number] as [number, number]),
      ...supplierCoordinates,
    ];

    if (allPoints.length === 0) {
      return;
    }

    if (allPoints.length === 1) {
      map.setView(allPoints[0], 12);
      return;
    }

    const bounds = new LatLngBounds(allPoints);
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [devices, map, selectedDayStops, selectedDevice, supplierPoints]);

  return null;
}

function FocusMapTargetMarker({
  target,
}: {
  target: MapFocusTarget | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    map.setView([target.latitude, target.longitude], 16, { animate: true });
  }, [map, target]);

  if (!target) {
    return null;
  }

  return (
    <CircleMarker
      center={[target.latitude, target.longitude]}
      radius={9}
      pathOptions={{
        color: "#0284c7",
        fillColor: "#38bdf8",
        fillOpacity: 0.95,
        weight: 3,
      }}
    >
      <Popup>
        <div className="text-sm">
          <p className="font-semibold text-gray-900">{target.title}</p>
          <p className="mt-1 text-xs text-gray-600">{target.address ?? "Адреса не визначена"}</p>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function hasCoordinates(device: Pick<TrackerDevice, "lastLatitude" | "lastLongitude">) {
  return typeof device.lastLatitude === "number" && typeof device.lastLongitude === "number";
}

function countTypeBefore(
  timeline: Array<DayTimelineTrip | DayTimelineStop>,
  currentIndex: number,
  type: "trip" | "stop",
) {
  let count = 0;
  for (let index = 0; index < currentIndex; index += 1) {
    if (timeline[index].type === type) {
      count += 1;
    }
  }
  return count;
}

function formatDateForInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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

function formatRange(start: string, end: string | null): string {
  return `${formatDateTime(start)} → ${end ? formatDateTime(end) : "триває"}`;
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

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "—";
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} хв`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
}

function formatKm(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} грн`;
}

function formatMeters(value: number): string {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(1)} км` : "—";
}

function formatStopPeriod(start: string, end: string | null) {
  return formatRange(start, end);
}

function getMarkerColor(status: Status) {
  if (status === "confirmed") return "#059669";
  if (status === "in_progress") return "#d97706";
  return "#dc2626";
}

function buildGoogleMapsPointLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
