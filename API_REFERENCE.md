# API Reference — TechnoRent

> **Base URL (production):** `https://techno-rent-vercel.onrender.com/api`  
> **Base URL (local):** `http://localhost:3001/api`

---

## Зміст

1. [Загальна інформація](#1-загальна-інформація)
2. [Аутентифікація](#2-аутентифікація)
3. [Rate Limiting](#3-rate-limiting)
4. [Коди помилок](#4-коди-помилок)
5. [Public API — Техніка](#5-public-api--техніка)
6. [Public API — Замовлення](#6-public-api--замовлення)
7. [Public API — Заявки на послуги](#7-public-api--заявки-на-послуги)
8. [Auth API](#8-auth-api)
9. [Admin API — Техніка](#9-admin-api--техніка)
10. [Admin API — Замовлення (Orders)](#10-admin-api--замовлення-orders)
11. [Admin API — Оренда (Rent Orders)](#11-admin-api--оренда-rent-orders)
12. [Admin API — Зайнятість (Occupancy)](#12-admin-api--зайнятість-occupancy)
13. [Admin API — Завантаження файлів](#13-admin-api--завантаження-файлів)
14. [Admin API — Заявки на послуги](#14-admin-api--заявки-на-послуги)
15. [Sitemap](#15-sitemap)
16. [Enum-значення](#16-enum-значення)

---

## 1. Загальна інформація

- **Фреймворк:** Express 5.1 + TypeScript
- **БД:** PostgreSQL 16 + Prisma ORM 6.9+
- **Валідація:** Zod 3.25+
- **Формат:** JSON (Content-Type: application/json)
- **Завантаження файлів:** multipart/form-data
- **Захист:** Helmet, CORS (тільки CLIENT_URL)

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
| Auth (`/api/auth/*`) | 10 запитів | 15 хв | `"Забагато спроб. Спробуйте пізніше."` |
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
| `type` | string | `all` | Фільтр за типом (`excavator`, `loader` тощо) |
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
    "type": "excavator",
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
["bulldozer", "crane", "excavator", "loader"]
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

## 8. Auth API

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

## 9. Admin API — Техніка

> Всі ендпоінти потребують `Authorization: Bearer <token>`.

### `POST /api/admin/equipment`

Створити одиницю техніки.

**Zod Schema (`equipmentSchema`):**

| Поле | Тип | Обов'язкове | Валідація |
|------|-----|-------------|-----------|
| `slug` | string | ✅ | min(1) |
| `name` | string | ✅ | min(1) |
| `brand` | string | ✅ | min(1) |
| `type` | enum | ✅ | Один з: `excavator`, `loader`, `bulldozer`, `crane`, `roller`, `dump_truck`, `concrete_mixer`, `generator`, `other` |
| `description` | string | ✅ | min(1) |
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
  "type": "excavator",
  "description": "Потужний екскаватор для будівництва",
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
  -d '{"slug":"cat-320","name":"CAT 320","brand":"Caterpillar","type":"excavator","description":"Опис","pricePerHour":1200}'
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

## 10. Admin API — Замовлення (Orders)

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

## 11. Admin API — Оренда (Rent Orders)

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

## 12. Admin API — Зайнятість (Occupancy)

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

## 13. Admin API — Завантаження файлів

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

## 14. Admin API — Заявки на послуги

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

## 15. Sitemap

### `GET /api/sitemap.xml`

Динамічна XML-карта сайту. Включає всі статичні сторінки + всі одиниці техніки.

**Response:** `Content-Type: application/xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://technorent.ua/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://technorent.ua/catalog</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://technorent.ua/services</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://technorent.ua/vyviz-smittia</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://technorent.ua/contacts</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://technorent.ua/catalog/cat-320</loc><lastmod>2025-01-15</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
```

---

## 16. Enum-значення

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
SUPER_ADMIN | ADMIN
```
