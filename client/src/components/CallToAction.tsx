export default function CallToAction() {
  return (
    <section aria-label="Залишити заявку" className="w-full rounded-[20px] bg-dark px-[120px] py-11 max-xl:px-8 max-md:px-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-[42px] font-bold text-white max-lg:text-3xl">
          Потрібна техніка для роботи?
        </h2>
        <p className="max-w-[700px] text-[17px] font-medium text-gray-100">
          Залиште заявку і ми допоможемо швидко підібрати техніку для вашого
          проєкту.
        </p>
        <a
          href="#order"
          className="mt-2 w-fit rounded-full bg-primary px-[22px] py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          Замовити техніку
        </a>
      </div>
    </section>
  );
}
