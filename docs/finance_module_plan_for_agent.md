# План реалізації фінансового модуля CRM TechnoRent

> Призначення: детальна інструкція для AI-агента/Codex, який уже має контекст проєкту TechnoRent.
> Мета: додати в CRM повноцінний облік грошей без порушення вже працюючої логіки заявок, замовлень, працівників, Telegram-бота, GPS, зайнятості та деплою.

---

## 0. Головна ідея модуля

Потрібно реалізувати фінансовий контур CRM для бізнесу оренди спецтехніки та послуг.

Фінанси мають охоплювати:

1. **Фінанси конкретного замовлення**:
   - погоджена з клієнтом ціна;
   - позиції, з яких формується ціна;
   - оплати клієнта;
   - борг клієнта;
   - зарплата працівника;
   - розрахунок з працівником;
   - додаткові витрати по замовленню;
   - чистий прибуток по замовленню.

2. **Загальні витрати по техніці**:
   - куплене пальне;
   - кількість літрів;
   - ціна за літр;
   - загальна сума;
   - обслуговування;
   - ремонт;
   - запчастини;
   - інші витрати;
   - привʼязка до конкретної одиниці техніки.

3. **Загальну вкладку `Фінанси` в адмінці**:
   - дохід за вибраний період;
   - витрати за вибраний період;
   - прибуток;
   - таблиця по техніці;
   - таблиця по послугах;
   - стан боргів клієнтів;
   - стан розрахунків з працівниками;
   - таблиця витрат;
   - експорт в Excel за вибраний період.

---

## 1. Важливий поточний контекст проєкту

Агент уже має контекст проєкту, але перед внесенням змін обовʼязково перевірити актуальні файли:

- `server/src/lib/schema.ts` — SQL-схема БД, таблиці, індекси.
- `server/src/routes/admin.rent-orders.ts` — основна бізнес-логіка замовлень.
- `server/src/routes/admin.requests.ts` — unified CRM-заявки.
- `server/src/routes/internal.telegram.ts` — internal API між backend і Telegram-ботом.
- `telegram-bot/src/server.ts` — Telegram callback-и і форми працівника.
- `client/src/pages/AdminRentOrdersPage.tsx` — UI замовлень.
- `client/src/pages/AdminOverviewPage.tsx` — огляд CRM.
- `client/src/components/AdminLayout.tsx` — меню адмінки.
- `client/src/api/client.ts` — frontend API-клієнт.
- `client/src/data/types.ts` — frontend типи.

Поточна система вже має:

- публічні заявки;
- unified CRM-шар `CustomerRequest` / `CustomerRequestItem`;
- `RentOrder` і `RentOrderItem`;
- призначення працівника;
- Telegram-бота для працівників;
- старт/завершення виконання;
- післяробочу Telegram-анкету;
- фінальне закриття замовлення менеджером;
- GPS snapshot після виконання;
- вкладки `Заявки`, `Замовлення`, `Працівники`, `Техніка`, `Послуги`, `GPS`, `Мапа`, `Зайнятість`.

---

## 2. Критичні правила: що не можна ламати

### 2.1. Не ламати існуючий CRM-флоу

Поточний флоу має залишитися працездатним:

```text
Заявка → Замовлення → Призначення працівника → Прийняття в Telegram →
Старт виконання → Завершення виконання → Анкета працівника →
Фінальне закриття менеджером
```

Фінансовий модуль має **доповнювати** цей флоу, а не замінювати його.

### 2.2. Не видаляти і не перейменовувати існуючі таблиці

Не видаляти:

- `CustomerRequest`
- `CustomerRequestItem`
- `RentOrder`
- `RentOrderItem`
- `BookedPeriod`
- `Employee`
- `WorkAssignment`
- `WorkExecutionSession`
- `WorkExecutionReport`
- `OrderEventLog`
- `Equipment`
- `Service`
- GPS-таблиці

Нову фінансову логіку додавати через нові таблиці і додаткові nullable-поля.

### 2.3. Не використовувати Prisma

Проєкт працює через `pg` і raw SQL. Prisma не використовувати в runtime.

Усі нові SQL-запити робити через:

```ts
pool.query(sql, params)
```

### 2.4. Не створювати PostgreSQL enum без потреби

Для нових статусів і типів використовувати `TEXT` + backend validation через Zod/перевірки.

Це важливо для сумісності з shared hosting/cPanel.

### 2.5. Не порушити деплой на cPanel

Після змін мають проходити:

```bash
cd server && npm run build
cd client && npm run build
cd telegram-bot && npm run build
```

Не змінювати без потреби:

- `server/dist/start.cjs`
- production env-структуру;
- Passenger startup flow.

### 2.6. Не виносити секрети у frontend

Не додавати секрети з префіксом `VITE_`.

---

## 3. Бізнес-логіка фінансів

---

## 3.1. Фінанси заявки та замовлення

### Як має працювати

1. Приходить заявка.
2. Якщо в заявці є приблизний розрахунок, менеджер бачить його.
3. Менеджер телефонує клієнту.
4. Менеджер створює замовлення.
5. У замовленні менеджер вказує погоджену з клієнтом ціну.
6. Ціна може формуватися з готових або ручних позицій.
7. Менеджер вказує зарплатню працівника.
8. Умови зарплати працівника передаються працівнику в Telegram-повідомленні про завдання.
9. Після виконання працівник заповнює Telegram-форму.
10. Якщо були додаткові витрати, вони додаються до замовлення.
11. Менеджер фінально закриває замовлення.
12. У замовленні видно:
    - суму замовлення;
    - скільки оплачено клієнтом;
    - скільки ще клієнт винен;
    - скільки працівник має отримати;
    - чи розрахувались з працівником;
    - витрати;
    - прибуток.

---

## 3.2. Позиції розрахунку ціни для клієнта

