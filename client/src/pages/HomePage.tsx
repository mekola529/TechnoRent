import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import Hero from "../components/Hero";
import PopularEquipment from "../components/PopularEquipment";
import PopularServices from "../components/PopularServices";
import HowItWorks from "../components/HowItWorks";
import WhyChooseUs from "../components/WhyChooseUs";
import CallToAction from "../components/CallToAction";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import { DEFAULT_OG_IMAGE, absoluteSiteUrl } from "../utils/seo";

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "TechnoRent",
  description:
    "Оренда спецтехніки у Львові та області: екскаватори, навантажувачі, бульдозери, крани та інша техніка для будівельних робіт.",
  url: absoluteSiteUrl("/"),
  telephone: "+380670000000",
  email: "info@technorent.ua",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Львів",
    addressRegion: "Львівська область",
    addressCountry: "UA",
  },
  areaServed: {
    "@type": "GeoCircle",
    geoMidpoint: { "@type": "GeoCoordinates", latitude: 49.8397, longitude: 24.0297 },
    geoRadius: "100000",
  },
  openingHours: "Mo-Sa 08:00-20:00",
  priceRange: "$$",
};

const homeFaqItems = [
  {
    q: "Яку техніку можна орендувати?",
    a: "У каталозі є екскаватори, навантажувачі, бульдозери, автокрани, самоскиди та евакуатор. Потрібну машину підбираємо під ваше завдання.",
  },
  {
    q: "Як оформити оренду техніки?",
    a: "Оберіть машину в каталозі або опишіть роботу в заявці. Менеджер уточнить адресу, дату та умови подачі.",
  },
  {
    q: "Чи надаєте оператора разом з технікою?",
    a: "Для робіт, де потрібен оператор, техніку подаємо разом із ним. Деталі залежать від обраної машини та виду робіт.",
  },
  {
    q: "Яка мінімальна тривалість оренди?",
    a: "Мінімальний час залежить від техніки та виду робіт. Залиште заявку, і менеджер уточнить доступні умови.",
  },
];

const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: homeFaqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>TechnoRent | Оренда спецтехніки у Львові: екскаватори, крани, навантажувачі</title>
        <meta
          name="description"
          content="Оренда спецтехніки у Львові та області. Екскаватори, навантажувачі, бульдозери й крани для робіт на ділянці та будмайданчику."
        />
        <link rel="canonical" href={absoluteSiteUrl("/")} />
        <meta property="og:title" content="TechnoRent | Оренда спецтехніки у Львові" />
        <meta
          property="og:description"
          content="Оренда спецтехніки у Львові та області. Екскаватори, навантажувачі, бульдозери й крани для робіт на ділянці та будмайданчику."
        />
        <meta property="og:url" content={absoluteSiteUrl("/")} />
        <meta property="og:image" content={DEFAULT_OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TechnoRent | Оренда спецтехніки у Львові" />
        <meta
          name="twitter:description"
          content="Оренда спецтехніки у Львові та області. Екскаватори, навантажувачі, бульдозери й крани для робіт на ділянці та будмайданчику."
        />
        <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(localBusinessJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(homeFaqJsonLd)}</script>
      </Helmet>

      <Header />
      <MobileTabBar />
      <main>
        <Hero />
        <HowItWorks />
        <PopularEquipment />
        <PopularServices />
        <WhyChooseUs />

        {/* Debris removal promo */}
        <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
          <div className="relative overflow-hidden rounded-[18px] bg-dark px-8 py-10 max-md:px-5 max-md:py-8">
            {/* Accent line */}
            <div className="absolute top-0 left-0 h-full w-1.5 bg-primary" />

            <div className="flex items-center gap-8 max-lg:flex-col max-lg:gap-5">
              {/* Icon */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-5xl max-md:h-16 max-md:w-16 max-md:text-4xl">
                ♻️
              </div>

              {/* Text */}
              <div className="flex flex-1 flex-col gap-2 max-lg:text-center">
                <h2 className="text-[26px] font-bold text-white max-md:text-xl">
                  Вивіз будівельного <span className="text-primary">сміття</span>
                </h2>
                <p className="text-[15px] leading-relaxed font-medium text-gray-300 max-md:text-sm">
                  Вивеземо бетон, цеглу, ґрунт та інші будівельні відходи з об'єкта у Львові
                  або області. За заявкою уточнимо обсяг, під'їзд і потрібну техніку.
                </p>
              </div>

              {/* CTA */}
              <Link
                to="/services/vyviz-budivelnogo-smittia"
                className="shrink-0 rounded-full bg-primary px-7 py-3.5 text-[14px] font-bold text-dark transition-opacity hover:opacity-90 max-lg:w-full max-lg:text-center"
              >
                Замовити вивіз сміття
              </Link>
            </div>
          </div>
        </section>

        <CallToAction />

        {/* FAQ */}
        <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
          <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
            Часті запитання
          </h2>
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {homeFaqItems.map((item) => (
              <details
                key={item.q}
                className="group rounded-[14px] border border-border bg-white p-4"
              >
                <summary className="cursor-pointer list-none text-[15px] font-bold text-dark [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.q}
                    <span className="shrink-0 text-primary transition-transform group-open:rotate-45">＋</span>
                  </span>
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed text-dark-text">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
