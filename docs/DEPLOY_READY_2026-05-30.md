# TechnoRent — Deploy Ready 2026-05-30

## Статус збірки

Поточна локальна збірка пройдена успішно:

```bash
npm run build
```

Що зібрано:

- backend: `server/dist/`
- frontend: `client_dist/`
- production frontend також зібраний у `client/dist/`

Перевірка production-залежностей:

```bash
npm audit --omit=dev
cd client && npm audit --omit=dev
cd server && npm audit --omit=dev
```

Результат: `0 vulnerabilities`.

Клієнтський lint:

```bash
cd client && npm run lint
```

Результат: `0 errors`, `10 warnings`.

Warnings стосуються `react-hooks/exhaustive-deps` в адмінських сторінках і не блокують production build, але їх варто прибрати окремим проходом перед фінальним публічним релізом.

Docker image локально не перевірявся, бо на машині немає Docker CLI (`docker: command not found`).

## Що заливати на cPanel

Для поточної схеми cPanel потрібно оновити:

- `client_dist/`
- `server/dist/`
- `server/package.json`
- `server/package-lock.json`
- `server/prisma/`
- `docs/` за потреби
- `.env.example` за потреби

Не заливати реальний локальний `.env`.

Якщо на сервері встановлюються залежності вручну:

```bash
cd server
npm install --omit=dev
```

Після оновлення файлів перезапустити Node.js app у cPanel.

## Критичні production env

Мінімум:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DB_NAME
JWT_SECRET=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
CLIENT_URL=https://technorent.lanbox.com.ua
SITE_URL=https://technorent.lanbox.com.ua
SEO_SITE_URL=https://technorent.lanbox.com.ua
PORT=3001
```

Monobank:

```env
MONOBANK_MERCHANT_TOKEN=...
MONOBANK_API_BASE_URL=https://api.monobank.ua
MONOBANK_WEBHOOK_URL=https://technorent.lanbox.com.ua/api/payments/monobank/webhook
MONOBANK_REDIRECT_URL=https://technorent.lanbox.com.ua/account/orders
MONOBANK_VERIFY_WEBHOOK=true
MONOBANK_PUBLIC_KEY=
```

Telegram/worker bot:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_INTERNAL_TOKEN=...
TELEGRAM_BOT_INTERNAL_URL=...
TELEGRAM_BOT_PORT=3011
TELEGRAM_BOT_WEBHOOK_SECRET=...
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
```

EquGPS:

```env
EQUGPS_BASE_URL=https://trace.equgps.com
EQUGPS_EMAIL=...
EQUGPS_PASSWORD=...
```

Для frontend дозволені тільки публічні `VITE_*` змінні. Секрети не повинні мати префікс `VITE_`.

## Перевірка після restart

1. Відкрити `/api/health`.
2. Відкрити головну сторінку.
3. Перевірити `/admin`.
4. Створити тестову заявку з неавторизованого стану.
5. Зареєструвати або увійти в кабінет і перевірити, що заявка підтягнулась.
6. Створити нову заявку вже з авторизованого кабінету і перевірити, що вона одразу зʼявилась у “Мої заявки”.
7. В адмінці перевести заявку в замовлення і перевірити, що клієнту показується номер замовлення.
8. Змінити погоджену вартість в адмінці і перевірити, що вона оновилась у кабінеті.
9. Якщо є тестовий Monobank токен, створити payment link із кабінету й перевірити webhook після тестової оплати.

## Основна інструкція

Повний cPanel сценарій: [DEPLOY_PRODUCTION_CPANEL.md](./DEPLOY_PRODUCTION_CPANEL.md).
