import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="w-full border-b border-border bg-white">
      <div className="mx-auto flex items-center justify-between px-[120px] py-4 max-xl:px-8 max-md:px-4">
        {/* Logo */}
        <Link to="/" className="text-[28px] font-bold text-dark">
          TechnoRent
        </Link>

        {/* Navigation */}
        <nav aria-label="Основна навігація" className="hidden items-center gap-7 md:flex">
          <Link to="/" className="text-sm font-semibold text-dark hover:text-primary transition-colors">
            Головна
          </Link>
          <Link to="/catalog" className="text-sm font-semibold text-dark-text hover:text-primary transition-colors">
            Техніка
          </Link>
          <Link to="/services" className="text-sm font-semibold text-dark-text hover:text-primary transition-colors">
            Послуги
          </Link>
          <Link to="/contacts" className="text-sm font-semibold text-dark-text hover:text-primary transition-colors">
            Контакти
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3.5">
          <a
            href="tel:+380670000000"
            className="hidden text-sm font-semibold text-dark lg:block"
            aria-label="Зателефонувати +380 67 000 00 00"
          >
            +380 (67) 000-00-00
          </a>
          <a
            href="#order"
            className="rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark transition-opacity hover:opacity-90"
          >
            Замовити техніку
          </a>
        </div>
      </div>
    </header>
  );
}
