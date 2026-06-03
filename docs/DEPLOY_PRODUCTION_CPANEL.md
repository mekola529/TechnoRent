# TechnoRent — Production Deploy на cPanel

> Оновлено: 24 квітня 2026
> Цей документ фіксує реальний production-контур і помилки, які вже траплялись під час деплою.

## 1. Production-контур

- хостинг: `HostPro`
- панель: `cPanel`
- Node app: уже створений, повторно створювати не треба
- application root: `/home/xkiavukt/technorent.lanbox.com.ua`
- startup file: `server/dist/start.cjs`
- production API: `https://technorent.lanbox.com.ua/api`

## 2. Структура файлів на сервері

У корені сайту після деплою має бути саме так:

```text
/home/xkiavukt/technorent.lanbox.com.ua
├── .env
├── client_dist/
├── uploads/
├── server/
│   ├── dist/
│   ├── node_modules/
│   ├── package.json
│   └── package-lock.json
└── docs/
```

Критично:

- `.env` лежить у корені сайту, не в `server/.env`
- `client_dist/index.html` існує
- `server/dist/start.cjs` існує
- `server/dist/scripts/sync-tracker-from-equgps.js` існує

## 3. Що має бути в production `.env`

Мінімум:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DB_NAME
JWT_SECRET=...
CLIENT_URL=https://technorent.lanbox.com.ua
SITE_URL=https://technorent.lanbox.com.ua
PORT=3001

TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_INTERNAL_TOKEN=...
TELEGRAM_BOT_INTERNAL_URL=http://127.0.0.1:3011/internal
TELEGRAM_BOT_PORT=3011
TELEGRAM_BOT_WEBHOOK_SECRET=...
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram

EQUGPS_PLATFORM_URL=https://gps.equgps.com
EQUGPS_EMAIL=...
EQUGPS_PASSWORD=...
```

### Якщо сайт на хостингу, а Telegram worker bot запускається локально через ngrok

Для тимчасового тесту, коли production-сайт має викликати локальний бот, `TELEGRAM_BOT_INTERNAL_URL` у production `.env` має дивитись не на `127.0.0.1`, а на поточний ngrok URL:

```env
TELEGRAM_BOT_INTERNAL_URL=https://YOUR-NGROK-DOMAIN.ngrok-free.app/internal
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
```

Причина: `127.0.0.1` на хостингу означає сам хостинг, а не локальний Mac.

Локально для бота має бути:

```env
TELEGRAM_BOT_PORT=3011
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
TELEGRAM_INTERNAL_TOKEN=той_самий_що_на_хостингу
TELEGRAM_BOT_WEBHOOK_SECRET=...
```

Після запуску ngrok:

```bash
ngrok http 3011
```

Telegram webhook треба тимчасово поставити на:

```text
https://YOUR-NGROK-DOMAIN.ngrok-free.app/webhook/telegram
```

Автоматичний локальний запуск бота + ngrok:

```bash
node scripts/start-local-telegram-ngrok.mjs --production
```

Скрипт сам:

- запускає `telegram-bot`;
- запускає `ngrok`;
- ставить Telegram webhook на новий ngrok URL;
- показує `TELEGRAM_BOT_INTERNAL_URL`, який потрібно вставити у production `.env`.

При кожному новому ngrok URL потрібно:

- оновити `TELEGRAM_BOT_INTERNAL_URL` у production `.env`;
- перезапустити Node app на cPanel;
- оновити Telegram webhook на новий ngrok URL.

Для повернення до локальної розробки, коли і сайт, і backend запущені локально:

```bash
node scripts/start-local-telegram-ngrok.mjs --local
```

У цьому режимі Telegram webhook все одно йде через ngrok, але bot відправляє internal-запити на локальний backend `http://127.0.0.1:3001/api/internal/telegram`. Production `.env` на хостингу змінювати не потрібно.

### Якщо Telegram worker bot винесений на окремий cPanel Node.js app

Для постійного production-режиму краще запускати `telegram-bot/` як окремий Node.js app:

- startup file: `start.cjs`;
- application root: папка bot app;
- backend сайту викликає bot app через `TELEGRAM_BOT_INTERNAL_URL=https://BOT_DOMAIN/internal`;
- Telegram webhook має вести на `https://BOT_DOMAIN/webhook/telegram`.

Детальна інструкція: [`TELEGRAM_BOT_CPANEL_DEPLOY.md`](./TELEGRAM_BOT_CPANEL_DEPLOY.md).

## 4. Що зібрати локально перед деплоєм

Перед кожним деплоєм:

```bash
cd /Users/mikolagusir/Desktop/TechnoRent/server && npm run build
cd /Users/mikolagusir/Desktop/TechnoRent/client && npm run build
```

Після цього в ZIP мають потрапити:

- `client_dist/`
- `server/dist/`
- `server/node_modules/`
- `server/package.json`
- `server/package-lock.json`
- `uploads/`
- `docs/`
- `.env.example`

