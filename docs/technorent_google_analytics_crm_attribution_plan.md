# План впровадження Google Analytics + CRM attribution для TechnoRent

> Призначення: цей файл є технічним планом для AI агента/розробника, який має впровадити аналітику Google, збереження джерела заявки в CRM та генератор відстежуваних посилань.
> Проєкт: TechnoRent — React + Vite frontend, Express + TypeScript backend, PostgreSQL через raw SQL, CRM-заявки в адмінці.
> Головна ціль: бачити не тільки відвідування в Google Analytics, а й конкретно в CRM: **звідки прийшла кожна заявка**.

---

## 1. Бізнес-ціль

Після реалізації адміністратор має бачити:

1. Звідки користувач потрапив на сайт:
   - Google organic;
   - Google Ads;
   - Instagram/Facebook;
   - Telegram;
   - email/SMS-розсилка;
   - QR-код;
   - інший сайт;
   - прямий перехід.

2. Звідки прийшла конкретна заявка:
   - `utm_source`;
   - `utm_medium`;
   - `utm_campaign`;
   - `utm_content`;
   - `utm_term`;
   - referrer;
   - перша сторінка входу;
   - сторінка, з якої відправили заявку;
   - ID згенерованого tracking-посилання, якщо воно було.

3. Мати в адмінці окремий розділ для створення посилань:
   - назва кампанії;
   - куди веде посилання;
   - джерело;
   - канал;
   - кампанія;
   - варіант оголошення/поста;
   - готове посилання для копіювання;
   - статистика: кліки, заявки, конверсія.

---

## 2. Важливий поточний контекст проєкту

Перед початком агент повинен прочитати:

```text
docs/README.md
docs/TECHNICAL_OVERVIEW.md
docs/PROJECT_CONTEXT.md
docs/API_REFERENCE.md
```

Особливо звернути увагу на:

- frontend: `client/`, React + Vite + TypeScript;
- backend: `server/`, Express + TypeScript;
- БД: PostgreSQL через `pg` і raw SQL;
- schema init: `server/src/lib/schema.ts`;
- public API для заявок:
  - `POST /api/orders`;
  - `POST /api/service-requests`;
- CRM-шар:
  - `CustomerRequest`;
  - `CustomerRequestItem`;
- адмінка:
  - `AdminOrdersPage`;
  - `AdminOverviewPage`;
  - `AdminLayout`;
- не додавати секрети в `VITE_*`, бо ці змінні потрапляють у frontend bundle.

---

## 3. Що потрібно реалізувати

Потрібно реалізувати 3 пов'язані частини:

```text
1. Google Analytics / Google Tag Manager
2. Збереження джерела користувача в CRM
3. Генератор tracking-посилань в адмінці
```

---

# Етап 1. Підготовка Google Analytics 4 і Google Tag Manager

## 1.1. Що має зробити власник проєкту вручну

Попросити власника проєкту створити:

1. Google Analytics 4 property.
2. Google Tag Manager container.
3. Отримати:
   - `GTM-XXXXXXX` — ID контейнера Google Tag Manager;
   - GA4 Measurement ID, наприклад `G-XXXXXXXXXX`.

## 1.2. Що має зробити агент у коді

Додати підтримку GTM на frontend.

Рекомендований варіант:

- не вставляти GA4 напряму;
- вставити Google Tag Manager;
- всі події відправляти через `window.dataLayer`.

Додати в env frontend:

```env
VITE_GTM_ID=GTM-XXXXXXX
```

> Це не секрет. Його можна мати у frontend env.

## 1.3. Де додавати GTM

Перевірити структуру `client/index.html`.

Варіант 1 — вставити GTM snippet прямо в `index.html`, але тільки якщо є `VITE_GTM_ID`.

Варіант 2 — створити компонент/утиліту, яка динамічно додає GTM script.

Рекомендований варіант для Vite:

```typescript
// client/src/lib/analytics.ts

export function initGtm() {
  const gtmId = import.meta.env.VITE_GTM_ID;

  if (!gtmId) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    "gtm.start": new Date().getTime(),
    event: "gtm.js",
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
  document.head.appendChild(script);
}
```

Також додати TypeScript declaration:

```typescript
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}
```

Викликати `initGtm()` у `client/src/main.tsx`.

---

# Етап 2. Frontend attribution: збереження джерела відвідувача

## 2.1. Створити файл attribution-логіки

Створити:

```text
client/src/lib/attribution.ts
```

Цей файл має відповідати за:

- читання UTM з URL;
- читання `gclid`, `fbclid`, `ttclid`;
- читання `trid` або `tracking_link_id`;
- читання `document.referrer`;
- збереження `firstTouch`;
- оновлення `lastTouch`;
- повернення payload для форм заявок.

## 2.2. Які параметри збирати