У замовленні має бути блок **`Позиції розрахунку`**.

Приклад:

| Позиція | Кількість | Одиниця | Ціна | Сума |
|---|---:|---|---:|---:|
| Доставка техніки | 18 | км | 60 | 1080 |
| Робота екскаватора | 5 | год | 1200 | 6000 |
| Завантаження авто на евакуатор | 1 | шт | 500 | 500 |

### Типи позицій

Підтримати такі типи:

```text
fixed          — фіксована сума
per_km         — за кілометр
per_hour       — за годину
per_shift      — за зміну
manual         — ручна сума
percent        — відсоток, можна додати, але не обовʼязково використовувати в MVP
```

### Джерело позиції

У позиції бажано мати поле `source`:

```text
manual              — менеджер додав вручну
request_calculation — підтягнуто з розрахунку заявки
template            — додано з шаблону
```

### Важливо

- Загальна сума замовлення має рахуватись із позицій.
- Але менеджер має мати можливість вручну вказати/скоригувати фінальну погоджену суму.
- Тому бажано мати:
  - `calculatedTotal` — сума позицій;
  - `agreedTotal` — фінальна погоджена сума.

Якщо `agreedTotal` не задано, використовувати суму позицій.

---

## 3.3. Готові шаблони позицій

Потрібно передбачити довідник шаблонів позицій.

Наприклад:

| Назва | Тип | Одиниця | Ціна за замовчуванням |
|---|---|---|---:|
| Доставка техніки | per_km | км | 60 |
| Подача евакуатора | per_km | км | 35 |
| Завантаження авто на евакуатор | fixed | шт | 500 |
| Робота техніки | per_hour | год | 1200 |
| Зміна техніки | per_shift | зміна | 8000 |
| Простій | per_hour | год | 600 |

У першій версії можна:

- створити таблицю шаблонів;
- додати базову CRUD-логіку пізніше;
- або на старті зробити простий список у коді/seed.

Краще зробити таблицю, бо надалі менеджер зможе редагувати шаблони.

---

## 3.4. Підтягування розрахунку із заявки

Якщо в заявці є попередній розрахунок, при створенні замовлення менеджер має бачити кнопку:

```text
Підтягнути розрахунок із заявки
```

Приклад для евакуатора:

- подача до клієнта: 12 км;
- маршрут перевезення: 34 км;
- тариф: 35 грн/км;
- орієнтовна сума: 1610 грн.

CRM має створити позиції:

| Позиція | Кількість | Одиниця | Ціна |
|---|---:|---|---:|
| Подача евакуатора | 12 | км | 35 |
| Евакуація авто | 34 | км | 35 |

Менеджер може змінити кількість, ціну або видалити позицію.

Якщо зараз у `CustomerRequest` ще немає структурованих полів розрахунку, додавати підтримку обережно:

- або через JSONB-поле для calculator snapshot;
- або використовувати вже наявний payload, якщо він існує в коді.

Не ламати існуючі заявки.

---

## 3.5. Зарплата працівника

У замовленні має бути блок **`Оплата працівника`**.

### Формати оплати

Потрібно підтримати:

```text
fixed      — фіксована сума за замовлення
hourly     — за годину
shift      — за зміну
percent    — відсоток від суми замовлення
manual     — ручна фінальна сума
```

### Приклади

Фіксована сума:

```text
Працівник отримає 1500 грн за замовлення.
```

За годину:

```text
250 грн/год × 6 год = 1500 грн.
```

За зміну:

```text
2000 грн за зміну.
```

Відсоток:

```text
20% від погодженої суми замовлення.
```

### Що зберігати

Потрібно зберігати:

- працівника;
- тип оплати;
- ставку;
- кількість годин/змін, якщо потрібно;
- відсоток, якщо потрібно;
- розраховану суму;
- фінальну суму;
- статус розрахунку;
- коментар.

---

## 3.6. Що передавати працівнику в Telegram

У повідомленні про нове завдання додати блок з оплатою працівника.

Приклад:

```text
Нове завдання №124

Клієнт: Іван
Телефон: +380...
Послуга: Евакуатор
Звідки: Львів, вул. ...
Куди: Пустомити, вул. ...

Ваша оплата:
Формат: за замовлення
Сума: 1500 грн

Коментар менеджера:
Акуратно завантажити авто, клієнт чекає після 15:00.
```

Якщо відсоток:

```text
Ваша оплата:
20% від фінальної суми замовлення.
Орієнтовно: 1600 грн.
Фінальна сума буде підтверджена після закриття замовлення.
```

### Важливо

- Не обовʼязково показувати працівнику повну суму, яку платить клієнт.
- Працівник має бачити свою оплату і деталі завдання.
- Не зламати поточні callback-кнопки `Прийняти`, `Відхилити`, `Розпочати`, `Завершити`.

---

## 3.7. Telegram-форма після виконання

Після завершення працівник має заповнити форму.

Поточна анкета вже існує. Її потрібно розширити або акуратно адаптувати.

Працівник має вказати:

1. Чи отримував гроші від клієнта?
2. Якщо так — скільки отримав?
3. Чи були додаткові витрати?
4. Якщо так:
   - тип витрати;
   - сума;
   - коментар.
5. Коментар по роботі.

### Типи витрат працівника

```text
fuel           — пальне
parking        — парковка
materials      — матеріали
repair         — дрібний ремонт
other          — інше
```

### Важливо

Додаткові витрати працівника — це **витрати замовлення**, а не загальні витрати техніки.

Менеджер має бачити їх у замовленні і мати можливість підтвердити/відредагувати.

---

## 3.8. Оплати клієнта

У замовленні має бути облік платежів клієнта.

Клієнт може оплатити:

- готівкою працівнику;
- готівкою менеджеру;
- на карту;
- на рахунок;
- іншим способом.

### Формула

