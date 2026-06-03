import type { ReactNode } from "react";
import Header from "../Header";
import MobileTabBar from "../MobileTabBar";
import Footer from "../Footer";
import PageMeta from "../PageMeta";

interface AccountLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AccountLayout({ title, subtitle, children }: AccountLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <PageMeta title={`${title} | TechnoRent`} description={subtitle} noindex />
      <Header />
      <MobileTabBar />
      <main className="flex-1">
        <section className="px-[120px] pb-4 pt-8 max-xl:px-8 max-md:px-4 max-md:pt-5">
          <div className="max-w-[920px]">
            <h1 className="text-[42px] font-bold leading-tight text-dark max-md:text-[30px]">
              {title}
            </h1>
            <p className="mt-3 text-base font-medium leading-7 text-dark-text max-md:text-sm max-md:leading-6">
              {subtitle}
            </p>
          </div>
        </section>
        <section className="px-[120px] py-8 max-xl:px-8 max-md:px-4 max-md:py-5">
          {children}
        </section>
      </main>
      <Footer />
    </div>
  );
}
