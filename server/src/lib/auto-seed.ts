import { pool } from "./db.js";
import { hash } from "bcryptjs";
import { normalizeEquipmentTypeValue } from "./equipment-type.js";

type EquipmentType = string;
type PricingType =
  | "fixed_from"
  | "hourly_from"
  | "calculator"
  | "tow_calculator"
  | "material_delivery_calculator"
  | "custom";

function mapType(t: string): EquipmentType {
  return normalizeEquipmentTypeValue(t);
}

const equipmentList = [
  {
    slug: "jcb-3cx",
    name: "JCB 3CX",
    brand: "JCB",
    type: "excavator",
    description:
      "Екскаватор-навантажувач JCB 3CX підходить для копання траншей, переміщення ґрунту та навантаження матеріалів на ділянці.",
    pricePerHour: 1200,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "74 кВт (100 к.с.)" },
      { label: "Глибина копання", value: "5.46 м" },
      { label: "Об'єм ковша", value: "1.0 м³" },
      { label: "Маса", value: "8 200 кг" },
      { label: "Рік випуску", value: "2021" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1652922660696-60c68ec51582?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "JCB 3CX, екскаватор-навантажувач",
      },
    ],
    bookedPeriods: [] as { from: string; to: string; note?: string }[],
  },
  {
    slug: "cat-938",
    name: "CAT 938",
    brand: "Caterpillar",
    type: "loader",
    description:
      "Фронтальний навантажувач Caterpillar 938 використовують для переміщення піску, гравію, ґрунту та будівельних відходів.",
    pricePerHour: 1450,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "127 кВт (170 к.с.)" },
      { label: "Об'єм ковша", value: "2.5 м³" },
      { label: "Вантажопідйомність", value: "4 500 кг" },
      { label: "Маса", value: "13 500 кг" },
      { label: "Рік випуску", value: "2022" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1758798347934-633347ee2812?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "CAT 938, фронтальний навантажувач",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "volvo-ec220",
    name: "Volvo EC220",
    brand: "Volvo",
    type: "excavator",
    description:
      "Гусеничний екскаватор Volvo EC220 потрібен для котлованів, земляних робіт і демонтажу, коли на майданчику є місце для гусеничної техніки.",
    pricePerHour: 1600,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "122 кВт (166 к.с.)" },
      { label: "Глибина копання", value: "6.7 м" },
      { label: "Об'єм ковша", value: "1.4 м³" },
      { label: "Маса", value: "22 200 кг" },
      { label: "Рік випуску", value: "2020" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1647978403048-2e5099133ea3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "Volvo EC220, гусеничний екскаватор",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "cat-d6",
    name: "CAT D6",
    brand: "Caterpillar",
    type: "bulldozer",
    description:
      "Бульдозер Caterpillar D6 використовують для планування ґрунту, розчистки ділянки та переміщення матеріалу по майданчику.",
    pricePerHour: 1800,
    isPopular: false,
    specs: [
      { label: "Потужність двигуна", value: "158 кВт (215 к.с.)" },
      { label: "Ширина відвалу", value: "3.9 м" },
      { label: "Маса", value: "20 000 кг" },
      { label: "Рік випуску", value: "2023" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "CAT D6, бульдозер",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "liebherr-ltm-1060",
    name: "Liebherr LTM 1060",
    brand: "Liebherr",
    type: "crane",
    description:
      "Автомобільний кран Liebherr LTM 1060 підіймає конструкції та обладнання вагою до 60 тонн. Перед замовленням потрібно уточнити вагу й висоту підйому.",
    pricePerHour: 2500,
    isPopular: false,
    specs: [
      { label: "Вантажопідйомність", value: "60 т" },
      { label: "Довжина стріли", value: "48 м" },
      { label: "Потужність двигуна", value: "270 кВт (367 к.с.)" },
      { label: "Маса", value: "48 000 кг" },
      { label: "Рік випуску", value: "2019" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "Liebherr LTM 1060, автомобільний кран",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "man-tgs-33400",
    name: "MAN TGS 33.400",
    brand: "MAN",
    type: "dump-truck",
    description:
      "Самоскид MAN TGS 33.400 перевозить пісок, щебінь, ґрунт і будівельні відходи між майданчиками.",
    pricePerHour: 950,
    isPopular: false,
    specs: [
      { label: "Вантажопідйомність", value: "20 т" },
      { label: "Об'єм кузова", value: "16 м³" },
      { label: "Потужність двигуна", value: "294 кВт (400 к.с.)" },
      { label: "Рік випуску", value: "2021" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "MAN TGS 33.400, самоскид",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "evakuator-renault",
    name: "Евакуатор Renault",
    brand: "Renault",
    type: "other",
    description:
      "Евакуатор Renault перевозить легкові авто, кросовери та малий комерційний транспорт після поломки або ДТП у Львові й області.",
    pricePerHour: 1400,
    isPopular: true,
    specs: [
      { label: "Тип платформи", value: "Зсувна платформа" },
      { label: "Вантажопідйомність", value: "до 3.5 т" },
      { label: "Лебідка", value: "електрична" },
      { label: "Рік випуску", value: "2018" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "Евакуатор Renault",
      },
    ],
    bookedPeriods: [],
  },
];

const servicesList: {
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: PricingType;
  deliveryRatePerKm?: number | null;
  relatedEquipmentTypes: EquipmentType[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isPopular?: boolean;
  sortOrder: number;
}[] = [
  {
    slug: "vyviz-budivelnogo-smittia",
    title: "Вивіз будівельного сміття",
    shortDescription: "Вивіз бетону, цегли, ґрунту та інших будівельних відходів з об'єктів у Львові та області.",
    fullDescription: "Після ремонту або демонтажу вкажіть адресу, вид відходів і приблизний обсяг. За цими даними підберемо самоскид та, якщо потрібно, техніку для завантаження.",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "Вартість розраховуємо за обсягом, видом відходів і адресою",
    pricingType: "custom" as PricingType,
    relatedEquipmentTypes: ["dump_truck", "loader"] as EquipmentType[],
    features: ["Вивіз бетону, цегли, ґрунту й деревини", "Завантаження технікою за потреби", "Подача самоскида на погоджену адресу", "Робота з приватними та комерційними об'єктами"],
    seoTitle: "Вивіз будівельного сміття у Львові | TechnoRent",
    seoDescription: "Вивіз будівельного сміття у Львові та області. Уточніть обсяг і адресу, щоб підібрати техніку та розрахувати вартість.",
    isPopular: true,
    sortOrder: 1,
  },
  {
    slug: "kopannia-transheyi",
    title: "Копання траншей",
    shortDescription: "Копання траншей екскаватором для прокладання комунікацій, фундаментів та дренажних систем.",
    fullDescription: "Копаємо траншеї під водопровід, каналізацію, кабелі, дренаж і фундаментні роботи. Для підбору екскаватора потрібно знати довжину, ширину, глибину та доступ до ділянки.",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 1 200 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["excavator"] as EquipmentType[],
    features: ["Траншеї для комунікацій і дренажу", "Копання під фундаментні роботи", "Підбір екскаватора за розмірами траншеї", "Вивезення ґрунту за окремим погодженням"],
    seoTitle: "Копання траншей екскаватором у Львові | TechnoRent",
    seoDescription: "Копання траншей для комунікацій та фундаментів у Львові.",
    sortOrder: 2,
  },
  {
    slug: "ryttia-kotlovaniv",
    title: "Риття котлованів",
    shortDescription: "Котловани під фундамент, басейн або підземні конструкції з можливістю вивезення ґрунту.",
    fullDescription: "Риємо котловани під фундамент, басейн та інші конструкції. Перед роботою уточнюємо розміри виїмки, умови заїзду техніки і куди подіти надлишковий ґрунт.",
    image: "https://images.unsplash.com/photo-1647978403048-2e5099133ea3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 1 200 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["excavator", "dump_truck"] as EquipmentType[],
    features: ["Котловани під фундаменти й басейни", "Робота за заданими розмірами", "Навантаження та вивезення ґрунту", "Підбір техніки за умовами ділянки"],
    seoTitle: "Риття котлованів у Львові | TechnoRent",
    seoDescription: "Риття котлованів для фундаментів та будівництва у Львові.",
    isPopular: true,
    sortOrder: 3,
  },
  {
    slug: "planuvannia-dilianky",
    title: "Планування ділянки",
    shortDescription: "Вирівнювання та планування земельних ділянок бульдозером і навантажувачем перед будівництвом.",
    fullDescription: "Вирівнюємо ділянку перед фундаментом, дорогою або облаштуванням території. За потреби знімаємо верхній шар ґрунту та переміщуємо його в межах майданчика.",
    image: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 1 450 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["bulldozer", "loader"] as EquipmentType[],
    features: ["Вирівнювання рельєфу", "Зняття верхнього шару ґрунту", "Підготовка під фундамент або дорогу", "Підбір техніки за площею ділянки"],
    seoTitle: "Планування ділянки у Львові | TechnoRent",
    seoDescription: "Планування та вирівнювання земельних ділянок у Львові.",
    sortOrder: 4,
  },
  {
    slug: "demontazhni-roboty",
    title: "Демонтажні роботи",
    shortDescription: "Демонтаж будівель, конструкцій та споруд із використанням екскаваторів та вивозом залишків.",
    fullDescription: "Демонтуємо фундаменти, перегородки та інші конструкції спецтехнікою. До початку робіт уточнюємо матеріал конструкції, доступ техніки й порядок вивезення залишків.",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "ціна розраховується індивідуально",
    pricingType: "custom" as PricingType,
    relatedEquipmentTypes: ["excavator", "dump_truck"] as EquipmentType[],
    features: ["Демонтаж конструкцій і фундаментів", "Робота з гідромолотом за потреби", "Вивіз відходів за погодженням", "Оцінка доступу техніки до об'єкта"],
    seoTitle: "Демонтажні роботи у Львові | TechnoRent",
    seoDescription: "Демонтаж будівель та конструкцій у Львові.",
    sortOrder: 5,
  },
  {
    slug: "zavantazhennia-ta-vyvezennia-gruntu",
    title: "Завантаження та вивезення ґрунту",
    shortDescription: "Завантаження ґрунту навантажувачем або екскаватором та вивезення самоскидами з будмайданчика.",
    fullDescription: "Вивозимо ґрунт після котлованів, траншей та планування. Навантажувач або екскаватор працює разом із самоскидом, якщо на об'єкті потрібне завантаження.",
    image: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 950 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["loader", "dump_truck", "excavator"] as EquipmentType[],
    features: ["Завантаження екскаватором або навантажувачем", "Вивезення самоскидом", "Погодження місця доставки ґрунту", "Кілька машин для потрібного обсягу"],
    seoTitle: "Завантаження та вивезення ґрунту у Львові | TechnoRent",
    seoDescription: "Завантаження та вивезення ґрунту у Львові.",
    sortOrder: 6,
  },
  {
    slug: "perevezennia-sypuchyh-materialiv",
    title: "Доставка сипучих матеріалів",
    shortDescription: "Пісок, щебінь, гравій або чорнозем із доставкою самоскидом на вашу адресу.",
    fullDescription: "Оберіть матеріал, кількість і адресу доставки. Калькулятор покаже попередню суму за матеріал і перевезення, а менеджер підтвердить наявність і машину.",
    image: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "Попередній розрахунок за матеріалом, кількістю та адресою доставки",
    pricingType: "material_delivery_calculator" as PricingType,
    deliveryRatePerKm: 45,
    relatedEquipmentTypes: ["dump_truck"] as EquipmentType[],
    features: ["Вибір доступного матеріалу", "Розрахунок матеріалу й доставки", "Самоскид для вказаного обсягу", "Подача після підтвердження заявки"],
    seoTitle: "Доставка сипучих матеріалів у Львові | TechnoRent",
    seoDescription: "Доставка піску, щебеню та чорнозему у Львові й області. Оберіть матеріал і адресу для попереднього розрахунку.",
    isPopular: true,
    sortOrder: 7,
  },
  {
    slug: "montazhni-ta-pidyomni-roboty",
    title: "Монтажні та підйомні роботи",
    shortDescription: "Монтаж конструкцій, підйом важких вантажів та встановлення обладнання автокраном.",
    fullDescription: "Автокран Liebherr підіймає конструкції та обладнання вагою до 60 тонн. Для розрахунку потрібні вага вантажу, висота, радіус подачі й місце встановлення крана.",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 2 500 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["crane"] as EquipmentType[],
    features: ["Вантажопідйомність до 60 тонн", "Висота підйому до 48 м", "Монтаж конструкцій та обладнання", "Подача крана з оператором"],
    seoTitle: "Монтажні та підйомні роботи у Львові | TechnoRent",
    seoDescription: "Монтажні роботи автокраном у Львові.",
    sortOrder: 8,
  },
  {
    slug: "pidgotovka-dilianky-do-budivnytstva",
    title: "Підготовка ділянки до будівництва",
    shortDescription: "Розчистка ділянки, зняття ґрунту та вирівнювання майданчика перед будівництвом.",
    fullDescription: "Перед будівництвом розчищаємо територію, знімаємо верхній шар ґрунту та вирівнюємо майданчик. Перелік робіт залежить від стану ділянки.",
    image: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "ціна розраховується індивідуально",
    pricingType: "custom" as PricingType,
    relatedEquipmentTypes: ["bulldozer", "excavator", "loader"] as EquipmentType[],
    features: ["Розчистка від рослинності та споруд", "Зняття ґрунту й планування", "Поєднання кількох машин за потреби", "Вивезення зайвого матеріалу за погодженням"],
    seoTitle: "Підготовка ділянки до будівництва у Львові | TechnoRent",
    seoDescription: "Комплексна підготовка будівельного майданчика у Львові.",
    sortOrder: 9,
  },
  {
    slug: "zemliani-roboty",
    title: "Земляні роботи",
    shortDescription: "Копання, переміщення ґрунту та вирівнювання ділянок на приватних і комерційних об'єктах.",
    fullDescription: "Виконуємо копання, переміщення та планування ґрунту. За описом робіт і адресою підберемо екскаватор, бульдозер або потрібне поєднання техніки.",
    image: "https://images.unsplash.com/photo-1652922660696-60c68ec51582?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "від 1 200 грн/год",
    pricingType: "hourly_from" as PricingType,
    relatedEquipmentTypes: ["excavator", "bulldozer"] as EquipmentType[],
    features: ["Копання, переміщення і планування ґрунту", "Приватні та комерційні об'єкти", "Техніка за обсягом роботи", "Подача з оператором за потреби"],
    seoTitle: "Земляні роботи у Львові | TechnoRent",
    seoDescription: "Земляні роботи у Львові та області.",
    sortOrder: 10,
  },
  {
    slug: "poslugy-evakuatora",
    title: "Послуги евакуатора",
    shortDescription: "Евакуація легкових авто, кросоверів і комерційного транспорту у Львові та області з виїздом на місце.",
    fullDescription: "Перевозимо автомобілі, які не можуть їхати самостійно, після поломки або ДТП. Вкажіть адресу завантаження, пункт доставки та стан авто. Вартість залежить від маршруту й умов завантаження.",
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
    priceInfo: "35 грн/км",
    pricingType: "tow_calculator" as PricingType,
    deliveryRatePerKm: 35,
    relatedEquipmentTypes: ["other"] as EquipmentType[],
    features: ["Виїзд по Львову та області", "Перевезення авто після ДТП або поломки", "Доставка на СТО, стоянку або за адресою клієнта", "Допомога з завантаженням і фіксацією транспорту"],
    seoTitle: "Послуги евакуатора у Львові | TechnoRent",
    seoDescription: "Евакуатор у Львові та області для перевезення авто після поломки або ДТП. Вкажіть маршрут, щоб отримати розрахунок.",
    isPopular: true,
    sortOrder: 11,
  },
];

const HUMANIZED_PUBLIC_COPY_REVISION = "public-copy-humanizer-v2";

async function applyHumanizedPublicCopyOnce() {
  const { rows } = await pool.query(
    `SELECT "key" FROM "SiteSetting" WHERE "key" = $1 LIMIT 1`,
    [HUMANIZED_PUBLIC_COPY_REVISION],
  );
  if (rows.length > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of equipmentList) {
      await client.query(
        `UPDATE "Equipment" SET "description" = $1, "updatedAt" = NOW() WHERE "slug" = $2`,
        [item.description, item.slug],
      );
      for (const image of item.images) {
        await client.query(
          `UPDATE "EquipmentImage" SET "alt" = $1
           WHERE "equipmentId" IN (SELECT "id" FROM "Equipment" WHERE "slug" = $2)
             AND "url" = $3`,
          [image.alt, item.slug, image.url],
        );
      }
    }

    for (const service of servicesList) {
      await client.query(
        `UPDATE "Service"
         SET "title" = $1, "shortDescription" = $2, "fullDescription" = $3, "priceInfo" = $4,
             "pricingType" = $5, "deliveryRatePerKm" = $6, "features" = $7,
             "seoTitle" = $8, "seoDescription" = $9, "updatedAt" = NOW()
         WHERE "slug" = $10`,
        [
          service.title,
          service.shortDescription,
          service.fullDescription,
          service.priceInfo,
          service.pricingType,
          service.deliveryRatePerKm ?? null,
          service.features,
          service.seoTitle,
          service.seoDescription,
          service.slug,
        ],
      );
    }

    await client.query(
      `UPDATE "Service"
       SET "shortDescription" = $1, "fullDescription" = $2, "features" = $3,
           "seoTitle" = $4, "seoDescription" = $5, "updatedAt" = NOW()
       WHERE "slug" = 'dostavka-sypuchykh-materialiv'`,
      [
        "Замовлення піску, щебеню, чорнозему або іншого матеріалу разом із доставкою самоскидом.",
        "Оберіть матеріал, кількість і адресу доставки. Калькулятор покаже попередню суму за матеріал і перевезення, а менеджер підтвердить наявність та транспорт.",
        [
          "Вибір доступного матеріалу",
          "Розрахунок матеріалу й доставки",
          "Подача самоскида за підтвердженою заявкою",
        ],
        "Доставка сипучих матеріалів у Львові | TechnoRent",
        "Доставка піску, щебеню та чорнозему у Львові й області. Оберіть матеріал і адресу для попереднього розрахунку.",
      ],
    );

    await client.query(
      `INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("key") DO NOTHING`,
      [HUMANIZED_PUBLIC_COPY_REVISION, JSON.stringify({ applied: true })],
    );
    await client.query("COMMIT");
    console.log("  Public site copy updated to humanizer revision v2");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function autoSeed() {
  console.log("🌱 Auto-seeding database...");

  // Створити адміна лише якщо облікові дані явно задані в env
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const allowAdminSeed =
    process.env.NODE_ENV !== "production" || process.env.ADMIN_AUTO_SEED === "true";
  if (!allowAdminSeed) {
    console.warn("  ⚠️ Admin auto-seed skipped in production. Set ADMIN_AUTO_SEED=true only for controlled setup.");
  } else if (!adminEmail || !adminPassword) {
    console.warn("  ⚠️ Admin auto-seed skipped: ADMIN_EMAIL / ADMIN_PASSWORD are not configured");
  } else {
    const { rows: existingAdmin } = await pool.query(
      `SELECT "id" FROM "Admin" WHERE "email" = $1`,
      [adminEmail],
    );
    if (existingAdmin.length === 0) {
      const passwordHash = await hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO "Admin" ("email", "passwordHash", "role") VALUES ($1, $2, 'ADMIN')`,
        [adminEmail, passwordHash],
      );
      console.log(`  ✅ Admin created: ${adminEmail}`);
    }
  }

  // Створити відсутню техніку
  for (const item of equipmentList) {
      const { rows: existingEquipment } = await pool.query(
        `SELECT "id" FROM "Equipment" WHERE "slug" = $1 LIMIT 1`,
        [item.slug],
      );

      if (existingEquipment.length > 0) {
        continue;
      }

      const eqType = mapType(item.type);
      const { rows: eqRows } = await pool.query(
        `INSERT INTO "Equipment" ("slug", "name", "brand", "type", "description", "pricePerHour", "isPopular")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
        [item.slug, item.name, item.brand, eqType, item.description, item.pricePerHour, item.isPopular],
      );
      const eqId = eqRows[0].id;

      for (const spec of item.specs) {
        await pool.query(
          `INSERT INTO "EquipmentSpec" ("label", "value", "equipmentId") VALUES ($1, $2, $3)`,
          [spec.label, spec.value, eqId],
        );
      }
      for (const img of item.images) {
        await pool.query(
          `INSERT INTO "EquipmentImage" ("url", "alt", "equipmentId") VALUES ($1, $2, $3)`,
          [img.url, img.alt, eqId],
        );
      }
      for (const bp of item.bookedPeriods) {
        await pool.query(
          `INSERT INTO "BookedPeriod" ("from", "to", "note", "equipmentId") VALUES ($1, $2, $3, $4)`,
          [new Date(bp.from), new Date(bp.to), bp.note ?? null, eqId],
        );
      }

      console.log(`  ✅ ${item.name}`);
  }

  // Створити відсутні послуги
  for (const svc of servicesList) {
      const { rows: existingService } = await pool.query(
        `SELECT "id" FROM "Service" WHERE "slug" = $1 LIMIT 1`,
        [svc.slug],
      );

      if (existingService.length > 0) {
        continue;
      }

      await pool.query(
        `INSERT INTO "Service" ("slug", "title", "shortDescription", "fullDescription", "image", "priceInfo", "pricingType", "deliveryRatePerKm", "relatedEquipmentTypes", "features", "seoTitle", "seoDescription", "isPopular", "sortOrder", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
        [
          svc.slug,
          svc.title,
          svc.shortDescription,
          svc.fullDescription,
          svc.image,
          svc.priceInfo,
          svc.pricingType,
          svc.deliveryRatePerKm ?? null,
          svc.relatedEquipmentTypes.map(mapType),
          svc.features,
          svc.seoTitle,
          svc.seoDescription,
          svc.isPopular ?? false,
          svc.sortOrder,
        ],
      );
      console.log(`  ✅ Послуга: ${svc.title}`);
  }

  await applyHumanizedPublicCopyOnce();

  console.log("🎉 Auto-seed complete!");
}
