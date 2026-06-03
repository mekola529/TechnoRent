# TechnoRent — короткий технічний overview

> Оновлено: 24 квітня 2026

Цей документ коротко описує проєкт з технічної сторони. Для повного контексту дивись [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md), для API — [`API_REFERENCE.md`](./API_REFERENCE.md), для деплою — [`DEPLOY_PRODUCTION_CPANEL.md`](./DEPLOY_PRODUCTION_CPANEL.md).

## 1. Що це за система

TechnoRent — сайт і CRM для оренди спецтехніки та замовлення послуг у Львові й області.

Система складається з:

- публічного React-сайту;
- адмін-панелі;
- Express API;
- PostgreSQL бази;
- окремого Telegram webhook-бота для працівників;
- GPS-інтеграції з `gps.equgps.com`;
- production-деплою на cPanel.

## 2. Основний стек

- Frontend: `React 19`, `TypeScript`, `Vite`, `Tailwind CSS`, `React Router`.
- Backend: `Express 5`, `TypeScript`, `pg`, `Zod`, `JWT`, `bcryptjs`.
- Database: `PostgreSQL`, runtime-запити тільки через raw SQL.
- Telegram: Telegram Bot API через окремий сервіс `telegram-bot/`.
- GPS: EquGPS Platform API, основне джерело `https://gps.equgps.com`.
- Hosting: cPanel / Phusion Passenger / Node.js app.

Важливо: Prisma не використовується в runtime. Якщо в репозиторії є Prisma-файли, це legacy-артефакти.

## 3. Структура проєкту

```text
TechnoRent/
├── client/              # React SPA: публічний сайт + адмінка
├── server/              # Express API, SQL, scripts, schema init
├── telegram-bot/        # окремий Telegram webhook-сервіс
├── docs/                # вся документація
├── uploads/             # завантажені зображення
├── .env                 # локальні env-змінні
└── .env.example         # приклад env
```

Ключові frontend-файли:

- `client/src/App.tsx` — маршрути.
- `client/src/components/AdminLayout.tsx` — меню адмінки.
- `client/src/pages/AdminOrdersPage.tsx` — єдина вкладка заявок.
- `client/src/pages/AdminRentOrdersPage.tsx` — замовлення.
- `client/src/pages/AdminEmployeesPage.tsx` — працівники і Telegram-кандидати.
- `client/src/pages/AdminGpsMapPage.tsx` — мапа GPS, поїздки, стоянки.
- `client/src/pages/AdminNotificationsPage.tsx` — налаштування Telegram-шаблонів і service-specific overrides.
- `client/src/components/TowCalculatorModal.tsx` — калькулятор евакуатора.
- `client/src/components/AddressAutocompleteInput.tsx` — reusable автопідказки адрес.

Ключові backend-файли:

- `server/src/index.ts` — Express app, routes, static production serve.
- `server/src/lib/schema.ts` — SQL schema init.
- `server/src/lib/db.ts` — PostgreSQL pool.
- `server/src/routes/admin.rent-orders.ts` — замовлення, призначення, закриття.
- `server/src/routes/admin.requests.ts` — unified CRM-заявки.
- `server/src/routes/admin.gps.ts` — GPS API для адмінки.
- `server/src/routes/internal.telegram.ts` — internal API для Telegram-бота.
- `server/src/routes/admin.notifications.ts` — admin API для шаблонів сповіщень.
- `server/src/lib/equgps-sync.ts` — основний GPS sync.
- `server/src/lib/notification-templates.ts` — registry дефолтних шаблонів і дозволених змінних.
- `server/src/lib/notification-service.ts` — завантаження шаблонів із БД, service override, reset, preview, fallback.
- `server/src/lib/notification-renderer.ts` — підстановка whitelist-змінних у шаблони.
- `server/src/lib/tracker.repository.ts` — збереження GPS-позицій, стоянок, денних статистик.

Ключові Telegram-файли:

- `telegram-bot/src/index.ts` — старт webhook-сервера.
- `telegram-bot/src/config.ts` — env-конфіг.
- `telegram-bot/src/server.ts` — Telegram webhook, callbacks, internal endpoints.
- `telegram-bot/src/services/backend-api.ts` — bot -> backend.
- `telegram-bot/src/services/telegram-api.ts` — bot -> Telegram API.

## 4. Публічний сайт

Користувач може:

- переглядати техніку;
- переглядати послуги;
- бачити популярну техніку і популярні послуги на головній;
- залишати заявку на техніку;
- залишати заявку на послугу;
- розрахувати орієнтовну вартість евакуації.
- розрахувати доставку сипучих матеріалів, якщо послуга має відповідний тип ціни.

Форми створюють legacy-записи і паралельно пишуться в новий CRM-шар `CustomerRequest`.

