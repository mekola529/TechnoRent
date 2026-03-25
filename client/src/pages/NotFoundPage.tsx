import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>Сторінку не знайдено — TechnoRent</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Header />
      <MobileTabBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 px-4 text-center">
        <span className="text-6xl font-bold text-primary">404</span>
        <h1 className="text-3xl font-bold text-dark">Сторінку не знайдено</h1>
        <p className="text-dark-text">
          Перевірте адресу або поверніться на головну сторінку.
        </p>
        <Link
          to="/"
          className="mt-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          На головну
        </Link>
      </div>

      <Footer />
    </div>
  );
}
