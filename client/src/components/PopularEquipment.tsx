import { useState, useEffect } from "react";
import { getPopularEquipment } from "../data/equipment.service";
import type { Equipment } from "../data/types";
import EquipmentCard from "./EquipmentCard";

export default function PopularEquipment() {
  const [popular, setPopular] = useState<Equipment[]>([]);

  useEffect(() => {
    getPopularEquipment().then(setPopular);
  }, []);

  if (!popular.length) return null;

  return (
    <section className="flex w-full flex-col items-center px-[112px] pt-[90px] pb-[50px] max-xl:px-8 max-md:px-4">
      <h2 className="mb-[18px] text-center text-[40px] font-bold text-dark max-lg:text-3xl">
        Популярна техніка
      </h2>
      <div className="flex w-full flex-wrap justify-around gap-5 pt-3 max-md:flex-col">
        {popular.map((item) => (
          <EquipmentCard key={item.id} item={item} maxWidth />
        ))}
      </div>
    </section>
  );
}
