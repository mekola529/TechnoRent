import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MobileTabBar from "../components/MobileTabBar";
import { useOrderModal } from "../context/OrderModalContext";

const services = [
  {
    title: "Оренда екскаваторів",
    desc: "Гусеничні та колісні екскаватори для земляних робіт будь-якої складності. Копання котлованів, траншей, планування території.",
    icon: "🏗️",
  },
  {
    title: "Оренда навантажувачів",
    desc: "Фронтальні та телескопічні навантажувачі для переміщення будівельних матеріалів, вантажно-розвантажувальних робіт.",
    icon: "🚜",
  },
  {
    title: "Оренда бульдозерів",
    desc: "Потужні бульдозери для підготовки будівельних майданчиків, зняття ґрунту, планування та вирівнювання території.",
    icon: "🚧",
  },
  {
    title: "Оренда кранів",
    desc: "Автокрани та баштові крани для монтажних робіт, підйому важких конструкцій та обладнання на висоту.",
    icon: "🏢",
  },
  {
    title: "Оренда катків",
    desc: "Вібраційні та статичні катки для ущільнення ґрунту, асфальту та інших поверхонь при дорожньому будівництві.",
    icon: "🛞",
  },
  {
    title: "Оренда самоскидів",
    desc: "Самоскиди різної вантажопідйомності для перевезення сипучих матеріалів, ґрунту та будівельного сміття.",
    icon: "🚛",
  },
];

const advantages = [
  { title: "Техніка з оператором", desc: "Надаємо досвідчених операторів разом із технікою" },
  { title: "Гнучкі умови оренди", desc: "Погодинна, поденна або довгострокова оренда" },
  { title: "Доставка на об'єкт", desc: "Організуємо доставку техніки на ваш майданчик" },
  { title: "Технічне обслуговування", desc: "Вся техніка проходить регулярне ТО та справна" },
];

export default function ServicesPage() {
  const { openOrderModal } = useOrderModal();

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Helmet>
        <title>Послуги — TechnoRent | Оренда спецтехніки у Львові</title>
        <meta
          name="description"
          content="Послуги оренди будівельної техніки у Львові: екскаватори, навантажувачі, бульдозери, крани, катки, самоскиди. Техніка з оператором, доставка на об'єкт."
        />
        <link rel="canonical" href="https://technorent.ua/services" />
      </Helmet>

      <Header />
      <MobileTabBar />

      {/* Hero */}
      <section className="w-full bg-dark px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[42px] font-bold leading-tight text-white max-lg:text-3xl max-md:text-2xl">
            Оренда будівельної <span className="text-primary">техніки</span> у Львові
          </h1>
          <p className="mt-3 text-base font-medium text-gray-300 max-md:text-sm">
            Повний спектр послуг оренди будівельної техніки для вашого проєкту у Львові та Львівській області
          </p>
        </div>
      </section>

      {/* Debris removal — full-width banner */}
      <section className="w-full bg-dark px-[120px] max-xl:px-8 max-md:px-0">
        <div className="flex items-center gap-8 px-8 py-10 max-lg:flex-col max-lg:gap-5 max-lg:text-center max-md:px-4 max-md:py-8">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-5xl max-md:h-16 max-md:w-16 max-md:text-4xl">
            ♻️
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <h2 className="text-[26px] font-bold text-white max-md:text-xl">
              Вивіз будівельного <span className="text-primary">сміття</span>
            </h2>
            <p className="text-[15px] leading-relaxed font-medium text-gray-300 max-md:text-sm">
              Оперативно вивеземо будівельні відходи, бетон, цеглу, ґрунт та інше сміття з вашого
              об'єкта у Львові та області. Працюємо швидко і за графіком.
            </p>
          </div>
          <Link
            to="/vyviz-smittia"
            className="shrink-0 rounded-full bg-primary px-7 py-3.5 text-[14px] font-bold text-dark transition-opacity hover:opacity-90 max-lg:w-full max-lg:text-center"
          >
            Замовити вивіз сміття
          </Link>
        </div>
      </section>

      {/* Services grid */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {services.map((s) => (
            <div
              key={s.title}
              className="flex flex-col gap-3 rounded-[14px] border border-border bg-white p-5 transition-shadow hover:shadow-md"
            >
              <span className="text-3xl">{s.icon}</span>
              <h3 className="text-lg font-bold text-dark">{s.title}</h3>
              <p className="text-[13px] leading-relaxed text-dark-text">{s.desc}</p>
              <button
                onClick={() => openOrderModal()}
                className="mt-auto w-full rounded-full bg-primary py-2.5 text-center text-xs font-bold text-dark transition-opacity hover:opacity-90"
              >
                Замовити
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Advantages */}
      <section className="w-full bg-light-bg px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <h2 className="mb-8 text-center text-[32px] font-bold text-dark max-md:text-2xl">
          Що ми пропонуємо
        </h2>
        <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {advantages.map((a) => (
            <div key={a.title} className="flex gap-3 rounded-[14px] bg-white p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-dark">
                ✓
              </span>
              <div>
                <p className="text-[15px] font-bold text-dark">{a.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-dark-text">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="w-full px-[120px] py-14 max-xl:px-8 max-md:px-4 max-md:py-8">
        <div className="mx-auto max-w-2xl rounded-[18px] bg-dark p-10 text-center max-md:p-6">
          <h2 className="text-[28px] font-bold text-white max-md:text-xl">
            Потрібна техніка для проєкту?
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-300">
            Залиште заявку і ми підберемо оптимальне рішення для вашого завдання
          </p>
          <button
            onClick={() => openOrderModal()}
            className="mt-5 rounded-full bg-primary px-8 py-3 text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Залишити заявку
          </button>
        </div>
      </section>

      <Footer />
      
    </div>
  );
}