```text
Оплачено клієнтом = сума всіх платежів клієнта
Борг клієнта = фінальна сума замовлення - оплачено клієнтом
```

### Статуси оплати

```text
UNPAID          — не оплачено
PARTIALLY_PAID  — частково оплачено
PAID            — оплачено
OVERPAID        — переплата
```

Статус можна рахувати автоматично на backend або frontend.

---

## 3.9. Розрахунок з працівником

Потрібно рахувати баланс між компанією і працівником.

### Приклад 1

Працівник має отримати 1500 грн.
Працівник отримав від клієнта 3000 грн.
Працівник мав додаткові витрати 1200 грн.

Тоді:

```text
Працівник тримає 3000 грн клієнтських грошей.
Йому належить 1500 грн зарплати.
Йому треба компенсувати 1200 грн витрат.
Компанії працівник має передати: 3000 - 1500 - 1200 = 300 грн.
```

### Приклад 2

Працівник має отримати 1500 грн.
Працівник не отримував гроші від клієнта.
Витрат немає.

```text
Компанія винна працівнику 1500 грн.
```

### Статуси розрахунку з працівником

```text
NOT_SETTLED             — не розраховано
PARTIALLY_SETTLED       — частково розраховано
SETTLED                 — розраховано
EMPLOYEE_OWES_COMPANY   — працівник винен компанії
COMPANY_OWES_EMPLOYEE   — компанія винна працівнику
```

---

## 3.10. Витрати по замовленню

Це витрати, які виникли саме під час виконання замовлення.

Приклади:

- пальне для конкретного виїзду;
- парковка;
- платна дорога;
- додаткові матеріали;
- дрібний ремонт;
- інше.

Ці витрати мають бути привʼязані до:

- замовлення;
- техніки, якщо відомо;
- працівника, якщо витрату подав працівник;
- типу витрати;
- суми;
- коментаря.

---

## 3.11. Загальні витрати по техніці

Окремо від витрат замовлення потрібні витрати, які привʼязані до техніки, але не обовʼязково до конкретного замовлення.

Приклади:

- купівля пального за місяць;
- планове ТО;
- ремонт;
- запчастини;
- мастила;
- мийка;
- страхування;
- інші витрати.

### Важливі рішення користувача

1. Пальне рахуємо **тільки як куплене**.
2. Залишок пального в баку не ведемо.
3. Витрата на пальне входить у той період, коли пальне купили.
4. Фото чеків не робимо в першій версії.
5. Excel-звіт просто завантажується, історія експортів не зберігається.
6. Розмежування ADMIN/MANAGER поки не робимо.

### Форма витрати техніки

Поля:

- техніка;
- дата;
- тип витрати;
- літри — тільки для пального;
- ціна за літр — тільки для пального;
- сума;
- коментар.

Для пального:

```text
Сума = літри × ціна за літр
```

Але суму дозволити редагувати вручну.

---

## 4. Формули розрахунків

---

## 4.1. Замовлення

```text
calculatedTotal = сума всіх OrderPriceItem.total
orderTotal = agreedTotal якщо задано, інакше calculatedTotal
clientPaid = сума всіх OrderPayment.amount
clientDebt = orderTotal - clientPaid
orderExpenses = сума всіх OrderExpense.amount
workerSalary = finalAmount з WorkerCompensation
orderProfit = orderTotal - orderExpenses - workerSalary
```

Важливо:

- Гроші, які працівник отримав від клієнта, — це оплата клієнта, а не витрата.
- Зарплата працівника — це витрата компанії.
- Витрати працівника по замовленню — це витрата компанії.

---

## 4.2. Загальні фінанси за період

```text
Дохід = сума завершених замовлень за вибраний період
Витрати = витрати по замовленнях + зарплати працівникам + витрати техніки
Прибуток = Дохід - Витрати
```

Дата для доходу:

- використовувати дату фінального закриття замовлення, якщо така є;
- якщо її немає, використовувати `updatedAt`/`completedAt`, залежно від фактичної схеми.

Дата для витрат техніки:

- використовувати дату витрати/купівлі.

---

## 4.3. Фінанси по техніці

```text
Дохід техніки = частка замовлень, де була ця техніка
Витрати техніки =
  витрати по замовленнях цієї техніки
  + загальні витрати цієї техніки
  + зарплата працівника, якщо привʼязана до цієї техніки/замовлення
Прибуток техніки = Дохід техніки - Витрати техніки
```

### Якщо в замовленні кілька одиниць техніки

Для MVP використати просту логіку:

- якщо позиція розрахунку має `equipmentId`, дохід іде на цю техніку;
- якщо позиції не привʼязані до техніки, розподілити дохід між `RentOrderItem` пропорційно або порівну;
- краще в UI дозволити привʼязати кожну позицію ціни до техніки.

Рекомендація: додати `equipmentId` у `OrderPriceItem` як nullable.

---

## 4.4. Фінанси по послугах

```text
Дохід послуги = сума замовлень/позицій, привʼязаних до цієї послуги
Витрати послуги = витрати замовлень, повʼязаних із цією послугою
Прибуток послуги = Дохід послуги - Витрати послуги
```

Рекомендація: додати `serviceId` у `OrderPriceItem` або у `RentOrder`, якщо у схемі вже є звʼязок із послугою.

Якщо поточного `serviceId` у `RentOrder` немає, додавати дуже обережно як nullable-поле.

---

## 4.5. Розрахунок з працівником

```text
workerEarned = фінальна зарплата працівника
workerReceivedFromClient = платежі клієнта, де receivedByType = employee
workerReportedExpenses = витрати замовлення, створені/подані працівником
companyPaidToWorker = сума EmployeeSettlement, де direction = company_to_employee
workerPaidToCompany = сума EmployeeSettlement, де direction = employee_to_company

workerBalance = workerEarned + workerReportedExpenses - workerReceivedFromClient - companyPaidToWorker + workerPaidToCompany
```