Не класти в ZIP реальний production `.env`.

## 5. Покроковий деплой

1. Зробити backup поточного `server/` і `client_dist/` на хостингу.
2. Завантажити новий ZIP у:
   `/home/xkiavukt/technorent.lanbox.com.ua`
3. Розпакувати архів у корені сайту.
4. Якщо архів розпакувався у вкладену папку, перенести її вміст у root.
5. Перевірити, що структура на сервері відповідає секції 2.
6. У `Setup Node.js App` перевірити:
   - application root
   - startup file `server/dist/start.cjs`
7. Якщо worker bot запускається локально через ngrok, оновити `TELEGRAM_BOT_INTERNAL_URL` у production `.env`.
8. Натиснути `Restart`.

## 6. Що перевірити одразу після restart

1. `https://technorent.lanbox.com.ua/api/health`
2. головну сторінку сайту
3. `/admin`
4. вкладки `GPS` і `Мапа`
5. сторінку послуги евакуатора
6. логін в адмінку і повернення на публічну частину
7. якщо тестується worker bot локально через ngrok:
   - призначити тестове замовлення працівнику;
   - перевірити, що production backend дістався до ngrok;
   - перевірити callback `Прийняти` у Telegram.

## 7. Cron для GPS

Поточне джерело GPS: `gps.equgps.com`.

Правильний шлях до `node` для цього проєкту:

```text
/home/xkiavukt/nodevenv/technorent.lanbox.com.ua/server/20/bin/node
```

Правильна cron-команда:

```bash
/home/xkiavukt/nodevenv/technorent.lanbox.com.ua/server/20/bin/node /home/xkiavukt/technorent.lanbox.com.ua/server/dist/scripts/sync-tracker-from-equgps.js >> /home/xkiavukt/technorent.lanbox.com.ua/server.log 2>&1
```

Рекомендований розклад:

```text
*/5 * * * *
```

Поведінка sync:
- основний cron одночасно оновлює поточну GPS-позицію, денну статистику, поїздки і стоянки;
- при кожному запуску оновлюються сьогоднішній день і попередній день;
- стоянки за ці дні замінюються актуальним звітом з EquGPS, тому старі зайві записи не накопичуються;
- окремий `sync-tracker-daily-stats-from-equgps.js` лишається допоміжним, але production cron повинен запускати саме `sync-tracker-from-equgps.js`.

## 8. Де дивитись логи

- Node app output у `Setup Node.js App`
- файл:

```text
/home/xkiavukt/technorent.lanbox.com.ua/server.log
```

## 9. Помилки, які вже були, і як їх не повторити

### 1. `ALTER TYPE ... ADD cannot run inside a transaction block`

Причина:
- `ALTER TYPE "PricingType" ADD VALUE ...` був усередині великого SQL-блоку в `initSchema()`

Що вже виправлено:
- enum-розширення винесене в окремий `pool.query()`

Що робити:
- не повертати `ALTER TYPE ... ADD VALUE` назад у транзакційний SQL-блок

### 2. `relation "TrackerDevice" does not exist`

Причина:
- `initSchema()` падав раніше за створення GPS-таблиць

Що робити:
- якщо ця помилка з’явиться знову, дивитись першу помилку вище в логах, а не саму `TrackerDevice`

### 3. Неправильний шлях до `node` у cron

Неправильний варіант:

```text
/home/xkiavukt/nodevenv/technorent.lanbox.com.ua/20/bin/node
```

Правильний варіант:

```text
/home/xkiavukt/nodevenv/technorent.lanbox.com.ua/server/20/bin/node
```

### 4. `.env` покладений не туди

Неправильно:

```text
/home/xkiavukt/technorent.lanbox.com.ua/server/.env
```

Правильно:

```text
/home/xkiavukt/technorent.lanbox.com.ua/.env
```

### 5. GPS sync по Telegram замість EquGPS

Актуальний production sync:

```text
server/dist/scripts/sync-tracker-from-equgps.js
```

Він працює з `gps.equgps.com` і оновлює сьогодні + попередній день.

Не використовувати в cron legacy-скрипт:

```text
server/dist/scripts/sync-tracker-locations.js
```

### 6. `Забагато спроб` у адмінці через `/auth/me`

Причина:
- раніше rate-limit висів на всьому `/api/auth`

Що вже виправлено:
- limiter висить тільки на `POST /api/auth/login`

### 7. Публічна частина редиректила на `/admin`

Причина:
- глобальний `AuthProvider` + агресивний redirect по будь-якому `401`

Що вже виправлено:
- redirect на `/admin` відбувається тільки всередині адмін-маршрутів

## 10. Мінімальний чеклист перед релізом

- `server` build проходить
- `client` build проходить
- `docs/` оновлені
- `client_dist/` свіжий
- `server/dist/` свіжий
- `sync-tracker-from-equgps.js` є в `server/dist/scripts/`
- startup file не змінений
- production `.env` перевірений
- cron команда перевірена