З URL потрібно читати:

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
gclid
fbclid
ttclid
trid
tracking_link_id
```

`trid` — короткий tracking code, який буде генеруватися в CRM.

## 2.3. Структура attribution payload

```typescript
export type TouchAttribution = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  trackingCode?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
  capturedAt?: string | null;
};

export type LeadAttributionPayload = {
  firstTouch?: TouchAttribution | null;
  lastTouch?: TouchAttribution | null;
  formPage?: string | null;
};
```

## 2.4. Логіка first touch / last touch

Потрібно розділяти:

### First touch

Перше джерело, з якого користувач прийшов.

Зберігається один раз і не перезаписується, поки користувач не очистить localStorage або поки не мине TTL.

### Last touch

Останнє джерело перед заявкою.

Оновлюється, якщо користувач прийшов із новими UTM або tracking code.

## 2.5. TTL для attribution

Додати TTL, наприклад 30 днів.

```text
attribution_ttl_days = 30
```

Якщо first touch старіший за 30 днів — дозволити перезаписати.

## 2.6. Приклад логіки

```typescript
const ATTRIBUTION_FIRST_KEY = "tr_attribution_first";
const ATTRIBUTION_LAST_KEY = "tr_attribution_last";
const ATTRIBUTION_TTL_DAYS = 30;

export function captureAttribution() {
  const params = new URLSearchParams(window.location.search);

  const touch = {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
    gclid: params.get("gclid"),
    fbclid: params.get("fbclid"),
    ttclid: params.get("ttclid"),
    trackingCode: params.get("trid") || params.get("tracking_link_id"),
    referrer: document.referrer || null,
    landingPage: window.location.pathname + window.location.search,
    capturedAt: new Date().toISOString(),
  };

  const hasAttribution =
    touch.utmSource ||
    touch.utmMedium ||
    touch.utmCampaign ||
    touch.gclid ||
    touch.fbclid ||
    touch.ttclid ||
    touch.trackingCode ||
    touch.referrer;

  if (!hasAttribution) {
    return;
  }

  const existingFirst = localStorage.getItem(ATTRIBUTION_FIRST_KEY);

  if (!existingFirst || isExpired(existingFirst)) {
    localStorage.setItem(ATTRIBUTION_FIRST_KEY, JSON.stringify(touch));
  }

  localStorage.setItem(ATTRIBUTION_LAST_KEY, JSON.stringify(touch));
}

export function getLeadAttributionPayload() {
  return {
    firstTouch: safeJsonParse(localStorage.getItem(ATTRIBUTION_FIRST_KEY)),
    lastTouch: safeJsonParse(localStorage.getItem(ATTRIBUTION_LAST_KEY)),
    formPage: window.location.pathname + window.location.search,
  };
}
```

## 2.7. Де викликати captureAttribution

У `client/src/App.tsx` або окремому компоненті, який реагує на зміну маршруту.

Потрібно врахувати, що це SPA, тому користувач може переходити між сторінками без повного reload.

Рекомендовано створити компонент:

```text
client/src/components/AnalyticsTracker.tsx
```

Він має:

- слухати `useLocation()`;
- викликати `captureAttribution()`;
- відправляти page_view у dataLayer.

---

# Етап 3. Події Google Analytics через dataLayer

## 3.1. Створити helper для подій

У `client/src/lib/analytics.ts` додати:

```typescript
export function pushAnalyticsEvent(
  event: string,
  params: Record<string, unknown> = {}
) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event,
    ...params,
  });
}
```

## 3.2. Подія page_view для SPA

При зміні маршруту:

```typescript
pushAnalyticsEvent("page_view", {
  page_path: window.location.pathname,
  page_location: window.location.href,
  page_title: document.title,
});
```

## 3.3. Події, які потрібно додати

### Відкриття форми

```text
form_open
```

Параметри:

```typescript
{
  form_type: "equipment_order" | "service_request" | "tow_calculator" | "callback",
  page_path: window.location.pathname,
  equipment_id?: string,
  equipment_slug?: string,
  service_slug?: string
}
```

### Успішна відправка заявки

```text
lead_submit_success
```

Параметри:

```typescript
{
  lead_type: "equipment_order" | "service_request" | "tow_calculator" | "callback",
  request_id: "...",
  page_path: window.location.pathname,
  utm_source?: "...",
  utm_medium?: "...",
  utm_campaign?: "...",
  tracking_code?: "..."
}
```

### Клік по телефону

```text
phone_click
```

### Клік по Telegram/Viber/WhatsApp

```text
messenger_click
```

Параметри:

```typescript
{
  messenger: "telegram" | "viber" | "whatsapp"
}
```

## 3.4. Важливе правило

Не відправляти в Google Analytics персональні дані:

```text
НЕ відправляти:
- ім'я клієнта;
- телефон;
- email;
- повну адресу;
- коментар клієнта.
```

У CRM це зберігати можна, але в GA4 — ні.

---

# Етап 4. Передача attribution у форми заявок

## 4.1. Знайти всі місця створення заявок

Перевірити:

```text
client/src/components/OrderModal.tsx
client/src/components/CallToAction.tsx
client/src/pages/DebrisRemovalPage.tsx
client/src/components/TowCalculatorModal.tsx
інші форми, які викликають POST /api/orders або POST /api/service-requests
```

## 4.2. Додати attribution payload у body запиту

При submit:

```typescript
const attribution = getLeadAttributionPayload();

