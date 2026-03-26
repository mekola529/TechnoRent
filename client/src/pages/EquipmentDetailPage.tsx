import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { getEquipmentBySlug, formatPrice, isAvailableOnDate } from "../data/equipment.service";
import type { Equipment } from "../data/types";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import OrderModal from "../components/OrderModal";
import Skeleton from "../components/Skeleton";
import EquipmentCard from "../components/EquipmentCard";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";

/** Генерує масив днів місяця */
function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  return { daysInMonth, startOffset };
}

const monthNames = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function EquipmentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [item, setItem] = useState<Equipment | undefined>();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getEquipmentBySlug(slug).then((data) => {
      setItem(data);
      setLoading(false);
    });
  }, [slug]);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const recentlyViewed = useRecentlyViewed(item);

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }

  const calendarData = useMemo(() => {
    if (!item) return null;
    const { daysInMonth, startOffset } = getMonthDays(calYear, calMonth);
    const days: { day: number; available: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, available: isAvailableOnDate(item, dateStr) });
    }
    return { days, startOffset, monthName: `${monthNames[calMonth]} ${calYear}` };
  }, [item, calYear, calMonth]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-sans">
        <Header />
        <MobileTabBar />
        {/* Breadcrumb skeleton */}
        <nav className="px-[120px] pt-2 max-xl:px-8 max-md:px-4">
          <Skeleton className="h-4 w-40" />
        </nav>
        {/* Grid skeleton */}
        <section className="grid grid-cols-2 gap-6 px-[120px] py-6 max-xl:px-8 max-lg:grid-cols-1 max-md:px-4">
          <Skeleton className="min-h-[400px] !rounded-2xl max-lg:min-h-[280px]" />
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-1 h-8 w-32" />
            <Skeleton className="h-10 w-40 !rounded-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-6">
            <Skeleton className="h-7 w-40" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full max-w-[300px]" />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-48 w-full !rounded-lg" />
          </div>
        </section>
        <div className="mt-16" />
        <Footer />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-sans">
        <Header />
        <MobileTabBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <h1 className="text-3xl font-bold text-dark">Техніку не знайдено</h1>
          <p className="text-dark-text">Перевірте URL або поверніться до каталогу.</p>
          <Link to="/catalog" className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90">
            До каталогу
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const nextAvailable = (() => {
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const check = new Date(today);
      check.setDate(today.getDate() + i);
      const dateStr = check.toISOString().split("T")[0];
      if (isAvailableOnDate(item, dateStr)) {
        return check.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
      }
    }
    return "уточнюйте";
  })();

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>{`${item.name} — оренда ${item.brand} у Львові | TechnoRent`}</title>
        <meta
          name="description"
          content={`Оренда ${item.name} (${item.brand}) у Львові — ${formatPrice(item.pricePerHour)}. ${item.description.slice(0, 120)}...`}
        />
        <link rel="canonical" href={`https://technorent.ua/catalog/${item.slug}`} />
        <meta property="og:title" content={`${item.name} — оренда у Львові | TechnoRent`} />
        <meta property="og:description" content={item.description.slice(0, 160)} />
        <meta property="og:url" content={`https://technorent.ua/catalog/${item.slug}`} />
        {item.images[0] && <meta property="og:image" content={item.images[0].url} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: item.name,
            description: item.description,
            brand: { "@type": "Brand", name: item.brand },
            image: item.images[0]?.url,
            offers: {
              "@type": "Offer",
              priceCurrency: "UAH",
              price: item.pricePerHour,
              availability: "https://schema.org/InStock",
              url: `https://technorent.ua/catalog/${item.slug}`,
            },
          })}
        </script>
      </Helmet>

      <Header />
      <MobileTabBar />

      {/* Breadcrumb */}
      <nav aria-label="Навігація" className="px-[120px] pt-2 max-xl:px-8 max-md:px-4">
        <ol className="flex text-[13px] font-medium text-dark-text">
          <li>
            <Link to="/catalog" className="transition-colors hover:text-primary">Техніка</Link>
          </li>
          <li className="mx-1">/</li>
          <li className="text-dark" aria-current="page">{item.name}</li>
        </ol>
      </nav>

      {/* 2×2 Grid: Image + Info / Specs + Calendar */}
      <section className="grid grid-cols-2 gap-6 px-[120px] py-6 max-xl:px-8 max-lg:grid-cols-1 max-md:px-4">
        {/* Image */}
        <div className="h-[420px] overflow-hidden rounded-2xl border border-border bg-[#2B2B2B] max-lg:h-[280px]">
          {item.images[0] && (
            <img
              src={item.images[0].url}
              alt={`${item.name} — ${item.brand}, оренда у Львові`}
              className="h-full w-full object-cover"
              loading="eager"
              width={800}
              height={420}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex h-[420px] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-white p-6 max-lg:h-auto">
          <h1 className="text-[44px] font-bold text-dark max-lg:text-3xl">{item.name}</h1>
          <p className="text-[15px] font-medium text-dark-text">{item.description}</p>
          <p className="text-[30px] font-bold text-primary">{formatPrice(item.pricePerHour)}</p>
          <button
            onClick={() => setShowModal(true)}
            className="w-fit rounded-full bg-primary px-[18px] py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Замовити техніку
          </button>
          <p className="text-[13px] font-bold text-dark">Найближча доступність: {nextAvailable}</p>
        </div>

        {/* Specs */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-[26px] font-bold text-dark">Характеристики</h2>
          <div className="flex flex-col gap-1">
            {item.specs.map((spec) => (
              <p key={spec.label} className="text-sm font-medium leading-[1.8] text-dark-text">
                {spec.label}: {spec.value}
              </p>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-bold text-dark">Календар зайнятості</h2>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="text-sm font-semibold text-dark-text hover:text-dark">←</button>
              <span className="text-[13px] font-semibold text-dark-text">{calendarData?.monthName}</span>
              <button onClick={nextMonth} className="text-sm font-semibold text-dark-text hover:text-dark">→</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-[#FFF6D8] px-2.5 py-1.5 text-xs font-semibold text-dark">Зайнято</span>
            <span className="rounded-full bg-light-bg px-2.5 py-1.5 text-xs font-semibold text-dark-text">Вільно</span>
          </div>
          {calendarData && (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((d) => (
                  <span key={d} className="py-1 text-center text-xs font-bold text-dark">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calendarData.startOffset }).map((_, i) => (
                  <span key={`empty-${i}`} />
                ))}
                {calendarData.days.map(({ day, available }) => (
                  <span
                    key={day}
                    className={`rounded-lg py-1.5 text-center text-[13px] font-medium ${
                      available ? "bg-light-bg text-dark-text" : "bg-[#FFF6D8] text-dark"
                    }`}
                  >
                    {String(day).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Recently viewed */}
      {recentlyViewed.length > 0 && (
        <section className="px-[120px] pb-10 max-xl:px-8 max-md:px-4">
          <h2 className="mb-5 text-[26px] font-bold text-dark">Нещодавно переглянута техніка</h2>
          <div className="grid grid-cols-4 gap-5 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:flex max-md:flex-nowrap max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:scroll-smooth max-md:-mx-4 max-md:px-4 max-md:pb-4 max-md:gap-4">
            {recentlyViewed.slice(0, 4).map((eq) => (
              <EquipmentCard key={eq.id} item={eq} maxWidth />
            ))}
          </div>
        </section>
      )}

      <div className="mt-16" />
      <Footer />

      {showModal && (
        <OrderModal
          equipmentName={item.name}
          equipmentId={item.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
