export default function WhyChooseUs() {
  return (
    <section className="flex w-full gap-7 px-[120px] py-[50px] max-xl:px-8 max-lg:flex-col max-md:px-4">
      {/* Image */}
      <div className="h-[360px] w-full overflow-hidden rounded-[18px] max-lg:h-[260px]">
        <img
          src="https://images.unsplash.com/photo-1661120212012-aca40671ba47?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800"
          alt="Спецтехніка TechnoRent на будівельному майданчику"
          className="h-full w-full object-cover"
          loading="lazy"
          width={800}
          height={360}
        />
      </div>

      {/* Text */}
      <div className="flex w-full flex-col justify-center gap-3">
        <h2 className="text-[38px] font-bold leading-tight text-dark max-lg:text-3xl">
          Чому обирають TechnoRent
        </h2>
        <ul className="list-none text-lg font-medium leading-[1.6] text-dark-text">
          <li>• Власний парк техніки</li>
          <li>• Досвідчені оператори</li>
          <li>• Швидка подача техніки</li>
          <li>• Працюємо по Львову та області</li>
        </ul>
      </div>
    </section>
  );
}
