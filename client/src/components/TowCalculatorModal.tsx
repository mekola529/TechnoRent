import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createOrder } from "../data/equipment.service";
import { getTowCalculatorState } from "../data/services";
import AddressAutocompleteInput from "./AddressAutocompleteInput";
import type { AddressSuggestion } from "../utils/addressSearch";
import { geocodeAddress } from "../utils/addressSearch";
import { getLeadAttributionPayload } from "../lib/attribution";
import { pushAnalyticsEvent } from "../lib/analytics";
import { useCustomerAccount } from "../context/useCustomerAccount";
import { getCustomerContactPrefill, shouldPrefillPhone } from "../utils/customerPrefill";

interface TowCalculatorModalProps {
  serviceSlug: string;
  serviceName: string;
  priceInfo: string;
  deliveryRatePerKm: number | null;
  onClose: () => void;
}

interface RouteEstimate {
  selectedTrackerId: string;
  selectedEquipmentId: string;
  selectedTrackerName: string;
  selectedEquipmentName: string;
  calculationMode: "urgent_live" | "scheduled_base";
  requestMode: "urgent" | "scheduled";
  startLocationLabel: string;
  pickupCoordinates: { lat: number; lon: number };
  destinationCoordinates: { lat: number; lon: number };
  truckToPickupDistanceKm: number;
  truckToPickupDurationMinutes: number;
  serviceDistanceKm: number;
  serviceDurationMinutes: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  distanceKm: number;
  durationMinutes: number;
  estimatedCost: number;
}

