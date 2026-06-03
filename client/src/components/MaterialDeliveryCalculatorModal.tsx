import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createOrder } from "../data/equipment.service";
import {
  calculateMaterialDelivery,
  getMaterialDeliveryOptions,
  type MaterialDeliveryCalculationResult,
  type MaterialDeliveryRequestMode,
  type MaterialDeliveryOptions,
} from "../data/material-delivery";
import AddressAutocompleteInput from "./AddressAutocompleteInput";
import type { AddressSuggestion } from "../utils/addressSearch";
import { getLeadAttributionPayload } from "../lib/attribution";
import { pushAnalyticsEvent } from "../lib/analytics";
import { useCustomerAccount } from "../context/useCustomerAccount";
import { getCustomerContactPrefill, shouldPrefillPhone } from "../utils/customerPrefill";

interface MaterialDeliveryCalculatorModalProps {
  serviceSlug: string;
  serviceName: string;
  onClose: () => void;
}

export default function MaterialDeliveryCalculatorModal({
  serviceSlug,
  serviceName,
  onClose,
}: MaterialDeliveryCalculatorModalProps) {
  const { customer } = useCustomerAccount();
  const [options, setOptions] = useState<MaterialDeliveryOptions | null>(null);
  const [form, setForm] = useState({
    materialId: "",
    quantity: "",
    address: "",
    requestMode: "urgent" as MaterialDeliveryRequestMode,
    scheduledDate: "",
    scheduledTime: "",
    name: "",
    phone: "+380",
    comment: "",
  });
  const [addressSuggestion, setAddressSuggestion] = useState<AddressSuggestion | null>(null);
  const [estimate, setEstimate] = useState<MaterialDeliveryCalculationResult | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [estimating, setEstimating] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [calculationTouched, setCalculationTouched] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);
  const [showContactFields, setShowContactFields] = useState(false);
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

  const selectedMaterial = useMemo(
    () => options?.materials.find((material) => material.id === form.materialId) ?? null,
    [form.materialId, options?.materials],
  );

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
      form_type: "material_delivery_calculator",
      page_path: window.location.pathname,
      service_slug: serviceSlug,
    });
  }, [serviceSlug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingOptions(true);
      setError("");
      try {
        const data = await getMaterialDeliveryOptions(serviceSlug);
        if (cancelled) return;
        setOptions(data);
        setForm((prev) => ({
          ...prev,
          materialId: prev.materialId || data.materials[0]?.id || "",
          quantity: prev.quantity || (data.materials[0]?.minOrderQuantity ? String(data.materials[0].minOrderQuantity) : "5"),
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не вдалося завантажити матеріали.");
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceSlug]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (["materialId", "quantity", "address", "requestMode", "scheduledDate", "scheduledTime"].includes(field)) {
      setEstimate(null);
    }
    if (field === "address") {
      setAddressSuggestion((prev) => (prev?.label === value ? prev : null));
    }
  }

  async function handleEstimate() {
    setCalculationTouched(true);
    setError("");

    if (!form.materialId) {
      setError("Оберіть матеріал.");
      return;
    }

    const quantity = Number(form.quantity);
    if (!form.quantity.trim() || Number.isNaN(quantity) || quantity <= 0) {
      setError("Вкажіть кількість більше 0.");
      return;
    }

    if (!form.address.trim()) {
      setError("Вкажіть адресу доставки.");
      return;
    }

    if (form.requestMode === "scheduled" && !form.scheduledDate) {
      setError("Для запланованої доставки вкажіть дату.");
      return;
    }

    setEstimating(true);
    try {
      const result = await calculateMaterialDelivery(serviceSlug, {
        materialId: form.materialId,
        quantity,
        unit: selectedMaterial?.unit,
        address: form.address.trim(),
        latitude: addressSuggestion?.label === form.address.trim() ? addressSuggestion.lat : null,
        longitude: addressSuggestion?.label === form.address.trim() ? addressSuggestion.lon : null,
        requestMode: form.requestMode,
        scheduledDate: form.scheduledDate || undefined,
        scheduledTime: form.scheduledTime || undefined,
      });

      if (!result.available) {
        setEstimate(null);
        setError(result.message || "Не вдалося розрахувати доставку.");
        return;
      }

      setEstimate(result);
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Не вдалося розрахувати доставку.");
    } finally {
      setEstimating(false);
    }
  }

  async function handleSubmit() {
    setCalculationTouched(true);
    setContactTouched(true);
    setError("");

    if (!estimate || !estimate.available) {
      setError("Спочатку натисніть «Розрахувати», щоб отримати орієнтовну суму.");
      return;
    }

    if (!form.name.trim() || form.phone.trim().length < 10) {
      setError("Заповніть ім'я та коректний номер телефону.");
      return;
    }

    setSending(true);
    try {
      const attribution = getLeadAttributionPayload();
      const created = await createOrder({
        customerName: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        comment: form.comment.trim() || undefined,
        requestType: "service",
        serviceName,
        dateFrom: form.scheduledDate || undefined,
        attribution,
        metadata: {
          materialDelivery: {
            servicePricingType: "material_delivery_calculator",
            calculationMode: estimate.calculationMode,
            requestMode: form.requestMode,
            selectedMaterialId: form.materialId,
            selectedMaterialName: selectedMaterial?.name ?? null,
            quantity: Number(form.quantity),
            unit: selectedMaterial?.unit ?? null,
            deliveryRatePerKm: estimate.pricingDetails?.deliveryRatePerKm ?? null,
            materialCost: estimate.materialCost,
            deliveryCost: estimate.deliveryCost,
            totalEstimatedCost: estimate.totalCost,
            truckToPointKm: estimate.truckToPointKm,
            pointToClientKm: estimate.pointToClientKm,
            chosenSupplierPointId: estimate.chosenSupplierPoint?.id ?? null,
            chosenSupplierPointName: estimate.chosenSupplierPoint?.name ?? null,
            chosenSupplierPointAddress: estimate.chosenSupplierPoint?.address ?? null,
            chosenSupplierPointCoordinates: estimate.chosenSupplierPoint?.position ?? null,
            chosenOfferUnitPrice: estimate.pricingDetails?.unitPrice ?? null,
            chosenEquipmentId: estimate.chosenEquipment?.id ?? null,
            chosenEquipmentName: estimate.chosenEquipment?.name ?? null,
            alternativesSnapshot: estimate.alternatives,
            scheduledDate: form.scheduledDate || null,
            scheduledTime: form.scheduledTime || null,
            deliveryAddress: form.address.trim(),
            deliveryCoordinates: {
              lat: addressSuggestion?.label === form.address.trim() ? addressSuggestion.lat : null,
              lon: addressSuggestion?.label === form.address.trim() ? addressSuggestion.lon : null,
            },
            customerComment: form.comment.trim() || null,
            calculatedAt: new Date().toISOString(),
          },
        },
      });
      pushAnalyticsEvent("lead_submit_success", {
        lead_type: "material_delivery_calculator",
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

  function handleRequestSubmit() {
    if (!showContactFields) {
      setShowContactFields(true);
      requestAnimationFrame(() => {
        contactFieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      if (!estimate) {
        setError("Спочатку натисніть «Розрахувати», щоб отримати орієнтовну суму.");
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
        className="max-h-[90dvh] w-full max-w-[720px] overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-white p-5 font-sans shadow-xl max-sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="text-5xl">✅</span>
            <h2 className="text-2xl font-bold text-dark">Заявку надіслано!</h2>
            <p className="max-w-[460px] text-center text-sm font-medium text-dark-text">
              Заявку збережено. Менеджер перевірить матеріал і транспорт та зв&apos;яжеться з вами для підтвердження.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              Закрити
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[28px] font-bold text-dark max-sm:text-2xl">
                  Розрахунок доставки матеріалів
                </h2>
                <p className="mt-1 text-sm text-dark-text">
                  Вкажіть матеріал, кількість і адресу, куди його привезти.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-base font-bold text-dark-text transition-colors hover:text-dark"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Матеріал"
                required
                error={calculationTouched && !form.materialId ? "Оберіть матеріал" : ""}
              >
                <select
                  value={form.materialId}
                  disabled={loadingOptions}
                  onChange={(event) => {
                    const material = options?.materials.find((item) => item.id === event.target.value);
                    update("materialId", event.target.value);
                    if (material?.minOrderQuantity && !form.quantity) {
                      update("quantity", String(material.minOrderQuantity));
                    }
                  }}
                  className="w-full max-w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none focus:border-primary disabled:opacity-60 md:text-[13px]"
                >
                  {loadingOptions ? (
                    <option value="">Завантаження...</option>
                  ) : (
                    <>
                      <option value="">Оберіть матеріал</option>
                      {options?.materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name} ({material.unit})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </Field>

              <Field
                label={`Кількість${selectedMaterial?.unit ? `, ${selectedMaterial.unit}` : ""}`}
                required
                error={calculationTouched && (!form.quantity || Number(form.quantity) <= 0) ? "Вкажіть кількість" : ""}
              >
                <Input
                  type="number"
                  placeholder="5"
                  value={form.quantity}
                  onChange={(value) => update("quantity", value)}
                  error={calculationTouched && (!form.quantity || Number(form.quantity) <= 0)}
                />
              </Field>

              <Field
                label="Адреса доставки"
                required
                className="sm:col-span-2"
                error={calculationTouched && !form.address.trim() ? "Вкажіть адресу доставки" : ""}
              >
                <AddressAutocompleteInput
                  placeholder="Напр. Львів, вул. Городоцька, 120"
                  value={form.address}
                  onChange={(value) => update("address", value)}
                  onSelect={(suggestion) => {
                    setAddressSuggestion(suggestion);
                    setEstimate(null);
                  }}
                  error={calculationTouched && !form.address.trim()}
                />
              </Field>

              <div className="sm:col-span-2 rounded-2xl border border-border bg-[#F9FAFB] p-3">
                <span className="text-[13px] font-bold text-dark">Коли потрібна доставка?</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <ModeButton
                    active={form.requestMode === "urgent"}
                    title="Потрібно зараз"
                    description="Рахуємо маршрут від поточної позиції машини"
                    onClick={() => update("requestMode", "urgent")}
                  />
                  <ModeButton
                    active={form.requestMode === "scheduled"}
                    title="Потрібно на дату"
                    description="Рахуємо маршрут від базової адреси машини"
                    onClick={() => update("requestMode", "scheduled")}
                  />
                </div>
              </div>

              {form.requestMode === "scheduled" && (
                <>
                  <Field
                    label="Дата доставки"
                    required
                    error={calculationTouched && !form.scheduledDate ? "Вкажіть дату" : ""}
                  >
                    <Input
                      type="date"
                      placeholder=""
                      value={form.scheduledDate}
                      onChange={(value) => update("scheduledDate", value)}
                      error={calculationTouched && !form.scheduledDate}
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

              {estimate?.available && (
                <div className="sm:col-span-2">
                  <div className="rounded-2xl border border-border bg-[#F9FAFB] p-4">
                    <h3 className="text-base font-bold text-dark">Попередній розрахунок</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <MetricCard label="Матеріал" value={formatCurrency(estimate.materialCost ?? 0)} />
                      <MetricCard label="Доставка" value={formatCurrency(estimate.deliveryCost ?? 0)} />
                      <MetricCard label="Разом" value={formatCurrency(estimate.totalCost ?? 0)} accent />
                    </div>
                    <p className="mt-3 text-xs font-medium text-dark-text">
                      Це попередня сума. Менеджер підтвердить її після перевірки матеріалу й транспорту.
                    </p>
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
                      onChange={(value) => update("name", value)}
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
                      onChange={(value) => update("phone", value)}
                      type="tel"
                      error={contactTouched && form.phone.trim().length < 10}
                    />
                  </Field>

                  <Field label="Коментар" className="sm:col-span-2">
                    <textarea
                      placeholder="Наприклад: зручний заїзд, потрібна доставка до воріт..."
                      value={form.comment}
                      onChange={(event) => update("comment", event.target.value)}
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
                disabled={estimating || loadingOptions}
                className="flex-1 rounded-full bg-primary px-3.5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {estimating ? "Розрахунок..." : "Розрахувати"}
              </button>
              <button
                type="button"
                onClick={handleRequestSubmit}
                disabled={sending || loadingOptions}
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
      onChange={(event) => onChange(event.target.value)}
      className={`w-full max-w-full rounded-[10px] border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px] ${error ? "border-red-400" : "border-border"}`}
    />
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value);
}
