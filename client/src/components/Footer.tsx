import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="w-full bg-dark px-[120px] py-10 max-xl:px-8 max-md:px-4">
      <div className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1">
        {/* Контакти */}
        <div className="flex flex-col gap-2">
          <h4 className="text-base font-bold text-white">Контакти</h4>
          <address className="not-italic text-[13px] font-medium leading-[1.5] text-gray-100">
            <a href="tel:+380670000000" aria-label="Зателефонувати">+380 (67) 000-00-00</a>
            <br />
            <a href="mailto:info@technorent.ua" aria-label="Написати email">info@technorent.ua</a>
          </address>
        </div>

        {/* Навігація */}
        <nav aria-label="Навігація сайтом" className="flex flex-col gap-2">
          <h4 className="text-base font-bold text-white">Навігація</h4>
          <div className="flex flex-col gap-1 text-[13px] font-medium leading-[1.5] text-gray-100">
            <Link to="/" className="hover:text-primary transition-colors">Головна</Link>
            <Link to="/catalog" className="hover:text-primary transition-colors">Техніка</Link>
            <Link to="/services" className="hover:text-primary transition-colors">Послуги</Link>
            <Link to="/services/vyviz-budivelnogo-smittia" className="hover:text-primary transition-colors">Вивіз сміття</Link>
            <Link to="/contacts" className="hover:text-primary transition-colors">Контакти</Link>
          </div>
        </nav>

        {/* Графік */}
        <div className="flex flex-col gap-2">
          <h4 className="text-base font-bold text-white">Графік</h4>
          <p className="text-[13px] font-medium leading-[1.5] text-gray-100">
            <time>Пн-Сб: 08:00-20:00</time>
            <br />
            Нд: черговий режим
          </p>
        </div>

        {/* Локація */}
        <div className="flex flex-col gap-2">
          <h4 className="text-base font-bold text-white">Локація</h4>
          <p className="text-[13px] font-medium leading-[1.5] text-gray-100">
            Львів та Львівська область
          </p>
        </div>
      </div>

      <div className="mt-8 border-t border-gray-700 pt-4 text-center text-xs font-medium text-gray-400">
        © {new Date().getFullYear()} TechnoRent. Всі права захищені.
      </div>
    </footer>
  );
}