export default function TowCalculatorModal({
  serviceSlug,
  serviceName,
  priceInfo,
  deliveryRatePerKm,
  onClose,
}: TowCalculatorModalProps) {
  const { customer } = useCustomerAccount();
  const pricePerKm = useMemo(
    () => deliveryRatePerKm ?? extractPricePerKm(priceInfo),
    [deliveryRatePerKm, priceInfo],
  );
  const [form, setForm] = useState({
    name: "",
    phone: "+380",
    pickupAddress: "",
    destinationAddress: "",
    requestMode: "urgent" as "urgent" | "scheduled",
    scheduledDate: "",
    scheduledTime: "",
    comment: "",
  });
  const [estimate, setEstimate] = useState<RouteEstimate | null>(null);
  const [pickupSuggestion, setPickupSuggestion] = useState<AddressSuggestion | null>(null);
  const [destinationSuggestion, setDestinationSuggestion] = useState<AddressSuggestion | null>(null);
  const [truckState, setTruckState] = useState<Awaited<ReturnType<typeof getTowCalculatorState>>>();
  const [submitted, setSubmitted] = useState(false);
  const [routeTouched, setRouteTouched] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);
  const [showContactFields, setShowContactFields] = useState(false);
  const [loadingTruckState, setLoadingTruckState] = useState(true);
  const [estimating, setEstimating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const contactFieldsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customer) return;

    const prefill = getCustomerContactPrefill(customer);
    setForm((prev) => ({
      ...prev,
      name: prev.name.trim() ? prev.name : prefill.name,
      phone: shouldPrefillPhone(prev.phone) ? prefill.phone : prev.phone,
    }));
  }, [customer]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.overflow = "hidden";

    return () => {
      style.position = "";
      style.top = "";
      style.left = "";
      style.right = "";
      style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    pushAnalyticsEvent("form_open", {
      form_type: "tow_calculator",
      page_path: window.location.pathname,
      service_slug: serviceSlug,
    });
  }, [serviceSlug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingTruckState(true);
      const state = await getTowCalculatorState(serviceSlug);
      if (cancelled) return;
      setTruckState(state);
      setLoadingTruckState(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceSlug]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (
      field === "pickupAddress" ||
      field === "destinationAddress" ||
      field === "requestMode" ||
      field === "scheduledDate" ||
      field === "scheduledTime"
    ) {
      setEstimate(null);
      if (field === "pickupAddress") {
        setPickupSuggestion((prev) => (prev?.label === value ? prev : null));
      }
      if (field === "destinationAddress") {
        setDestinationSuggestion((prev) => (prev?.label === value ? prev : null));
      }
    }
  }

  async function handleEstimate() {
    setRouteTouched(true);
    setError("");

    if (!form.pickupAddress.trim() || !form.destinationAddress.trim()) {
      setError("Вкажіть звідки і куди потрібно евакуювати авто.");
      return;
    }

    if (form.requestMode === "scheduled" && !form.scheduledDate) {
      setError("Для запланованої евакуації вкажіть дату.");
      return;
    }

    if (!pricePerKm) {
      setError("Не вдалося визначити ціну за 1 км для цієї послуги.");
      return;
    }

    if (!truckState?.available) {
      setError(truckState?.message || "Немає актуальної GPS-позиції евакуатора для розрахунку.");
      return;
    }

    setEstimating(true);

    try {
      const [pickup, destination] = await Promise.all([
        pickupSuggestion && pickupSuggestion.label === form.pickupAddress.trim()
          ? Promise.resolve({ lat: pickupSuggestion.lat, lon: pickupSuggestion.lon })
          : geocodeAddress(form.pickupAddress),
        destinationSuggestion && destinationSuggestion.label === form.destinationAddress.trim()
          ? Promise.resolve({ lat: destinationSuggestion.lat, lon: destinationSuggestion.lon })
          : geocodeAddress(form.destinationAddress),
      ]);

      const candidates = await resolveTrackerCandidatesForRouting(truckState, form.requestMode);
      const candidateRoutes = await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          route: await fetchRoute(candidate.position, pickup),
        })),
      );

      const bestCandidate = candidateRoutes.reduce((best, current) => {
        if (!best) return current;
        if (current.route.durationSeconds < best.route.durationSeconds) return current;
        if (
          current.route.durationSeconds === best.route.durationSeconds &&
          current.route.distanceMeters < best.route.distanceMeters
        ) {
          return current;
        }
        return best;
      }, candidateRoutes[0]);

      const [truckToPickup, pickupToDestination] = await Promise.all([
        Promise.resolve(bestCandidate.route),
        fetchRoute(pickup, destination),
      ]);

      const truckToPickupDistanceKm = truckToPickup.distanceMeters / 1000;
      const truckToPickupDurationMinutes = truckToPickup.durationSeconds / 60;
      const serviceDistanceKm = pickupToDestination.distanceMeters / 1000;
      const serviceDurationMinutes = pickupToDestination.durationSeconds / 60;
      const totalDistanceKm = truckToPickupDistanceKm + serviceDistanceKm;
      const totalDurationMinutes = truckToPickupDurationMinutes + serviceDurationMinutes;
      const estimatedCost = Math.round(totalDistanceKm * pricePerKm);

      setEstimate({
        selectedTrackerId: bestCandidate.candidate.trackerId,
        selectedEquipmentId: bestCandidate.candidate.equipmentId,
        selectedTrackerName: bestCandidate.candidate.trackerName,
        selectedEquipmentName: bestCandidate.candidate.equipmentName,
        calculationMode: form.requestMode === "scheduled" ? "scheduled_base" : "urgent_live",
        requestMode: form.requestMode,
        startLocationLabel: bestCandidate.candidate.startLocationLabel,
        pickupCoordinates: pickup,
        destinationCoordinates: destination,
        truckToPickupDistanceKm,
        truckToPickupDurationMinutes,
        serviceDistanceKm,
        serviceDurationMinutes,
        totalDistanceKm,
        totalDurationMinutes,
        distanceKm: totalDistanceKm,
        durationMinutes: totalDurationMinutes,
        estimatedCost,
      });
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Не вдалося розрахувати маршрут.");
    } finally {
      setEstimating(false);
    }
  }

  async function handleSubmit() {
    setRouteTouched(true);
    setContactTouched(true);
    setError("");

    if (!form.name.trim() || form.phone.trim().length < 10) {
      setError("Заповніть ім'я та коректний номер телефону.");
      return;
    }

    if (!form.pickupAddress.trim() || !form.destinationAddress.trim()) {
      setError("Вкажіть маршрут евакуації.");
      return;
    }

    if (!estimate || !pricePerKm) {
      setError("Спочатку розрахуйте вартість.");
      return;
    }

    setSending(true);

    try {
      const attribution = getLeadAttributionPayload();
      const created = await createOrder({
        customerName: form.name.trim(),
        phone: form.phone.trim(),
        address: form.pickupAddress.trim(),
        addressTo: form.destinationAddress.trim(),
        comment: form.comment.trim() || undefined,
        equipmentId: estimate.selectedEquipmentId,
        requestType: "tow",
        serviceName,
        dateFrom: form.requestMode === "scheduled" ? form.scheduledDate : undefined,
        attribution,
        metadata: {
          tow: {
            selectedEquipmentId: estimate.selectedEquipmentId,
            selectedTrackerId: estimate.selectedTrackerId,
            selectedEquipmentName: estimate.selectedEquipmentName,
            selectedTrackerName: estimate.selectedTrackerName,
            towVehicleLabel: `${estimate.selectedEquipmentName} (${estimate.selectedTrackerName})`,
            calculationMode: estimate.calculationMode,
            requestMode: estimate.requestMode,
            scheduledDate: form.requestMode === "scheduled" ? form.scheduledDate : null,
            scheduledTime: form.requestMode === "scheduled" ? form.scheduledTime || null : null,
            pickupCoordinates: estimate.pickupCoordinates,
            destinationCoordinates: estimate.destinationCoordinates,
            truckCurrentPosition: formatTruckLocationForComment(estimate, truckState),
            truckDispatchDistance: `${estimate.truckToPickupDistanceKm.toFixed(1)} км`,
            truckDispatchEta: formatDuration(estimate.truckToPickupDurationMinutes),
            clientRouteDistance: `${estimate.serviceDistanceKm.toFixed(1)} км`,
            clientRouteEta: formatDuration(estimate.serviceDurationMinutes),
            totalRouteDistance: `${estimate.totalDistanceKm.toFixed(1)} км`,
            tariffLabel: `${formatPrice(pricePerKm)} / км`,
            estimatedCost: formatCurrency(estimate.estimatedCost),
          },
        },
      });
      pushAnalyticsEvent("lead_submit_success", {
        lead_type: "tow_calculator",
        request_id: created.id,
        page_path: window.location.pathname,
        utm_source: attribution.lastTouch?.utmSource,
        utm_medium: attribution.lastTouch?.utmMedium,
        utm_campaign: attribution.lastTouch?.utmCampaign,
        tracking_code: attribution.lastTouch?.trackingCode,
      });

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка надсилання заявки.");
    } finally {
      setSending(false);
    }
  }

  function jumpToContactFields() {
    setShowContactFields(true);
    requestAnimationFrame(() => {
      contactFieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleRequestSubmit() {
    if (!showContactFields) {
      jumpToContactFields();
      if (!estimate) {
        setError("Спочатку натисніть «Розрахувати», щоб отримати вартість евакуації.");
      }
      return;
    }

    void handleSubmit();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-[680px] overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-white p-5 font-sans shadow-xl max-sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="text-5xl">✅</span>
            <h2 className="text-2xl font-bold text-dark">Заявку надіслано!</h2>
            <p className="max-w-[420px] text-center text-sm font-medium text-dark-text">
              Маршрут і розрахунок збережено. Менеджер зв&apos;яжеться з вами, щоб підтвердити подачу евакуатора.
            </p>
            <button
              onClick={onClose}
              className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              Закрити
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[28px] font-bold text-dark max-sm:text-2xl">
                  Розрахунок евакуації
                </h2>
                <p className="mt-1 text-sm text-dark-text">
                  Вкажіть, звідки забрати авто і куди його доставити.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-base font-bold text-dark-text transition-colors hover:text-dark"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Звідки евакуювати"
                required
                className="sm:col-span-2"
                error={routeTouched && !form.pickupAddress.trim() ? "Вкажіть адресу завантаження" : ""}
              >
                <AddressAutocompleteInput
                  placeholder="Напр. Львів, вул. Городоцька, 120"
                  value={form.pickupAddress}
                  onChange={(v) => update("pickupAddress", v)}
                  onSelect={(suggestion) => {
                    setPickupSuggestion(suggestion);
                    setEstimate(null);
                  }}
                  error={routeTouched && !form.pickupAddress.trim()}
                />
              </Field>

              <Field
                label="Куди доставити"
                required
                className="sm:col-span-2"
                error={routeTouched && !form.destinationAddress.trim() ? "Вкажіть адресу доставки" : ""}
              >
                <AddressAutocompleteInput
                  placeholder="Напр. Львів, вул. Кульпарківська, 226"
                  value={form.destinationAddress}
                  onChange={(v) => update("destinationAddress", v)}
                  onSelect={(suggestion) => {
                    setDestinationSuggestion(suggestion);
                    setEstimate(null);
                  }}
                  error={routeTouched && !form.destinationAddress.trim()}
                />
              </Field>

              <div className="sm:col-span-2 rounded-2xl border border-border bg-[#F9FAFB] p-3">
                <span className="text-[13px] font-bold text-dark">Коли потрібен евакуатор?</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <ModeButton
                    active={form.requestMode === "urgent"}
                    title="Потрібно зараз"
                    description="Рахуємо маршрут від поточної позиції евакуатора"
                    onClick={() => update("requestMode", "urgent")}
                  />
                  <ModeButton
                    active={form.requestMode === "scheduled"}
                    title="Потрібно на дату"
                    description="Рахуємо маршрут від базової адреси евакуатора"
                    onClick={() => update("requestMode", "scheduled")}
                  />
                </div>
              </div>

              {form.requestMode === "scheduled" && (
                <>
                  <Field
                    label="Дата подачі"
                    required
                    error={routeTouched && !form.scheduledDate ? "Вкажіть дату" : ""}
                  >
                    <Input
                      type="date"
                      placeholder=""
                      value={form.scheduledDate}
                      onChange={(value) => update("scheduledDate", value)}
                      error={routeTouched && !form.scheduledDate}
                    />
                  </Field>
                  <Field label="Час (необов'язково)">
                    <Input
                      type="time"
                      placeholder=""
                      value={form.scheduledTime}
                      onChange={(value) => update("scheduledTime", value)}
                    />
                  </Field>
                </>
              )}

              {estimate && (
                <div className="sm:col-span-2">
                  <div className="rounded-2xl border border-border bg-[#F9FAFB] p-4">
                    <div>
                      <h3 className="text-base font-bold text-dark">Попередній розрахунок</h3>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MetricCard label="Відстань евакуації" value={`${estimate.serviceDistanceKm.toFixed(1)} км`} />
                      <MetricCard label="Час евакуації" value={formatDuration(estimate.serviceDurationMinutes)} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <MetricCard label="Подача евакуатора" value={`${estimate.truckToPickupDistanceKm.toFixed(1)} км`} />
                      <MetricCard label="Час подачі" value={formatDuration(estimate.truckToPickupDurationMinutes)} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-1">
                      <MetricCard label="Вартість" value={formatCurrency(estimate.estimatedCost)} accent />
                    </div>
                  </div>
                </div>
              )}

              {showContactFields && (
                <>
                  <div ref={contactFieldsRef} className="sm:col-span-2 h-0" />

                  <Field
                    label="Ім'я"
                    required
                    error={contactTouched && !form.name.trim() ? "Вкажіть ваше ім'я" : ""}
                  >
                    <Input
                      placeholder="Введіть ім'я"
                      value={form.name}
                      onChange={(v) => update("name", v)}
                      error={contactTouched && !form.name.trim()}
                    />
                  </Field>

                  <Field
                    label="Мобільний"
                    required
                    error={contactTouched && form.phone.trim().length < 10 ? "Вкажіть коректний номер" : ""}
                  >
                    <Input
                      placeholder="+380"
                      value={form.phone}
                      onChange={(v) => update("phone", v)}
                      type="tel"
                      error={contactTouched && form.phone.trim().length < 10}
                    />
                  </Field>

                  <Field label="Коментар" className="sm:col-span-2">
                    <textarea
                      placeholder="Наприклад: авто після ДТП, не заводиться, заблоковані колеса..."
                      value={form.comment}
                      onChange={(e) => update("comment", e.target.value)}
                      className="h-[96px] w-full max-w-full resize-none rounded-[10px] border border-border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px]"
                    />
                  </Field>
                </>
              )}
            </div>

            {error && <p className="mt-4 text-sm font-medium text-red-500">{error}</p>}

            <div className="mt-5 flex gap-2.5 max-sm:flex-col">
              <button
                type="button"
                onClick={handleEstimate}
                disabled={estimating || loadingTruckState}
                className="flex-1 rounded-full bg-primary px-3.5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {estimating ? "Розрахунок..." : "Розрахувати"}
              </button>
              <button
                type="button"
                onClick={handleRequestSubmit}
                disabled={sending || loadingTruckState || !truckState?.available}
                className="flex-1 rounded-full bg-dark px-3.5 py-3 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {sending ? "Надсилання..." : "Надіслати заявку"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
        active ? "border-primary bg-primary/15" : "border-border bg-white hover:border-primary/50"
      }`}
    >
      <span className="text-sm font-bold text-dark">{active ? "◉" : "○"} {title}</span>
      <span className="mt-1 block text-xs font-medium text-dark-text">{description}</span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-dark-text">{label}</span>
      <p className={`mt-1 text-lg font-bold ${accent ? "text-primary" : "text-dark"}`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
  error,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-[13px] font-bold text-dark">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {children}
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
  error,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full max-w-full rounded-[10px] border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px] ${error ? "border-red-400" : "border-border"}`}
    />
  );
}