await createOrder({
  ...formData,
  attribution,
});
```

Аналогічно для service request.

## 4.3. Після успішної заявки відправити GA event

Після успішної відповіді backend:

```typescript
pushAnalyticsEvent("lead_submit_success", {
  lead_type: "equipment_order",
  request_id: created.id,
  page_path: window.location.pathname,
  utm_source: attribution.lastTouch?.utmSource,
  utm_medium: attribution.lastTouch?.utmMedium,
  utm_campaign: attribution.lastTouch?.utmCampaign,
  tracking_code: attribution.lastTouch?.trackingCode,
});
```

---

# Етап 5. Backend: розширення API для прийому attribution

## 5.1. Розширити Zod-схеми

Знайти backend-схеми для:

```text
POST /api/orders
POST /api/service-requests
```

Додати optional `attribution`.

Приклад:

```typescript
const attributionTouchSchema = z.object({
  utmSource: z.string().max(120).nullable().optional(),
  utmMedium: z.string().max(120).nullable().optional(),
  utmCampaign: z.string().max(160).nullable().optional(),
  utmContent: z.string().max(160).nullable().optional(),
  utmTerm: z.string().max(160).nullable().optional(),
  gclid: z.string().max(255).nullable().optional(),
  fbclid: z.string().max(255).nullable().optional(),
  ttclid: z.string().max(255).nullable().optional(),
  trackingCode: z.string().max(80).nullable().optional(),
  referrer: z.string().max(1000).nullable().optional(),
  landingPage: z.string().max(1000).nullable().optional(),
  capturedAt: z.string().nullable().optional(),
});

const attributionSchema = z.object({
  firstTouch: attributionTouchSchema.nullable().optional(),
  lastTouch: attributionTouchSchema.nullable().optional(),
  formPage: z.string().max(1000).nullable().optional(),
}).optional();
```

## 5.2. Нормалізація attribution

Створити helper:

```text
server/src/lib/attribution.ts
```

Функції:

```typescript
normalizeAttribution(input)
resolveTrafficSource(attribution)
```

`resolveTrafficSource` має виводити зрозумілий тип:

```text
google_ads
google_organic
facebook
instagram
telegram
email
sms
qr
referral
direct
unknown
```

Приклади правил:

```text
якщо є gclid -> google_ads
якщо utm_source=google і utm_medium=cpc -> google_ads
якщо utm_source=google і utm_medium=organic -> google_organic
якщо utm_source=instagram -> instagram
якщо utm_source=facebook -> facebook
якщо utm_source=telegram або referrer містить t.me -> telegram
якщо utm_medium=email -> email
якщо utm_medium=sms -> sms
якщо utm_medium=qr -> qr
якщо referrer є, але UTM немає -> referral
якщо нічого немає -> direct
```

## 5.3. Не довіряти сирим даним без обмежень

Перед записом у БД:

- обрізати довгі рядки;
- пусті рядки перетворювати в `null`;
- не зберігати небезпечні HTML-фрагменти як HTML;
- не використовувати ці дані без escape у Telegram/адмінці.

---

# Етап 6. База даних: таблиці для attribution і tracking links

## 6.1. Не використовувати PostgreSQL enum

У цьому проєкті краще використовувати `TEXT` + backend validation, а не нові PostgreSQL enum.

## 6.2. Додати таблицю MarketingTrackingLink

У `server/src/lib/schema.ts` додати:

```sql
CREATE TABLE IF NOT EXISTS "MarketingTrackingLink" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "destinationPath" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Індекси:

```sql
CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_link_code"
ON "MarketingTrackingLink" ("code");

CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_link_created_at"
ON "MarketingTrackingLink" ("createdAt");
```

## 6.3. Додати таблицю MarketingTrackingClick

```sql
CREATE TABLE IF NOT EXISTS "MarketingTrackingClick" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "trackingLinkId" TEXT NOT NULL REFERENCES "MarketingTrackingLink"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "referrer" TEXT,
  "landingUrl" TEXT,
  "userAgent" TEXT,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Індекси:

```sql
CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_click_link_id"
ON "MarketingTrackingClick" ("trackingLinkId");

CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_click_created_at"
ON "MarketingTrackingClick" ("createdAt");
```

## 6.4. Додати таблицю CustomerRequestAttribution

Рекомендовано не перевантажувати основну таблицю заявки, а винести attribution окремо.

```sql
CREATE TABLE IF NOT EXISTS "CustomerRequestAttribution" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),

  "customerRequestId" TEXT,
  "legacyOrderId" TEXT,
  "legacyServiceRequestId" TEXT,

  "trafficSource" TEXT,
  "trackingCode" TEXT,
  "trackingLinkId" TEXT REFERENCES "MarketingTrackingLink"("id") ON DELETE SET NULL,

  "firstUtmSource" TEXT,
  "firstUtmMedium" TEXT,
  "firstUtmCampaign" TEXT,
  "firstUtmContent" TEXT,
  "firstUtmTerm" TEXT,
  "firstGclid" TEXT,
  "firstFbclid" TEXT,
  "firstTtclid" TEXT,
  "firstReferrer" TEXT,
  "firstLandingPage" TEXT,
  "firstCapturedAt" TIMESTAMP,

  "lastUtmSource" TEXT,
  "lastUtmMedium" TEXT,
  "lastUtmCampaign" TEXT,
  "lastUtmContent" TEXT,
  "lastUtmTerm" TEXT,
  "lastGclid" TEXT,
  "lastFbclid" TEXT,
  "lastTtclid" TEXT,
  "lastReferrer" TEXT,
  "lastLandingPage" TEXT,
  "lastCapturedAt" TIMESTAMP,

  "formPage" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Індекси:

```sql
CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_customer_request_id"
ON "CustomerRequestAttribution" ("customerRequestId");

CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_tracking_link_id"
ON "CustomerRequestAttribution" ("trackingLinkId");

CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_traffic_source"
ON "CustomerRequestAttribution" ("trafficSource");

CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_created_at"
ON "CustomerRequestAttribution" ("createdAt");
```

## 6.5. Примітка щодо CustomerRequest

Якщо у поточному коді public forms вже паралельно пишуть у `CustomerRequest`, потрібно прив'язувати attribution саме до `CustomerRequest`.

Якщо в конкретному місці ще створюється тільки legacy `Order` або `ServiceRequest`, тимчасово записати `legacyOrderId` або `legacyServiceRequestId`, але в майбутньому привести все до `CustomerRequest`.

---

# Етап 7. Backend: запис attribution при створенні заявки

## 7.1. Створити repository/service

Створити:

```text
server/src/lib/marketing-attribution.repository.ts
```

Функції:

```typescript
createCustomerRequestAttribution({
  customerRequestId,
  legacyOrderId,
  legacyServiceRequestId,
  attribution,
});
```

## 7.2. Визначати trackingLinkId по code

Якщо в attribution є `trackingCode`, знайти відповідний запис:

```sql
SELECT id FROM "MarketingTrackingLink"
WHERE "code" = $1 AND "isActive" = true
LIMIT 1;
```

## 7.3. Записувати attribution після створення заявки

У routes:

```text
server/src/routes/orders.ts
server/src/routes/service-requests.ts
server/src/routes/admin.requests.ts якщо потрібно
```

Після успішного створення заявки:

```typescript
await createCustomerRequestAttribution({
  customerRequestId: createdCustomerRequestId,
  legacyOrderId: createdOrderId,
  attribution: req.body.attribution,
});
```

Важливо:

- помилка запису attribution не повинна ламати створення заявки;
- але помилку треба залогувати;
- не відправляти attribution у Telegram як HTML без escape.

---

# Етап 8. Tracking links: генератор посилань в CRM

## 8.1. Додати backend admin routes

Створити файл:

```text
server/src/routes/admin.marketing.ts
```

Підключити в `server/src/index.ts`:

```typescript
app.use("/api/admin/marketing", adminMarketingRouter);
```

Всі endpoints мають бути захищені JWT auth.

## 8.2. Endpoints

### Список посилань

```http
GET /api/admin/marketing/links
```

Повертає список посилань зі статистикою:

```json
[
  {
    "id": "...",
    "code": "tg-sypuchi-2026-05",
    "name": "Telegram пост: доставка сипучих",
    "destinationPath": "/services/dostavka-sypuchyh-materialiv",
    "utmSource": "telegram",
    "utmMedium": "post",
    "utmCampaign": "sypuchi_2026_05",
    "utmContent": "main_post",
    "isActive": true,
    "fullUrl": "https://technorent.lanbox.com.ua/go/tg-sypuchi-2026-05",
    "clicksCount": 42,
    "leadsCount": 5,
    "conversionRate": 11.9,
    "createdAt": "..."
  }
]
```

### Створити посилання

```http
POST /api/admin/marketing/links
```

Body:

```json
{
  "name": "Telegram пост: доставка сипучих",
  "description": "Пост у Telegram каналі за травень",
  "destinationPath": "/services/dostavka-sypuchyh-materialiv",
  "utmSource": "telegram",
  "utmMedium": "post",
  "utmCampaign": "sypuchi_2026_05",
  "utmContent": "main_post",
  "utmTerm": ""
}
```

Backend має:

- згенерувати `code`;
- перевірити унікальність;
- зберегти запис;
- повернути `fullUrl`.

