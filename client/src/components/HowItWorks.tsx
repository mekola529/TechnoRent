const steps = [
  { number: "01", text: "Опишіть роботу", description: "Оберіть техніку в каталозі або залиште заявку з адресою та видом робіт." },
  { number: "02", text: "Уточнимо деталі", description: "Менеджер перевірить, яка машина потрібна, коли її можна подати та як розраховується вартість." },
  { number: "03", text: "Погодимо подачу", description: "Після підтвердження дати й умов техніка виїде на ваш об'єкт." },
];

export default function HowItWorks() {
  return (
    <section aria-label="Як працює оренда" className="flex w-full flex-col items-center px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
      <h2 className="mb-4 text-center text-4xl font-bold text-dark max-lg:text-3xl">
        Як це працює
      </h2>
      <div className="grid grid-cols-3 gap-6 pt-[25px] max-md:grid-cols-1">
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex h-[220px] flex-col gap-2 rounded-2xl bg-white p-5 shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
          >
            <span className="text-2xl font-bold text-primary">
              {step.number}
            </span>
            <p className="text-xl font-bold text-dark">{step.text}</p>
            <p className="text-[14px] leading-[1.5] font-medium text-dark-text">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
