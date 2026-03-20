import { Helmet } from "react-helmet-async";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";

const contactInfo = [
  {
    title: "Телефон",
    value: "+380 (67) 000-00-00",
    href: "tel:+380670000000",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Email",
    value: "info@technorent.ua",
    href: "mailto:info@technorent.ua",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
        <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
      </svg>
    ),
  },
  {
    title: "Графік роботи",
    value: "Пн-Сб: 08:00-20:00, Нд: черговий режим",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: "Локація",
    value: "Львів та Львівська область",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 3.824 3.024Zm.553-13.603a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function ContactsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>Контакти — TechnoRent | Зв'язатися з нами</title>
        <meta
          name="description"
          content="Контакти TechnoRent — оренда спецтехніки у Львові. Телефон, email, графік роботи. Зв'яжіться з нами для замовлення будівельної техніки."
        />
        <link rel="canonical" href="https://technorent.ua/contacts" />
      </Helmet>

      <Header />

      {/* Hero */}
      <section className="w-full bg-dark px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[42px] font-bold leading-tight text-white max-lg:text-3xl max-md:text-2xl">
            <span className="text-primary">Контакти</span>
          </h1>
          <p className="mt-3 text-base font-medium text-gray-300 max-md:text-sm">
            Зв'яжіться з нами для замовлення техніки або консультації
          </p>
        </div>
      </section>

      {/* Contact info + map */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="flex gap-8 max-lg:flex-col">
          {/* Left — contact cards */}
          <div className="flex w-full flex-col gap-4">
            {contactInfo.map((c) => (
              <div
                key={c.title}
                className="flex items-start gap-4 rounded-[14px] border border-border bg-white p-5 transition-shadow hover:shadow-md"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {c.icon}
                </span>
                <div>
                  <p className="text-xs font-bold text-dark-text">{c.title}</p>
                  {c.href ? (
                    <a
                      href={c.href}
                      className="mt-0.5 text-[15px] font-bold text-dark transition-colors hover:text-primary"
                    >
                      {c.value}
                    </a>
                  ) : (
                    <p className="mt-0.5 text-[15px] font-bold text-dark">{c.value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right — map */}
          <div className="h-[400px] w-full overflow-hidden rounded-[18px] border border-border max-lg:h-[300px]">
            <iframe
              title="TechnoRent на карті"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d164465.2578467064!2d23.858663!3d49.839683!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x473add7c09109a57%3A0x4223c517012378e2!2z0JvRjNCy0ZbQsg!5e0!3m2!1suk!2sua!4v1"
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[28px] font-bold text-dark max-md:text-xl">
            Маєте питання?
          </h2>
          <p className="mt-2 text-sm font-medium text-dark-text">
            Зателефонуйте нам або напишіть на email — відповімо протягом 30 хвилин
          </p>
          <div className="mt-6 flex justify-center gap-3 max-md:flex-col">
            <a
              href="tel:+380670000000"
              className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              Зателефонувати
            </a>
            <a
              href="mailto:info@technorent.ua"
              className="rounded-full border-2 border-dark bg-white px-8 py-3 text-sm font-bold text-dark transition-colors hover:bg-dark hover:text-white"
            >
              Написати email
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <MobileTabBar />
    </div>
  );
}