Приклад `fullUrl`:

```text
https://technorent.lanbox.com.ua/go/tg-sypuchi-2026-05
```

### Оновити посилання

```http
PUT /api/admin/marketing/links/:id
```

### Деактивувати посилання

```http
PATCH /api/admin/marketing/links/:id/status
```

Body:

```json
{ "isActive": false }
```

### Видалити посилання

Краще не видаляти фізично, а деактивувати.

Якщо все ж потрібне видалення:

```http
DELETE /api/admin/marketing/links/:id
```

## 8.3. Short redirect endpoint

Додати публічний endpoint:

```http
GET /go/:code
```

Він має:

1. Знайти `MarketingTrackingLink` по `code`.
2. Якщо не знайдено або inactive — redirect на головну або 404.
3. Записати click у `MarketingTrackingClick`.
4. Зібрати фінальний URL:
   - `destinationPath`;
   - UTM-параметри;
   - `trid=<code>`.
5. Зробити `302 redirect`.

Приклад:

Користувач відкриває:

```text
https://technorent.lanbox.com.ua/go/tg-sypuchi-2026-05
```

Backend редіректить на:

```text
https://technorent.lanbox.com.ua/services/dostavka-sypuchyh-materialiv?utm_source=telegram&utm_medium=post&utm_campaign=sypuchi_2026_05&utm_content=main_post&trid=tg-sypuchi-2026-05
```

## 8.4. Захист redirect endpoint

Перевірити:

- `destinationPath` має бути тільки внутрішнім шляхом, який починається з `/`;
- не дозволяти `https://external-site.com`;
- не дозволяти `javascript:`;
- не дозволяти `//external-site.com`;
- обрізати надто довгі значення.

Це потрібно, щоб не створити open redirect vulnerability.

---

# Етап 9. Admin UI: розділ “Маркетинг” або “Аналітика”

## 9.1. Додати пункт меню

У `client/src/components/AdminLayout.tsx` додати пункт:

```text
Маркетинг
```

або

```text
Аналітика
```

Рекомендовано:

```text
Маркетинг
```

Route:

```text
/admin/marketing
```

## 9.2. Створити сторінку

Створити:

```text
client/src/pages/AdminMarketingPage.tsx
```

## 9.3. Структура сторінки

Сторінка має містити:

### Верхній блок KPI

```text
Усього кліків
Усього заявок
Конверсія
Найкраще джерело
```

### Фільтри

```text
Період: сьогодні / 7 днів / 30 днів / custom
Джерело: усі / google / instagram / telegram / email / qr / referral / direct
Кампанія
```

### Таблиця tracking-посилань

Колонки:

```text
Назва
Джерело
Канал
Кампанія
Готове посилання
Кліки
Заявки
Конверсія
Статус
Дії
```

Дії:

```text
Копіювати
Редагувати
Деактивувати
```

### Форма створення посилання

Поля:

```text
Назва
Опис
Куди веде посилання
utm_source
utm_medium
utm_campaign
utm_content
utm_term
```

Для `destinationPath` краще зробити select/combobox:

```text
/
 /catalog
 /services
 /vyviz-smittia
 /contacts
 /services/:slug
 /catalog/:slug
```

Можна також дозволити ручний шлях, але валідувати, що він починається з `/`.

## 9.4. UX для копіювання посилання

Біля кожного посилання додати кнопку:

```text
Копіювати
```

Після копіювання показати toast:

```text
Посилання скопійовано
```

## 9.5. Приклад форми

```text
Назва: Telegram пост — доставка щебеню
Куди веде: /services/dostavka-sypuchyh-materialiv
Джерело: telegram
Канал: post
Кампанія: sypuchi_2026_05
Контент: main_post
```

Готове посилання:

```text
https://technorent.lanbox.com.ua/go/tg-sypuchi-2026-05
```

---

# Етап 10. CRM UI: показ джерела в заявках

## 10.1. Оновити список заявок

У `AdminOrdersPage` або сторінці unified CRM-заявок додати:

- колонку/бейдж “Джерело”;
- фільтр по джерелу;
- фільтр по кампанії.

Приклад бейджів:

```text
Google Ads
Google organic
Instagram
Telegram
Email
QR
Referral
Direct
Unknown
```

## 10.2. Оновити картку заявки

У деталі заявки додати блок:

```text
Джерело заявки
```

Поля:

```text
Тип джерела: Telegram
Tracking-посилання: Telegram пост — доставка щебеню
UTM source: telegram
UTM medium: post
UTM campaign: sypuchi_2026_05
UTM content: main_post
Referrer: ...
Перша сторінка входу: /services/dostavka-sypuchyh-materialiv
Сторінка заявки: /services/dostavka-sypuchyh-materialiv
Дата фіксації: ...
```

## 10.3. Не перевантажувати UI

У списку показувати тільки короткий бейдж.

Повні UTM-поля показувати тільки в деталях заявки.

