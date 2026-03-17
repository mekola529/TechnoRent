/** Тип техніки */
export type EquipmentType =
  | "excavator"      // Екскаватор
  | "loader"         // Навантажувач
  | "bulldozer"      // Бульдозер
  | "crane"          // Кран
  | "roller"         // Каток
  | "dump-truck"     // Самоскид
  | "concrete-mixer" // Бетонозмішувач
  | "generator"      // Генератор
  | "other";         // Інше

/** Локалізовані назви типів техніки */
export const equipmentTypeLabels: Record<EquipmentType, string> = {
  excavator: "Екскаватор",
  loader: "Навантажувач",
  bulldozer: "Бульдозер",
  crane: "Кран",
  roller: "Каток",
  "dump-truck": "Самоскид",
  "concrete-mixer": "Бетонозмішувач",
  generator: "Генератор",
  other: "Інше",
};

/** Проміжок часу, коли техніка зайнята */
export interface BookedPeriod {
  /** Початок бронювання (ISO 8601) */
  from: string;
  /** Кінець бронювання (ISO 8601) */
  to: string;
  /** Коментар — хто / який проєкт (опціонально) */
  note?: string;
}

/** Характеристики техніки (ключ-значення) */
export interface EquipmentSpec {
  label: string;
  value: string;
}

/** Зображення товару */
export interface EquipmentImage {
  url: string;
  alt: string;
}

/** Основна модель товару */
export interface Equipment {
  /** Унікальний ідентифікатор */
  id: string;
  /** URL-friendly текст (slug) */
  slug: string;
  /** Назва товару */
  name: string;
  /** Бренд (виробник) */
  brand: string;
  /** Тип техніки */
  type: EquipmentType;
  /** Опис товару */
  description: string;
  /** Технічні характеристики */
  specs: EquipmentSpec[];
  /** Зображення */
  images: EquipmentImage[];
  /** Вартість оренди (грн/год) */
  pricePerHour: number;
  /** Чи є товар популярним */
  isPopular: boolean;
  /** Періоди, коли техніка зайнята */
  bookedPeriods: BookedPeriod[];
}
