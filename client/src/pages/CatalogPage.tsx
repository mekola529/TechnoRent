import { useState, useEffect } from "react";
import PageMeta from "../components/PageMeta";
import {
  getAllEquipment,
  getUniqueBrands,
  getAvailableTypes,
} from "../data/equipment.service";
import { equipmentTypeLabels } from "../data/types";
import type { Equipment, EquipmentType } from "../data/types";
import EquipmentCard from "../components/EquipmentCard";
import Header from "../components/Header";
import Footer from "../components/Footer";

type SortOption = "popular" | "price-asc" | "price-desc" | "name";

const sortLabels: Record<SortOption, string> = {
  popular: "за популярністю",
  "price-asc": "ціна: від дешевих",
  "price-desc": "ціна: від дорогих",
  name: "за назвою",
};

export default function CatalogPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedType, setSelectedType] = useState<EquipmentType | "all">("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("popular");

  // Завантажити мета-дані один раз
  useEffect(() => {
    Promise.all([getUniqueBrands(), getAvailableTypes()]).then(([b, t]) => {
      setBrands(b);
      setTypes(t as EquipmentType[]);
    });
  }, []);

  // Завантажити техніку при зміні фільтрів
  useEffect(() => {
    setLoading(true);
    getAllEquipment({
      type: selectedType !== "all" ? selectedType : undefined,
      brand: selectedBrand !== "all" ? selectedBrand : undefined,
      sort: sort === "popular" ? undefined : sort,
    }).then((items) => {
      // Додаткове сортування "за популярністю" на клієнті
      if (sort === "popular") {
        items.sort((a, b) => Number(b.isPopular) - Number(a.isPopular));
      }
      setEquipment(items);
      setLoading(false);
    });
  }, [selectedType, selectedBrand, sort]);

  const resetFilters = () => {
    setSelectedType("all");
    setSelectedBrand("all");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <PageMeta
        title="Каталог спецтехніки — оренда екскаваторів, навантажувачів, кранів"
        description="Каталог будівельної техніки в оренду у Львові. Екскаватори, навантажувачі, бульдозери, крани, катки, самоскиди. Фільтруйте за категорією, брендом та ціною."
        canonical="https://technorent.ua/catalog"
      />
      <Header />

      {/* Title */}
      <section className="flex flex-col gap-2.5 px-[120px] pt-6 max-xl:px-8 max-md:px-4">
        <h1 className="text-[46px] font-bold text-dark max-lg:text-3xl">
          Каталог техніки
        </h1>
        <p className="text-base font-medium text-dark-text">
          Оберіть потрібну техніку за категорією, брендом та ціною.
        </p>
      </section>

      {/* Body: Filters + Grid */}
      <section className="flex gap-6 px-[120px] py-6 max-xl:px-8 max-lg:flex-col max-md:px-4">
        {/* Sidebar Filters */}
        <aside className="flex w-[300px] shrink-0 flex-col gap-3.5 rounded-2xl bg-light-bg p-[18px] max-lg:w-full">
          <h3 className="text-2xl font-bold text-dark">Фільтри</h3>

          {/* Категорія */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-dark">Категорія</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EquipmentType | "all")}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-dark-text outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Всі категорії</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {equipmentTypeLabels[type] ?? type}
                </option>
              ))}
            </select>
          </div>

          {/* Бренд */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-dark">Бренд</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-dark-text outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Всі бренди</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={resetFilters}
            className="mt-1 rounded-full bg-primary px-3.5 py-[11px] text-[13px] font-bold text-dark transition-opacity hover:opacity-90"
          >
            Скинути фільтри
          </button>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col gap-4">
          {/* Sort bar */}
          <div className="flex items-center justify-between rounded-xl bg-light-bg px-3.5 py-2.5">
            <span className="text-sm font-semibold text-dark">
              {loading ? "Завантаження..." : `${equipment.length} позицій`}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-dark-text">Сортування:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-lg border border-border bg-white px-2 py-1 text-sm font-medium text-dark-text outline-none focus:ring-2 focus:ring-primary"
              >
                {Object.entries(sortLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Equipment Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-lg font-medium text-dark-text">Завантаження...</p>
            </div>
          ) : equipment.length > 0 ? (
            <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
              {equipment.map((item) => (
                <EquipmentCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <p className="text-xl font-bold text-dark">Нічого не знайдено</p>
              <p className="text-sm text-dark-text">
                Спробуйте змінити параметри фільтрації
              </p>
              <button
                onClick={resetFilters}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-dark transition-opacity hover:opacity-90"
              >
                Скинути фільтри
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="mt-16" />
      <Footer />
    </div>
  );
}
