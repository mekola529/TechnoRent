import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import { apiFetch } from "../api/client";

/* ── Structured data ── */

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Вивіз будівельного сміття",
  description:
    "Оперативний вивіз будівельного сміття у Львові та Львівській області — бетон, цегла, ґрунт, демонтажні відходи.",
  provider: {
    "@type": "LocalBusiness",
    name: "TechnoRent",
    url: "https://technorent.ua",
  },
  areaServed: {
    "@type": "Place",
    name: "Львів та Львівська область",
  },
  url: "https://technorent.ua/vyviz-smittia",
};

const faqItems = [
  {
    q: "Скільки коштує вивіз будівельного сміття?",
    a: "Вартість залежить від обсягу та типу відходів. Залиште заявку — менеджер розрахує точну вартість після уточнення деталей.",
  },
  {
    q: "Як швидко ви можете вивезти сміття?",
    a: "Зазвичай ми організовуємо вивіз протягом 1–2 днів після підтвердження заявки. У термінових випадках — в день звернення.",
  },
  {
    q: "В яких районах ви працюєте?",
    a: "Ми обслуговуємо Львів та всю Львівську область у радіусі до 100 км.",
  },
  {
    q: "Які матеріали ви вивозите?",
    a: "Бетон, цеглу, штукатурку, дерево, метал, гіпсокартон, утеплювач, залишки демонтажу та інше будівельне сміття.",
  },
  {
    q: "Чи потрібно мені самостійно пакувати сміття?",
    a: "Ні, наша бригада виконає завантаження. Але якщо сміття вже зібране у мішки — це пришвидшить процес.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

/* ── Data ── */

const wasteTypes = [
  "Будівельний лом (цегла, бетон, штукатурка)",
  "Залишки демонтажу (двері, вікна, перегородки)",
  "Мішки з будівельним сміттям",
  "Уламки матеріалів (плитка, гіпсокартон, утеплювач)",
  "Дерев'яні відходи (дошки, палети, опалубка)",
  "Металеві залишки (арматура, профілі, труби)",
  "Інше будівельне сміття",
];

const steps = [
  { num: "01", title: "Залишаєте заявку", desc: "Заповніть форму — вкажіть адресу, дату та бажаний час вивозу. Це займе лише хвилину." },
  { num: "02", title: "Уточнюємо деталі", desc: "Менеджер зв'яжеться з вами, уточнить обсяг сміття та адресу забору." },
  { num: "03", title: "Погоджуємо час", desc: "Підтверджуємо зручну для вас дату та часовий інтервал вивозу." },
  { num: "04", title: "Вивозимо сміття", desc: "Приїжджаємо на вказану адресу, завантажуємо і вивозимо все будівельне сміття." },
];

const advantages = [
  { icon: "⚡", title: "Оперативне погодження", desc: "Зв'яжемося з вами протягом 30 хвилин після заявки" },
  { icon: "📅", title: "Зручний вибір дати і часу", desc: "Ви обираєте коли — ми організовуємо вивіз" },
  { icon: "📍", title: "Виїзд на вказану адресу", desc: "Працюємо по Львову та Львівській області" },
  { icon: "🏢", title: "Приватні та комерційні об'єкти", desc: "Обслуговуємо квартири, будинки, офіси та промислові об'єкти" },
];

const timeSlots = [
  "08:00 - 10:00",
  "10:00 - 12:00",
  "12:00 - 14:00",
  "14:00 - 16:00",
  "16:00 - 18:00",
  "18:00 - 20:00",
];

/* ── Helpers ── */

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

/* ── Component ── */

export default function DebrisRemovalPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "+380",
    address: "",
    date: "",
    time: "",
    comment: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Вкажіть ваше ім'я";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Вкажіть коректний номер телефону";
    if (!form.address.trim()) e.address = "Вкажіть адресу вивозу";
    if (!form.date) {
      e.date = "Оберіть дату";
    } else if (form.date < todayISO()) {
      e.date = "Дата не може бути в минулому";
    }
    if (!form.time) e.time = "Оберіть бажаний час";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    setSending(true);
    setSubmitError("");

    try {
      await apiFetch("/service-requests", {
        method: "POST",
        body: JSON.stringify({
          serviceType: "debris_removal",
          customerName: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          date: form.date,
          time: form.time,
          comment: form.comment.trim() || undefined,
        }),
      });
      setSubmitted(true);
      setForm({ name: "", phone: "+380", address: "", date: "", time: "", comment: "" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка надсилання");
    } finally {
      setSending(false);
    }
  }

  function openModal() {
    setSubmitted(false);
    setSubmitError("");
    setShowModal(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>Вивіз будівельного сміття — TechnoRent | Львів та область</title>
        <meta
          name="description"
          content="Замовте вивіз будівельного сміття у Львові та Львівській області. Швидке погодження, зручний вибір дати та часу, виїзд на адресу."
        />
        <link rel="canonical" href="https://technorent.ua/vyviz-smittia" />
        <script type="application/ld+json">{JSON.stringify(serviceJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <Header />
      <MobileTabBar />

      {/* ═══════ Hero ═══════ */}
      <section className="relative flex min-h-[420px] w-full items-center overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
          alt="Вивіз будівельного сміття — TechnoRent"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1920}
          height={420}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-black/50" />

        <div className="relative z-10 flex w-full max-w-[720px] flex-col gap-3.5 px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
          <h1 className="text-[48px] font-bold leading-tight text-white max-lg:text-4xl max-md:text-[28px]">
            Вивіз будівельного <span className="text-primary">сміття</span>
          </h1>
          <p className="max-w-[540px] text-lg font-medium text-gray-100 max-md:text-base">
            Швидко організуємо вивіз сміття після ремонту, демонтажу або будівельних робіт.
            Працюємо по Львову та Львівській області.
          </p>
          <button
            onClick={openModal}
            className="mt-1 w-fit rounded-full bg-primary px-7 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Замовити вивіз
          </button>
        </div>
      </section>

      {/* ═══════ Про послугу ═══════ */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-[32px] font-bold text-dark max-md:text-2xl">
            Про послугу
          </h2>
          <p className="text-center text-[15px] leading-relaxed text-dark-text">
            Після ремонту, демонтажу чи будівництва завжди залишається сміття, яке потрібно вивезти
            швидко та без зайвих клопотів. Ми беремо це на себе — ви лише залишаєте заявку,
            а ми організовуємо вивіз у зручний для вас час. Послуга підходить як для приватних
            осіб після ремонту квартири, так і для будівельних компаній з великими обсягами відходів.
          </p>
        </div>
      </section>

      {/* ═══════ Переваги ═══════ */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Чому це зручно
        </h2>
        <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {advantages.map((a) => (
            <div key={a.title} className="flex gap-3 rounded-[14px] bg-white p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-dark">
                {a.icon}
              </span>
              <div>
                <p className="text-[15px] font-bold text-dark">{a.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-dark-text">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Що ми вивозимо ═══════ */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Що ми вивозимо
        </h2>
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 max-md:grid-cols-1">
          {wasteTypes.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2.5 rounded-[10px] border border-border bg-white p-3.5"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-dark">
                ✓
              </span>
              <span className="text-[14px] font-medium text-dark">{w}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Як це працює ═══════ */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Як це працює
        </h2>
        <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {steps.map((s) => (
            <div
              key={s.num}
              className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
            >
              <span className="text-2xl font-bold text-primary">{s.num}</span>
              <p className="text-lg font-bold text-dark">{s.title}</p>
              <p className="text-[13px] leading-relaxed text-dark-text">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Часті запитання
        </h2>
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {faqItems.map((item) => (
            <details
              key={item.q}
              className="group rounded-[14px] border border-border bg-white p-4"
            >
              <summary className="cursor-pointer list-none text-[15px] font-bold text-dark [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.q}
                  <span className="shrink-0 text-primary transition-transform group-open:rotate-45">＋</span>
                </span>
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-dark-text">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══════ Інтерлінкінг ═══════ */}
      <section className="w-full bg-light-bg px-[120px] py-10 max-xl:px-8 max-md:px-4 max-md:py-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4 text-center">
          <Link
            to="/catalog"
            className="rounded-full border-2 border-primary px-6 py-3 text-[14px] font-bold text-dark transition-colors hover:bg-primary"
          >
            Каталог техніки в оренду
          </Link>
          <Link
            to="/services"
            className="rounded-full border-2 border-border px-6 py-3 text-[14px] font-bold text-dark transition-colors hover:border-primary hover:bg-primary"
          >
            Усі послуги TechnoRent
          </Link>
        </div>
      </section>

      {/* ═══════ Заключний CTA ═══════ */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-2xl rounded-[18px] bg-dark p-10 text-center max-md:p-6">
          <h2 className="text-[28px] font-bold text-white max-md:text-xl">
            Залишилось сміття після ремонту?
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-300">
            Ми швидко організуємо вивіз — залиште заявку і ми зв'яжемося з вами
          </p>
          <button
            onClick={openModal}
            className="mt-5 rounded-full bg-primary px-8 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Залишити заявку
          </button>
        </div>
      </section>

      <Footer />

      {/* ═══════ Модальне вікно форми ═══════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="relative max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-dark"
            >
              ✕
            </button>

            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <span className="text-5xl">✅</span>
                <h3 className="text-2xl font-bold text-dark">Заявку надіслано!</h3>
                <p className="max-w-sm text-center text-sm font-medium text-dark-text">
                  Ми зв'яжемося з вами найближчим часом для уточнення деталей вивозу.
                </p>
                <button
                  onClick={() => setShowModal(false)}
                  className="mt-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
                >
                  Закрити
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 text-[22px] font-bold text-dark">Залишити заявку</h2>
                <p className="mb-5 text-sm font-medium text-dark-text">
                  Заповніть форму — ми зв'яжемося з вами для підтвердження
                </p>

                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 rounded-[10px] bg-light-bg p-3">
                    <span className="text-lg">🚛</span>
                    <span className="text-sm font-bold text-dark">Вивіз будівельного сміття</span>
                  </div>

                  <FormField label="Ім'я" required error={errors.name}>
                    <input
                      type="text"
                      placeholder="Введіть ваше ім'я"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      className={inputClass(errors.name)}
                    />
                  </FormField>

                  <FormField label="Телефон" required error={errors.phone}>
                    <input
                      type="tel"
                      placeholder="+380 ..."
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      className={inputClass(errors.phone)}
                    />
                  </FormField>

                  <FormField label="Адреса вивозу" required error={errors.address}>
                    <input
                      type="text"
                      placeholder="Місто, вулиця, будинок"
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                      className={inputClass(errors.address)}
                    />
                  </FormField>

                  <div className="flex gap-3 max-[480px]:flex-col">
                    <FormField label="Дата вивозу" required error={errors.date} className="min-w-0 flex-1">
                      <input
                        type="date"
                        min={todayISO()}
                        value={form.date}
                        onChange={(e) => update("date", e.target.value)}
                        className={inputClass(errors.date)}
                      />
                    </FormField>

                    <FormField label="Бажаний час" required error={errors.time} className="min-w-0 flex-1">
                      <select
                        value={form.time}
                        onChange={(e) => update("time", e.target.value)}
                        className={inputClass(errors.time)}
                      >
                        <option value="">— Оберіть час —</option>
                        {timeSlots.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <FormField label="Коментар (необов'язково)">
                    <textarea
                      placeholder="Опишіть обсяг, тип сміття або інші деталі…"
                      value={form.comment}
                      onChange={(e) => update("comment", e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-[10px] border border-border bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px]"
                    />
                  </FormField>

                  <p className="text-xs font-semibold text-dark-text">* Обов'язкові поля</p>

                  {submitError && (
                    <p className="text-xs font-semibold text-red-500">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {sending ? "Надсилання…" : "Замовити вивіз"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable form elements (matching OrderModal patterns) ── */

function FormField({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
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
      {error && <span className="text-xs font-semibold text-red-500">{error}</span>}
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-[10px] border ${error ? "border-red-400" : "border-border"} bg-white px-3.5 py-3 text-base font-medium text-dark outline-none placeholder:text-[#8A8A8A] focus:border-primary md:text-[13px]`;
}
