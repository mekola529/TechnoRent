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
    <section className="w-full px-[120px] max-xl:px-8 max-md:px-4">
      <h2 className="mb-[18px] text-[40px] font-bold text-dark max-lg:text-3xl">
        Популярна техніка
      </h2>
      <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
        {popular.map((item) => (
          <EquipmentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