Інтерпретація:

```text
workerBalance > 0  → компанія ще винна працівнику
workerBalance = 0  → розраховано
workerBalance < 0  → працівник винен компанії
```

---

## 5. Рекомендовані нові таблиці

Назви можна адаптувати під стиль проєкту, але логіку зберегти.

---

## 5.1. `PriceItemTemplate`

Шаблони позицій ціни.

```sql
CREATE TABLE IF NOT EXISTS "PriceItemTemplate" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "title" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL,
  "defaultUnit" TEXT,
  "defaultUnitPrice" NUMERIC(12,2),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 5.2. `OrderPriceItem`

Позиції розрахунку ціни замовлення.

```sql
CREATE TABLE IF NOT EXISTS "OrderPriceItem" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
  "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
  "serviceId" TEXT REFERENCES "Service"("id") ON DELETE SET NULL,
  "templateId" TEXT REFERENCES "PriceItemTemplate"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL,
  "quantity" NUMERIC(12,2) NOT NULL DEFAULT 1,
  "unit" TEXT,
  "unitPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "comment" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Індекси:

```sql
CREATE INDEX IF NOT EXISTS "OrderPriceItem_rentOrderId_idx" ON "OrderPriceItem"("rentOrderId");
CREATE INDEX IF NOT EXISTS "OrderPriceItem_equipmentId_idx" ON "OrderPriceItem"("equipmentId");
CREATE INDEX IF NOT EXISTS "OrderPriceItem_serviceId_idx" ON "OrderPriceItem"("serviceId");
```

---

## 5.3. `OrderPayment`

Оплати клієнта.

```sql
CREATE TABLE IF NOT EXISTS "OrderPayment" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
  "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "method" TEXT NOT NULL DEFAULT 'cash',
  "receivedByType" TEXT NOT NULL DEFAULT 'manager',
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
  "paidAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "comment" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Типи `method`:

```text
cash
card
bank_transfer
other
```

Типи `receivedByType`:

```text
manager
employee
company_account
other
```

---

## 5.4. `OrderExpense`

Витрати конкретного замовлення.

```sql
CREATE TABLE IF NOT EXISTS "OrderExpense" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
  "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "comment" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manager',
  "expenseAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Типи:

```text
fuel
parking
materials
repair
service
other
```

`source`:

```text
manager
employee
system
```

---

## 5.5. `WorkerCompensation`

Оплата працівника по замовленню.

```sql
CREATE TABLE IF NOT EXISTS "WorkerCompensation" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL DEFAULT 'fixed',
  "rate" NUMERIC(12,2),
  "quantity" NUMERIC(12,2),
  "percent" NUMERIC(5,2),
  "calculatedAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "finalAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'NOT_SETTLED',
  "comment" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Індекс:

```sql
CREATE INDEX IF NOT EXISTS "WorkerCompensation_rentOrderId_idx" ON "WorkerCompensation"("rentOrderId");
CREATE INDEX IF NOT EXISTS "WorkerCompensation_employeeId_idx" ON "WorkerCompensation"("employeeId");
```

---

## 5.6. `EmployeeSettlement`

Фактичні розрахунки між компанією і працівником.

```sql
CREATE TABLE IF NOT EXISTS "EmployeeSettlement" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "rentOrderId" TEXT REFERENCES "RentOrder"("id") ON DELETE SET NULL,
  "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "direction" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'cash',
  "settledAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "comment" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`direction`:

```text
company_to_employee
employee_to_company
```

---

## 5.7. `EquipmentExpense`

Загальні витрати по техніці.

```sql
CREATE TABLE IF NOT EXISTS "EquipmentExpense" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "fuelLiters" NUMERIC(12,2),
  "fuelPricePerLiter" NUMERIC(12,2),
  "comment" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Типи:

```text
fuel
maintenance
repair
parts
oil
washing
insurance
other
```

Індекси:

```sql
CREATE INDEX IF NOT EXISTS "EquipmentExpense_equipmentId_idx" ON "EquipmentExpense"("equipmentId");
CREATE INDEX IF NOT EXISTS "EquipmentExpense_expenseDate_idx" ON "EquipmentExpense"("expenseDate");
CREATE INDEX IF NOT EXISTS "EquipmentExpense_type_idx" ON "EquipmentExpense"("type");
```

---

## 5.8. Можливі додаткові поля в `RentOrder`

Додати nullable-поля, якщо їх ще немає:

```sql
ALTER TABLE "RentOrder"
  ADD COLUMN IF NOT EXISTS "agreedTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "financeComment" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS "workerSettlementStatus" TEXT NOT NULL DEFAULT 'NOT_SETTLED';
