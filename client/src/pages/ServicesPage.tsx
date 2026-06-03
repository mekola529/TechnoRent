import { useState, useEffect } from "react";
import PageMeta from "../components/PageMeta";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import ServiceCard from "../components/ServiceCard";
import { useOrderModal } from "../context/useOrderModal";
import { getActiveServices } from "../data/services";
import type { Service } from "../data/services";
import { DEFAULT_OG_IMAGE, absoluteSiteUrl } from "../utils/seo";

const advantages = [
  { title: "Техніка з оператором", desc: "Для робіт, де потрібне керування машиною, погоджуємо подачу з оператором." },
  { title: "Розрахунок під задачу", desc: "Ціна залежить від техніки, тривалості, адреси та обсягу робіт." },
  { title: "Подача на адресу", desc: "Після уточнення деталей погоджуємо, куди й коли подати машину." },
  { title: "Пов'язані роботи", desc: "За потреби поєднаємо копання, навантаження і вивезення матеріалу." },
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
      <PageMeta
        title="Послуги TechnoRent | Спецтехніка у Львові та області"
        description="Земляні роботи, демонтаж, вивіз сміття, перевезення матеріалів і евакуатор у Львові та області. Оберіть потрібну послугу."
        canonical={absoluteSiteUrl("/services")}
        image={DEFAULT_OG_IMAGE}
      />

      <Header />
      <MobileTabBar />

      {/* Hero */}
      <section className="w-full bg-dark px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[42px] font-bold leading-tight text-white max-lg:text-3xl max-md:text-2xl">
            Роботи зі <span className="text-primary">спецтехнікою</span>
          </h1>
          <p className="mt-3 text-base font-medium text-gray-300 max-md:text-sm">
            Земляні роботи, демонтаж, вивіз відходів, доставка матеріалів та евакуатор у Львові й області.
          </p>
        </div>
      </section>

      {/* Services grid */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        {loading ? (
          <div className="grid grid-cols-[repeat(3,minmax(0,340px))] justify-center gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-border bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                <div className="h-[180px] rounded-xl bg-gray-200" />
                <div className="flex flex-col gap-3 pt-3">
                  <div className="h-5 w-3/4 rounded bg-gray-200" />
                  <div className="h-4 w-1/2 rounded bg-gray-200" />
                  <div className="h-10 w-28 rounded-full bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(3,minmax(0,340px))] justify-center gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            {allServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </section>

      {/* Advantages */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Як оформити роботу
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
            Маєте задачу на об'єкті?
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-300">
            Вкажіть адресу та вид робіт. Менеджер підкаже, яка техніка потрібна і як рахується ціна.
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
