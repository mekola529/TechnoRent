import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import fallbackHeroImage from "../assets/hero.png";
// import { useOrderModal } from "../context/OrderModalContext";

export default function Hero() {
  // const { openOrderModal } = useOrderModal();
  const [heroImage, setHeroImage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ heroImage: string }>("/settings/homepage", { redirectOnUnauthorized: false })
      .then((settings) => {
        setHeroImage(settings.heroImage || fallbackHeroImage);
      })
      .catch(() => setHeroImage(fallbackHeroImage));
  }, []);

  return (
    <section
      aria-label="Оренда спецтехніки у Львові"
      className="relative flex min-h-[520px] w-full items-center overflow-hidden"
    >
      {/* Background image */}
      {heroImage && (
        <img
          src={heroImage}
          alt="Будівельна спецтехніка TechnoRent у Львові"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1920}
          height={520}
          fetchPriority="high"
        />
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex w-full max-w-[720px] flex-col gap-3.5 px-[120px] py-20 max-xl:px-8 max-md:px-4 max-md:py-12">
        <h1 className="text-[58px] font-bold leading-tight text-white max-lg:text-4xl">
          Спецтехніка в оренду у Львові
        </h1>
        <p className="text-lg font-medium text-gray-100">
          Екскаватори, навантажувачі, крани й самоскиди для робіт на об'єкті.
          Працюємо у Львові та області.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          <Link
            to="/catalog"
            className="w-[190px] rounded-full bg-primary py-3 text-center text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Переглянути техніку
          </Link>
          {/* <button
            onClick={() => openOrderModal()}
            className="w-[190px] rounded-full border border-white py-3 text-center text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Залишити заявку
          </button> */}
          <Link
            to="/services"
            className="rounded-full border border-primary px-[22px] py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
          >
            Послуги
          </Link>
        </div>
      </div>
    </section>
  );
}