function extractPricePerKm(priceInfo: string): number | null {
  const match = priceInfo.match(/(\d[\d\s.,]*)/);
  if (!match) return null;

  const normalized = match[1].replace(/\s+/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDuration(totalMinutes: number): string {
  const rounded = Math.max(1, Math.round(totalMinutes));
  if (rounded < 60) return `${rounded} хв`;

  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (minutes === 0) {
    return `${hours} год`;
  }

  return `${hours} год ${minutes} хв`;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function resolveTruckPosition(
  trackerDevice:
    | {
        lastAddress: string | null;
        lastLatitude: number | null;
        lastLongitude: number | null;
      }
    | undefined,
): { lat: number; lon: number } | null {
  const latitude = trackerDevice?.lastLatitude;
  const longitude = trackerDevice?.lastLongitude;

  if (typeof latitude === "number" && typeof longitude === "number") {
    return { lat: latitude, lon: longitude };
  }

  return null;
}

async function resolveTruckPositionForRouting(
  tracker: {
    lastAddress: string | null;
    lastLatitude: number | null;
    lastLongitude: number | null;
  },
): Promise<{ lat: number; lon: number }> {
  const directPosition = resolveTruckPosition(tracker);
  if (directPosition) {
    return directPosition;
  }

  const address = tracker.lastAddress;
  if (address) {
    return geocodeAddress(address);
  }

  throw new Error("Немає актуальної GPS-позиції евакуатора для розрахунку.");
}

function formatTruckLocationForComment(
  estimate: RouteEstimate | null,
  truckState: Awaited<ReturnType<typeof getTowCalculatorState>> | undefined,
): string {
  if (estimate?.calculationMode === "scheduled_base") {
    return estimate.startLocationLabel;
  }

  const selectedTracker = truckState?.trackers?.find(
    (candidate) =>
      candidate.trackerDevice.name === estimate?.selectedTrackerName &&
      candidate.equipment.name === estimate?.selectedEquipmentName,
  )?.trackerDevice;
  const address = selectedTracker?.lastAddress;
  if (address) {
    return address;
  }

  const position = resolveTruckPosition(selectedTracker);
  if (!position) {
    return "невідомо";
  }

  return `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}`;
}

async function resolveTrackerCandidatesForRouting(
  truckState: Awaited<ReturnType<typeof getTowCalculatorState>> | undefined,
  requestMode: "urgent" | "scheduled",
): Promise<Array<{
  trackerId: string;
  equipmentId: string;
  trackerName: string;
  equipmentName: string;
  startLocationLabel: string;
  position: { lat: number; lon: number };
}>> {
  const trackers = truckState?.trackers ?? [];
  if (trackers.length === 0) {
    throw new Error(truckState?.message || "Немає доступних евакуаторів для розрахунку.");
  }

  const candidates = await Promise.all(
    trackers.map(async (candidate) => {
      if (requestMode === "scheduled") {
        const baseLatitude = candidate.equipment.baseLatitude;
        const baseLongitude = candidate.equipment.baseLongitude;
        if (typeof baseLatitude !== "number" || typeof baseLongitude !== "number") {
          return null;
        }

        return {
          trackerId: candidate.trackerDevice.id,
          equipmentId: candidate.equipment.id,
          trackerName: candidate.trackerDevice.name,
          equipmentName: candidate.equipment.name,
          startLocationLabel: candidate.equipment.baseAddress || `${baseLatitude.toFixed(6)}, ${baseLongitude.toFixed(6)}`,
          position: { lat: baseLatitude, lon: baseLongitude },
        };
      }

      return {
        trackerId: candidate.trackerDevice.id,
        equipmentId: candidate.equipment.id,
        trackerName: candidate.trackerDevice.name,
        equipmentName: candidate.equipment.name,
        startLocationLabel: candidate.trackerDevice.lastAddress || "поточна GPS-позиція",
        position: await resolveTruckPositionForRouting(candidate.trackerDevice),
      };
    }),
  );

  const availableCandidates = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  if (availableCandidates.length === 0) {
    throw new Error(
      requestMode === "scheduled"
        ? "Для запланованої евакуації немає евакуатора з базовою локацією."
        : "Не вдалося визначити позицію жодного евакуатора.",
    );
  }

  return availableCandidates;
}

async function fetchRoute(
  pickup: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): Promise<{ distanceMeters: number; durationSeconds: number }> {
  const params = new URLSearchParams({
    fromLat: String(pickup.lat),
    fromLon: String(pickup.lon),
    toLat: String(destination.lat),
    toLon: String(destination.lon),
  });

  const res = await fetch(`/api/address-search/route?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Сервіс розрахунку маршруту тимчасово недоступний.");
  }

  return res.json() as Promise<{ distanceMeters: number; durationSeconds: number }>;
}
