import { PrismaClient, EquipmentType, PricingType } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

/** Map frontend type → Prisma enum (dash → underscore) */
function mapType(t: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    excavator: "excavator",
    loader: "loader",
    bulldozer: "bulldozer",
    crane: "crane",
    roller: "roller",
    "dump-truck": "dump_truck",
    "concrete-mixer": "concrete_mixer",
    generator: "generator",
    other: "other",
  };
  return map[t] ?? "other";
}

const equipmentList = [
  {
    slug: "jcb-3cx",
    name: "JCB 3CX",
    brand: "JCB",
    type: "excavator",
    description:
      "Універсальний екскаватор-навантажувач JCB 3CX — ідеальний вибір для земляних робіт, риття траншей та навантажування матеріалів. Потужний двигун та маневреність роблять його незамінним на будмайданчику.",
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
        alt: "JCB 3CX — екскаватор-навантажувач",
      },
    ],
    bookedPeriods: [
      { from: "2026-03-20", to: "2026-03-25", note: "Будівництво на вул. Шевченка" },
      { from: "2026-04-01", to: "2026-04-05" },
    ],
  },
  {
    slug: "cat-938",
    name: "CAT 938",
    brand: "Caterpillar",
    type: "loader",
    description:
      "Фронтальний навантажувач Caterpillar 938 для переміщення сипучих матеріалів, піску, гравію та будівельного сміття. Висока продуктивність та надійність.",
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
        alt: "CAT 938 — фронтальний навантажувач",
      },
    ],
    bookedPeriods: [{ from: "2026-03-18", to: "2026-03-22" }],
  },
  {
    slug: "volvo-ec220",
    name: "Volvo EC220",
    brand: "Volvo",
    type: "excavator",
    description:
      "Гусеничний екскаватор Volvo EC220 для масштабних земляних робіт, демонтажу та будівництва. Потужний, точний та економічний.",
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
        alt: "Volvo EC220 — гусеничний екскаватор",
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
      "Бульдозер Caterpillar D6 для планування ґрунту, розчистки територій та переміщення великих об'ємів матеріалів. Надійний та продуктивний.",
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
        alt: "CAT D6 — бульдозер",
      },
    ],
    bookedPeriods: [
      { from: "2026-03-25", to: "2026-04-10", note: "Підготовка ділянки під забудову" },
    ],
  },
  {
    slug: "liebherr-ltm-1060",
    name: "Liebherr LTM 1060",
    brand: "Liebherr",
    type: "crane",
    description:
      "Автомобільний кран Liebherr LTM 1060 вантажопідйомністю 60 тонн. Для монтажних робіт, встановлення конструкцій та піднімання важких вантажів.",
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
        alt: "Liebherr LTM 1060 — автомобільний кран",
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
      "Самоскид MAN TGS 33.400 для перевезення сипучих матеріалів, будівельного сміття та ґрунту. Велика вантажопідйомність та прохідність.",
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
        alt: "MAN TGS 33.400 — самоскид",
      },
    ],
    bookedPeriods: [{ from: "2026-03-19", to: "2026-03-21" }],
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Перевірити чи вже є дані
  const existingEquipment = await prisma.equipment.count();
  if (existingEquipment > 0) {
    console.log("  ℹ️ Database already seeded, skipping.");
    return;
  }

  // Створити адміна
  const adminEmail = process.env.ADMIN_EMAIL || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "password";
  const passwordHash = await hash(adminPassword, 12);

  await prisma.admin.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`  ✅ Admin created: ${adminEmail}`);

  // Створити техніку
  for (const item of equipmentList) {
    await prisma.equipment.create({
      data: {
        slug: item.slug,
        name: item.name,
        brand: item.brand,
        type: mapType(item.type),
        description: item.description,
        pricePerHour: item.pricePerHour,
        isPopular: item.isPopular,
        specs: {
          create: item.specs,
        },
        images: {
          create: item.images,
        },
        bookedPeriods: {
          create: item.bookedPeriods.map((bp) => ({
            from: new Date(bp.from),
            to: new Date(bp.to),
            note: bp.note ?? null,
          })),
        },
      },
    });
    console.log(`  ✅ ${item.name}`);
  }

  // Створити послуги
  const servicesList: {
    slug: string;
    title: string;
    shortDescription: string;
    fullDescription: string;
    image: string;
    priceInfo: string;
    pricingType: PricingType;
    relatedEquipmentTypes: EquipmentType[];
    features: string[];
    seoTitle: string;
    seoDescription: string;
    sortOrder: number;
  }[] = [
    {
      slug: "vyviz-budivelnogo-smittia",
      title: "Вивіз будівельного сміття",
      shortDescription: "Оперативний вивіз будівельних відходів — бетон, цегла, ґрунт та інше сміття з вашого об'єкта у Львові та області.",
      fullDescription: "Після ремонту, демонтажу чи будівництва завжди залишається сміття, яке потрібно вивезти швидко та без зайвих клопотів. Ми забезпечуємо повний цикл: завантаження самоскидом або навантажувачем, транспортування та утилізацію. Послуга підходить як для приватних осіб після ремонту квартири, так і для будівельних компаній з великими обсягами відходів. Працюємо по Львову та Львівській області.",
      image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "Вартість залежить від обсягу та типу відходів — розраховується індивідуально",
      pricingType: "custom",
      relatedEquipmentTypes: ["dump_truck", "loader"],
      features: ["Завантаження та вивіз за один виїзд", "Працюємо з великими обсягами", "Вивіз бетону, цегли, ґрунту, деревини", "Обслуговуємо приватні та комерційні об'єкти"],
      seoTitle: "Вивіз будівельного сміття у Львові — TechnoRent",
      seoDescription: "Замовте вивіз будівельного сміття у Львові та Львівській області. Самоскиди та навантажувачі, швидке погодження, виїзд на адресу.",
      sortOrder: 1,
    },
    {
      slug: "kopannia-transheyi",
      title: "Копання траншей",
      shortDescription: "Копання траншей екскаватором для прокладання комунікацій, фундаментів та дренажних систем.",
      fullDescription: "Копання траншей — одна з найпоширеніших земляних робіт при будівництві. Використовуємо екскаватори різної потужності для прокладання водопроводу, каналізації, газових труб, електрокабелів та дренажних систем. Глибина та ширина траншеї підбирається під ваші потреби. Працюємо як на приватних ділянках, так і на комерційних та промислових об'єктах.",
      image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 1 200 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["excavator"],
      features: ["Траншеї будь-якої глибини та ширини", "Для комунікацій, фундаментів, дренажу", "Точне виконання за проєктом", "Мінімальне пошкодження ландшафту"],
      seoTitle: "Копання траншей екскаватором у Львові — TechnoRent",
      seoDescription: "Копання траншей для комунікацій та фундаментів у Львові. Екскаватори JCB та Volvo, досвідчені оператори, робота за проєктом.",
      sortOrder: 2,
    },
    {
      slug: "ryttia-kotlovaniv",
      title: "Риття котлованів",
      shortDescription: "Риття котлованів для фундаментів, басейнів та підземних конструкцій із застосуванням потужних екскаваторів.",
      fullDescription: "Риття котлованів потребує потужної техніки та точного виконання. Наші екскаватори дозволяють виконувати роботи будь-якого масштабу — від невеликих котлованів під фундамент приватного будинку до великих виїмок під комерційні об'єкти. Забезпечуємо дотримання проєктних розмірів, організуємо вивіз зайвого ґрунту самоскидами.",
      image: "https://images.unsplash.com/photo-1647978403048-2e5099133ea3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 1 200 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["excavator", "dump_truck"],
      features: ["Котловани під фундаменти, басейни, підвали", "Дотримання проєктних розмірів", "Вивіз зайвого ґрунту", "Роботи будь-якого масштабу"],
      seoTitle: "Риття котлованів у Львові — TechnoRent",
      seoDescription: "Риття котлованів для фундаментів та будівництва у Львові. Потужні екскаватори, точне виконання, вивіз ґрунту.",
      sortOrder: 3,
    },
    {
      slug: "planuvannia-dilianky",
      title: "Планування ділянки",
      shortDescription: "Вирівнювання та планування земельних ділянок бульдозером і навантажувачем перед будівництвом.",
      fullDescription: "Планування ділянки — обов'язковий етап перед початком будівництва. Бульдозери та навантажувачі вирівнюють рельєф, знімають верхній шар ґрунту, усувають нерівності та готують площадку під фундамент, дорогу або ландшафтне озеленення. Виконуємо роботи на приватних ділянках, комерційних та промислових територіях.",
      image: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 1 450 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["bulldozer", "loader"],
      features: ["Вирівнювання рельєфу під будівництво", "Зняття верхнього шару ґрунту", "Підготовка під фундамент або дорогу", "Ділянки будь-якої площі"],
      seoTitle: "Планування ділянки у Львові — TechnoRent",
      seoDescription: "Планування та вирівнювання земельних ділянок у Львові. Бульдозери та навантажувачі, підготовка під будівництво.",
      sortOrder: 4,
    },
    {
      slug: "demontazhni-roboty",
      title: "Демонтажні роботи",
      shortDescription: "Демонтаж будівель, конструкцій та споруд із використанням екскаваторів та вивозом залишків.",
      fullDescription: "Виконуємо демонтаж старих будівель, фундаментів, перегородок та інших конструкцій. Екскаватори з гідромолотом або ковшем-руйнівником дозволяють працювати швидко та безпечно. Після демонтажу організуємо завантаження та вивіз будівельних відходів самоскидами. Працюємо на приватних та комерційних об'єктах.",
      image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "ціна розраховується індивідуально",
      pricingType: "custom",
      relatedEquipmentTypes: ["excavator", "dump_truck"],
      features: ["Демонтаж будівель та фундаментів", "Робота з гідромолотом", "Вивіз будівельних відходів", "Безпечне виконання робіт"],
      seoTitle: "Демонтажні роботи у Львові — TechnoRent",
      seoDescription: "Демонтаж будівель та конструкцій у Львові. Екскаватори, вивіз відходів, безпечне виконання на приватних та комерційних об'єктах.",
      sortOrder: 5,
    },
    {
      slug: "zavantazhennia-ta-vyvezennia-gruntu",
      title: "Завантаження та вивезення ґрунту",
      shortDescription: "Завантаження ґрунту навантажувачем або екскаватором та вивезення самоскидами з будмайданчика.",
      fullDescription: "При будівництві часто виникає потреба вивезти великі обсяги ґрунту. Ми забезпечуємо повний цикл: екскаватор або навантажувач завантажує ґрунт, а самоскид вивозить його на полігон або на іншу ділянку. Працюємо оперативно, організуємо безперервний цикл завантаження-вивезення для максимальної продуктивності.",
      image: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 950 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["loader", "dump_truck", "excavator"],
      features: ["Безперервний цикл завантаження-вивезення", "Великі обсяги за короткий час", "Транспортування на полігон або ділянку", "Координація кількох одиниць техніки"],
      seoTitle: "Завантаження та вивезення ґрунту у Львові — TechnoRent",
      seoDescription: "Завантаження та вивезення ґрунту у Львові. Навантажувачі, екскаватори та самоскиди — повний цикл земляних робіт.",
      sortOrder: 6,
    },
    {
      slug: "perevezennia-sypuchyh-materialiv",
      title: "Перевезення сипучих матеріалів",
      shortDescription: "Доставка піску, щебеню, гравію та інших сипучих матеріалів самоскидами на ваш об'єкт.",
      fullDescription: "Забезпечуємо перевезення сипучих будівельних матеріалів — піску, щебеню, гравію, відсіву, чорнозему — самоскидами великої вантажопідйомності. Доставка на будмайданчик, приватну ділянку або промисловий об'єкт. Можливе замовлення кількох рейсів для великих обсягів.",
      image: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 950 грн/рейс",
      pricingType: "fixed_from",
      relatedEquipmentTypes: ["dump_truck"],
      features: ["Пісок, щебінь, гравій, відсів, чорнозем", "Самоскиди до 20 тонн", "Доставка на об'єкт у зручний час", "Можливість кількох рейсів за день"],
      seoTitle: "Перевезення сипучих матеріалів у Львові — TechnoRent",
      seoDescription: "Доставка піску, щебеню та гравію самоскидами у Львові. Вантажопідйомність до 20 тонн, доставка на об'єкт.",
      sortOrder: 7,
    },
    {
      slug: "montazhni-ta-pidyomni-roboty",
      title: "Монтажні та підйомні роботи",
      shortDescription: "Монтаж конструкцій, підйом важких вантажів та встановлення обладнання автокраном.",
      fullDescription: "Автокран Liebherr вантажопідйомністю 60 тонн дозволяє виконувати складні монтажні роботи: встановлення залізобетонних конструкцій, металевих балок, технологічного обладнання, кондиціонерів на дах тощо. Кран працює з досвідченим оператором, який забезпечує безпечне та точне виконання підйомів.",
      image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 2 500 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["crane"],
      features: ["Вантажопідйомність до 60 тонн", "Висота підйому до 48 м", "Монтаж конструкцій та обладнання", "Досвідчений оператор у комплекті"],
      seoTitle: "Монтажні та підйомні роботи у Львові — TechnoRent",
      seoDescription: "Монтажні роботи автокраном у Львові. Підйом вантажів до 60 тонн, висота стріли 48 м, встановлення конструкцій.",
      sortOrder: 8,
    },
    {
      slug: "pidgotovka-dilianky-do-budivnytstva",
      title: "Підготовка ділянки до будівництва",
      shortDescription: "Комплексна підготовка будівельного майданчика — розчистка, планування, зняття ґрунту.",
      fullDescription: "Комплексна підготовка ділянки включає кілька етапів: розчистка території від рослинності та старих споруд, зняття верхнього шару ґрунту, вирівнювання площадки, при необхідності — риття котловану під фундамент. Використовуємо бульдозери для планування, екскаватори для земляних робіт та навантажувачі для переміщення матеріалів.",
      image: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "ціна розраховується індивідуально",
      pricingType: "custom",
      relatedEquipmentTypes: ["bulldozer", "excavator", "loader"],
      features: ["Розчистка від рослинності та споруд", "Зняття ґрунту та планування", "Координація кількох одиниць техніки", "Під ключ — від оцінки до готового майданчика"],
      seoTitle: "Підготовка ділянки до будівництва у Львові — TechnoRent",
      seoDescription: "Комплексна підготовка будівельного майданчика у Львові. Бульдозери, екскаватори, навантажувачі — розчистка, планування, земляні роботи.",
      sortOrder: 9,
    },
    {
      slug: "zemliani-roboty",
      title: "Земляні роботи",
      shortDescription: "Повний спектр земляних робіт — копання, переміщення ґрунту, вирівнювання на приватних та комерційних об'єктах.",
      fullDescription: "Земляні роботи — базова складова будь-якого будівельного проєкту. Ми пропонуємо повний цикл: від копання та переміщення ґрунту до фінального планування території. Використовуємо екскаватори для точного копання, бульдозери для планування великих площ. Працюємо на приватних ділянках, комерційних та промислових об'єктах будь-якого масштабу.",
      image: "https://images.unsplash.com/photo-1652922660696-60c68ec51582?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920",
      priceInfo: "від 1 200 грн/год",
      pricingType: "hourly_from",
      relatedEquipmentTypes: ["excavator", "bulldozer"],
      features: ["Копання, переміщення, планування ґрунту", "Приватні та комерційні об'єкти", "Техніка різної потужності під задачу", "Досвідчені оператори"],
      seoTitle: "Земляні роботи у Львові — TechnoRent",
      seoDescription: "Земляні роботи у Львові та області. Екскаватори та бульдозери для копання, переміщення ґрунту, планування територій.",
      sortOrder: 10,
    },
  ];

  for (const svc of servicesList) {
    await prisma.service.create({ data: svc });
    console.log(`  ✅ Послуга: ${svc.title}`);
  }

  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
