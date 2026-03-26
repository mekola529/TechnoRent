# TechnoRent — Повний контекстний документ проєкту

> **Дата створення:** 26 березня 2026  
> **Призначення:** головне джерело контексту для будь-якого нового технічного агента, який входить у проєкт

---

## 1. Загальний опис проєкту

### Що це

TechnoRent — веб-сайт компанії з оренди будівельної спецтехніки у Львові та Львівській області. Включає **клієнтську частину** (публічний сайт) та **адмін-панель** для керування технікою, заявками та зайнятістю.

### Бізнес-задача

- Клієнт заходить на сайт → переглядає каталог техніки → залишає заявку (ім'я + телефон)
- Адміністратор отримує заявку через Telegram-бот + бачить її в адмін-панелі
- Адміністратор обробляє заявку → створює замовлення → техніка бронюється в календарі зайнятості
- Додатковий сервіс: вивіз будівельного сміття (окрема форма)

### Ролі користувачів

| Роль | Що може |
|------|---------|
| **Відвідувач сайту** | Переглядати каталог, залишати заявки на оренду, замовляти вивіз сміття, замовляти дзвінок |
| **Адміністратор (ADMIN/MANAGER)** | Керувати технікою (CRUD), обробляти заявки, створювати замовлення, керувати зайнятістю в календарі |

### Основний сценарій (happy path)

```
Клієнт → Каталог → Обирає техніку → "Замовити" → Заповнює форму →
→ Заявка створюється в БД + Telegram-повідомлення адміну →
→ Адмін бачить заявку → Підтверджує → Створює RentOrder →
→ BookedPeriod автоматично з'являється в календарі зайнятості
```

---

## 2. Технічний стек

### Frontend (client/)

| Технологія | Версія | Призначення |
|-----------|--------|-------------|
| React | 19.2.4 | UI-фреймворк |
| TypeScript | ~5.9.3 | Типізація |
| Vite | 8.0.0 | Build tool + dev server |
| Tailwind CSS | 4.2.1 | Стилі (через @tailwindcss/vite plugin) |
| React Router | 7.13.1 | Маршрутизація (SPA) |
| react-helmet-async | 3.0.0 | SEO (meta-теги, title, structured data) |

**Немає:** Redux, Zustand, Axios, query-бібліотек. Стейт через React Context, запити через нативний `fetch`.

### Backend (server/)

| Технологія | Версія | Призначення |
|-----------|--------|-------------|
| Express | 5.1.0 | HTTP-сервер |
| Prisma | 6.9.0+ | ORM для PostgreSQL |
| PostgreSQL | 16 | База даних |
| TypeScript | ~5.9.3 | Типізація |
| Zod | 3.25+ | Валідація запитів |
| JWT (jsonwebtoken) | 9.0.2 | Аутентифікація адмінів |
| bcryptjs | 3.0.2 | Хешування паролів |
| Multer | 2.1.1 | Завантаження файлів |
| Sharp | 0.34.5 | Компресія зображень → WebP |
| Helmet | 8.1.0 | Security headers |
| express-rate-limit | 8.3.1 | Rate limiting |

### Інфраструктура

| Що | Де |
|----|----|
| Frontend hosting | **Vercel** (repo `techno_rent_vercel`, remote `vercel`) |
| Backend hosting | **Render** (repo `TechnoRent`, remote `origin`) |
| Database | PostgreSQL на Render |
| Telegram сповіщення | Telegram Bot API |
| Домен продакшну | `https://technorentvercel.vercel.app` |
| API продакшну | `https://techno-rent-vercel.onrender.com/api` |

### Команда деплою

```bash
git push origin main && git push vercel main
```

---

## 3. Структура репозиторію (пояснена)

```
TechnoRent/
├── client/                          # Frontend (React SPA)
│   ├── src/
│   │   ├── main.tsx                 # Entry point: StrictMode + HelmetProvider + App
│   │   ├── App.tsx                  # BrowserRouter + всі маршрути + Context Providers
│   │   ├── index.css                # Tailwind @import + @theme (кольори, шрифти)
│   │   ├── api/
│   │   │   └── client.ts           # apiFetch<T>() — єдиний HTTP-клієнт (fetch + auth)
│   │   ├── context/
│   │   │   ├── AuthContext.tsx      # Стан аутентифікації адміна (login/logout/token)
│   │   │   └── OrderModalContext.tsx # Глобальний стан модалки замовлення
│   │   ├── data/
│   │   │   ├── types.ts            # TypeScript типи: Equipment, BookedPeriod, EquipmentType
│   │   │   └── equipment.service.ts # API-функції: getAllEquipment, createOrder тощо
│   │   ├── components/
│   │   │   ├── Header.tsx           # Шапка сайту (лого, навігація, кнопка замовлення)
│   │   │   ├── Footer.tsx           # Підвал (контакти, навігація, графік)
│   │   │   ├── Hero.tsx             # Hero-секція головної сторінки
│   │   │   ├── HowItWorks.tsx       # 3-крокова секція "Як це працює"
│   │   │   ├── PopularEquipment.tsx  # Секція популярної техніки (з API)
│   │   │   ├── WhyChooseUs.tsx      # Секція "Чому обирають TechnoRent"
│   │   │   ├── CallToAction.tsx     # Форма "Замовити дзвінок" (CTA)
│   │   │   ├── EquipmentCard.tsx    # Картка техніки (для каталогу і популярних)
│   │   │   ├── OrderModal.tsx       # Модальне вікно замовлення (createPortal)
│   │   │   ├── MobileTabBar.tsx     # Мобільна навігація (sticky під Header)
│   │   │   ├── PageMeta.tsx         # SEO обгортка (title, description, og, canonical)
│   │   │   ├── Skeleton.tsx         # Skeleton loaders (base + catalog + admin table)
│   │   │   ├── RequireAuth.tsx      # Auth guard для адмін-роутів
│   │   │   ├── AdminLayout.tsx      # Layout адмінки (sidebar + outlet)
│   │   │   └── admin/              # Shared UI-компоненти адмінки
│   │   │       ├── index.ts         # Barrel export
│   │   │       ├── AdminButton.tsx  # Кнопка (primary/secondary/ghost/danger)
│   │   │       ├── AdminCard.tsx    # Картка-обгортка
│   │   │       ├── AdminFilterBar.tsx # Панель пошуку/фільтрів
│   │   │       ├── AdminInput.tsx   # Input/Textarea/Select з лейблами
│   │   │       ├── AdminPageHeader.tsx # Заголовок сторінки з actions
│   │   │       ├── ConfirmModal.tsx # Модалка підтвердження (delete тощо)
│   │   │       └── StatusBadge.tsx  # Бейджик статусу (кольоровий pill)
│   │   └── pages/
│   │       ├── HomePage.tsx         # Головна: Hero + секції + FAQ + structured data
│   │       ├── CatalogPage.tsx      # Каталог з фільтрами та сортуванням
│   │       ├── EquipmentDetailPage.tsx # Деталі техніки + календар + structured data
│   │       ├── ServicesPage.tsx     # Сторінка послуг
│   │       ├── DebrisRemovalPage.tsx # Вивіз сміття (лендінг + форма)
│   │       ├── ContactsPage.tsx     # Контакти + Google Maps
│   │       ├── NotFoundPage.tsx     # 404
│   │       ├── AdminLoginPage.tsx   # Логін адміна
│   │       ├── AdminOverviewPage.tsx # Дашборд (KPI, останні заявки)
│   │       ├── AdminEquipmentPage.tsx # CRUD техніки
│   │       ├── AdminOrdersPage.tsx  # Список заявок + деталі
│   │       ├── AdminRentOrdersPage.tsx # Замовлення (оренди) + items
│   │       ├── AdminServiceRequestsPage.tsx # Заявки на послуги
│   │       └── AdminOccupancyPage.tsx # Календар зайнятості
│   ├── public/                      # Статичні файли (robots.txt тощо)
│   ├── index.html                   # HTML shell
│   ├── vercel.json                  # Vercel config (SPA rewrites)
│   ├── vite.config.ts               # Vite config (proxy, plugins)
│   ├── tsconfig.json                # TypeScript config
│   └── package.json                 # Залежності frontend
│
├── server/                          # Backend (Express + Prisma)
│   ├── src/
│   │   ├── index.ts                 # Entry point: Express app, middleware, маршрути
│   │   ├── lib/
│   │   │   ├── prisma.ts           # Prisma client instance
│   │   │   ├── logger.ts           # Безпечне логування (production vs dev)
│   │   │   └── telegram.ts         # Telegram Bot API: сповіщення про заявки
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT auth middleware (Bearer token)
│   │   │   └── validate.ts         # Zod validation middleware
│   │   └── routes/
│   │       ├── equipment.ts         # GET /api/equipment (публічний)
│   │       ├── orders.ts            # POST /api/orders (публічний)
│   │       ├── service-requests.ts  # POST /api/service-requests (публічний)
│   │       ├── auth.ts              # POST /api/auth/login, GET /api/auth/me
│   │       ├── admin.equipment.ts   # CRUD /api/admin/equipment (захищений)
│   │       ├── admin.orders.ts      # /api/admin/orders (захищений)
│   │       ├── admin.rent-orders.ts # /api/admin/rent-orders (захищений)
│   │       ├── admin.occupancy.ts   # /api/admin/occupancy (захищений)
│   │       ├── admin.upload.ts      # POST /api/admin/upload (захищений)
│   │       └── admin.service-requests.ts # /api/admin/service-requests (захищений)
│   ├── prisma/
│   │   ├── schema.prisma            # Схема БД (моделі, enums, зв'язки)
│   │   ├── seed.ts                  # Seed: початкова техніка + адмін
│   │   └── migrations/              # Prisma migrations
│   ├── tsconfig.json                # TypeScript config
│   └── package.json                 # Залежності backend
│
├── uploads/                         # Завантажені зображення техніки (WebP)
├── .env                             # Змінні середовища (НЕ в git)
├── .env.example                     # Шаблон змінних середовища
├── Dockerfile                       # Multi-stage Docker build
├── docker-compose.yml               # Docker Compose (PostgreSQL + server)
├── package.json                     # Root: скрипти dev/build/start, concurrently
└── інструкція_для_агента_адмінка.md # Інструкція з рефакторингу адмінки
```

---

## 4. Змінні середовища

```bash
# ─── Серверні (секретні) ───────────────────
DATABASE_URL="postgresql://USER:PASSWORD@host:5432/technorent"
JWT_SECRET="..."              # Для підпису JWT-токенів
ADMIN_EMAIL="admin"           # Логін адміна (seed)
ADMIN_PASSWORD="..."          # Пароль адміна (seed)
PORT=3001                     # Порт серверу
CLIENT_URL="http://localhost:5173"  # CORS origin
SITE_URL="https://technorent.ua"    # Для sitemap
NODE_ENV="development"
TELEGRAM_BOT_TOKEN="..."     # Telegram Bot для сповіщень
TELEGRAM_CHAT_ID="..."       # Chat ID для сповіщень

# ─── Клієнтська (публічна) ─────────────────
VITE_API_URL="https://..."   # URL API для фронтенду (потрапляє в bundle!)
```

> **УВАГА:** Змінні з префіксом `VITE_` потрапляють в клієнтський JavaScript bundle і стають публічними. Ніколи не додавай секрети з `VITE_` префіксом.

---

## 5. Маршрутизація

### Публічні маршрути (клієнтські)

| Маршрут | Файл | Призначення |
|---------|------|-------------|
| `/` | `HomePage.tsx` | Головна з Hero, популярною технікою, FAQ |
| `/catalog` | `CatalogPage.tsx` | Каталог з фільтрами (тип, бренд, сортування) |
| `/catalog/:slug` | `EquipmentDetailPage.tsx` | Деталі техніки + календар зайнятості |
| `/services` | `ServicesPage.tsx` | Перелік послуг оренди |
| `/vyviz-smittia` | `DebrisRemovalPage.tsx` | Лендінг вивозу сміття + форма заявки |
| `/contacts` | `ContactsPage.tsx` | Контакти + Google Maps |
| `/admin` | `AdminLoginPage.tsx` | Вхід в адмін-панель |
| `*` | `NotFoundPage.tsx` | 404 |

### Захищені маршрути (адмін)

Обгорнуті в `RequireAuth` + `AdminLayout` (sidebar + outlet).

| Маршрут | Файл | Призначення |
|---------|------|-------------|
| `/admin/overview` | `AdminOverviewPage.tsx` | Дашборд: KPI, останні заявки, швидкі дії |
| `/admin/equipment` | `AdminEquipmentPage.tsx` | CRUD техніки (таблиця + форма) |
| `/admin/orders` | `AdminOrdersPage.tsx` | Заявки (список + деталі + зміна статусу) |
| `/admin/rent-orders` | `AdminRentOrdersPage.tsx` | Замовлення оренди (multi-item) |
| `/admin/service-requests` | `AdminServiceRequestsPage.tsx` | Заявки на послуги (вивіз сміття) |
| `/admin/occupancy` | `AdminOccupancyPage.tsx` | Календар зайнятості техніки |

### API-ендпоїнти

#### Публічні

| Метод | Шлях | Що робить |
|-------|------|-----------|
| GET | `/api/equipment` | Список техніки (фільтри: type, brand, popular, sort) |
| GET | `/api/equipment/:slug` | Техніка за slug (+ specs, images, bookedPeriods) |
| GET | `/api/equipment/meta/brands` | Унікальні бренди |
| GET | `/api/equipment/meta/types` | Унікальні типи техніки |
| POST | `/api/orders` | Створити заявку + Telegram |
| POST | `/api/service-requests` | Створити заявку на послугу + Telegram |
| POST | `/api/auth/login` | Логін адміна → JWT |
| GET | `/api/auth/me` | Перевірка токена |
| GET | `/api/sitemap.xml` | Динамічний sitemap |

#### Захищені (Bearer token)

| Метод | Шлях | Що робить |
|-------|------|-----------|
| POST | `/api/admin/equipment` | Створити техніку |
| PUT | `/api/admin/equipment/:id` | Оновити техніку |
| DELETE | `/api/admin/equipment/:id` | Видалити техніку (+ файли зображень) |
| GET | `/api/admin/orders` | Список заявок (фільтр за статусом) |
| PATCH | `/api/admin/orders/:id/status` | Змінити статус заявки |
| DELETE | `/api/admin/orders/:id` | Видалити заявку |
| GET | `/api/admin/rent-orders` | Список замовлень |
| GET | `/api/admin/rent-orders/:id` | Деталі замовлення |
| POST | `/api/admin/rent-orders` | Створити замовлення (+ auto BookedPeriods) |
| PUT | `/api/admin/rent-orders/:id` | Оновити замовлення |
| PATCH | `/api/admin/rent-orders/:id/status` | Змінити статус замовлення |
| DELETE | `/api/admin/rent-orders/:id` | Видалити замовлення |
| GET | `/api/admin/occupancy` | Всі BookedPeriod'и |
| POST | `/api/admin/occupancy` | Створити період зайнятості |
| PUT | `/api/admin/occupancy/:id` | Оновити період |
| DELETE | `/api/admin/occupancy/:id` | Видалити період |
| POST | `/api/admin/upload` | Завантажити зображення (→ WebP) |
| DELETE | `/api/admin/upload` | Видалити зображення |
| GET | `/api/admin/service-requests` | Список заявок на послуги |
| PATCH | `/api/admin/service-requests/:id/status` | Змінити статус |
| DELETE | `/api/admin/service-requests/:id` | Видалити |

---

## 6. Моделі даних (база даних)

### Equipment (Техніка)

Головна бізнес-сутність — одиниця техніки, яку можна орендувати.

```
Equipment
├── id           : String (cuid)
├── slug         : String (unique, URL-friendly)
├── name         : String ("JCB 3CX")
├── brand        : String ("JCB")
├── type         : EquipmentType enum
├── description  : String
├── pricePerHour : Int (грн/год)
├── isPopular    : Boolean
├── createdAt    : DateTime
├── updatedAt    : DateTime
├── specs[]      → EquipmentSpec (label + value)
├── images[]     → EquipmentImage (url + alt)
├── bookedPeriods[] → BookedPeriod
├── orders[]     → Order
└── rentOrderItems[] → RentOrderItem
```

**EquipmentType enum:** `excavator`, `loader`, `bulldozer`, `crane`, `roller`, `dump_truck`, `concrete_mixer`, `generator`, `other`

> **Важливо:** В Prisma enum використовує underscore (`dump_truck`), на фронтенді — dash (`dump-truck`). Конвертація відбувається в `equipment.service.ts` через `mapApiType()` / `unmapType()`.

### Order (Заявка)

Заявка від клієнта — може бути прив'язана до конкретної техніки або загальна.

```
Order
├── id           : String (cuid)
├── customerName : String
├── phone        : String
├── email?       : String
├── dateFrom?    : DateTime
├── dateTo?      : DateTime
├── address?     : String
├── comment?     : String
├── status       : OrderStatus enum (default: NEW)
├── equipmentId? : String → Equipment
├── createdAt    : DateTime
├── updatedAt    : DateTime
├── bookedPeriods[] → BookedPeriod
└── rentOrders[] → RentOrder
```

### RentOrder (Замовлення оренди)

Підтверджене замовлення — може містити кілька одиниць техніки.

```
RentOrder
├── id              : String (cuid)
├── customerName    : String
├── customerPhone   : String
├── status          : RentOrderStatus enum (default: NEW)
├── comment?        : String
├── sourceType      : String ("manual" | "request")
├── sourceRequestId?: String → Order (якщо створено з заявки)
├── createdAt       : DateTime
├── updatedAt       : DateTime
├── items[]         → RentOrderItem (equipmentId + startDate + endDate)
└── bookedPeriods[] → BookedPeriod (auto-sync)
```

**Ключова логіка:** При створенні/оновленні RentOrder автоматично синхронізуються BookedPeriod записи (функція `syncBookedPeriods()`). При скасуванні — BookedPeriod'и видаляються.

### ServiceRequest (Заявка на послугу)

Окрема сутність для вивозу сміття та інших послуг.

```
ServiceRequest
├── id           : String (cuid)
├── serviceType  : String ("debris_removal")
├── customerName : String
├── phone        : String
├── address      : String
├── date         : DateTime
├── time         : String ("09:00", "09:00-12:00")
├── comment?     : String
├── status       : OrderStatus enum (default: NEW)
├── createdAt    : DateTime
└── updatedAt    : DateTime
```

### BookedPeriod (Період зайнятості)

Запис про зайнятість техніки в певний період.

```
BookedPeriod
├── id           : String (cuid)
├── from         : DateTime
├── to           : DateTime
├── note?        : String (наприклад "[Оренда] Клієнт: Іванов")
├── equipmentId  : String → Equipment
├── orderId?     : String → Order
└── rentOrderId? : String → RentOrder
```

**Типи зайнятості** (визначаються за note):
- `[Оренда]` — підтверджена оренда (auto-created з RentOrder)
- `[Техобслуговування]` — технічне обслуговування
- Без мітки — ручна бронь або інше

### Admin (Адміністратор)

```
Admin
├── id           : String (cuid)
├── email        : String (unique)
├── passwordHash : String (bcrypt)
├── role         : AdminRole enum (ADMIN | MANAGER)
└── createdAt    : DateTime
```

### Статуси

**OrderStatus:** `NEW` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED` | `CANCELLED`

**RentOrderStatus:** `NEW` → `CONFIRMED` → `ACTIVE` → `COMPLETED` | `CANCELLED`

> ACTIVE є тільки в RentOrder (означає «техніка зараз на об'єкті»).

### Діаграма зв'язків

```
Equipment ──1:N── EquipmentSpec
Equipment ──1:N── EquipmentImage
Equipment ──1:N── BookedPeriod
Equipment ──1:N── Order
Equipment ──1:N── RentOrderItem

Order ──1:N── BookedPeriod
Order ──1:N── RentOrder (як source)

RentOrder ──1:N── RentOrderItem
RentOrder ──1:N── BookedPeriod

RentOrderItem ──N:1── Equipment
```

---

## 7. Архітектура фронтенду (детально)

### Entry point та провайдери

```
main.tsx
└── StrictMode
    └── HelmetProvider (SEO)
        └── App.tsx
            └── BrowserRouter
                └── ScrollToTop (auto scroll on route change)
                    └── AuthProvider (admin auth state)
                        └── OrderModalProvider (global modal)
                            └── Routes
```

### State management

Весь стейт через **React Context** (дві штуки):

1. **AuthContext** (`context/AuthContext.tsx`)
   - Зберігає `admin: AdminUser | null` та `loading: boolean`
   - При mount перевіряє токен через `GET /auth/me`
   - Expose: `login(token, user)`, `logout()`, `useAuth()` hook

2. **OrderModalContext** (`context/OrderModalContext.tsx`)
   - Зберігає `isOpen: boolean` та `options: { equipmentName?, equipmentId? }`
   - Expose: `openOrderModal(options?)`, `useOrderModal()` hook

Решта стейту — **локальний стан в компонентах** (useState, useEffect).

### API-клієнт

Один файл — `api/client.ts`:

```typescript
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T>
```

- Додає `Content-Type: application/json` та `Authorization: Bearer <token>` (якщо є)
- На 401: очищує localStorage → перенаправляє на `/admin` (тільки якщо не вже на `/admin`)
- На не-401 помилки: кидає `Error` з повідомленням від сервера

### Сервісний шар (data/)

`equipment.service.ts` — обгортки над `apiFetch`:

| Функція | Що робить |
|---------|-----------|
| `getAllEquipment(params?)` | Отримати техніку з фільтрами |
| `getEquipmentBySlug(slug)` | Отримати одну техніку за slug |
| `getPopularEquipment()` | Отримати популярну техніку |
| `getUniqueBrands()` | Отримати список брендів |
| `getAvailableTypes()` | Отримати список типів |
| `createOrder(data)` | Створити заявку |
| `isAvailableOnDate(equipment, date)` | Перевірити доступність на дату |
| `formatPrice(price)` | Форматування ціни ("від X грн/год") |

**Важлива особливість:** Функція `resolveImageUrl(url)` додає до відносних шляхів (`/uploads/...`) базовий URL бекенду. Це потрібно тому, що в продакшені фронтенд і бекенд на різних доменах.

**Конвертація типів:** `mapApiType()` та `unmapType()` — конвертація між `dump_truck` (API) ↔ `dump-truck` (фронтенд).

### Стилі

- **Tailwind CSS v4** — конфігурація через `@theme` в `index.css`
- Кастомні кольори: `primary` (#F2B705), `dark` (#111111), `dark-text` (#2B2B2B), `light-bg` (#F5F5F5), `border` (#EAEAEA)
- Шрифт: Montserrat
- **Важливо (Tailwind v4 quirk):** `createPortal` рендерить DOM поза деревом React/Tailwind, тому `@theme` змінні не діють. У модалках, що використовують `createPortal`, замість Tailwind utility classes для фону (як `bg-black/40`) потрібно використовувати inline `style`.

### Responsive Design

Breakpoints (Tailwind v4, mobile-first з `max-*` модифікаторами):
- `max-xl` (< 1280px): зменшення padding
- `max-lg` (< 1024px): перехід на 2 колонки, stack layout
- `max-md` (< 768px): мобільна версія, 1 колонка

---

## 8. Архітектура бекенду (детально)

### Entry point (`server/src/index.ts`)

```
Express app
├── Middleware
│   ├── helmet (security headers, CSP вимкнено)
│   ├── cors (CLIENT_URL origin)
│   ├── express.json()
│   ├── static /uploads (зображення техніки)
│   ├── authLimiter (10 req / 15 min для /auth)
│   └── ordersLimiter (15 req / 15 min для /orders, /service-requests)
│
├── Public API
│   ├── /api/equipment → equipmentRouter
│   ├── /api/orders → ordersRouter (rate limited)
│   ├── /api/service-requests → serviceRequestsRouter (rate limited)
│   ├── /api/auth → authRouter (rate limited)
│   └── /api/sitemap.xml (inline handler)
│
├── Admin API (всі routes використовують authMiddleware всередині)
│   ├── /api/admin/equipment → adminEquipmentRouter
│   ├── /api/admin/orders → adminOrdersRouter
│   ├── /api/admin/rent-orders → adminRentOrdersRouter
│   ├── /api/admin/occupancy → adminOccupancyRouter
│   ├── /api/admin/upload → adminUploadRouter
│   └── /api/admin/service-requests → adminServiceRequestsRouter
│
└── Production SPA fallback (serve client/dist if exists)
```

### Аутентифікація

1. Адмін логіниться через `POST /api/auth/login` (email + password)
2. Сервер перевіряє bcrypt hash → видає JWT (24h expiry) з `{ id, role }`
3. Фронтенд зберігає токен в `localStorage("admin_token")`
4. Кожен запит до admin API містить `Authorization: Bearer <token>`
5. `authMiddleware` перевіряє JWT → додає `req.adminId` та `req.adminRole`
6. При невалідному токені → 401

### Валідація

Всі POST/PUT/PATCH ендпоїнти використовують:
```typescript
validate(zodSchema) // middleware
```
Zod-схема парсить `req.body`, повертає 400 з деталями помилок.

### Telegram-сповіщення

При створенні заявки (Order або ServiceRequest):
- Формується HTML-повідомлення з деталями
- Надсилається через Telegram Bot API
- **Асинхронно** (не блокує відповідь клієнту)
- Якщо `TELEGRAM_BOT_TOKEN` або `TELEGRAM_CHAT_ID` не задані — тихо ігнорується

### Завантаження зображень

`POST /api/admin/upload`:
1. Multer приймає файл (до 15MB, тільки image/*)
2. Sharp конвертує → WebP (max 1200px width, quality 80)
3. Зберігає в `/uploads/` з UUID-імʼям
4. Повертає `{ url: "/uploads/uuid.webp", alt: "" }`

### Sitemap

`GET /api/sitemap.xml` — динамічно генерує XML sitemap з усією технікою з БД.

---

## 9. Сторінки (детальний опис)

### HomePage

**Маршрут:** `/`  
**Файл:** `client/src/pages/HomePage.tsx`

**Секції (зверху вниз):**
1. Header (sticky)
2. MobileTabBar (mobile only)
3. Hero (фоновий Unsplash, CTA кнопки)
4. HowItWorks (3 кроки)
5. PopularEquipment (дані з API, горизонтальний скрол на мобайлі)
6. Banner вивозу сміття (посилання на `/vyviz-smittia`)
7. WhyChooseUs (зображення + 4 переваги)
8. CallToAction (форма "Замовити дзвінок")
9. FAQ (4 питання, `<details>` елементи)
10. Footer

**SEO:** LocalBusiness schema, FAQ schema, повні OG/Twitter мета-теги.

### CatalogPage

**Маршрут:** `/catalog`  
**Файл:** `client/src/pages/CatalogPage.tsx`

**Функціональність:**
- Фільтри: тип техніки, бренд (dropdown)
- Сортування: популярні, ціна ↑/↓, назва
- Грід карток: 3 колонки → 2 (tablet) → 1 (mobile)
- Skeleton loaders під час завантаження
- Empty state: "Нічого не знайдено" з кнопкою скидання

**API:** `getAllEquipment(params)`, `getUniqueBrands()`, `getAvailableTypes()`

### EquipmentDetailPage

**Маршрут:** `/catalog/:slug`  
**Файл:** `client/src/pages/EquipmentDetailPage.tsx`

**Секції:**
1. Breadcrumbs (Головна → Техніка → Назва)
2. Hero: велике зображення + панель з ціною та кнопкою "Замовити"
3. Опис техніки
4. Характеристики (specs таблиця)
5. **Календар доступності:** інтерактивний місячний календар, зайняті дні виділені, навігація по місяцях, розрахунок "Найближча вільна дата"

**SEO:** Product schema з offer details.

**API:** `getEquipmentBySlug(slug)`

### DebrisRemovalPage

**Маршрут:** `/vyviz-smittia`  
**Файл:** `client/src/pages/DebrisRemovalPage.tsx`

**Структура (лендігн-сторінка):**
1. Hero з фоновим зображенням
2. Про послугу
3. "Чому це зручно" (4 картки)
4. "Що ми вивозимо" (7 типів сміття)
5. "Як це працює" (4 кроки)
6. FAQ (5 питань)
7. Внутрішні посилання на каталог та послуги
8. Фінальний CTA

**Модальна форма заявки:**
- Поля: ім'я, телефон, адреса, дата (min=today), час (6 слотів: 08:00-20:00), коментар
- Валідація з error messages
- Success/error states
- **API:** `POST /api/service-requests`

### AdminOverviewPage (Дашборд)

**Маршрут:** `/admin/overview`

**KPI картки (4):**
- Нові заявки (count WHERE status = NEW)
- Активні оренди (RentOrders WHERE status = ACTIVE)
- Вільна техніка (Equipment - зайнятих сьогодні)
- На обслуговуванні (BookedPeriods WHERE note includes "техобслуговування")

**Блоки:**
- Останні заявки (5 шт, sorted by date)
- Закінчення оренд (наступні 7 днів, кольорова індикація терміновості)
- Швидкі дії (посилання на основні розділи)

### AdminEquipmentPage

**Маршрут:** `/admin/equipment`

**Два режими:**
1. **Таблиця** — список всієї техніки: зображення, назва, тип, ціна, популярність
2. **Форма** — створення/редагування: name, slug (auto-generate), brand, type, price, description, isPopular, images (upload/URL, drag-reorder), specs (dynamic key-value pairs)

**Особливості:**
- Auto-slugify з назви (тільки при створенні)
- Завантаження зображень → `POST /api/admin/upload` → WebP
- Drag-to-reorder зображень (перше = основне)
- Визначення dirty state через серіалізацію
- Delete з підтвердженням (ConfirmModal)

### AdminOrdersPage (Заявки)

**Маршрут:** `/admin/orders`

**Layout:** список зліва + деталі справа (2-panel)

**Деталі заявки:**
- Інформація клієнта
- Зміна статусу (dropdown)
- Booked periods (якщо є)
- Кнопка "Створити замовлення" → переходить на RentOrders з prefilled даними
- Quick actions: підтвердити, в обробку, завершити, скасувати, видалити

### AdminRentOrdersPage (Замовлення)

**Маршрут:** `/admin/rent-orders`

**Три режими:** list / detail / form

**Форма замовлення:**
- Клієнт: ім'я, телефон
- Items: масив `{ equipmentId, startDate, endDate }` (можна додавати/видаляти)
- Коментар
- Source type (manual / request)

**Ключова логіка:** При створенні RentOrder сервер автоматично створює BookedPeriod для кожного item.

### AdminOccupancyPage (Календар)

**Маршрут:** `/admin/occupancy`

**Функціональність:**
- Інтерактивний місячний календар
- Фільтр за технікою
- Кожен день показує колір залежно від типу зайнятості:
  - 🟠 Помаранчевий — заброньовано
  - 🔵 Голубий — оренда
  - 🟣 Фіолетовий — техобслуговування
  - ⚪ Сірий — вільно
- Tooltip на hover з деталями
- Модалка створення/редагування періоду

---

## 10. Компонентна структура

### Shared (публічний сайт)

| Компонент | Використовується на | Примітки |
|-----------|---------------------|----------|
| `Header` | Всі публічні сторінки | Sticky, навігація, кнопка замовити |
| `Footer` | Всі публічні сторінки | Контакти, навігація, copyright |
| `MobileTabBar` | Всі публічні сторінки | Тільки mobile, sticky під Header |
| `PageMeta` | Більшість сторінок | SEO обгортка (Helmet) |
| `EquipmentCard` | CatalogPage, PopularEquipment | Картка техніки (link → detail) |
| `OrderModal` | Глобально через context | createPortal, body scroll lock |
| `Skeleton` | CatalogPage, EquipmentDetailPage, admin pages | Skeleton loaders |
| `RequireAuth` | App.tsx (обгортає admin routes) | Redirect якщо не залогінений |

### Shared (адмін-панель)

Barrel export з `components/admin/index.ts`:

| Компонент | Призначення |
|-----------|-------------|
| `AdminButton` | Кнопка з варіантами (primary/secondary/ghost/danger) |
| `AdminCard` | Базова картка-обгортка (rounded, border, bg-white) |
| `AdminFilterBar` | Панель фільтрів (пошук + слоти для додаткових фільтрів) |
| `AdminInput/Textarea/Select` | Інпути з опціональними лейблами |
| `AdminPageHeader` | Заголовок сторінки + subtitle + action slot |
| `ConfirmModal` | Модалка підтвердження (danger/primary варіанти) |
| `StatusBadge` | Кольоровий pill-бейдж статусу |

### Layout

| Компонент | Де | Структура |
|-----------|-----|-----------|
| `AdminLayout` | `/admin/*` | Dark sidebar (навігація) + light content area + Outlet |

---

## 11. Потоки даних

### Створення загальної заявки (від клієнта)

```
1. Клієнт натискає "Замовити техніку" (Header) або "Замовити" (EquipmentDetail)
   → openOrderModal({ equipmentName?, equipmentId? })

2. OrderModal рендериться через createPortal
   → Клієнт заповнює форму (ім'я, телефон, [email, дати, адреса, коментар])

3. handleSubmit() → createOrder(data)
   → apiFetch<T>("POST /orders", body)

4. Backend: orders.ts
   → Zod validation
   → prisma.order.create({ ... })
   → sendTelegramNotification({ ... }) (async, non-blocking)
   → Response: { id, equipment?, ... }

5. Telegram-бот надсилає повідомлення адміну

6. Адмін бачить заявку в AdminOrdersPage
   → Може змінити статус → CONFIRMED → IN_PROGRESS → COMPLETED
   → Може створити RentOrder (кнопка "Створити замовлення")
```

### Створення замовлення оренди (адміном)

```
1. Адмін → AdminOrdersPage → обирає заявку → "Створити замовлення"
   → navigate("/admin/rent-orders", { state: { fromRequest: order } })

2. AdminRentOrdersPage (form mode, prefilled)
   → Адмін обирає техніку, дати для кожного item
   → Submit

3. apiFetch("POST /admin/rent-orders", body)

4. Backend: admin.rent-orders.ts
   → prisma.rentOrder.create({ items: [...] })
   → syncBookedPeriods() — автоматично створює BookedPeriod для кожного item
   → Якщо є sourceRequestId → оновлює статус Order → COMPLETED

5. BookedPeriods з'являються в:
   → AdminOccupancyPage (календар)
   → EquipmentDetailPage (публічний календар)
```

### Оновлення техніки (адміном)

```
1. AdminEquipmentPage → Edit → Форма

2. Зміни: specs (dynamic), images (upload/reorder/delete), мета-дані

3. Зображення:
   → Нові: POST /admin/upload → Sharp → WebP → /uploads/uuid.webp
   → Видалені: DELETE /admin/upload → fs.unlink

4. Submit → PUT /api/admin/equipment/:id
   → Сервер: deleteAll specs + images → createMany нові
   → Якщо зображення видалено — файл видаляється з диску

5. Відповідь з оновленими даними → UI оновлюється
```

---

## 12. Безпека

### Що реалізовано

- **Helmet** — security headers (X-Frame-Options, X-Content-Type-Options тощо)
- **CORS** — обмежений origin (`CLIENT_URL`)
- **Rate limiting** — 10 req/15min для auth, 15 req/15min для orders
- **JWT** — 24h expiry, secret з env
- **bcryptjs** — хешування паролів з salt rounds 12
- **Zod validation** — на кожному POST/PUT/PATCH ендпоїнті
- **File upload restrictions** — тільки image/*, макс 15MB, конвертація в WebP
- **File delete validation** — тільки `/uploads/*.webp` (захист від arbitrary file deletion)
- **XSS prevention** — escaped HTML в Telegram повідомленнях (функція `esc()`)
- **Token cleanup** — на фронтенді: auto-logout при 401

### На що звернути увагу

- **localStorage для токена** — вразливість до XSS (але CSP вимкнено через `contentSecurityPolicy: false`)
- **Немає ролевого контролю** — `role` зберігається в JWT та context, але фактично не перевіряється ніде (ADMIN та MANAGER мають однакові права)
- **Немає CSRF-захисту** — покладається на SameSite cookies (але використовується localStorage, тому не актуально)
- **Env-змінні** — `JWT_SECRET` обов'язковий (сервер кидає помилку без нього)
- **Telegram Bot Token** — якщо не задано, сповіщення тихо ігноруються

---

## 13. Поточний стан проєкту

### Що повністю реалізовано ✅

- Публічний сайт з усіма сторінками і SEO
- Каталог техніки з фільтрами і сортуванням
- Сторінка деталей техніки з календарем доступності
- Модальне вікно замовлення (OrderModal) з валідацією
- Форма "Замовити дзвінок" (CallToAction) з валідацією
- Лендінг вивозу будівельного сміття з формою заявки
- Telegram-сповіщення при створенні заявок
- Адмін-панель: login, dashboard, CRUD техніки, заявки, замовлення, послуги, зайнятість
- Shared UI-бібліотека для адмінки
- Skeleton loaders на всіх сторінках
- Responsive design (desktop → tablet → mobile)
- Динамічний sitemap
- Docker setup для розгортання

### Що тимчасово вимкнено / закоментовано ⏸️

- **Hero.tsx:** кнопка "Залишити заявку" і `useOrderModal` — закоментовані. Наразі тільки "Переглянути техніку" і "Вивіз сміття"

### Що потребує доробки 🔧

- **Ролевий контроль:** `AdminRole` enum існує (ADMIN/MANAGER), але не перевіряється — всі адміни мають однакові права
- **RentOrder status ACTIVE:** не має чіткого тригера переходу (manually set)
- **Контактні дані:** телефон +380 (67) 000-00-00 та email info@technorent.ua — заглушки, потрібно замінити на реальні
- **Google Maps iframe** на ContactsPage — URL з прикладом Львова, потрібна точна адреса
- **SEO:** `SITE_URL` встановлено як `https://technorent.ua`, але фактичний домен — `technorentvercel.vercel.app`
- **Hero зображення:** використовується Unsplash URL — бажано замінити на власне фото
- **WhyChooseUs зображення:** зовнішній URL (`bf-logistic.ua`) — ненадійне джерело

### Відомі технічні особливості ⚠️

- **createPortal + Tailwind v4:** Модалки рендеряться через `createPortal(… , document.body)`. Tailwind v4 `@theme` працює тільки всередині DOM-дерева, де підключено CSS. Тому overlay `bg-black/40` не працює в порталах — потрібен inline `style`. OrderModal вже виправлений, але ConfirmModal (адмін) може мати цю ж проблему (потрібно перевірити)
- **Equipment type mapping:** Backend enum `dump_truck` ↔ Frontend string `dump-truck`. Конвертація в `equipment.service.ts`. При додаванні нових типів потрібно оновлювати обидва mapping'и

---

## 14. Технічний борг

### Де структура хороша

- Чіткий поділ client/server
- Prisma schema добре нормалізована, з indexes
- Shared admin UI-компоненти (уникає дублювання)
- Consistent pattern для admin pages (list → detail → form)
- Zod-валідація на кожному ендпоїнті
- Skeleton loaders забезпечують хороший UX

### Де є дублювання

- `statusMap` (Record<status, color/label>) визначається **окремо в кожній admin page** (Orders, RentOrders, ServiceRequests) замість одного shared об'єкта
- Форми валідації (pattern "touched + field check") в OrderModal, CallToAction, DebrisRemovalPage — однаковий паттерн без абстракції
- Date formatting helpers (`fmtDate`, `toInputDate`) дублюються в admin pages

### Тимчасові рішення

- Телефон і email в Header/Footer — hardcoded заглушки
- Hero/WhyChooseUs зображення з зовнішніх URL
- `ConfirmModal` використовує `bg-black/60` — може не працювати в Tailwind v4 через createPortal (не перевірено)
- SEO canonical URLs вказують на `technorent.ua`, а не на фактичний домен

### Що варто рефакторити в майбутньому

1. **Спільний status config** — один файл з усіма статусами, кольорами та лейблами
2. **Абстракція форм** — custom hook для валідації (touched + errors pattern)
3. **Date utilities** — один файл з `fmtDate`, `toInputDate`, `todayISO`
4. **Image component** — обгортка для `resolveImageUrl` з fallback placeholder
5. **Ролевий доступ** — middleware + frontend guard для ADMIN vs MANAGER дій
6. **Заміна localStorage на httpOnly cookie** для підвищення безпеки (але потребує proxy configuration)

---

## 15. Адмін-панель (окремий розділ)

### Загальна архітектура

```
AdminLayout (sidebar + content)
├── Sidebar: 6 пунктів навігації + logout
├── Mobile: hamburger + overlay
└── Content: <Outlet /> → рендерить поточну admin page
```

**Стиль:** темний sidebar (`#0f1115`, `#171a21`) + світлий контент (`#f5f6fa`)

### Розділи адмінки

| Розділ | Функція | Складність |
|--------|---------|------------|
| Огляд | Dashboard з KPI | Середня (3 паралельних API) |
| Техніка | CRUD з зображеннями | **Висока** (drag, upload, specs) |
| Заявки | Список + деталі + quick actions | Середня |
| Замовлення | Multi-item orders + BookedPeriod sync | **Висока** |
| Послуги | Простий CRUD статусів | Низька |
| Зайнятість | Інтерактивний календар | **Висока** (grid, tooltips, filter) |

### UX-рішення

- **2-panel layout** для Orders, ServiceRequests — список зліва, деталі справа
- **3-mode view** для RentOrders — list / detail / form
- **Table + Form toggle** для Equipment
- **ConfirmModal** для destructive actions
- **Unsaved changes warning** в Equipment і RentOrders
- **Source linking** — Order → RentOrder (можна створити замовлення з заявки)
- **Status badges** — кольорові pills для візуального розрізнення статусів

---

## 16. Деплой

### Vercel (Frontend)

- **Repo:** `techno_rent_vercel` (remote `vercel`)
- **Config:** `client/vercel.json` — `.rewrites: source: "(.*)" → /index.html`
- **Build:** `npm run build` → `dist/`
- **Env:** `VITE_API_URL` = backend URL

### Render (Backend)

- **Repo:** `TechnoRent` (remote `origin`)
- **Config:** Dockerfile (multi-stage build)
- **Env:** DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_URL, SITE_URL, PORT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- **Start:** `npx prisma migrate deploy && npx prisma db seed && node dist/index.js`
- **Uploads:** зберігаються на filesystem сервера (не persist across deploys на безкоштовному Render)

### Важливо перед деплоєм

1. `VITE_API_URL` на Vercel має вказувати на Render backend URL
2. `CLIENT_URL` на Render має вказувати на Vercel frontend URL (для CORS)
3. Database migration виконується автоматично при старті
4. Seed виконується автоматично, але тільки якщо БД порожня

### Docker (альтернативний деплой)

```bash
docker-compose up -d
```

Запускає PostgreSQL + server з усім необхідним.

---

## 17. Що потрібно знати новому агенту перед початком роботи

### З чого починати аналіз

1. **Прочитай цей документ** — він дає 90% контексту
2. **Відкрий App.tsx** — зрозумій маршрутизацію
3. **Відкрий schema.prisma** — зрозумій моделі даних
4. **Відкрий server/src/index.ts** — зрозумій API-структуру
5. **Подивись index.css** — зрозумій кольори і тему

### Які файли читати першими

| Пріоритет | Файл | Чому |
|-----------|------|------|
| 🔴 1 | `client/src/App.tsx` | Всі маршрути |
| 🔴 2 | `server/prisma/schema.prisma` | Вся модель даних |
| 🔴 3 | `server/src/index.ts` | Всі API endpoints |
| 🟡 4 | `client/src/api/client.ts` | Як фронтенд спілкується з бекендом |
| 🟡 5 | `client/src/data/types.ts` | Типи фронтенду |
| 🟡 6 | `client/src/data/equipment.service.ts` | API-сервісний шар |
| 🟡 7 | `client/src/context/AuthContext.tsx` | Як працює аутентифікація |
| 🟢 8 | `client/src/index.css` | Кольори і тема |

### Які частини найкритичніші

1. **`admin.rent-orders.ts`** — найскладніша бізнес-логіка (multi-item, BookedPeriod sync, status-dependent behavior)
2. **`AdminEquipmentPage.tsx`** — найбільший за розміром frontend файл (500+ рядків), складна форма
3. **`equipment.service.ts`** — type mapping між API та фронтендом, URL resolution для зображень
4. **`api/client.ts`** — 401 handling logic (redirect vs show error залежно від location)

### Ризики ламання логіки

| Ризик | Що може зламатися |
|-------|-------------------|
| Зміна EquipmentType enum | Потрібно оновити: schema.prisma, types.ts, mapApiType(), unmapType(), equipmentTypeLabels |
| Зміна OrderStatus/RentOrderStatus | Потрібно оновити: schema.prisma, Zod schemas, statusMap в кожній admin page, StatusBadge |
| Зміна BookedPeriod логіки | Може зламати: calendar в AdminOccupancy + EquipmentDetail, RentOrder sync |
| Зміна 401 handling в client.ts | Може зламати login flow або auto-logout |
| Зміна createPortal behavior | Потрібно перевірити: overlay opacity, scroll lock, Tailwind v4 scope |
| Видалення equipment.images | Потрібно видаляти і файл з диску через DELETE /admin/upload |

### Місця, що потребують особливої обережності

1. **`syncBookedPeriods()`** в `admin.rent-orders.ts` — видаляє всі BookedPeriods замовлення перед створенням нових. Якщо помилка на етапі create — дані будуть втрачені
2. **AdminEquipmentPage**: PUT endpoint видаляє всі specs/images перед створенням нових — якщо помилка при create, дані будуть втрачені (не в транзакції)
3. **Image URL resolution** — `resolveImageUrl()` стрипає `/api` з `API_BASE`. Якщо формат URL зміниться, зображення перестануть відображатися
4. **Phone validation** — фронтенд перевіряє `phone.length < 10`, бекенд `phone.length >= 5`. Неузгодженість

---

## 18. Рекомендації для майбутніх змін

### Як краще вносити зміни

1. **Перед зміною**: прочитай файл повністю, зрозумій контекст
2. **TypeScript**: не ігноруй помилки типів — вони рятують від runtime bugs
3. **Tailwind**: використовуй кастомні кольори з `@theme` (`text-primary`, `bg-dark` тощо), не хардкодь hex
4. **createPortal модалки**: використовуй inline styles для overlay background; перевіряй, чи не потрібен body scroll lock
5. **Admin UI**: використовуй shared компоненти з `components/admin/` (AdminButton, AdminCard тощо)
6. **API зміни**: змінюй і бекенд і фронтенд одночасно; не забувай type mapping
7. **Після змін**: запусти `npx tsc --noEmit` для перевірки типів, `npx vite build` для перевірки білду

### Як не ламати існуючий UI

- Не змінюй responsive breakpoints без тестування на всіх розмірах
- Не видаляй `max-w-full` / `overflow-hidden` — вони запобігають horizontal scroll
- Зберігай padding pattern: `px-[120px] max-xl:px-8 max-md:px-4`
- Мобільна навігація: не чіпай `top-[61px]` в MobileTabBar без зміни висоти Header

### Як вводити нові сторінки

1. Створи файл в `pages/`
2. Додай маршрут в `App.tsx`
3. Для публічної: додай Header, MobileTabBar, Footer, PageMeta
4. Для адмін: додай під `AdminLayout` Route, додай пункт в sidebar (AdminLayout.tsx)
5. Оновити sitemap (якщо публічна) — `server/src/index.ts`

### Як перевіряти результат

1. `npx tsc --noEmit` — перевірка типів
2. `npx vite build` — перевірка білду
3. Перевірити в браузері: desktop (1366+), tablet (768), mobile (375)
4. Перевірити console на помилки
5. Перевірити lighthouse для SEO-критичних сторінок

---

## 19. Топ найважливіших файлів

| # | Файл | Що в ньому | Коли звертатися |
|---|------|-----------|----------------|
| 1 | `server/prisma/schema.prisma` | Вся модель даних, enums, зв'язки | При будь-якій зміні даних |
| 2 | `client/src/App.tsx` | Всі маршрути, провайдери | При додаванні сторінок |
| 3 | `server/src/index.ts` | Всі API endpoints, middleware, sitemap | При зміні API |
| 4 | `client/src/api/client.ts` | HTTP-клієнт, auth, 401 handling | При зміні автентифікації |
| 5 | `client/src/data/equipment.service.ts` | API-функції, type mapping, URL resolution | При зміні Equipment API |
| 6 | `client/src/data/types.ts` | Frontend типи Equipment | При зміні моделей |
| 7 | `client/src/index.css` | Tailwind theme (кольори, шрифти) | При зміні дизайн-системи |
| 8 | `server/src/routes/admin.rent-orders.ts` | Найскладніша бізнес-логіка | При зміні процесу оренди |
| 9 | `client/src/pages/AdminEquipmentPage.tsx` | Найбільший UI файл (CRUD техніки) | При зміні форми техніки |
| 10 | `client/src/components/OrderModal.tsx` | Глобальна модалка замовлення | При зміні форми замовлення |
| 11 | `server/src/lib/telegram.ts` | Telegram сповіщення | При зміні формату повідомлень |
| 12 | `client/src/components/AdminLayout.tsx` | Layout адмінки (sidebar) | При додаванні admin sections |
| 13 | `.env.example` | Шаблон змінних середовища | При deployment |
| 14 | `server/src/middleware/auth.ts` | JWT auth middleware | При зміні авторизації |
| 15 | `client/src/context/AuthContext.tsx` | Frontend auth state | При зміні login flow |

---

## 20. Що в цьому документі може застаріти найшвидше

| Що | Чому |
|----|------|
| Список API-ендпоїнтів | Нові features → нові endpoints |
| Статус виправлених багів (розділ 13) | Баги виправляються, нові з'являються |
| Тимчасово вимкнений функціонал (Hero кнопка) | Може бути повернутий |
| Контактні дані (телефон, email) | Заглушки → реальні дані |
| Production URLs | Домен може змінитися |
| Список admin pages в sidebar | Нові розділи адмінки |
| Versії залежностей (React 19, Vite 8 тощо) | Package updates |

**Рекомендація:** При суттєвих змінах оновлюй відповідні розділи цього документа.

---

## 21. Питання, які залишилися відкритими після аналізу коду

1. **Реальні контактні дані:** Яку адресу, телефон і email потрібно вказати замість заглушок?
2. **Домен:** Який буде фінальний домен? `technorent.ua` чи `technorentvercel.vercel.app`?
3. **Ролевий контроль:** Які саме дії має мати MANAGER, що не має ADMIN? Або навпаки?
4. **Persistence зображень:** Render free tier не зберігає файли між redeploys — чи потрібен S3/Cloudinary?
5. **Кнопка "Залишити заявку" в Hero:** Чому закоментована? Тимчасово чи назавжди?
6. **Оплата:** Чи планується інтеграція з платіжною системою?
7. **Мультимовність:** Чи потрібна English версія або інші мови?
8. **Аналітика:** Чи потрібен Google Analytics / tag manager?
9. **BookedPeriod без транзакцій:** `syncBookedPeriods()` видаляє і створює без транзакції — чи це прийнятний ризик?
10. **Service types:** Наразі тільки `debris_removal` — які ще послуги планується додати?