```

Якщо `closedAt` уже є під іншою назвою — не дублювати, використати існуюче поле.

---

## 6. Backend API

Рекомендується створити окремий файл:

```text
server/src/routes/admin.finance.ts
```

І підключити в `server/src/index.ts`:

```ts
app.use('/api/admin/finance', adminFinanceRouter);
```

Усі endpoints мають бути захищені `authMiddleware`.

---

## 6.1. Endpoints для фінансів замовлення

### Отримати фінансові дані замовлення

```http
GET /api/admin/rent-orders/:id/finance
```

Повертає:

- order basics;
- price items;
- payments;
- expenses;
- worker compensation;
- settlements;
- computed summary.

### Оновити погоджену суму і коментар

```http
PUT /api/admin/rent-orders/:id/finance-summary
```

Body:

```json
{
  "agreedTotal": 8000,
  "financeComment": "Ціну погоджено з клієнтом телефоном"
}
```

### CRUD позицій ціни

```http
POST /api/admin/rent-orders/:id/price-items
PUT /api/admin/rent-orders/:id/price-items/:itemId
DELETE /api/admin/rent-orders/:id/price-items/:itemId
```

### CRUD оплат клієнта

```http
POST /api/admin/rent-orders/:id/payments
PUT /api/admin/rent-orders/:id/payments/:paymentId
DELETE /api/admin/rent-orders/:id/payments/:paymentId
```

### CRUD витрат замовлення

```http
POST /api/admin/rent-orders/:id/expenses
PUT /api/admin/rent-orders/:id/expenses/:expenseId
DELETE /api/admin/rent-orders/:id/expenses/:expenseId
```

### Оплата працівника

```http
PUT /api/admin/rent-orders/:id/worker-compensation
```

### Розрахунки з працівником

```http
POST /api/admin/rent-orders/:id/employee-settlements
DELETE /api/admin/rent-orders/:id/employee-settlements/:settlementId
```

---

## 6.2. Endpoints для загальних витрат техніки

```http
GET /api/admin/finance/equipment-expenses?from=YYYY-MM-DD&to=YYYY-MM-DD&equipmentId=all&type=all
POST /api/admin/finance/equipment-expenses
PUT /api/admin/finance/equipment-expenses/:id
DELETE /api/admin/finance/equipment-expenses/:id
```

Body для створення:

```json
{
  "equipmentId": "eq_1",
  "type": "fuel",
  "expenseDate": "2026-05-10",
  "fuelLiters": 120,
  "fuelPricePerLiter": 60,
  "amount": 7200,
  "comment": "Заправка за травень"
}
```

Для обслуговування:

```json
{
  "equipmentId": "eq_1",
  "type": "maintenance",
  "expenseDate": "2026-05-15",
  "amount": 4500,
  "comment": "Заміна масла і фільтрів"
}
```

---

## 6.3. Endpoints для фінансового dashboard

### Загальний overview

```http
GET /api/admin/finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Повертає:

```json
{
  "income": 245000,
  "expenses": 92000,
  "profit": 153000,
  "fuelExpenses": 48000,
  "maintenanceExpenses": 22000,
  "workerCompensation": 18000,
  "clientDebt": 35000,
  "workerBalance": 6000
}
```

### Таблиця по техніці

```http
GET /api/admin/finance/by-equipment?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Повертає:

```json
[
  {
    "equipmentId": "eq_1",
    "equipmentName": "JCB 3CX",
    "ordersCount": 12,
    "income": 96000,
    "fuelLiters": 320,
    "fuelExpenses": 19200,
    "maintenanceExpenses": 4500,
    "orderExpenses": 1200,
    "workerCompensation": 14000,
    "totalExpenses": 38900,
    "profit": 57100
  }
]
```

### Таблиця по послугах

```http
GET /api/admin/finance/by-service?from=YYYY-MM-DD&to=YYYY-MM-DD
```

### Борги клієнтів

```http
GET /api/admin/finance/client-debts?from=YYYY-MM-DD&to=YYYY-MM-DD
```

### Розрахунки з працівниками

```http
GET /api/admin/finance/employee-balances?from=YYYY-MM-DD&to=YYYY-MM-DD
```

---

## 6.4. Excel export

```http
GET /api/admin/finance/export.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Має повертати файл Excel.

Історію експортів не зберігати.

### Бібліотека

Можна використати `exceljs`.

Перевірити, чи її ще немає в `package.json`. Якщо немає — додати у server dependencies.

### Аркуші Excel

1. `Підсумок`
2. `Техніка`
3. `Послуги`
4. `Замовлення`
5. `Витрати`
6. `Працівники`

---

## 7. Frontend UI

---

## 7.1. Меню адмінки

У `AdminLayout.tsx` додати пункт:

```text
Фінанси
```

Маршрут:

```text
/admin/finance
```

Сторінка:

```text
client/src/pages/AdminFinancePage.tsx
```

---

## 7.2. Вкладка `Фінанси`

Сторінка має мати фільтр періоду:

- сьогодні;
- цей тиждень;
- цей місяць;
- минулий місяць;
- довільний період.

Можна почати з простого `dateFrom/dateTo`.

### Верхні KPI-картки

Показати:

- Дохід;
- Витрати;
- Прибуток;
- Пальне;
- Обслуговування/ремонт;
- Борги клієнтів;
- Баланс з працівниками.

### Таби або секції

```text
[Огляд] [Техніка] [Послуги] [Борги клієнтів] [Працівники] [Витрати]
```

Для MVP можна зробити все на одній сторінці, але з секціями.

---

## 7.3. Таблиця по техніці

Колонки:

- Техніка;
- Кількість замовлень;
- Дохід;
- Пальне, л;
- Пальне, грн;
- Обслуговування;
- Витрати замовлень;
- Зарплата;
- Всього витрат;
- Прибуток.

---

## 7.4. Таблиця по послугах

Колонки:

- Послуга;
- Кількість замовлень;
- Дохід;
- Витрати;
- Прибуток.

---

## 7.5. Борги клієнтів

Колонки:

- Замовлення;
- Клієнт;
- Телефон;
- Сума замовлення;
- Оплачено;
- Борг;
- Статус оплати;
- Дата.

---

## 7.6. Розрахунки з працівниками

Колонки:

- Працівник;
- Кількість замовлень;
- Заробив;
- Виплачено;
- Отримав від клієнтів;
- Витрати працівника;
- Баланс;
- Статус.

---

## 7.7. Витрати техніки

Окрема секція у фінансах:

- таблиця витрат;
- кнопка `Додати витрату`;
- фільтри: техніка, тип, період.

Форма додавання витрати:

- техніка — select;
- тип — select;
- дата;
- літри — показувати тільки для типу `fuel`;
- ціна за літр — показувати тільки для типу `fuel`;
- сума;
- коментар.

Автоматично рахувати суму для пального:

```ts
amount = fuelLiters * fuelPricePerLiter
```

Але дозволити вручну змінити суму.

---

## 7.8. Excel export UI

