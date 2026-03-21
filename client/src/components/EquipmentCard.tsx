import { Link } from "react-router-dom";
import type { Equipment } from "../data/types";
import { equipmentTypeLabels } from "../data/types";
import { formatPrice } from "../data/equipment.service";

interface EquipmentCardProps {
  item: Equipment;
  maxWidth?: boolean;
}

export default function EquipmentCard({ item, maxWidth }: EquipmentCardProps) {
  return (
    <Link
      to={`/catalog/${item.slug}`}
      className={`flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-lg${maxWidth ? ' w-[281px] max-md:w-[260px] max-md:shrink-0 max-md:snap-center' : ''}`}
    >
      <div className="h-[180px] w-full shrink-0 overflow-hidden rounded-xl bg-[#F5F5F5]">
        {item.images[0]?.url && (
          <img
            src={item.images[0].url}
            alt={`${item.name} — оренда ${equipmentTypeLabels[item.type]} у Львові`}
            className="h-full w-full object-cover object-center"
            loading="lazy"
            width={400}
            height={180}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <h3 className="text-[22px] font-bold text-dark">{item.name}</h3>
        <span className="rounded-full bg-light-bg px-2.5 py-0.5 text-xs font-semibold text-dark-text">
          {equipmentTypeLabels[item.type]}
        </span>
      </div>
      <p className="text-[15px] font-semibold text-dark-text">
        {formatPrice(item.pricePerHour)}
      </p>
      <span className="inline-flex w-fit items-center justify-center rounded-full bg-primary px-4 py-[11px] text-[13px] font-bold text-dark transition-opacity hover:opacity-90">
        Детальніше
      </span>
    </Link>
  );
}
