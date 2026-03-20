import { useState } from "react";
import { createOrder } from "../data/equipment.service";

export default function CallToAction() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+380");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleCallbackSubmit() {
    if (!name.trim() || phone.length < 5) return;
    setSending(true);
    setError("");
    try {
      await createOrder({ customerName: name, phone, comment: "Замовити дзвінок" });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка надсилання");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Залишити заявку" className="flex w-full items-center justify-between gap-6 bg-dark px-[120px] py-16 max-xl:px-8 max-lg:flex-col max-md:px-4 max-md:py-10">
      {/* Ліва частина */}
      <div className="flex flex-1 flex-col gap-3">
        <h2 className="text-[42px] font-bold text-white max-lg:text-3xl">
          Потрібна техніка для роботи?
        </h2>
        <p className="text-[17px] font-medium text-gray-100">
          Залиште заявку і ми допоможемо швидко підібрати техніку для вашого
          проєкту.
        </p>
      </div>

      {/* Форма зворотного дзвінка */}
      <div className="flex w-[360px] shrink-0 flex-col gap-2.5 rounded-[14px] border border-border bg-white p-5 max-lg:w-full">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-4xl">✅</span>
            <h3 className="text-lg font-bold text-dark">Заявку надіслано!</h3>
            <p className="text-center text-sm font-medium text-dark-text">
              Ми зателефонуємо вам найближчим часом.
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-[22px] font-bold text-dark">Заявка на дзвінок</h3>
            <label className="text-xs font-bold text-dark-text">Імʼя</label>
            <input
              type="text"
              placeholder="Введіть імʼя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-3 text-[13px] font-medium text-dark-text placeholder:text-[#98A2B3] outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="text-xs font-bold text-dark-text">Телефон</label>
            <input
              type="tel"
              placeholder="+380"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-3 text-[13px] font-medium text-dark-text placeholder:text-[#98A2B3] outline-none focus:ring-2 focus:ring-primary"
            />
            {error && (
              <p className="text-xs font-semibold text-red-500">{error}</p>
            )}
            <button
              type="button"
              onClick={handleCallbackSubmit}
              disabled={sending}
              className="w-full rounded-full bg-primary px-3.5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? "Надсилання..." : "Замовити дзвінок"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
