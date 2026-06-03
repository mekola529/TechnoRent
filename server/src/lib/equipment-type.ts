export const BUILTIN_EQUIPMENT_TYPES_UA = [
  "Екскаватор",
  "Навантажувач",
  "Бульдозер",
  "Кран",
  "Каток",
  "Самоскид",
  "Бетонозмішувач",
  "Генератор",
  "Інше",
] as const;

const equipmentTypeAliases = new Map<string, string>([
  ["excavator", "Екскаватор"],
  ["екскаватор", "Екскаватор"],
  ["loader", "Навантажувач"],
  ["навантажувач", "Навантажувач"],
  ["bulldozer", "Бульдозер"],
  ["бульдозер", "Бульдозер"],
  ["crane", "Кран"],
  ["кран", "Кран"],
  ["roller", "Каток"],
  ["каток", "Каток"],
  ["dump truck", "Самоскид"],
  ["dump_truck", "Самоскид"],
  ["dump-truck", "Самоскид"],
  ["самоскид", "Самоскид"],
  ["concrete mixer", "Бетонозмішувач"],
  ["concrete_mixer", "Бетонозмішувач"],
  ["concrete-mixer", "Бетонозмішувач"],
  ["бетонозмішувач", "Бетонозмішувач"],
  ["generator", "Генератор"],
  ["генератор", "Генератор"],
  ["other", "Інше"],
  ["інше", "Інше"],
]);

export function normalizeEquipmentTypeValue(value: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return "";

  const aliasKey = compact
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  const known = equipmentTypeAliases.get(aliasKey);
  if (known) return known;

  return compact.charAt(0).toUpperCase() + compact.slice(1);
}
