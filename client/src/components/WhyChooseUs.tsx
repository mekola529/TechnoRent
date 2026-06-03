export default function WhyChooseUs() {
  const points = [
    { title: "Техніка під конкретну роботу", desc: "Для траншеї, планування ділянки чи вивозу ґрунту потрібні різні машини. Допоможемо вибрати." },
    { title: "Оператор разом із технікою", desc: "Для робіт, що потребують керування технікою, погодимо подачу з оператором." },
    { title: "Дата без припущень", desc: "Час виїзду підтверджуємо після перевірки заявки й доступності машини." },
    { title: "Львів та область", desc: "Працюємо на приватних ділянках і будівельних об'єктах у регіоні." },
  ];

  return (
    <section className="flex w-full gap-7 px-[120px] py-16 max-xl:px-8 max-lg:flex-col max-md:px-4 max-md:py-10">
      {/* Left — image with title overlay */}
      <div className="relative h-[420px] w-full overflow-hidden rounded-[18px] max-lg:h-[280px]">
        <img
          src="https://bf-logistic.ua/images/category/bud-teh/1075462460_1075462460.jpg.pagespeed.ce.juQWDfrMuV.jpg"
          alt="Спецтехніка на будівельному майданчику"
          className="h-full w-full object-cover"
          loading="lazy"
          width={800}
          height={420}
        />
        <div className="absolute inset-0 bg-black/40" />
        <h2 className="absolute inset-0 flex items-center justify-center text-center text-[34px] font-bold leading-tight text-white max-lg:text-2xl max-md:text-xl">
          Як ми&nbsp;
          <span className="text-primary">працюємо</span>
        </h2>
      </div>

      {/* Right — points */}
      <div className="flex w-full flex-col justify-center gap-4">
        {points.map((p) => (
          <div
            key={p.title}
            className="flex gap-3.5 rounded-[14px] border border-border bg-white p-4 transition-shadow hover:shadow-md"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-dark">
              ✓
            </span>
            <div>
              <p className="text-[15px] font-bold text-dark">{p.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-dark-text">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
