import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import Hero from "../components/Hero";
import PopularEquipment from "../components/PopularEquipment";
import HowItWorks from "../components/HowItWorks";
import WhyChooseUs from "../components/WhyChooseUs";
import CallToAction from "../components/CallToAction";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "TechnoRent",
  description:
    "Оренда спецтехніки у Львові та Львівській області — екскаватори, навантажувачі, бульдозери, крани та інша будівельна техніка.",
  url: "https://technorent.ua",
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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>TechnoRent — Оренда спецтехніки у Львові | Екскаватори, навантажувачі, крани</title>
        <meta
          name="description"
          content="TechnoRent — оренда спецтехніки у Львові та Львівській області. Екскаватори, навантажувачі, бульдозери, крани. Власний парк техніки, досвідчені оператори, швидка подача."
        />
        <link rel="canonical" href="https://technorent.ua/" />
        <meta property="og:title" content="TechnoRent — Оренда спецтехніки у Львові" />
        <meta
          property="og:description"
          content="Оренда екскаваторів, навантажувачів, бульдозерів та іншої будівельної техніки у Львові. Власний парк, досвідчені оператори, швидка подача."
        />
        <meta property="og:url" content="https://technorent.ua/" />
        <script type="application/ld+json">{JSON.stringify(localBusinessJsonLd)}</script>
      </Helmet>

      <Header />
      <MobileTabBar />
      <main>
        <Hero />
        <HowItWorks />
        <PopularEquipment />
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
                  Оперативно вивеземо будівельні відходи, бетон, цеглу, ґрунт та інше сміття з вашого
                  об'єкта у Львові та області. Працюємо швидко і за графіком.
                </p>
              </div>

              {/* CTA */}
              <Link
                to="/services/debris-removal"
                className="shrink-0 rounded-full bg-primary px-7 py-3.5 text-[14px] font-bold text-dark transition-opacity hover:opacity-90 max-lg:w-full max-lg:text-center"
              >
                Детальніше
              </Link>
            </div>
          </div>
        </section>

        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
