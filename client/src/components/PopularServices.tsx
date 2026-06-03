import { useEffect, useState } from "react";
import ServiceCard from "./ServiceCard";
import { getPopularServices, type Service } from "../data/services";

export default function PopularServices() {
  const [popular, setPopular] = useState<Service[]>([]);

  useEffect(() => {
    getPopularServices().then(setPopular).catch(() => setPopular([]));
  }, []);

  if (!popular.length) return null;

  return (
    <section className="flex w-full flex-col items-center bg-light-bg px-[120px] py-16 max-xl:px-8 max-md:px-4 max-md:py-10">
      <h2 className="mb-[18px] text-center text-[40px] font-bold text-dark max-lg:text-3xl">
        Популярні послуги
      </h2>
      <div className="flex w-full flex-wrap justify-around gap-5 pt-3 max-md:-mx-4 max-md:flex-nowrap max-md:justify-start max-md:overflow-x-auto max-md:scroll-smooth max-md:snap-x max-md:snap-mandatory max-md:px-4 max-md:pb-4">
        {popular.map((service) => (
          <ServiceCard key={service.id} service={service} maxWidth />
        ))}
      </div>
    </section>
  );
}
