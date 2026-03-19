const steps = [
  { number: "01", text: "Залишаєте заявку" },
  { number: "02", text: "Ми зв'язуємося з вами" },
  { number: "03", text: "Техніка виїжджає на об'єкт" },
];

export default function HowItWorks() {
  return (
    <section aria-label="Як працює оренда" className="flex w-full flex-col items-center px-[120px] py-[50px] max-xl:px-8 max-md:px-4">
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
          </div>
        ))}
      </div>
    </section>
  );
}
