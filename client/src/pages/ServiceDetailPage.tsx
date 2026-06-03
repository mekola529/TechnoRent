import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import EquipmentCard from "../components/EquipmentCard";
import Skeleton from "../components/Skeleton";
import TowCalculatorModal from "../components/TowCalculatorModal";
import MaterialDeliveryCalculatorModal from "../components/MaterialDeliveryCalculatorModal";
import PageMeta from "../components/PageMeta";
import { absoluteImageUrl, absoluteSiteUrl } from "../utils/seo";
import { useOrderModal } from "../context/useOrderModal";
import { getServiceBySlug, getActiveServices } from "../data/services";
import { serviceEditorialContent } from "../data/serviceEditorialContent";
import type { Service } from "../data/services";
import { getEquipmentByTypes } from "../data/equipment.service";
import type { Equipment } from "../data/types";
import { trackPhoneClick } from "../lib/analytics";

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { openOrderModal } = useOrderModal();
  const [service, setService] = useState<Service | undefined>();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showTowCalculator, setShowTowCalculator] = useState(false);
  const [showMaterialDeliveryCalculator, setShowMaterialDeliveryCalculator] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const found = await getServiceBySlug(slug);
      if (cancelled) return;
      if (!found) {
        setNotFound(true);
        return;
      }
      setService(found);
      setLoadingEquipment(true);
      const items = await getEquipmentByTypes(found.relatedEquipmentTypes);
      if (!cancelled) {
        setEquipment(items);
        setLoadingEquipment(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Related services (exclude current, max 3)
  const [relatedServices, setRelatedServices] = useState<Service[]>([]);
  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    getActiveServices().then((all) => {
      if (cancelled) return;
      setRelatedServices(
        all
          .filter((s) => s.slug !== service.slug)
          .filter((s) =>
            s.relatedEquipmentTypes.some((t) =>
              service.relatedEquipmentTypes.includes(t)
            )
          )
          .slice(0, 3)
      );
    });
    return () => { cancelled = true; };
  }, [service]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-sans">
        <PageMeta
          title="Послугу не знайдено"
          description="Запитану послугу не знайдено."
          noindex
        />
        <Header />
        <MobileTabBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <h1 className="text-3xl font-bold text-dark">Послугу не знайдено</h1>
          <p className="text-dark-text">Перевірте URL або поверніться до списку послуг.</p>
          <Link
            to="/services"
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            До послуг
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-sans">
        <Header />
        <MobileTabBar />
        <div className="h-[420px] w-full animate-pulse bg-gray-200" />
        <div className="px-[120px] py-10 max-xl:px-8 max-md:px-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-full max-w-md" />
        </div>
        <Footer />
      </div>
    );
  }

  const isTowCalculator = service.pricingType === "tow_calculator";
  const isMaterialDeliveryCalculator = service.pricingType === "material_delivery_calculator";
  const openServiceAction = () => {
    if (isTowCalculator) {
      setShowTowCalculator(true);
      return;
    }
    if (isMaterialDeliveryCalculator) {
      setShowMaterialDeliveryCalculator(true);
      return;
    }

    openOrderModal({ serviceName: service.title });
  };

  const actionLabel = isTowCalculator
    ? "Розрахувати евакуацію"
    : isMaterialDeliveryCalculator
      ? "Розрахувати доставку"
      : "Замовити послугу";
  const secondaryActionLabel = isTowCalculator
    ? "Відкрити калькулятор"
    : isMaterialDeliveryCalculator
      ? "Відкрити калькулятор"
      : "Отримати розрахунок";
  const seoImage = absoluteImageUrl(service.image);
  const editorial = serviceEditorialContent[service.slug];
  const canonical = absoluteSiteUrl(`/services/${service.slug}`);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>{service.seoTitle}</title>
        <meta name="description" content={service.seoDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={service.seoTitle} />
        <meta property="og:description" content={service.seoDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        {seoImage && <meta property="og:image" content={seoImage} />}
        <meta name="twitter:card" content={seoImage ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={service.seoTitle} />
        <meta name="twitter:description" content={service.seoDescription} />
        {seoImage && <meta name="twitter:image" content={seoImage} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: service.title,
            description: service.seoDescription,
            image: seoImage,
            provider: {
              "@type": "LocalBusiness",
              name: "TechnoRent",
              url: absoluteSiteUrl("/"),
            },
            areaServed: {
              "@type": "Place",
              name: "Львів та Львівська область",
            },
            url: canonical,
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
                name: "Послуги",
                item: absoluteSiteUrl("/services"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: service.title,
                item: canonical,
              },
            ],
          })}
        </script>
        {editorial && (
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: editorial.faqs.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: item.answer,
                },
              })),
            })}
          </script>
        )}
      </Helmet>

      <Header />
      <MobileTabBar />

      {/* Breadcrumb */}
      <nav aria-label="Навігація" className="px-[120px] pt-2 max-xl:px-8 max-md:px-4">
        <ol className="flex text-[13px] font-medium text-dark-text">
          <li>
            <Link to="/services" className="transition-colors hover:text-primary">
              Послуги
            </Link>
          </li>
          <li className="mx-1">/</li>
          <li className="text-dark" aria-current="page">
            {service.title}
          </li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="relative mt-2 flex min-h-[380px] w-full items-center overflow-hidden max-md:min-h-[280px]">
        <img
          src={service.image}
          alt={service.title}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1920}
          height={380}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 flex w-full max-w-[720px] flex-col gap-3.5 px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-10">
          <h1 className="text-[44px] font-bold leading-tight text-white max-lg:text-3xl max-md:text-[26px]">
            {service.title}
          </h1>
          <p className="max-w-[540px] text-lg font-medium text-gray-100 max-md:text-base">
            {service.shortDescription}
          </p>
          <button
            onClick={openServiceAction}
            className="mt-1 w-fit rounded-full bg-primary px-7 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            {actionLabel}
          </button>
        </div>
      </section>

      {/* Main content: Description + Features | Price card */}
      <section className="grid grid-cols-[1fr_380px] items-stretch gap-6 px-[120px] py-8 max-xl:px-8 max-lg:grid-cols-1 max-md:px-4 max-md:py-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-4 text-[26px] font-bold text-dark max-md:text-xl">Про послугу</h2>
            {!editorial && (
              <p className="text-[15px] leading-relaxed text-dark-text">{service.fullDescription}</p>
            )}
            {editorial?.intro.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-[15px] leading-relaxed text-dark-text">
                {paragraph}
              </p>
            ))}
            {editorial?.relatedNote && (
              <p className="mt-4 rounded-xl bg-light-bg p-4 text-[14px] leading-relaxed text-dark-text">
                {editorial.relatedNote.text}{" "}
                <Link className="font-semibold text-dark underline decoration-primary underline-offset-2" to={editorial.relatedNote.linkTo}>
                  {editorial.relatedNote.linkLabel}
                </Link>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-4 text-[22px] font-bold text-dark">Що включено</h2>
            <ul className="flex flex-col gap-2.5">
              {service.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-dark">
                    ✓
                  </span>
                  <span className="text-[14px] font-medium text-dark-text">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column: Price card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-[22px] font-bold text-dark">Вартість</h2>
          <p className="text-[24px] font-bold leading-snug text-primary">{service.priceInfo}</p>
          <p className="text-[13px] leading-relaxed text-dark-text">
            {isTowCalculator
              ? "Вкажіть адресу завантаження та адресу доставки. Ми побудуємо маршрут і покажемо приблизну вартість евакуації."
              : isMaterialDeliveryCalculator
                ? "Оберіть матеріал, кількість і адресу доставки. Ми покажемо попередню вартість матеріалу та доставки."
              : "Вартість залежить від обсягу робіт, техніки та тривалості. У заявці вкажіть деталі, щоб менеджер підготував розрахунок."}
          </p>
          <div className="mt-auto flex flex-col gap-3">
            <button
              onClick={openServiceAction}
              className="w-full rounded-full bg-primary py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              {secondaryActionLabel}
            </button>
            <a
              href="tel:+380670000000"
              onClick={() => trackPhoneClick({ placement: `service_detail:${service.slug}` })}
              className="flex items-center justify-center gap-2 text-[13px] font-semibold text-dark-text transition-colors hover:text-dark"
            >
              📞 +380 (67) 000-00-00
            </a>
          </div>
        </div>
      </section>

      {editorial && (
        <section className="w-full bg-light-bg px-[120px] py-12 max-xl:px-8 max-md:px-4 max-md:py-8">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div className="rounded-2xl bg-white p-6">
              <h2 className="mb-4 text-[25px] font-bold text-dark max-md:text-xl">
                Коли варто замовити цю послугу
              </h2>
              <ul className="flex flex-col gap-3">
                {editorial.suitableFor.map((item) => (
                  <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-dark-text">
                    <span aria-hidden="true" className="mt-1 text-primary">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-6">
              <h2 className="mb-4 text-[25px] font-bold text-dark max-md:text-xl">
                Як організовуємо роботу
              </h2>
              <ol className="flex flex-col gap-4">
                {editorial.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-dark">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-bold text-dark">{step.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-dark-text">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {editorial && (
        <section className="w-full px-[120px] py-12 max-xl:px-8 max-md:px-4 max-md:py-8">
          <h2 className="mb-6 text-center text-[28px] font-bold text-dark max-md:text-xl">
            Поширені запитання
          </h2>
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {editorial.faqs.map((item) => (
              <details key={item.question} className="group rounded-[14px] border border-border bg-white p-4">
                <summary className="cursor-pointer list-none text-[15px] font-bold text-dark [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.question}
                    <span className="shrink-0 text-primary transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed text-dark-text">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Related equipment */}
      <section className="w-full px-[120px] py-12 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-6 text-[28px] font-bold text-dark max-md:text-xl">
          Техніка для цієї послуги
        </h2>
        {loadingEquipment ? (
          <div className="grid grid-cols-[repeat(4,minmax(0,280px))] justify-center gap-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <Skeleton className="h-[180px] w-full !rounded-xl" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : equipment.length > 0 ? (
          <div className="grid grid-cols-[repeat(4,minmax(0,280px))] justify-center gap-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {equipment.map((eq) => (
              <EquipmentCard key={eq.id} item={eq} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-dark-text">
            Наразі немає доступної техніки для цієї послуги. Зв'яжіться з нами для уточнення.
          </p>
        )}
      </section>

      {/* Related services */}
      {relatedServices.length > 0 && (
        <section className="w-full bg-light-bg px-[120px] py-12 max-xl:px-8 max-md:px-4 max-md:py-8">
          <h2 className="mb-6 text-[28px] font-bold text-dark max-md:text-xl">
            Пов'язані послуги
          </h2>
          <div className="grid grid-cols-[repeat(3,minmax(0,340px))] justify-center gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            {relatedServices.map((s) => (
              <Link
                key={s.slug}
                to={`/services/${s.slug}`}
                className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-white transition-shadow hover:shadow-md"
              >
                <div className="h-[140px] w-full overflow-hidden bg-light-bg">
                  <img
                    src={s.image}
                    alt={s.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    width={400}
                    height={140}
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <h3 className="text-[15px] font-bold text-dark">{s.title}</h3>
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-dark-text">
                    {s.shortDescription}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="w-full px-[120px] py-12 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-2xl rounded-[18px] bg-dark p-10 text-center max-md:p-6">
          <h2 className="text-[28px] font-bold text-white max-md:text-xl">
            Потрібна ця послуга?
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-300">
            Опишіть роботу й залиште номер телефону. Менеджер уточнить техніку, дату та вартість.
          </p>
          <button
            onClick={openServiceAction}
            className="mt-5 rounded-full bg-primary px-8 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            {isTowCalculator || isMaterialDeliveryCalculator ? "Розрахувати вартість" : "Залишити заявку"}
          </button>
        </div>
      </section>

      {showTowCalculator && (
        <TowCalculatorModal
          serviceSlug={service.slug}
          serviceName={service.title}
          priceInfo={service.priceInfo}
          deliveryRatePerKm={service.deliveryRatePerKm}
          onClose={() => setShowTowCalculator(false)}
        />
      )}

      {showMaterialDeliveryCalculator && (
        <MaterialDeliveryCalculatorModal
          serviceSlug={service.slug}
          serviceName={service.title}
          onClose={() => setShowMaterialDeliveryCalculator(false)}
        />
      )}

      <Footer />
    </div>
  );
}
