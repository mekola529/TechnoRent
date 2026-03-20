import { useState } from "react";
import { createOrder } from "../data/equipment.service";

interface OrderModalProps {
  equipmentName?: string;
  equipmentId?: string;
  onClose: () => void;
}

export default function OrderModal({ equipmentName, equipmentId, onClose }: OrderModalProps) {
  const isDetailed = !!equipmentId;

  const [form, setForm] = useState({
    name: "",
    phone: "+380",
    email: "",
    dateFrom: "",
    dateTo: "",
    address: "",
    comment: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || form.phone.length < 5) return;
    setSending(true);
    setError("");

    try {
      await createOrder({
        customerName: form.name,
        phone: form.phone,
        email: form.email || undefined,
        dateFrom: form.dateFrom || undefined,
        dateTo: form.dateTo || undefined,
        address: form.address || undefined,
        comment: form.comment || undefined,
        ...(equipmentId ? { equipmentId } : {}),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка надсилання");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-white p-6 font-sans shadow-xl ${isDetailed ? "max-w-[640px]" : "max-w-[420px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="text-5xl">✅</span>
            <h2 className="text-2xl font-bold text-dark">Заявку надіслано!</h2>
            <p className="text-center text-sm font-medium text-dark-text">
              Ми зв'яжемося з вами найближчим часом для підтвердження замовлення.
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
              <h2 className="text-[28px] font-bold text-dark">
                {isDetailed ? "Замовлення техніки" : "Залишити заявку"}
              </h2>
              <button
                onClick={onClose}
                className="text-base font-bold text-dark-text transition-colors hover:text-dark"
              >
                ✕
              </button>
            </div>

            {equipmentName && (
              <div className="mb-4 flex flex-col gap-1.5 rounded-[10px] bg-light-bg p-3">
                <span className="text-xs font-bold text-dark-text">Техніка</span>
                <span className="text-sm font-semibold text-dark">
                  {equipmentName}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Field label="Ім'я" required>
                <Input placeholder="Введіть ім'я" value={form.name} onChange={(v) => update("name", v)} />
              </Field>

              <Field label="Мобільний" required>
                <Input placeholder="+380" value={form.phone} onChange={(v) => update("phone", v)} type="tel" />
              </Field>

              {isDetailed && (
                <>
                  <Field label="Пошта (необов'язково)">
                    <Input placeholder="name@email.com" value={form.email} onChange={(v) => update("email", v)} type="email" />
                  </Field>

                  <div className="flex gap-2.5">
                    <Field label="Дата від (необов'язково)" className="flex-1">
                      <Input placeholder="" value={form.dateFrom} onChange={(v) => update("dateFrom", v)} type="date" />
                    </Field>
                    <Field label="Дата до (необов'язково)" className="flex-1">
                      <Input placeholder="" value={form.dateTo} onChange={(v) => update("dateTo", v)} type="date" />
                    </Field>
                  </div>

                  <Field label="Адреса (необов'язково)">
                    <Input placeholder="Львів, вул..." value={form.address} onChange={(v) => update("address", v)} />
                  </Field>
                </>
              )}

              <Field label="Коментар (необов'язково)">
                <textarea
                  placeholder="Деталі замовлення..."
                  value={form.comment}
                  onChange={(e) => update("comment", e.target.value)}
                  className="h-[90px] w-full resize-none rounded-[10px] border border-border bg-white px-3.5 py-3 text-[13px] font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary"
                />
              </Field>

              <p className="text-xs font-semibold text-dark-text">
                * Обов'язкові поля: Ім'я, Мобільний
              </p>

              {error && (
                <p className="text-xs font-semibold text-red-500">{error}</p>
              )}
            </div>

            <div className="mt-4 flex gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 rounded-full bg-light-bg px-3.5 py-3 text-[13px] font-bold text-dark transition-colors hover:bg-border"
              >
                Скасувати
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending}
                className="flex-1 rounded-full bg-primary px-3.5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {sending ? "Надсилання..." : isDetailed ? "Надіслати замовлення" : "Надіслати заявку"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-[13px] font-bold text-dark">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {children}
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-[13px] font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary"
    />
  );
}
