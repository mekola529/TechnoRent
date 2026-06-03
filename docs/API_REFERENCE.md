# API Reference — TechnoRent

> **Base URL (production):** `https://technorent.lanbox.com.ua/api`
> **Base URL (local):** `http://localhost:3001/api`
> **Дата оновлення:** 24 квітня 2026

---

## Зміст

1. [Загальна інформація](#1-загальна-інформація)
2. [Аутентифікація](#2-аутентифікація)
3. [Rate Limiting](#3-rate-limiting)
4. [Коди помилок](#4-коди-помилок)
5. [Public API — Техніка](#5-public-api--техніка)
6. [Public API — Замовлення](#6-public-api--замовлення)
7. [Public API — Заявки на послуги](#7-public-api--заявки-на-послуги)
8. [Public API — Послуги](#8-public-api--послуги)
9. [Auth API](#9-auth-api)
10. [Admin API — Техніка](#10-admin-api--техніка)
11. [Admin API — Замовлення (Orders)](#11-admin-api--замовлення-orders)
12. [Admin API — Оренда (Rent Orders)](#12-admin-api--оренда-rent-orders)
13. [Admin API — Зайнятість (Occupancy)](#13-admin-api--зайнятість-occupancy)
14. [Admin API — Завантаження файлів](#14-admin-api--завантаження-файлів)
15. [Admin API — Заявки на послуги](#15-admin-api--заявки-на-послуги)
16. [Admin API — Послуги (Services)](#16-admin-api--послуги-services)
17. [Admin API — GPS](#17-admin-api--gps)
18. [Admin API — Сповіщення](#18-admin-api--сповіщення)
19. [Public/Admin API — Налаштування](#19-publicadmin-api--налаштування)
20. [Health Check](#20-health-check)
21. [Sitemap](#21-sitemap)
22. [Enum-значення](#22-enum-значення)

---

## 1. Загальна інформація

- **Фреймворк:** Express 5.1 + TypeScript
- **БД:** PostgreSQL + pg (node-postgres) 8.13 — raw SQL, parameterized queries
- **Валідація:** Zod 3.25+
- **Формат:** JSON (Content-Type: application/json)
- **Завантаження файлів:** multipart/form-data
- **Захист:** Helmet, CORS (тільки CLIENT_URL)
- **Хостинг:** cPanel (HostPro), Phusion Passenger, Node.js v20.20.0

> **Примітка:** Проєкт мігровано з Prisma ORM на raw SQL (pg) у квітні 2026. Всі запити через `pool.query(sql, params)`.

---

## 2. Аутентифікація

Всі admin-ендпоінти (`/api/admin/*`) захищені JWT-токеном.

**Заголовок:**
```
Authorization: Bearer <token>
```

Токен отримується через `POST /api/auth/login` та діє **24 години**.

JWT payload: `{ id: string, role: string }`.

При невалідному/відсутньому токені повертається `401`.

---

## 3. Rate Limiting

| Група | Ліміт | Вікно | Повідомлення |
|-------|-------|-------|-------------|
| Login (`POST /api/auth/login`) | 10 запитів | 15 хв | `"Забагато спроб. Спробуйте пізніше."` |
| Orders & Service Requests (`/api/orders`, `/api/service-requests`) | 15 запитів | 15 хв | `"Забагато заявок. Спробуйте пізніше."` |

Повертає стандартні `RateLimit-*` заголовки. При перевищенні — `429 Too Many Requests`.

---

## 4. Коди помилок

| HTTP Status | Опис | Приклад тіла |
|------------|------|-------------|
| `200` | Успішна операція (GET, PUT, PATCH, DELETE) | `{ ... }` |
| `201` | Ресурс створено (POST) | `{ ... }` |
| `400` | Валідаційна помилка / невалідні дані | `{ "error": "...", "details": [...] }` |
| `401` | Не авторизовано / невірний токен | `{ "error": "Не авторизовано" }` |
| `404` | Ресурс не знайдено | `{ "error": "Техніку не знайдено" }` |
| `429` | Rate limit перевищено | `{ "error": "Забагато спроб..." }` |
| `500` | Серверна помилка | `{ "error": "Помилка сервера" }` |

**Формат помилки валідації (Zod):**
```json
{
  "error": "Помилка валідації",
  "details": [
    { "path": ["customerName"], "message": "Ім'я обов'язкове" }
  ]
}
```

---

## 5. Public API — Техніка

### `GET /api/equipment`

Отримати список техніки з фільтрами.

**Query Parameters:**

| Параметр | Тип | За замовчуванням | Опис |
|----------|-----|-----------------|------|
| `type` | string | `all` | Фільтр за типом техніки (`Екскаватор`, `Самоскид`, `Евакуатор` тощо) |
| `brand` | string | `all` | Фільтр за брендом |
| `popular` | `"true"` | — | Тільки популярні |
| `sort` | string | `createdAt desc` | Сортування: `price-asc`, `price-desc`, `name` |

**Response `200`:**
```json
[
  {
    "id": "cuid",
    "slug": "cat-320",
    "name": "CAT 320",
    "brand": "Caterpillar",
    "type": "Екскаватор",
    "description": "Потужний екскаватор...",
    "pricePerHour": 1200,
    "isPopular": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "images": [{ "id": "...", "url": "/uploads/abc.webp", "alt": "CAT 320", "equipmentId": "..." }],
    "specs": [{ "id": "...", "label": "Вага", "value": "20 т", "equipmentId": "..." }],
    "bookedPeriods": [{ "id": "...", "from": "...", "to": "...", "note": "...", "equipmentId": "...", "orderId": null, "rentOrderId": null }]
  }
]
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/equipment?type=excavator&sort=price-asc"
```

---

### `GET /api/equipment/:slug`

Отримати одиницю техніки за slug.

**Response `200`:** Об'єкт Equipment (як в масиві вище).

**Response `404`:**
```json
{ "error": "Техніку не знайдено" }
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/equipment/cat-320"
```

---

### `GET /api/equipment/meta/brands`

Отримати список унікальних брендів.

**Response `200`:**
```json
["Caterpillar", "JCB", "Komatsu"]
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/equipment/meta/brands"
```

---

### `GET /api/equipment/meta/types`

Отримати список наявних типів техніки.

**Response `200`:**
```json
["Бульдозер", "Екскаватор", "Кран", "Самоскид"]
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/equipment/meta/types"
```

---

## 6. Public API — Замовлення

### `POST /api/orders`

Створити замовлення (з форми на сайті). Rate limited (15/15хв).

**Zod Schema (`createOrderSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `customerName` | string | ✅ | min(1) — `"Ім'я обов'язкове"` |
| `phone` | string | ✅ | min(5) — `"Мобільний обов'язковий"` |
| `email` | string | ❌ | email() або `""` |
| `dateFrom` | string | ❌ | ISO date string або `""` |
| `dateTo` | string | ❌ | ISO date string або `""` |
| `address` | string | ❌ | або `""` |
| `comment` | string | ❌ | або `""` |
| `equipmentId` | string | ❌ | min(1) або `""` |

**Request:**
```json
{
  "customerName": "Іван Іванов",
  "phone": "+380991234567",
  "email": "ivan@example.com",
  "equipmentId": "clx1abc..."
}
```

**Response `201`:**
```json
{
  "id": "clx...",
  "customerName": "Іван Іванов",
  "phone": "+380991234567",
  "email": "ivan@example.com",
  "dateFrom": null,
  "dateTo": null,
  "address": null,
  "comment": null,
  "status": "NEW",
  "equipmentId": "clx1abc...",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "updatedAt": "2025-01-15T12:00:00.000Z",
  "equipment": { "name": "CAT 320", "slug": "cat-320" }
}
```

**Response `404`:** (якщо `equipmentId` вказано, але техніки не знайдено)
```json
{ "error": "Техніку не знайдено" }
```

**Побічний ефект:** Відправляє Telegram-сповіщення (асинхронно, не блокує відповідь).

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Іван","phone":"+380991234567"}'
```

---

## 7. Public API — Заявки на послуги

### `POST /api/service-requests`

Створити заявку на послугу. Rate limited (15/15хв).

**Zod Schema (`createSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `serviceType` | string | ✅ | min(1) |
| `customerName` | string | ✅ | min(1) — `"Ім'я обов'язкове"` |
| `phone` | string | ✅ | min(5) — `"Телефон обов'язковий"` |
| `address` | string | ✅ | min(1) — `"Адреса обов'язкова"` |
| `date` | string | ✅ | Date.parse() — `"Невірна дата"` |
| `time` | string | ✅ | min(1) — `"Час обов'язковий"` |
| `comment` | string | ❌ | або `""` |

**Request:**
```json
{
  "serviceType": "Вивіз сміття",
  "customerName": "Петро Петренко",
  "phone": "+380997654321",
  "address": "м. Київ, вул. Хрещатик 1",
  "date": "2025-02-01",
  "time": "10:00"
}
```

**Response `201`:**
```json
{
  "id": "clx...",
  "serviceType": "Вивіз сміття",
  "customerName": "Петро Петренко",
  "phone": "+380997654321",
  "address": "м. Київ, вул. Хрещатик 1",
  "date": "2025-02-01T00:00:00.000Z",
  "time": "10:00",
  "comment": null,
  "status": "NEW",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "updatedAt": "2025-01-15T12:00:00.000Z"
}
```

**Побічний ефект:** Telegram-сповіщення (асинхронно).

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/service-requests" \
  -H "Content-Type: application/json" \
  -d '{"serviceType":"Вивіз сміття","customerName":"Петро","phone":"+380997654321","address":"Київ","date":"2025-02-01","time":"10:00"}'
```

---

## 8. Public API — Послуги

### `GET /api/services`

Список активних послуг.

**Query Parameters:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `popular` | `"true"` | Повернути тільки популярні послуги для головної сторінки |

**Response `200`:**
```json
[
  {
    "id": "md5-uuid",
    "slug": "kopannia-transheyi",
    "title": "Копання траншей",
    "shortDescription": "Копання траншей екскаватором...",
    "fullDescription": "Повний опис...",
    "image": "https://images.unsplash.com/...",
    "priceInfo": "від 1 200 грн/год",
    "pricingType": "hourly_from",
    "relatedEquipmentTypes": ["excavator"],
    "features": ["Траншеї будь-якої глибини", "Точне виконання за проєктом"],
    "seoTitle": "Копання траншей у Львові — TechnoRent",
    "seoDescription": "...",
    "isActive": true,
    "isPopular": false,
    "sortOrder": 2,
    "createdAt": "2026-04-10T00:00:00.000Z",
    "updatedAt": "2026-04-10T00:00:00.000Z"
  }
]
```

---

### `GET /api/services/:slug`

Отримати послугу за slug (тільки активні).

**Response `200`:** Об'єкт Service (як в масиві вище).

**Response `404`:**
```json
{ "error": "Послугу не знайдено" }
```

---

### `GET /api/services/by-equipment-type/:type`

Отримати послуги, пов'язані з типом техніки.

**Response `200`:** Масив Service (тільки активні, де `type` є в `relatedEquipmentTypes`).

---

### `GET /api/services/:slug/tow-calculator`

Публічний endpoint для сторінки послуги/техніки евакуатора. Повертає список доступних прив'язаних GPS-маячків, щоб калькулятор міг обрати найближчий евакуатор до точки евакуації.

**Особливості:**
- працює тільки для послуг з `pricingType = "tow_calculator"`
- бере GPS-локацію з `TrackerDevice`, прив'язаного до `Equipment`
- якщо GPS-маячки не прив'язані або не мають позиції, повертає `available: false`

**Response `200`:**
```json
{
  "available": true,
  "priceInfo": "35 грн/км",
  "deliveryRatePerKm": 35,
  "trackers": [
    {
      "available": true,
      "trackerDevice": {
        "id": "trk_1",
        "name": "Евакуатор Рено",
        "lastAddress": "Липники, Львівська область, Україна",
        "lastLatitude": 49.82,
        "lastLongitude": 23.95,
        "lastTrackerAt": "2026-04-16T15:05:05.000Z"
      },
      "equipment": {
        "id": "eq_1",
        "name": "Евакуатор Renault",
        "slug": "evakuator-renault"
      }
    }
  ],
  "message": null
}
```

**Response `200` (GPS недоступний):**
```json
{
  "available": false,
  "priceInfo": "35 грн/км",
  "message": "Для цієї послуги ще не прив'язаний GPS-маячок до техніки."
}
```

**Response `400`:**
```json
{ "error": "Для цієї послуги калькулятор недоступний" }
```

---

### `GET /api/services/:slug/material-delivery-options`

Публічні дані для калькулятора доставки сипучих матеріалів.

**Response `200`:** матеріали, точки постачання, тарифи і доступна техніка для розрахунку.

---

### `POST /api/services/:slug/material-delivery-calculate`

Розрахунок доставки сипучих матеріалів.

**Request:**
```json
{
  "materialId": "sand",
  "quantity": 10,
  "unit": "т",
  "address": "Городок, Львівська область",
  "latitude": 49.78,
  "longitude": 23.65,
  "requestMode": "urgent",
  "scheduledDate": "",
  "scheduledTime": ""
}
```

**Response `200`:** орієнтовна вартість, відстані, найближча точка постачання і рекомендована техніка.

---

## 9. Auth API

### `POST /api/auth/login`

Авторизація адміна. Rate limited (10/15хв).

**Zod Schema (`loginSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `email` | string | ✅ | min(1) — `"Логін обов'язковий"` |
| `password` | string | ✅ | min(1) — `"Пароль обов'язковий"` |

**Request:**
```json
{
  "email": "admin@technorent.ua",
  "password": "secretpassword"
}
```

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "admin": {
    "id": "clx...",
    "email": "admin@technorent.ua",
    "role": "SUPER_ADMIN"
  }
}
```

**Response `401`:**
```json
{ "error": "Невірний логін або пароль" }
```

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@technorent.ua","password":"secret"}'
```

---

### `GET /api/auth/me`

Перевірка поточного токена (хто я).

**Headers:** `Authorization: Bearer <token>`

**Response `200`:**
```json
{
  "id": "clx...",
  "email": "admin@technorent.ua",
  "role": "SUPER_ADMIN"
}
```

**Response `401`:**
```json
{ "error": "Не авторизовано" }
```
або
```json
{ "error": "Невалідний токен" }
```
або
```json
{ "error": "Адміна не знайдено" }
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/auth/me" \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 10. Admin API — Техніка

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `POST /api/admin/equipment`

Створити одиницю техніки.

**Zod Schema (`equipmentSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `slug` | string | ✅ | min(1) |
| `name` | string | ✅ | min(1) |
| `brand` | string | ✅ | min(1) |
| `type` | string | ✅ | Довільний тип техніки; при збереженні нормалізується і додається в каталог типів |
| `description` | string | ✅ | min(1) |
| `pricingType` | enum | ❌ | `fixed_from`, `hourly_from`, `calculator`, `tow_calculator`, `material_delivery_calculator`, `custom`; default `hourly_from` |
| `pricePerHour` | number | ✅ | positive() |
| `isPopular` | boolean | ❌ | |
| `specs` | array | ❌ | `[{ label: string, value: string }]` |
| `images` | array | ❌ | `[{ url: string, alt: string }]` |

**Request:**
```json
{
  "slug": "cat-320",
  "name": "CAT 320",
  "brand": "Caterpillar",
  "type": "Екскаватор",
  "description": "Потужний екскаватор для будівництва",
  "pricingType": "hourly_from",
  "pricePerHour": 1200,
  "isPopular": true,
  "specs": [
    { "label": "Вага", "value": "20 т" },
    { "label": "Потужність", "value": "162 к.с." }
  ],
  "images": [
    { "url": "/uploads/abc123.webp", "alt": "CAT 320 вид спереду" }
  ]
}
```

**Response `201`:** Повний об'єкт Equipment з `specs`, `images`, `bookedPeriods`.

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/admin/equipment" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"cat-320","name":"CAT 320","brand":"Caterpillar","type":"Екскаватор","description":"Опис","pricePerHour":1200}'
```

---

### `GET /api/admin/equipment/types`

Отримати каталог доступних типів техніки для повторного використання в адмінці.

**Response `200`:**
```json
["Бетонозмішувач", "Евакуатор", "Екскаватор", "Кран", "Самоскид"]
```

---

### `PUT /api/admin/equipment/:id`

Оновити техніку (часткове оновлення, `equipmentSchema.partial()`).

Якщо передано `specs` — видаляє старі та створює нові.
Якщо передано `images` — видаляє старі файли з диска (якщо URL змінився) та створює нові записи.

**Response `200`:** Оновлений об'єкт Equipment.

**curl:**
```bash
curl -X PUT "https://techno-rent-vercel.onrender.com/api/admin/equipment/<id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pricePerHour":1500,"isPopular":false}'
```

---

### `DELETE /api/admin/equipment/:id`

Видалити техніку. Також видаляє файли зображень з диска.

**Response `200`:**
```json
{ "success": true }
```

**curl:**
```bash
curl -X DELETE "https://techno-rent-vercel.onrender.com/api/admin/equipment/<id>" \
  -H "Authorization: Bearer <token>"
```

---

## 11. Admin API — Замовлення (Orders)

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `GET /api/admin/orders`

Список замовлень з фільтрацією.

**Query Parameters:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `status` | string | Фільтр: `NEW`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` або `all` |

**Response `200`:**
```json
[
  {
    "id": "clx...",
    "customerName": "Іван",
    "phone": "+380991234567",
    "email": "ivan@example.com",
    "dateFrom": "2025-02-01T00:00:00.000Z",
    "dateTo": "2025-02-10T00:00:00.000Z",
    "address": "Київ",
    "comment": null,
    "status": "NEW",
    "equipmentId": "clx...",
    "createdAt": "2025-01-15T12:00:00.000Z",
    "updatedAt": "2025-01-15T12:00:00.000Z",
    "equipment": { "name": "CAT 320", "slug": "cat-320" },
    "bookedPeriods": [],
    "rentOrders": []
  }
]
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/admin/orders?status=NEW" \
  -H "Authorization: Bearer <token>"
```

---

### `PATCH /api/admin/orders/:id/status`

Оновити статус замовлення.

**Zod Schema (`statusSchema`):**

| Поле | Тип | Обов'язкове | Допустимі значення |
|------|-----|-------------|-------------------|
| `status` | enum | ✅ | `NEW`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |

**Request:**
```json
{ "status": "CONFIRMED" }
```

**Response `200`:** Оновлений об'єкт Order з `equipment` та `bookedPeriods`.

**curl:**
```bash
curl -X PATCH "https://techno-rent-vercel.onrender.com/api/admin/orders/<id>/status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"CONFIRMED"}'
```

---

### `DELETE /api/admin/orders/:id`

Видалити замовлення.

**Response `200`:**
```json
{ "success": true }
```

---

## 12. Admin API — Оренда (Rent Orders)

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `GET /api/admin/rent-orders`

Список замовлень оренди.

**Query Parameters:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `status` | string | Фільтр: `NEW`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `CANCELLED` або `all` |

**Response `200`:**
```json
[
  {
    "id": "clx...",
    "customerName": "Петро",
    "customerPhone": "+380997654321",
    "status": "NEW",
    "comment": null,
    "sourceType": "manual",
    "sourceRequestId": null,
    "createdAt": "2025-01-15T12:00:00.000Z",
    "updatedAt": "2025-01-15T12:00:00.000Z",
    "items": [
      {
        "id": "clx...",
        "equipmentId": "clx...",
        "startDate": "2025-02-01T00:00:00.000Z",
        "endDate": "2025-02-10T00:00:00.000Z",
        "rentOrderId": "clx...",
        "equipment": { "id": "clx...", "name": "CAT 320", "slug": "cat-320" }
      }
    ],
    "sourceRequest": null
  }
]
```

---

### `GET /api/admin/rent-orders/:id`

Отримати одне замовлення оренди.

**Response `200`:** Об'єкт RentOrder (як в масиві вище).

**Response `404`:**
```json
{ "error": "Замовлення не знайдено" }
```

---

### `POST /api/admin/rent-orders`

Створити замовлення оренди.

**Zod Schema (`rentOrderSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `customerName` | string | ✅ | min(1) |
| `customerPhone` | string | ✅ | min(1) |
| `items` | array | ✅ | min(1) — `"Додайте хоча б одну техніку"` |
| `items[].equipmentId` | string | ✅ | min(1) |
| `items[].startDate` | string | ✅ | Date.parse() — `"Invalid date"` |
| `items[].endDate` | string | ✅ | Date.parse() — `"Invalid date"` |
| `status` | enum | ❌ | `NEW`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `CANCELLED` (дефолт: `NEW`) |
| `comment` | string | ❌ | |
| `sourceType` | enum | ❌ | `manual`, `request` (дефолт: `manual`) |
| `sourceRequestId` | string | ❌ | ID заявки-джерела |

**Request:**
```json
{
  "customerName": "Петро Петренко",
  "customerPhone": "+380997654321",
  "items": [
    {
      "equipmentId": "clx1abc...",
      "startDate": "2025-02-01",
      "endDate": "2025-02-10"
    }
  ],
  "comment": "Потрібна доставка"
}
```

**Response `201`:** Об'єкт RentOrder з `items` та `sourceRequest`.

**Побічні ефекти:**
- Автоматично створює `BookedPeriod` для кожного item (якщо статус не `CANCELLED`).
- Якщо `sourceRequestId` вказано — автоматично змінює статус Order-джерела на `COMPLETED`.

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/admin/rent-orders" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Петро","customerPhone":"+380997654321","items":[{"equipmentId":"clx...","startDate":"2025-02-01","endDate":"2025-02-10"}]}'
```

---

### `PUT /api/admin/rent-orders/:id`

Оновити замовлення оренди (часткове оновлення, `rentOrderSchema.partial()`).

Якщо передано `items` — видаляє старі та створює нові. Також пересинхронізує `BookedPeriod`.

**Response `200`:** Оновлений об'єкт RentOrder.

---

### `PATCH /api/admin/rent-orders/:id/status`

Оновити статус замовлення оренди.

**Request:**
```json
{ "status": "ACTIVE" }
```

**Response `200`:** Оновлений об'єкт RentOrder.

**Побічні ефекти (BookedPeriods):**
- `CANCELLED` / `COMPLETED` → видаляє всі BookedPeriods цього замовлення.
- Інші статуси → відновлює BookedPeriods з items (якщо їх ще немає).

---

### `DELETE /api/admin/rent-orders/:id`

Видалити замовлення оренди. Також видаляє пов'язані `BookedPeriod`.

**Response `200`:**
```json
{ "success": true }
```

---

## 13. Admin API — Зайнятість (Occupancy)

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

Управління періодами зайнятості техніки (ручне додавання / зв'язка із замовленням).

### `GET /api/admin/occupancy`

Список усіх періодів зайнятості.

**Response `200`:**
```json
[
  {
    "id": "clx...",
    "from": "2025-02-01T00:00:00.000Z",
    "to": "2025-02-10T00:00:00.000Z",
    "note": "Ремонт",
    "equipmentId": "clx...",
    "orderId": null,
    "rentOrderId": null,
    "equipment": { "id": "clx...", "name": "CAT 320", "slug": "cat-320" },
    "order": null,
    "rentOrder": null
  }
]
```

---

### `POST /api/admin/occupancy`

Створити період зайнятості.

**Zod Schema (`periodSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `from` | string | ✅ | Date.parse() — `"Invalid date"` |
| `to` | string | ✅ | Date.parse() — `"Invalid date"` |
| `note` | string | ❌ | |
| `equipmentId` | string | ✅ | min(1) |
| `orderId` | string | ❌ | |

**Request:**
```json
{
  "from": "2025-02-01",
  "to": "2025-02-10",
  "note": "На ремонті",
  "equipmentId": "clx..."
}
```

**Response `201`:** Об'єкт BookedPeriod з `equipment`, `order`, `rentOrder`.

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/admin/occupancy" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"from":"2025-02-01","to":"2025-02-10","equipmentId":"clx...","note":"На ремонті"}'
```

---

### `PUT /api/admin/occupancy/:id`

Оновити період зайнятості (часткове оновлення, `periodSchema.partial()`).

**Response `200`:** Оновлений об'єкт BookedPeriod.

---

### `DELETE /api/admin/occupancy/:id`

Видалити період зайнятості.

**Response `200`:**
```json
{ "success": true }
```

---

## 14. Admin API — Завантаження файлів

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `POST /api/admin/upload`

Завантажити зображення. Автоматично конвертує у WebP.

**Content-Type:** `multipart/form-data`

**Параметри:**

| Поле | Тип | Опис |
|------|-----|------|
| `image` | file | Зображення (max 15MB, тільки `image/*`) |

**Обробка:**
- Resize: max 1200px ширина (без збільшення менших)
- Формат: WebP
- Якість: 80
- Ім'я файлу: `crypto.randomUUID().webp`
- Зберігається в: `/uploads/`

**Response `200`:**
```json
{
  "url": "/uploads/550e8400-e29b-41d4-a716-446655440000.webp",
  "alt": "original-filename.jpg"
}
```

**Response `400`:**
```json
{ "error": "Файл не завантажено" }
```

**curl:**
```bash
curl -X POST "https://techno-rent-vercel.onrender.com/api/admin/upload" \
  -H "Authorization: Bearer <token>" \
  -F "image=@./photo.jpg"
```

---

### `DELETE /api/admin/upload`

Видалити завантажене зображення з диску.

**Request:**
```json
{ "url": "/uploads/550e8400-e29b-41d4-a716-446655440000.webp" }
```

**Валідація:**
- URL повинен починатися з `/uploads/`
- Файл повинен мати розширення `.webp`

**Response `200`:**
```json
{ "success": true }
```

**Response `400`:**
```json
{ "error": "Невірний URL" }
```
або
```json
{ "error": "Невірний файл" }
```

---

## 15. Admin API — Заявки на послуги

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `GET /api/admin/service-requests`

Список заявок на послуги.

**Query Parameters:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `status` | string | Фільтр: `NEW`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` або `all` |
| `serviceType` | string | Фільтр за типом послуги або `all` |

**Response `200`:**
```json
[
  {
    "id": "clx...",
    "serviceType": "Вивіз сміття",
    "customerName": "Петро",
    "phone": "+380997654321",
    "address": "Київ",
    "date": "2025-02-01T00:00:00.000Z",
    "time": "10:00",
    "comment": null,
    "status": "NEW",
    "createdAt": "2025-01-15T12:00:00.000Z",
    "updatedAt": "2025-01-15T12:00:00.000Z"
  }
]
```

**curl:**
```bash
curl "https://techno-rent-vercel.onrender.com/api/admin/service-requests?status=NEW" \
  -H "Authorization: Bearer <token>"
```

---

### `PATCH /api/admin/service-requests/:id/status`

Оновити статус заявки.

**Zod Schema (`statusSchema`):**

| Поле | Тип | Обов'язкове | Допустимі значення |
|------|-----|-------------|-------------------|
| `status` | enum | ✅ | `NEW`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |

**Request:**
```json
{ "status": "CONFIRMED" }
```

**Response `200`:** Оновлений об'єкт ServiceRequest.

---

### `DELETE /api/admin/service-requests/:id`

Видалити заявку.

**Response `200`:**
```json
{ "success": true }
```

---

## 16. Admin API — Послуги (Services)

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `GET /api/admin/services`

Список всіх послуг (включно з неактивними).

**Response `200`:** Масив Service (сортовано за sortOrder ASC).

---

### `POST /api/admin/services`

Створити послугу.

**Zod Schema (`serviceSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `slug` | string | ✅ | min(1) |
| `title` | string | ✅ | min(1) |
| `shortDescription` | string | ✅ | min(1) |
| `fullDescription` | string | ✅ | min(1) |
| `image` | string | ✅ | min(1) |
| `priceInfo` | string | ✅ | min(1) |
| `pricingType` | enum | ✅ | `fixed_from`, `hourly_from`, `calculator`, `tow_calculator`, `material_delivery_calculator`, `custom` |
| `relatedEquipmentTypes` | string[] | ✅ | масив з EquipmentType значень |
| `features` | string[] | ✅ | масив рядків |
| `seoTitle` | string | ❌ | default: "" |
| `seoDescription` | string | ❌ | default: "" |
| `isActive` | boolean | ❌ | default: true |
| `isPopular` | boolean | ❌ | default: false |
| `sortOrder` | number | ❌ | default: 0 |

**Response `201`:** Створений об'єкт Service.

> **Примітка:** Для `pricingType = "tow_calculator"` і `material_delivery_calculator` поле `deliveryRatePerKm` використовується як тариф за 1 км.

---

### `PUT /api/admin/services/:id`

Оновити послугу (часткове оновлення).

**Response `200`:** Оновлений об'єкт Service.

---

### `DELETE /api/admin/services/:id`

Видалити послугу.

**Response `200`:**
```json
{ "success": true }
```

---

### `PUT /api/admin/services/:id/reorder`

Перемістити послугу на нову позицію (зсув інших).

**Request:**
```json
{ "newPosition": 3 }
```

**Response `200`:** Масив всіх Service (оновлений порядок).

---

## 17. Admin API — GPS

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `POST /api/admin/gps/sync`

Ручний запуск синхронізації GPS з адмінки, використовується кнопкою на вкладці `Мапа`.

**Поведінка:**
- джерело даних: `gps.equgps.com`;
- оновлює поточні позиції GPS-пристроїв;
- оновлює денну статистику, поїздки і стоянки за сьогодні та попередній день;
- стоянки за синхронізовані дні замінюються актуальним звітом, а не накопичуються.

**Response `200`:**
```json
{
  "status": "completed",
  "storedPositions": 1,
  "storedStops": 4,
  "storedDailyStats": 4,
  "syncedDates": ["2026-04-23", "2026-04-22"]
}
```

### `GET /api/admin/gps`

Повертає список GPS-пристроїв для адмінки разом із технікою, до якої вони прив'язані.

**Response `200`:**
```json
[
  {
    "id": "trk_1",
    "name": "Евакуатор Рено",
    "equipmentId": "eq_1",
    "lastAddress": "Липники, Львівська область, Україна",
    "lastEventText": "Запалення вимкнено",
    "lastTrackerAt": "2026-04-16T15:05:05.000Z",
    "lastTelegramChatId": "1833332922",
    "lastTelegramMessageId": "48702",
    "createdAt": "2026-04-16T12:00:00.000Z",
    "updatedAt": "2026-04-16T15:05:05.000Z",
    "equipment": {
      "id": "eq_1",
      "name": "Евакуатор Renault",
      "slug": "evakuator-renault"
    }
  }
]
```

**Використання в адмінці:**
- вкладка `/admin/gps`
- селект прив'язки GPS-маячка у `/admin/equipment`

---

### `GET /api/admin/gps/:id/day?date=YYYY-MM-DD`

Повертає денну статистику для вкладки `Мапа`: підсумок за день, список поїздок, список стоянок і спільну timeline-стрічку.

Якщо `date` не передано, backend використовує поточну дату в часовому поясі `Europe/Kiev`.

**Response `200`:**
```json
{
  "date": "2026-04-23",
  "device": {
    "id": "trk_1",
    "name": "Евакуатор Рено",
    "lastAddress": "Львів, Україна",
    "lastLatitude": 49.8261,
    "lastLongitude": 23.9567
  },
  "summary": {
    "totalDistanceKm": 7.711,
    "tripCount": 1,
    "tripDurationMs": 3431000,
    "stopCount": 1,
    "stopDurationMs": 1200000,
    "engineHoursMs": 3235000
  },
  "trips": [],
  "stops": [],
  "timeline": []
}
```

---

## 18. Admin API — Сповіщення

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

Шаблони сповіщень зберігаються в `NotificationTemplate`. Базовий шаблон має `serviceSlug = NULL`, а service-specific override має `serviceSlug` конкретної послуги.

### `GET /api/admin/notifications/templates`

Повертає список базових шаблонів.

**Query Parameters:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `channel` | string | Фільтр за каналом, наприклад `telegram_admin` |
| `category` | string | Фільтр за сценарієм |
| `status` | `enabled` або `disabled` | Фільтр за активністю |
| `search` | string | Пошук по назві або ключу |

### `GET /api/admin/notifications/templates/:key?serviceSlug=:slug`

Повертає один шаблон. Якщо передано `serviceSlug`, backend спочатку шукає override для цієї послуги, інакше повертає базовий шаблон.

**Response fields:**

| Поле | Опис |
|------|------|
| `serviceSlug` | `null` для базового шаблону або slug послуги |
| `isOverride` | `true`, якщо використовується окремий текст послуги |
| `isInherited` | `true`, якщо окремого тексту немає і повернуто базовий |
| `variables` | whitelist змінних для цього template key |

### `PUT /api/admin/notifications/templates/:key?serviceSlug=:slug`

Оновлює базовий шаблон або service-specific override.

**Body:**
```json
{
  "name": "Нова заявка на евакуатор адміну",
  "isEnabled": true,
  "bodyTemplate": "🚨 <b>Нова заявка</b>\\n{{request.customerName}}",
  "notes": "Опціональна примітка"
}
```

Якщо в `bodyTemplate` є змінна, якої немає у whitelist шаблону, повертається `400`.

### `POST /api/admin/notifications/templates/:key/reset?serviceSlug=:slug`

Reset без `serviceSlug` відновлює базовий дефолт із registry.

Reset із `serviceSlug`:

- повертає системний service-specific дефолт, якщо він описаний у registry;
- якщо системного дефолту немає, видаляє override і повертає fallback на базовий шаблон.

### `POST /api/admin/notifications/templates/:key/preview?serviceSlug=:slug`

Рендерить preview з тестовими даними.

**Body:**
```json
{
  "bodyTemplate": "Опціонально: текст для preview без збереження"
}
```

### `GET /api/admin/notifications/templates/:key/variables`

Повертає whitelist змінних для шаблону.

---

## 19. Public/Admin API — Налаштування

### `GET /api/settings/homepage`

Публічні налаштування головної сторінки.

**Response `200`:**
```json
{
  "heroImage": "https://example.com/hero.webp"
}
```

---

### `GET /api/admin/settings/homepage`

Отримати налаштування головної сторінки в адмінці. Потребує `Authorization: Bearer <token>`.

---

### `PUT /api/admin/settings/homepage`

Оновити hero-зображення головної сторінки. Потребує `Authorization: Bearer <token>`.

**Request:**
```json
{
  "heroImage": "/uploads/hero.webp"
}
```

---

## 20. Health Check

### `GET /api/health`

Перевірка стану серверу та БД. Не потребує авторизації.

**Response `200`:**
```json
{
  "status": "running",
  "time": "2026-04-10T12:00:00.000Z",
  "node": "v20.20.0",
  "env": {
    "NODE_ENV": "production",
    "DATABASE_URL": "set (postgresql://***@localhost:5432/xkiavukt_technorent)",
    "PORT": "3001",
    "CLIENT_URL": "https://technorent.lanbox.com.ua"
  },
  "database": "connected"
}
```

---

## 21. Sitemap

### `GET /sitemap.xml`

Динамічна XML-карта сайту. Включає всі статичні сторінки + всі одиниці техніки + всі активні послуги.

Alias для сумісності: `GET /api/sitemap.xml`.

**Response:** `Content-Type: application/xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://technorent.lanbox.com.ua/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://technorent.lanbox.com.ua/catalog</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://technorent.lanbox.com.ua/services</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://technorent.lanbox.com.ua/contacts</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://technorent.lanbox.com.ua/services/kopannia-transheyi</loc><lastmod>2026-04-10</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://technorent.lanbox.com.ua/catalog/cat-320</loc><lastmod>2026-04-10</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
```

---

## 22. Enum-значення

### EquipmentType
```
excavator | loader | bulldozer | crane | roller | dump_truck | concrete_mixer | generator | other
```

### OrderStatus
```
NEW | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED
```

### RentOrderStatus
```
NEW | CONFIRMED | ACTIVE | COMPLETED | CANCELLED
```

### AdminRole
```
ADMIN | MANAGER
```

### PricingType
```
fixed_from | hourly_from | calculator | tow_calculator | material_delivery_calculator | custom
```
