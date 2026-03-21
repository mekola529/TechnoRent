export default function WhyChooseUs() {
  const points = [
    { title: "Власний парк техніки", desc: "Понад 50 одиниць сучасної будівельної техніки провідних брендів" },
    { title: "Досвідчені оператори", desc: "Кваліфіковані спеціалісти з багаторічним досвідом роботи" },
    { title: "Швидка подача техніки", desc: "Доставка на обʼєкт протягом 2–4 годин після замовлення" },
    { title: "Працюємо по Львову та області", desc: "Обслуговуємо будівельні майданчики у Львові та Львівській області" },
  ];

  return (
    <section className="flex w-full gap-7 px-[120px] py-16 max-xl:px-8 max-lg:flex-col max-md:px-4 max-md:py-10">
      {/* Left — image with title overlay */}
      <div className="relative h-[420px] w-full overflow-hidden rounded-[18px] max-lg:h-[280px]">
        <img
          src="https://bf-logistic.ua/images/category/bud-teh/1075462460_1075462460.jpg.pagespeed.ce.juQWDfrMuV.jpg"
          alt="Спецтехніка TechnoRent на будівельному майданчику"
          className="h-full w-full object-cover"
          loading="lazy"
          width={800}
          height={420}
        />
        <div className="absolute inset-0 bg-black/40" />
        <h2 className="absolute inset-0 flex items-center justify-center text-center text-[34px] font-bold leading-tight text-white max-lg:text-2xl max-md:text-xl">
          Чому обирають
          <br />
          <span className="text-primary">TechnoRent</span>
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
