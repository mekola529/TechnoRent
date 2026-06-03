# TechnoRent

Платформа для оренди спецтехніки, обробки заявок і керування роботою сервісної компанії. Проєкт поєднує публічний сайт, кабінет клієнта, CRM для менеджерів, фінансовий модуль, оплату через Monobank, GPS-контроль і Telegram-сповіщення.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

## Що вміє система

- Публічний каталог техніки та послуг.
- Оформлення заявок на оренду техніки, евакуатор, вивіз сміття та інші послуги.
- Кабінет клієнта з історією заявок, статусами, погодженою вартістю і станом розрахунку.
- Прив’язка заявок до клієнта після реєстрації, навіть якщо заявку створили до акаунта.
- Адмінка для заявок, замовлень, техніки, послуг, працівників, клієнтів, фінансів, GPS, маркетингу та сповіщень.
- Фінансовий модуль із погодженою вартістю, оплатами, боргом, витратами і розрахунками з працівниками.
- Генерація платіжних посилань Monobank і синхронізація оплат через webhook.
- GPS-контроль техніки через EquGPS/Traccar-сумісне джерело.
- Telegram-сповіщення для менеджерів і працівників.
- SEO-метадані, sitemap, robots.txt і базова аналітика.

## Технології

| Частина | Технології |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| База даних | PostgreSQL, `pg`, runtime SQL schema setup |
| Авторизація | JWT для адмінки, cookie/session для клієнтського кабінету |
| Оплати | Monobank acquiring |
| Карти та GPS | Leaflet, EquGPS/Traccar-compatible API |
| Сповіщення | Telegram bot/internal API, email/Viber placeholders |

## Структура проєкту

```text
TechnoRent/
├── client/          React сайт, кабінет клієнта, адмінка
├── server/          Express API, PostgreSQL схема, інтеграції
├── docs/            Технічна документація, плани, деплойні інструкції
├── scripts/         Локальні helper-скрипти для ngrok, Monobank, Telegram
├── uploads/         Runtime-завантаження, не комітяться
└── client_dist/     Production-копія frontend build, не комітиться
```

## Локальний запуск

Вимоги:

- Node.js 20+
- npm
- PostgreSQL

Встановити залежності:

```bash
npm install
```

Створити `.env`:

```bash
cp .env.example .env
```

Мінімальні локальні змінні:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/technorent"
JWT_SECRET="generate-with-openssl-rand-base64-32"
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="your-local-password"
PORT=3001
CLIENT_URL="http://localhost:5173"
SITE_URL="http://localhost:5173"
```

Запустити frontend і backend разом:

```bash
npm run dev
```

Локальні адреси:

- сайт: `http://localhost:5173`
- API: `http://localhost:3001/api`

Backend при старті ініціалізує потрібну PostgreSQL-схему і запускає auto-seed для базових даних.

## Production build

Повна збірка:

```bash
npm run build
```

Команда збирає:

- `server/dist`
- `client/dist`
- `client_dist`, копію frontend build для cPanel-style деплою

## Деплой

Деплойний ZIP збирається вручну тільки коли потрібен реліз. У deploy-архів входять production build output, server runtime dependencies, документація та `.env.example`.

У deploy-архів не повинні потрапляти:

- `.env`
- Docker-файли
- `telegram-bot/`
- локальні логи
- локальні ZIP-артефакти
- `client_dist/` у Git
- `server/dist/` у Git
- `server/generated/`
- `uploads/`

Telegram bot пакується і деплоїться окремо за потреби.

Перед деплоєм завжди перевірити:

```bash
npm run build
```

Актуальні інструкції:

- [docs/DEPLOY_PRODUCTION_CPANEL.md](docs/DEPLOY_PRODUCTION_CPANEL.md)
- [docs/CPANEL_DEPLOY.md](docs/CPANEL_DEPLOY.md)
- [docs/README.md](docs/README.md)

## Правила для env

Не додавайте `VITE_` до секретних змінних. Усе, що починається з `VITE_`, потрапляє у frontend bundle і стає публічним.

Тільки backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `MONOBANK_MERCHANT_TOKEN`
- `MONOBANK_PUBLIC_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_INTERNAL_TOKEN`
- `SMTP_PASSWORD`
- `EQUGPS_EMAIL`
- `EQUGPS_PASSWORD`

Дозволені публічні frontend-змінні:

```env
VITE_API_URL="https://your-domain.example/api"
VITE_SITE_URL="https://your-domain.example"
VITE_GTM_ID="GTM-XXXXXXX"
```

## Документація

Для швидкого входу в контекст:

1. [docs/README.md](docs/README.md)
2. [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md)
3. [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)
4. [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
5. [docs/DEPLOY_PRODUCTION_CPANEL.md](docs/DEPLOY_PRODUCTION_CPANEL.md)

## Корисні команди

```bash
npm run dev           # локальний frontend + backend
npm run build         # production build
npm run build:server  # тільки backend
npm run build:client  # тільки frontend
npm start             # запуск server/dist
```

Допоміжні локальні скрипти:

```bash
node scripts/start-local-monobank-ngrok.mjs
node scripts/start-local-telegram-ngrok.mjs --local
```

## Поточний статус

Проєкт активно розробляється. Частина доменів, контактів і тестових інтеграцій може бути тимчасовою до фінального production запуску.

Основний репозиторій:

```text
https://github.com/mekola529/TechnoRent
```