Hero-зображення головної сторінки керується з адмінки через `SiteSetting.homepage.heroImage`.

Адреси в публічних формах використовують автопідказки:

- запит починається після мінімальної кількості символів;
- є debounce, щоб не робити запит після кожного символу;
- Львівська область має пріоритет;
- після вибору адреси dropdown закривається.

## 5. Адмінка і CRM

Основні вкладки:

- `Огляд` — KPI і останні записи.
- `Техніка` — CRUD техніки, тип ціни, базова адреса, прив’язка GPS-маячка.
- `Управління послугами` — CRUD послуг, тип ціни, прапорець популярної послуги.
- `Постачання` — матеріали, постачальники і точки постачання.
- `Працівники` — працівники і Telegram-кандидати.
- `Заявки` — unified CRM-заявки з `CustomerRequest`.
- `Замовлення` — операційні `RentOrder`.
- `Зайнятість` — календар бронювань.
- `GPS` — список трекерів.
- `Мапа` — мапа техніки, денна статистика, поїздки і стоянки.
- `Налаштування` — hero-зображення головної.
- `Сповіщення` — керування Telegram-шаблонами, preview, reset, service-specific тексти.

CRM-логіка:

- заявка приходить із сайту;
- менеджер переводить її в замовлення;
- менеджер призначає працівника;
- працівник приймає або відхиляє завдання в Telegram;
- працівник стартує і завершує виконання;
- після завершення збирається GPS snapshot;
- після GPS-збагачення система може автоматично порахувати витрату пального за нормою техніки і останньою закупівельною ціною пального;
- фінансовий модуль веде загальний баланс пального в літрах і показує попередження, якщо залишок нижче `FUEL_LOW_BALANCE_LITERS`;
- куплене працівником пальне додається на загальний баланс як закупівля, а в замовленні відображається як окрема компенсація `fuel_purchase`, яка не входить у витрати/прибуток замовлення, але входить у розрахунок з працівником;
- якщо GPS не повернув пробіг або мотогодини, менеджер може внести їх вручну в деталях замовлення і запустити перерахунок паливної витрати;
- працівник проходить Telegram-анкету;
- менеджер фінально закриває замовлення.

## 6. Telegram-бот

Бот живе окремо в `telegram-bot/` і працює через webhook, не через polling.

Локально:

- backend: `http://127.0.0.1:3001`;
- bot: `http://127.0.0.1:3011`;
- для Telegram webhook можна використовувати `ngrok http 3011`.

Що робить бот:

- приймає приватний `/start`;
- створює Telegram-кандидата працівника;
- відправляє працівнику завдання;
- обробляє inline-кнопки `Прийняти`, `Відхилити`, `Розпочати виконання`, `Завершити виконання`;
- проводить післяробочу анкету;
- пише діагностику callback-ів у `telegram-bot.log`.

Налаштування сповіщень:

- адмінка має вкладку `Сповіщення` (`/admin/notifications`);
- базові шаблони зберігаються в `NotificationTemplate` з `serviceSlug = NULL`;
- service-specific overrides зберігаються в тій самій таблиці з `serviceSlug`;
- підтримані дефолти: евакуатор, доставка сипучих матеріалів, вивіз будівельного сміття;
- Telegram inline-кнопки залишаються системними, через UI редагується тільки текст.

Повідомлення працівнику:

- містить номер замовлення, клієнта, телефон;
- показує дату/час старту, якщо вони задані;
- для евакуатора показує дві точки;
- для звичайної послуги або оренди показує одну адресу;
- адреси клікабельні і ведуть у Google Maps по координатах.

## 7. GPS

Основне джерело GPS: `gps.equgps.com`.

Основний sync:

```bash
cd server && npm run tracker:sync
```

Що робить sync:

- логіниться в EquGPS;
- отримує список пристроїв;
- отримує поточні позиції;
- оновлює `TrackerDevice`;
- зберігає позиції в `TrackerMessage`;
- оновлює денну статистику за сьогодні і попередній день;
- зберігає поїздки в `TrackerDailyStat.rawPayload`;
- замінює стоянки за ці дні актуальними даними з EquGPS.

Важливо: стоянки не накопичуються. За синхронізований день старі `TrackerStop` видаляються і записуються заново.

Ручний sync в адмінці:

```http
POST /api/admin/gps/sync
```

Cron на production запускає саме:

```text
server/dist/scripts/sync-tracker-from-equgps.js
```

Legacy Telegram GPS sync не використовувати для production.

## 8. SEO