---

# Етап 11. API для CRM attribution у заявках

## 11.1. Оновити endpoint списку заявок

Endpoint, який використовується сторінкою `Заявки`, має повертати attribution summary.

Наприклад:

```json
{
  "id": "...",
  "customerName": "Іван",
  "phone": "+380...",
  "status": "NEW",
  "createdAt": "...",
  "attribution": {
    "trafficSource": "telegram",
    "trackingCode": "tg-sypuchi-2026-05",
    "trackingLinkName": "Telegram пост — доставка щебеню",
    "utmSource": "telegram",
    "utmMedium": "post",
    "utmCampaign": "sypuchi_2026_05"
  }
}
```

## 11.2. Оновити endpoint деталей заявки

Детальний endpoint має повертати повний attribution.

```json
{
  "attribution": {
    "trafficSource": "telegram",
    "trackingCode": "tg-sypuchi-2026-05",
    "trackingLink": {
      "id": "...",
      "name": "Telegram пост — доставка щебеню"
    },
    "firstTouch": {
      "utmSource": "telegram",
      "utmMedium": "post",
      "utmCampaign": "sypuchi_2026_05",
      "landingPage": "/services/dostavka-sypuchyh-materialiv"
    },
    "lastTouch": {
      "utmSource": "telegram",
      "utmMedium": "post",
      "utmCampaign": "sypuchi_2026_05",
      "landingPage": "/services/dostavka-sypuchyh-materialiv"
    },
    "formPage": "/services/dostavka-sypuchyh-materialiv"
  }
}
```

---

# Етап 12. Звіти в адмінці

## 12.1. Додати summary endpoint

```http
GET /api/admin/marketing/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Повертає:

```json
{
  "clicks": 120,
  "leads": 18,
  "conversionRate": 15,
  "topSource": "telegram",
  "sources": [
    {
      "source": "telegram",
      "leads": 8
    },
    {
      "source": "google_ads",
      "leads": 5
    }
  ],
  "campaigns": [
    {
      "campaign": "sypuchi_2026_05",
      "leads": 5
    }
  ]
}
```

## 12.2. SQL-приклади

Кількість заявок по джерелах:

```sql
SELECT
  COALESCE("trafficSource", 'unknown') AS source,
  COUNT(*)::int AS leads
FROM "CustomerRequestAttribution"
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY COALESCE("trafficSource", 'unknown')
ORDER BY leads DESC;
```

Статистика по tracking links:

```sql
SELECT
  l."id",
  l."name",
  l."code",
  l."utmSource",
  l."utmMedium",
  l."utmCampaign",
  COUNT(DISTINCT c."id")::int AS "clicksCount",
  COUNT(DISTINCT a."id")::int AS "leadsCount"
FROM "MarketingTrackingLink" l
LEFT JOIN "MarketingTrackingClick" c ON c."trackingLinkId" = l."id"
LEFT JOIN "CustomerRequestAttribution" a ON a."trackingLinkId" = l."id"
GROUP BY l."id"
ORDER BY l."createdAt" DESC;
```

---

# Етап 13. Privacy / безпека / правила даних

## 13.1. Не відправляти PII в Google Analytics

Заборонено передавати в GA4:

```text
ім'я
телефон
email
точну адресу
коментар клієнта
```

## 13.2. Referrer і URL

Перед збереженням:

- обрізати до безпечної довжини;
- не рендерити як HTML;
- показувати в адмінці як plain text або безпечне посилання.

## 13.3. IP

Якщо зберігати IP для кліків:

- не зберігати raw IP;
- зберігати тільки hash;
- додати salt із server env.

Наприклад:

```env
TRACKING_HASH_SALT=some-long-secret
```

Не додавати salt у frontend.

## 13.4. Consent banner

Якщо сайт використовує GA4/Google Ads cookies, додати простий cookie/consent banner або хоча б передбачити можливість його додавання.

На першому етапі можна реалізувати:

```text
Продовжуючи користуватись сайтом, ви погоджуєтесь з використанням cookies для аналітики.
[Добре]
```

Краще рішення — окрема згода на analytics cookies.

## 13.5. Privacy policy

Додати або оновити сторінку політики конфіденційності:

```text
/privacy
```

У ній вказати:

- що сайт використовує Google Analytics;
- що сайт зберігає джерело заявки;
- що персональні дані використовуються для обробки заявки;
- що аналітичні дані не містять телефону/імені в Google Analytics.

---

# Етап 14. Тестування

## 14.1. Локальний тест attribution

Відкрити сайт локально:

```text
http://localhost:5173/services?utm_source=telegram&utm_medium=post&utm_campaign=test_campaign&utm_content=test_button&trid=test-code
```

Перевірити в DevTools:

```js
localStorage.getItem("tr_attribution_first")
localStorage.getItem("tr_attribution_last")
```

Очікувано:

```text
utmSource = telegram
utmMedium = post
utmCampaign = test_campaign
utmContent = test_button
trackingCode = test-code
```

## 14.2. Тест заявки

1. Відкрити URL з UTM.
2. Заповнити форму заявки.
3. Відправити.
4. Перевірити в БД:
   - запис заявки створився;
   - запис attribution створився;
   - `trafficSource = telegram`;
   - `trackingCode = test-code`.

## 14.3. Тест tracking link

1. В адмінці створити tracking-посилання.
2. Скопіювати URL.
3. Відкрити в браузері.
4. Переконатися, що:
   - відбувся redirect;
   - URL отримав UTM + `trid`;
   - у БД з'явився запис `MarketingTrackingClick`.
5. Відправити заявку.
6. Переконатися, що заявка прив'язалась до tracking link.

## 14.4. Тест GA/GTM

Перевірити:

- у браузері існує `window.dataLayer`;
- при переході між сторінками пушиться `page_view`;
- при відкритті форми пушиться `form_open`;
- після успішної заявки пушиться `lead_submit_success`;
- у Google Analytics DebugView видно події.

## 14.5. Тест без UTM

Відкрити сайт напряму:

```text
http://localhost:5173/
```

Відправити заявку.

Очікувано:

```text
trafficSource = direct
```

## 14.6. Тест referrer

Зробити тестову HTML-сторінку з посиланням на сайт або перейти з іншого локального домену.

Очікувано:

```text
trafficSource = referral
referrer = ...
```

## 14.7. Build checks

Перед завершенням виконати:

```bash
cd client && npm run build
cd server && npm run build
```

Якщо в проєкті є TypeScript check:

```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

