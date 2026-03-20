import { Link } from "react-router-dom";
import { useOrderModal } from "../context/OrderModalContext";

export default function Hero() {
  const { openOrderModal } = useOrderModal();
  return (
    <section
      aria-label="Оренда спецтехніки у Львові"
      className="relative flex min-h-[520px] w-full items-center overflow-hidden"
    >
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1695795692564-586c6ab80a69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
        alt="Будівельна спецтехніка для оренди у Львові — TechnoRent"
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        width={1920}
        height={520}
        fetchPriority="high"
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex w-full max-w-[720px] flex-col gap-3.5 px-[120px] py-20 max-xl:px-8 max-md:px-4 max-md:py-12">
        <h1 className="text-[58px] font-bold leading-tight text-white max-lg:text-4xl">
          Оренда спецтехніки у Львові
        </h1>
        <p className="text-lg font-medium text-gray-100">
          Швидка оренда екскаваторів, навантажувачів та іншої техніки для
          будівництва. Працюємо по Львову та області.
        </p>
        <div className="mt-1.5 flex gap-3">
          <Link
            to="/catalog"
            className="rounded-full bg-primary px-[22px] py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Переглянути техніку
          </Link>
          <button
            onClick={() => openOrderModal()}
            className="rounded-full border border-white px-[22px] py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Залишити заявку
          </button>
        </div>
      </div>
    </section>
  );
}