На сторінці `Фінанси` додати кнопку:

```text
Експорт в Excel
```

Вона має завантажувати файл з endpoint:

```text
/api/admin/finance/export.xlsx?from=...&to=...
```

Не відкривати нову сторінку. Просто скачати файл.

---

## 7.9. Фінансовий блок у картці замовлення

У `AdminRentOrdersPage.tsx` у detail view додати блоки:

1. `Розрахунок для клієнта`
2. `Оплати клієнта`
3. `Оплата працівника`
4. `Витрати замовлення`
5. `Розрахунок з працівником`
6. `Фінансовий підсумок`

### Розрахунок для клієнта

Таблиця:

- Назва;
- Тип;
- Кількість;
- Одиниця;
- Ціна;
- Сума;
- Коментар;
- Дії.

### Оплати клієнта

- Дата;
- Сума;
- Метод;
- Хто отримав;
- Коментар.

### Оплата працівника

- Тип оплати;
- Ставка;
- Кількість;
- Відсоток;
- Розрахована сума;
- Фінальна сума;
- Статус.

### Витрати замовлення

- Дата;
- Тип;
- Сума;
- Працівник;
- Коментар.

### Підсумок

- Сума замовлення;
- Оплачено;
- Борг клієнта;
- Витрати;
- Зарплата;
- Прибуток;
- Баланс з працівником.

---

## 8. Telegram-бот

---

## 8.1. Повідомлення про нове завдання

Додати інформацію про оплату працівника.

Важливо не зламати поточну структуру повідомлення:

- номер замовлення;
- клієнт;
- телефон;
- дата/час;
- адреси;
- коментар менеджера;
- inline-кнопки.

Додати блок:

```text
Ваша оплата:
Формат: ...
Сума: ... грн
```

---

## 8.2. Післяробоча анкета

Поточна анкета вже збирає певні дані. Її потрібно розширити так, щоб дані записувались у нові фінансові таблиці:

- якщо працівник вказав отриману готівку — створити `OrderPayment` з `receivedByType = employee`;
- якщо працівник вказав додаткові витрати — створити `OrderExpense` з `source = employee`;
- якщо працівник вказав коментар — зберегти в поточний report/comment, не ламати існуюче.

---

## 8.3. Менеджерське підтвердження

У першій версії можна зробити так:

- дані працівника одразу потрапляють у фінансовий блок замовлення;
- менеджер бачить їх;
- менеджер може редагувати або видалити ці записи.

Окремий статус `pending/approved` для витрат можна додати пізніше.

---

## 9. Excel export details

---

## 9.1. Аркуш `Підсумок`

Колонки:

| Показник | Сума |
|---|---:|
| Дохід | ... |
| Витрати | ... |
| Прибуток | ... |
| Пальне | ... |
| Обслуговування | ... |
| Зарплата | ... |
| Борги клієнтів | ... |
| Баланс з працівниками | ... |

---

## 9.2. Аркуш `Техніка`

Колонки:

- Техніка;
- Замовлень;
- Дохід;
- Пальне, л;
- Пальне, грн;
- Обслуговування;
- Ремонт;
- Інші витрати;
- Зарплата;
- Всього витрат;
- Прибуток.

---

## 9.3. Аркуш `Послуги`

Колонки:

- Послуга;
- Замовлень;
- Дохід;
- Витрати;
- Прибуток.

---

## 9.4. Аркуш `Замовлення`

Колонки:

- Номер;
- Дата закриття;
- Клієнт;
- Телефон;
- Послуга;
- Техніка;
- Сума;
- Оплачено;
- Борг;
- Витрати;
- Зарплата;
- Прибуток;
- Статус оплати.

---

## 9.5. Аркуш `Витрати`

Колонки:

- Дата;
- Техніка;
- Тип;
- Літри;
- Ціна за літр;
- Сума;
- Коментар.

---

## 9.6. Аркуш `Працівники`

Колонки:

- Працівник;
- Замовлень;
- Заробив;
- Отримав від клієнтів;
- Витрати подав;
- Виплачено компанією;
- Передано компанії;
- Баланс.

---

## 10. Поетапний план реалізації

---

# Етап 1. Підготовка і аудит поточної логіки

## Завдання

1. Переглянути актуальні файли:
   - `schema.ts`;
   - `admin.rent-orders.ts`;
   - `AdminRentOrdersPage.tsx`;
   - Telegram-файли;
   - типи frontend.

2. Зʼясувати:
   - які поля вже є в `RentOrder`;
   - чи є `closedAt` або аналог;
   - як зараз менеджер закриває замовлення;
   - що саме зараз зберігає післяробоча анкета працівника;
   - як зараз передаються дані працівнику в Telegram.

3. Скласти короткий внутрішній висновок у коментарях/плані перед змінами.

## Критерій готовності

- Агент розуміє актуальну структуру і не дублює вже існуючі поля.

---

# Етап 2. База даних

## Завдання

1. У `server/src/lib/schema.ts` додати нові таблиці:
   - `PriceItemTemplate`;
   - `OrderPriceItem`;
   - `OrderPayment`;
   - `OrderExpense`;
   - `WorkerCompensation`;
   - `EmployeeSettlement`;
   - `EquipmentExpense`.

2. Додати nullable-поля в `RentOrder`:
   - `agreedTotal`;
   - `financeComment`;
   - `closedAt`, якщо немає аналога;
   - `paymentStatus`;
   - `workerSettlementStatus`.

3. Додати індекси.

4. Не використовувати enum.

5. Забезпечити `CREATE TABLE IF NOT EXISTS` і `ALTER TABLE ADD COLUMN IF NOT EXISTS`.

## Критерій готовності

- Сервер стартує на порожній і на вже існуючій БД.
- Старі дані не губляться.
- `npm run build` для server проходить.

---

# Етап 3. Backend: finance helpers

## Завдання

