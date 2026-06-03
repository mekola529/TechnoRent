import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { getEquipmentBySlug, formatPrice, isAvailableOnDate } from "../data/equipment.service";
import type { Equipment } from "../data/types";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import OrderModal from "../components/OrderModal";
import TowCalculatorModal from "../components/TowCalculatorModal";
import Skeleton from "../components/Skeleton";
import EquipmentCard from "../components/EquipmentCard";
import PageMeta from "../components/PageMeta";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { getServicesByEquipmentType } from "../data/services";
import type { Service } from "../data/services";
import { absoluteImageUrl, absoluteSiteUrl } from "../utils/seo";

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
const TOW_SERVICE_SLUG = "poslugy-evakuatora";
const TOW_SERVICE_NAME = "Послуги евакуатора";

export default function EquipmentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [item, setItem] = useState<Equipment | undefined>();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [relatedServices, setRelatedServices] = useState<Service[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    Promise.resolve().then(async () => {
      setLoading(true);
      const data = await getEquipmentBySlug(slug);
      if (cancelled) return;
      setActiveImageIndex(0);
      setItem(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!item) return;
    getServicesByEquipmentType(item.type).then(setRelatedServices);
  }, [item]);

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
        <PageMeta
          title="Техніку не знайдено"
          description="Запитану техніку не знайдено."
          noindex
        />
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
  const isTowCalculator = item.pricingType === "tow_calculator";
  const actionLabel = isTowCalculator ? "Замовити евакуацію" : "Замовити техніку";
  const seoImage = absoluteImageUrl(item.images[0]?.url);
  const canonical = absoluteSiteUrl(`/catalog/${item.slug}`);
  const galleryImages = item.images ?? [];
  const activeImage = galleryImages[activeImageIndex] ?? galleryImages[0];
  const hasMultipleImages = galleryImages.length > 1;

  function showPreviousImage() {
    setActiveImageIndex((current) => (
      current === 0 ? galleryImages.length - 1 : current - 1
    ));
  }

  function showNextImage() {
    setActiveImageIndex((current) => (
      current >= galleryImages.length - 1 ? 0 : current + 1
    ));
  }

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>{`${item.name} | Оренда ${item.brand} у Львові | TechnoRent`}</title>
        <meta
          name="description"
          content={`Оренда ${item.name} (${item.brand}) у Львові. ${formatPrice(item.pricePerHour, item.pricingType)}. ${item.description.slice(0, 120)}...`}
        />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={`${item.name} | Оренда у Львові | TechnoRent`} />
        <meta property="og:description" content={item.description.slice(0, 160)} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="product" />
        {seoImage && <meta property="og:image" content={seoImage} />}
        <meta name="twitter:card" content={seoImage ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={`${item.name} | Оренда у Львові | TechnoRent`} />
        <meta name="twitter:description" content={item.description.slice(0, 160)} />
        {seoImage && <meta name="twitter:image" content={seoImage} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: item.name,
            description: item.description,
            brand: { "@type": "Brand", name: item.brand },
            image: seoImage,
            offers: {
              "@type": "Offer",
              priceCurrency: "UAH",
              price: item.pricePerHour,
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: item.pricePerHour,
                priceCurrency: "UAH",
                unitText: isTowCalculator ? "км" : "година",
              },
              availability: "https://schema.org/InStock",
              url: canonical,
            },
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Техніка",
                item: absoluteSiteUrl("/catalog"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: item.name,
                item: canonical,
              },
            ],
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
        <div className="relative h-[420px] overflow-hidden rounded-2xl border border-border bg-[#2B2B2B] max-lg:h-[280px]">
          {activeImage && (
            <img
              src={activeImage.url}
              alt={activeImage.alt || `${item.name}, ${item.brand}, оренда у Львові`}
              className="h-full w-full object-cover"
              loading="eager"
              width={800}
              height={420}
            />
          )}

          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={showPreviousImage}
                aria-label="Попереднє фото"
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-bold text-dark shadow-lg transition hover:bg-primary"
              >
                ←
              </button>
              <button
                type="button"
                onClick={showNextImage}
                aria-label="Наступне фото"
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-bold text-dark shadow-lg transition hover:bg-primary"
              >
                →
              </button>

              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${image.url}-${index}`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`Показати фото ${index + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeImageIndex
                        ? "w-8 bg-primary"
                        : "w-2.5 bg-white/80 hover:bg-white"
                    }`}
                  />
                ))}
              </div>

              <div className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">
                {activeImageIndex + 1} / {galleryImages.length}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="flex h-[420px] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-white p-6 max-lg:h-auto">
          <h1 className="text-[44px] font-bold text-dark max-lg:text-3xl">{item.name}</h1>
          <p className="text-[15px] font-medium text-dark-text">{item.description}</p>
          <p className="text-[30px] font-bold text-primary">{formatPrice(item.pricePerHour, item.pricingType)}</p>
          <button
            onClick={() => setShowModal(true)}
            className="w-fit rounded-full bg-primary px-[18px] py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            {actionLabel}
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

      {/* Related services */}
      {relatedServices.length > 0 && (
          <section className="px-[120px] pb-2 pt-4 max-xl:px-8 max-md:px-5">
            <h2 className="mb-5 text-[26px] font-bold text-dark">
              Види робіт, які може виконувати ця техніка
            </h2>
            <div className="grid grid-cols-[repeat(3,minmax(0,340px))] justify-center gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
              {relatedServices.map((s) => (
                <div
                  key={s.slug}
                  className="flex flex-col gap-2 rounded-[14px] border border-border bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <h3 className="text-[15px] font-bold text-dark">{s.title}</h3>
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-dark-text">
                    {s.shortDescription}
                  </p>
                  <Link
                    to={`/services/${s.slug}`}
                    className="mt-auto inline-flex w-fit items-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-dark transition-opacity hover:opacity-90"
                  >
                    Детальніше
                  </Link>
                </div>
              ))}
            </div>
          </section>
      )}

      {/* Recently viewed */}
      {recentlyViewed.length > 0 && (
        <section className="px-[120px] pb-10 max-xl:px-8 max-md:px-5">
          <h2 className="mb-5 text-[26px] font-bold text-dark">Нещодавно переглянута техніка</h2>
          <div className="grid grid-cols-4 gap-5 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:flex max-md:flex-nowrap max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:scroll-smooth max-md:-mx-5 max-md:px-5 max-md:pb-4 max-md:gap-4">
            {recentlyViewed.slice(0, 4).map((eq) => (
              <EquipmentCard key={eq.id} item={eq} maxWidth />
            ))}
          </div>
        </section>
      )}

      <div className="mt-16" />
      <Footer />

      {showModal && (
        isTowCalculator ? (
          <TowCalculatorModal
            serviceSlug={TOW_SERVICE_SLUG}
            serviceName={TOW_SERVICE_NAME}
            priceInfo={`${item.pricePerHour} грн/км`}
            deliveryRatePerKm={item.pricePerHour}
            onClose={() => setShowModal(false)}
          />
        ) : (
          <OrderModal
            equipmentName={item.name}
            equipmentId={item.id}
            onClose={() => setShowModal(false)}
          />
        )
      )}
    </div>
  );
}
