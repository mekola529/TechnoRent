import { Helmet } from "react-helmet-async";
import Header from "../components/Header";
import Hero from "../components/Hero";
import PopularEquipment from "../components/PopularEquipment";
import HowItWorks from "../components/HowItWorks";
import WhyChooseUs from "../components/WhyChooseUs";
import CallToAction from "../components/CallToAction";
import Footer from "../components/Footer";

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
      <main>
        <Hero />
        <HowItWorks />
        <PopularEquipment />
        <WhyChooseUs />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