Створити службові функції, наприклад:

```text
server/src/lib/finance.ts
```

Або всередині `admin.finance.ts`, якщо проєкт не має такого патерну.

Функції:

- `calculateOrderFinance(rentOrderId)`;
- `calculatePaymentStatus(total, paid)`;
- `calculateWorkerBalance(...)`;
- `calculateWorkerSettlementStatus(balance)`;
- `getFinanceSummary(from, to)`;
- `getFinanceByEquipment(from, to)`;
- `getFinanceByService(from, to)`;
- `getClientDebts(from, to)`;
- `getEmployeeBalances(from, to)`.

## Критерій готовності

- Розрахунки зосереджені в одному місці, а не дублюються в різних route handlers.

---

# Етап 4. Backend: API для фінансів замовлення

## Завдання

Додати endpoints для:

- отримання фінансів замовлення;
- позицій ціни;
- оплат клієнта;
- витрат замовлення;
- зарплати працівника;
- розрахунків з працівником.

Валідація через Zod.

Після кожної зміни, яка впливає на суму, оновлювати:

- `paymentStatus`;
- `workerSettlementStatus`;
- можливо `updatedAt`.

## Критерій готовності

- Через API можна повністю заповнити фінанси одного замовлення.
- Старий endpoint створення/оновлення замовлення не зламаний.

---

# Етап 5. Backend: API для витрат техніки

## Завдання

Додати CRUD для `EquipmentExpense`.

Правила:

- `equipmentId` обовʼязковий;
- `expenseDate` обовʼязкова;
- `type` обовʼязковий;
- `amount` обовʼязковий;
- для `fuel` дозволити `fuelLiters` і `fuelPricePerLiter`;
- якщо `fuelLiters` і `fuelPricePerLiter` задані, можна автоматично порахувати `amount`, але якщо `amount` передано — використовувати передане значення.

## Критерій готовності

- Можна додати пальне за місяць до конкретної техніки.
- Можна додати обслуговування або ремонт.
- Дані потрапляють у фінансову аналітику.

---

# Етап 6. Backend: фінансова аналітика

## Завдання

Додати endpoints:

```http
GET /api/admin/finance/summary
GET /api/admin/finance/by-equipment
GET /api/admin/finance/by-service
GET /api/admin/finance/client-debts
GET /api/admin/finance/employee-balances
```

Усі приймають:

```text
from=YYYY-MM-DD
to=YYYY-MM-DD
```

Правила періоду:

- `from` включно;
- `to` включно або до кінця дня `to`;
- явно обробити timezone/дати так, щоб не губились записи в кінці дня.

## Критерій готовності

- API повертає коректні агреговані суми за вибраний період.

---

# Етап 7. Backend: Excel export

## Завдання

1. Додати dependency `exceljs`, якщо її немає.
2. Додати endpoint:

```http
GET /api/admin/finance/export.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD
```

3. Сформувати workbook з аркушами:
   - `Підсумок`;
   - `Техніка`;
   - `Послуги`;
   - `Замовлення`;
   - `Витрати`;
   - `Працівники`.