---

# Етап 15. Деплой

## 15.1. Env

На production додати:

```env
VITE_GTM_ID=GTM-XXXXXXX
TRACKING_HASH_SALT=long-random-secret
```

`VITE_GTM_ID` потрібен на етапі build frontend.

`TRACKING_HASH_SALT` потрібен тільки backend.

## 15.2. Збірка

```bash
cd client && npm run build
cd server && npm run build
```

## 15.3. cPanel

Оскільки production працює на cPanel:

1. Зібрати frontend build.
2. Зібрати backend build.
3. Завантажити нові файли.
4. Перезапустити Node.js app у cPanel.
5. Перевірити:
   - сайт відкривається;
   - `/go/:code` працює;
   - заявки створюються;
   - адмінка відкриває “Маркетинг”;
   - GA події йдуть у DebugView.

---

# Етап 16. Оновлення документації

Після реалізації оновити:

```text
docs/TECHNICAL_OVERVIEW.md
docs/API_REFERENCE.md
docs/PROJECT_CONTEXT.md
docs/DEPLOY_PRODUCTION_CPANEL.md
.env.example
```

## 16.1. Що додати в API_REFERENCE.md

Описати:

```text
GET /go/:code
GET /api/admin/marketing/links
POST /api/admin/marketing/links
PUT /api/admin/marketing/links/:id
PATCH /api/admin/marketing/links/:id/status
GET /api/admin/marketing/summary
```

## 16.2. Що додати в PROJECT_CONTEXT.md

Описати:

- як працює attribution;
- які таблиці додані;
- де frontend збирає UTM;
- де в CRM показується джерело;
- як створювати tracking-посилання.

## 16.3. Що додати в .env.example

```env
VITE_GTM_ID=
TRACKING_HASH_SALT=
```

---

# Етап 17. Критерії готовності

Функціонал вважається готовим, якщо:

- [ ] GTM підключається на production, якщо заданий `VITE_GTM_ID`.
- [ ] SPA page views відправляються при переходах між сторінками.
- [ ] Подія `lead_submit_success` спрацьовує тільки після успішного створення заявки.
- [ ] UTM з URL зберігаються у first touch і last touch.
- [ ] Attribution передається у всі форми заявок.
- [ ] Backend приймає attribution без помилок.
- [ ] У БД створюється attribution-запис для заявки.
- [ ] В CRM у картці заявки видно джерело.
- [ ] В CRM можна фільтрувати заявки по джерелу.
- [ ] В адмінці можна створити tracking-посилання.
- [ ] Tracking-посилання відкривається через `/go/:code`.
- [ ] Клік по tracking-посиланню записується в БД.
- [ ] Заявка після tracking-посилання прив'язується до цього посилання.
- [ ] У розділі “Маркетинг” видно кліки, заявки і конверсію.
- [ ] Не передаються персональні дані в Google Analytics.
- [ ] `client build` проходить успішно.
- [ ] `server build` проходить успішно.
- [ ] Документація оновлена.

---

# Етап 18. Рекомендована структура файлів після реалізації

```text
client/src/lib/analytics.ts
client/src/lib/attribution.ts
client/src/components/AnalyticsTracker.tsx
client/src/pages/AdminMarketingPage.tsx
client/src/data/marketing.service.ts

server/src/lib/attribution.ts
server/src/lib/marketing-attribution.repository.ts
server/src/routes/admin.marketing.ts
```

