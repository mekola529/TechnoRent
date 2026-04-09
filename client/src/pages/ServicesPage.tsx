import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import { useOrderModal } from "../context/OrderModalContext";
import { getActiveServices } from "../data/services";
import type { Service } from "../data/services";

const advantages = [
  { title: "Техніка з оператором", desc: "Надаємо досвідчених операторів разом із технікою" },
  { title: "Гнучкі умови оренди", desc: "Погодинна, поденна або довгострокова оренда" },
  { title: "Доставка на об'єкт", desc: "Організуємо доставку техніки на ваш майданчик" },
  { title: "Технічне обслуговування", desc: "Вся техніка проходить регулярне ТО та справна" },
];

export default function ServicesPage() {
  const { openOrderModal } = useOrderModal();
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveServices().then((items) => {
      setAllServices(items);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>Послуги — TechnoRent | Оренда спецтехніки у Львові</title>
        <meta
          name="description"
          content="Послуги оренди будівельної техніки у Львові: земляні роботи, демонтаж, вивіз сміття, планування ділянок, монтажні роботи. Техніка з оператором, доставка на об'єкт."
        />
        <link rel="canonical" href="https://technorent.ua/services" />
      </Helmet>

      <Header />
      <MobileTabBar />

      {/* Hero */}
      <section className="w-full bg-dark px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[42px] font-bold leading-tight text-white max-lg:text-3xl max-md:text-2xl">
            Наші <span className="text-primary">послуги</span>
          </h1>
          <p className="mt-3 text-base font-medium text-gray-300 max-md:text-sm">
            Повний спектр будівельних послуг із використанням власної техніки у Львові та Львівській області
          </p>
        </div>
      </section>

      {/* Services grid */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        {loading ? (
          <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-[14px] border border-border bg-white">
                <div className="h-[180px] bg-gray-200" />
                <div className="flex flex-col gap-3 p-5">
                  <div className="h-5 w-3/4 rounded bg-gray-200" />
                  <div className="h-3 w-full rounded bg-gray-200" />
                  <div className="h-3 w-5/6 rounded bg-gray-200" />
                  <div className="mt-2 h-8 w-28 rounded-full bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {allServices.map((s) => (
            <Link
              key={s.slug}
              to={`/services/${s.slug}`}
              className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-white transition-shadow hover:shadow-md"
            >
              <div className="h-[180px] w-full overflow-hidden bg-light-bg">
                <img
                  src={s.image}
                  alt={s.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  width={400}
                  height={180}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h3 className="text-lg font-bold text-dark">{s.title}</h3>
                <p className="text-[13px] leading-relaxed text-dark-text">{s.shortDescription}</p>
                <span className="mt-auto inline-flex w-fit items-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-dark transition-opacity group-hover:opacity-90">
                  Детальніше
                </span>
              </div>
            </Link>
          ))}
        </div>
        )}
      </section>

      {/* Advantages */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Що ми пропонуємо
        </h2>
        <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {advantages.map((a) => (
            <div key={a.title} className="flex gap-3 rounded-[14px] bg-white p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-dark">
                ✓
              </span>
              <div>
                <p className="text-[15px] font-bold text-dark">{a.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-dark-text">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-2xl rounded-[18px] bg-dark p-10 text-center max-md:p-6">
          <h2 className="text-[28px] font-bold text-white max-md:text-xl">
            Потрібна техніка для проєкту?
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-300">
            Залиште заявку і ми підберемо оптимальне рішення для вашого завдання
          </p>
          <button
            onClick={() => openOrderModal()}
            className="mt-5 rounded-full bg-primary px-8 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Залишити заявку
          </button>
        </div>
      </section>

      <Footer />
      
    </div>
  );
}