4. Встановити headers:

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="finance-report-YYYY-MM-DD_YYYY-MM-DD.xlsx"
```

## Критерій готовності

- Файл завантажується з браузера.
- Excel відкривається без помилок.
- Історія експортів не зберігається.

---

# Етап 8. Frontend: типи і API-клієнт

## Завдання

1. Додати TypeScript типи:
   - `OrderPriceItem`;
   - `OrderPayment`;
   - `OrderExpense`;
   - `WorkerCompensation`;
   - `EmployeeSettlement`;
   - `EquipmentExpense`;
   - `FinanceSummary`;
   - `FinanceByEquipmentRow`;
   - `FinanceByServiceRow`;
   - `ClientDebtRow`;
   - `EmployeeBalanceRow`.

2. Додати API-функції в окремий файл, наприклад:

```text
client/src/data/finance.service.ts
```

3. Не дублювати fetch-логіку, використовувати `apiFetch`.

## Критерій готовності

- Frontend має типізований доступ до фінансового API.

---

# Етап 9. Frontend: фінансовий блок у замовленні

## Завдання

У `AdminRentOrdersPage.tsx` додати фінансові блоки.

Рекомендація: якщо файл уже великий, винести в компоненти:

```text
client/src/components/admin/order-finance/OrderFinancePanel.tsx
client/src/components/admin/order-finance/OrderPriceItemsTable.tsx
client/src/components/admin/order-finance/OrderPaymentsTable.tsx
client/src/components/admin/order-finance/OrderExpensesTable.tsx
client/src/components/admin/order-finance/WorkerCompensationCard.tsx
client/src/components/admin/order-finance/EmployeeSettlementsTable.tsx
```

Не робити весь код у одному великому файлі, якщо це погіршує підтримку.

## Критерій готовності

- У detail view замовлення видно повний фінансовий підсумок.
- Менеджер може додавати/редагувати позиції, оплати, витрати, зарплату.
- Старе створення/редагування замовлення працює.

---

# Етап 10. Frontend: сторінка `Фінанси`

## Завдання

1. Створити сторінку:

```text
client/src/pages/AdminFinancePage.tsx
```

2. Додати маршрут в `App.tsx`.
3. Додати пункт меню в `AdminLayout.tsx`.
4. Додати фільтр періоду.
5. Додати KPI-картки.
6. Додати таблиці:
   - по техніці;
   - по послугах;
   - борги клієнтів;
   - працівники;
   - витрати техніки.
7. Додати форму витрат техніки.
8. Додати кнопку Excel-експорту.

## Критерій готовності

- Менеджер бачить фінансовий стан за вибраний період.
- Можна додавати витрати по техніці.
- Можна завантажити Excel.

---

# Етап 11. Telegram-інтеграція

## Завдання

1. Додати у повідомлення працівнику інформацію про його оплату.
2. Розширити післяробочу анкету:
   - отримана готівка від клієнта;
   - додаткові витрати;
   - тип витрати;
   - коментар.
3. Зберігати ці дані в нові таблиці:
   - `OrderPayment`;
   - `OrderExpense`.
4. Не ламати поточні callback-и.
5. Не ламати логіку `WORKER_COMPLETED` і фінального закриття менеджером.

## Критерій готовності

- Працівник бачить свою оплату в Telegram.
- Дані після анкети потрапляють у фінанси замовлення.

---

# Етап 12. Тестування

## Backend

Перевірити:

```bash
cd server && npm run build
```

Тестові сценарії:

1. Створити замовлення без фінансів — старий сценарій працює.
2. Додати позиції ціни.
3. Додати погоджену суму.
4. Додати оплату клієнта.
5. Перевірити статус оплати.
6. Додати зарплату працівника.
7. Додати витрату замовлення.
8. Додати витрату техніки.
9. Перевірити summary.
10. Перевірити Excel export.

## Frontend

Перевірити:

```bash
cd client && npm run build
```

Сценарії:

1. Відкрити замовлення.
2. Додати фінансові позиції.
3. Додати оплату.
4. Додати витрату.
5. Додати зарплату працівника.
6. Перейти у вкладку `Фінанси`.
7. Змінити період.
8. Додати пальне по техніці.
9. Завантажити Excel.
10. Перевірити mobile/tablet layout, щоб не було горизонтального скролу.

## Telegram

Перевірити:

```bash
cd telegram-bot && npm run build
```

Сценарії:

1. Призначити працівника.
2. Перевірити повідомлення з оплатою.
3. Прийняти завдання.
4. Розпочати.
5. Завершити.
6. Заповнити дані про готівку і витрати.
7. Перевірити, що дані зʼявились у фінансах замовлення.

---

## 11. UX-рекомендації

1. Не перевантажувати картку замовлення одразу всіма формами.
2. Використати collapsible-блоки або таби:
   - `Основне`;
   - `Фінанси`;
   - `Працівник`;
   - `Події`.
3. Для сум використовувати формат:

```text
12 500 грн
```

4. Для боргу клієнта:
   - червоний, якщо борг > 0;
   - зелений, якщо оплачено.

5. Для прибутку:
   - зелений, якщо > 0;
   - червоний, якщо < 0.

6. Для форм витрат:
   - якщо тип `Пальне`, показувати літри і ціну за літр;
   - для інших типів ці поля ховати.

---

## 12. Ризики і як їх уникнути

### Ризик 1. Зламати створення замовлень

Не змінювати радикально `POST /api/admin/rent-orders`.
Фінанси додавати окремими endpoint-ами.

### Ризик 2. Зламати Telegram callback-и

Не переписувати повністю callback handler.
Додати фінансові кроки акуратно в існуючу анкету.

### Ризик 3. Неправильні суми через `string` з PostgreSQL numeric

`pg` може повертати `NUMERIC` як string.
На backend явно приводити до number там, де це потрібно для JSON.

### Ризик 4. Дублювання логіки розрахунків

Не рахувати одні й ті ж формули в 5 місцях.
Створити finance helper-и.

### Ризик 5. Невірний період через дату

Для `to` використовувати кінець дня:

```text
YYYY-MM-DD 23:59:59
```

або SQL `< nextDay(to)`.

### Ризик 6. Великий `AdminRentOrdersPage.tsx`

Якщо файл стане занадто великим, винести фінансовий UI в компоненти.

---

## 13. Пріоритет реалізації

Якщо потрібно скоротити обсяг, робити в такому порядку:

1. Таблиці БД.
2. Фінанси одного замовлення.
3. Витрати техніки.
4. Фінансова вкладка.
5. Excel export.
6. Telegram-розширення.
7. Шаблони позицій і покращення UX.

---

## 14. Definition of Done

Фінансовий модуль можна вважати готовим, якщо:

1. Менеджер може в замовленні сформувати ціну з позицій.
2. Менеджер може вказати погоджену суму.
3. Менеджер може вказати зарплату працівника.
4. Працівник бачить свою оплату в Telegram.
5. Працівник після виконання може вказати отриману готівку і додаткові витрати.
6. У замовленні видно:
   - суму;
   - оплачено;
   - борг;
   - витрати;
   - зарплату;
   - прибуток;
   - баланс з працівником.
7. Можна додати витрати по техніці:
   - пальне;
   - літри;
   - ціна за літр;
   - обслуговування;
   - ремонт;
   - інше.
8. У вкладці `Фінанси` видно:
   - дохід;
   - витрати;
   - прибуток;
   - таблицю по техніці;
   - таблицю по послугах;
   - борги клієнтів;
   - розрахунки з працівниками.
9. Excel-звіт завантажується за вибраний період.
10. Старі заявки, замовлення, зайнятість, Telegram і GPS не зламані.
11. `server`, `client`, `telegram-bot` успішно проходять build.

---

## 15. Короткий промпт для старту виконання агентом

Можна дати агенту такий стартовий промпт:

```text
Прочитай цей Markdown-план повністю. Потім перед змінами переглянь актуальні файли schema.ts, admin.rent-orders.ts, AdminRentOrdersPage.tsx, AdminLayout.tsx, App.tsx, Telegram bot server.ts та internal.telegram routes. Реалізуй фінансовий модуль поетапно, не ламаючи існуючу CRM-логіку заявка → замовлення → працівник → Telegram → виконання → фінальне закриття. Почни з аудиту поточної схеми і реалізації Етапу 1-2. Не використовуй Prisma, не додавай PostgreSQL enum, працюй через pg/raw SQL, усі нові поля роби backward-compatible. Після кожного великого етапу перевіряй build server/client/telegram-bot і коротко описуй, що змінив.
```