Можливо також:

```text
client/src/components/admin/TrackingLinkForm.tsx
client/src/components/admin/TrackingSourceBadge.tsx
```

---

# Етап 19. Стандарти назв UTM для TechnoRent

## 19.1. Джерела

```text
google
facebook
instagram
telegram
tiktok
email
sms
qr
olx
prom
direct
referral
```

## 19.2. Medium

```text
organic
cpc
paid_social
post
story
newsletter
sms
qr
referral
```

## 19.3. Campaign naming

Використовувати нижній регістр і underscore:

```text
rent_equipment_lviv_2026_05
vyviz_smittia_2026_05
sypuchi_materialy_2026_05
evakuator_2026_05
```

## 19.4. Приклади готових посилань

Telegram пост:

```text
/go/tg-sypuchi-2026-05
```

Instagram реклама:

```text
/go/ig-rent-equipment-2026-05
```

QR-код на візитці:

```text
/go/qr-visitka-2026
```

Email розсилка:

```text
/go/email-vyviz-smittia-2026-05
```

---

# Етап 20. Підсумковий промпт для AI агента

Скопіюй цей промпт агенту, який буде виконувати задачу:

```text
Ти працюєш над проєктом TechnoRent. Потрібно впровадити Google Analytics / Google Tag Manager, CRM attribution і генератор tracking-посилань.

Перед початком прочитай:
- docs/README.md
- docs/TECHNICAL_OVERVIEW.md
- docs/PROJECT_CONTEXT.md
- docs/API_REFERENCE.md

Завдання:
1. Додай Google Tag Manager на frontend через VITE_GTM_ID.
2. Реалізуй client/src/lib/analytics.ts з dataLayer helper.
3. Реалізуй client/src/lib/attribution.ts для збору UTM, gclid, fbclid, ttclid, trid, referrer, landingPage.
4. Реалізуй first touch і last touch attribution з TTL 30 днів.
5. Додай AnalyticsTracker для SPA page_view.
6. Додай події form_open, lead_submit_success, phone_click, messenger_click.
7. Не відправляй персональні дані в Google Analytics.
8. Додай attribution payload у всі публічні форми заявок.
9. Розшир backend Zod-схеми для POST /api/orders і POST /api/service-requests, щоб вони приймали attribution.
10. Додай таблиці MarketingTrackingLink, MarketingTrackingClick, CustomerRequestAttribution у server/src/lib/schema.ts. Не використовуй PostgreSQL enum.
11. Реалізуй backend helper для нормалізації attribution і визначення trafficSource.
12. При створенні заявки записуй attribution у CustomerRequestAttribution.
13. Додай public endpoint GET /go/:code, який записує click і робить безпечний redirect на внутрішню сторінку з UTM + trid.
14. Додай protected admin routes /api/admin/marketing/* для створення, редагування, деактивації та перегляду tracking-посилань.
15. Додай сторінку /admin/marketing в адмінці.
16. На сторінці маркетингу реалізуй:
    - список tracking-посилань;
    - створення нового посилання;
    - копіювання готового URL;
    - кліки;
    - заявки;
    - конверсію.
17. В CRM-заявках додай блок “Джерело заявки” і бейдж джерела в списку.
18. Додай фільтр заявок по джерелу/кампанії, якщо це не ламає поточну UX-структуру.
19. Онови документацію:
    - docs/TECHNICAL_OVERVIEW.md
    - docs/API_REFERENCE.md
    - docs/PROJECT_CONTEXT.md
    - .env.example
20. Перед завершенням виконай build:
    - cd client && npm run build
    - cd server && npm run build

Важливі правила:
- Не додавати секрети в VITE_*.
- Не передавати ім'я, телефон, email, адресу або коментар у Google Analytics.
- Не створювати open redirect у /go/:code.
- Не використовувати Prisma в runtime.
- Не додавати PostgreSQL enum для нових маркетингових статусів.
- Якщо attribution не записався, заявка все одно має створитися, але помилка має бути залогована.
- Усі нові SQL-запити писати через parameterized queries.
- Після реалізації коротко опиши, які файли змінено, як тестувати і які env-змінні потрібно додати на production.
```

---

# Етап 21. Додаткові покращення на майбутнє

Це не обов'язково для першої версії, але корисно пізніше:

1. Експорт звіту в CSV.
2. Інтеграція з Google Ads conversions.
3. Передача server-side conversion events.
4. Looker Studio dashboard.
5. Multi-touch attribution report.
6. Автоматичне створення QR-коду для tracking-посилання.
7. Окрема статистика по сторінках:
   - яка сторінка дала найбільше заявок;
   - які послуги найкраще конвертують.
8. Інтеграція з Telegram-ботом:
   - показувати менеджеру джерело заявки прямо в Telegram-сповіщенні.