- SEO meta керуються через `react-helmet-async` і `PageMeta`.
- Детальні сторінки техніки та послуг мають Open Graph, Twitter Card і JSON-LD.
- Сторінка вивозу сміття лишається legacy route `/vyviz-smittia`, але canonical вказує на актуальну сторінку послуги `/services/vyviz-budivelnogo-smittia`.
- `GET /sitemap.xml` і `GET /api/sitemap.xml` віддають однаковий динамічний sitemap зі статичними сторінками, активними послугами і технікою.
- `GET /robots.txt` забороняє індексацію адмінських/internal API маршрутів і вказує sitemap на `/sitemap.xml`.

## 9. База даних

Схема створюється і доповнюється через `server/src/lib/schema.ts`.

Важливі таблиці:

- `Equipment` — техніка.
- `Service` — послуги.
- `CustomerRequest` — unified заявки.
- `CustomerRequestItem` — позиції заявки.
- `RentOrder` — замовлення.
- `RentOrderItem` — позиції замовлення.
- `BookedPeriod` — календар зайнятості.
- `Employee` — працівники.
- `EmployeeTelegramCandidate` — кандидати після `/start`.
- `WorkAssignment` — призначення працівника.
- `WorkExecutionSession` — фактичне виконання.
- `WorkExecutionReport` — підсумковий звіт.
- `OrderEventLog` — журнал подій.
- `TrackerDevice` — GPS-пристрої.
- `TrackerMessage` — GPS-позиції.
- `TrackerStop` — стоянки.
- `TrackerDailyStat` — денна GPS-статистика.

Нові статуси краще зберігати як `TEXT` + backend validation, не як PostgreSQL enum, щоб уникнути проблем деплою на shared hosting.

## 10. Env

Ключові змінні:

```env
DATABASE_URL=...
JWT_SECRET=...
CLIENT_URL=http://localhost:5173
SITE_URL=...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_INTERNAL_TOKEN=...
TELEGRAM_BOT_INTERNAL_URL=http://127.0.0.1:3011/internal
TELEGRAM_BOT_PORT=3011
TELEGRAM_BOT_WEBHOOK_SECRET=...
BACKEND_INTERNAL_URL=http://127.0.0.1:3001/api/internal/telegram

EQUGPS_PLATFORM_URL=https://gps.equgps.com
EQUGPS_EMAIL=...
EQUGPS_PASSWORD=...
```

Не додавати секрети з префіксом `VITE_`, бо вони потрапляють у frontend bundle.

## 11. Локальний запуск

Типовий запуск основного сайту:

```bash
npm run dev
```

Окремо бот:

```bash
node scripts/start-local-telegram-ngrok.mjs --local
```

Цей режим запускає `telegram-bot`, `ngrok`, ставить Telegram webhook і направляє bot -> backend на локальний `http://127.0.0.1:3001/api/internal/telegram`.

Альтернатива без команди: двічі натиснути файл `Start TechnoRent Telegram Bot.command` у корені проєкту. Він відкриє Terminal і запропонує вибрати локальний режим або режим хостингу.

Якщо сайт на хостингу, а bot тимчасово локально:

```bash
node scripts/start-local-telegram-ngrok.mjs --production
```

У цьому режимі скрипт покаже `TELEGRAM_BOT_INTERNAL_URL`, який потрібно вставити у production `.env` на хостингу і після цього перезапустити Node.js app.

Якщо bot запускається на хостингу як окремий cPanel Node.js app:

- application root: папка `telegram-bot`;
- startup file: `start.cjs`;
- bot app слухає `process.env.PORT`, який дає cPanel;
- backend сайту має `TELEGRAM_BOT_INTERNAL_URL=https://BOT_DOMAIN/internal`;
- сам bot має `BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram`.

Детальна інструкція: [`TELEGRAM_BOT_CPANEL_DEPLOY.md`](./TELEGRAM_BOT_CPANEL_DEPLOY.md).

GPS sync:

```bash
cd server
npm run tracker:sync
```

Перевірки перед деплоєм:

```bash
cd server && npm run build
cd client && npm run build
cd telegram-bot && npm run build
```

## 12. Production deploy

Production працює на cPanel.

Основне:

- application root: `/home/xkiavukt/technorent.lanbox.com.ua`;
- startup file: `server/dist/start.cjs`;
- `.env` лежить у root сайту;
- frontend build лежить у `client_dist/`;
- backend build лежить у `server/dist/`;
- cron node path має містити `/server/20/bin/node`.

Правильна GPS cron-команда описана в [`CPANEL_DEPLOY.md`](./CPANEL_DEPLOY.md).

## 13. Що не ламати

- Не повертати Prisma в runtime.
- Не використовувати legacy Telegram GPS sync для production.
- Не виносити секрети у `VITE_*`.
- Не міняти `server/dist/start.cjs` без перевірки Passenger.
- Не робити нові Postgres enum для бізнес-статусів без потреби.
- Не дублювати заявки на послуги в окрему вкладку: все має йти в `Заявки`.
- Не прибирати `Управління послугами`: це довідник послуг, а не список заявок.
