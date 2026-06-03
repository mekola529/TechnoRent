# Telegram bot deploy на cPanel як окремий Node.js app

> Оновлено: 27 квітня 2026

Цей документ описує запуск `telegram-bot/` як окремого Node.js app на cPanel. Це замінює тимчасовий локальний запуск через `ngrok`.

## 1. Що буде на хостингу

Потрібно два Node.js app:

- основний сайт/API: `technorent.lanbox.com.ua`;
- окремий Telegram bot app: наприклад `bot.technorent.lanbox.com.ua` або окрема папка/сабдомен для бота.

Backend сайту звертається до бота через:

```env
TELEGRAM_BOT_INTERNAL_URL=https://bot.technorent.lanbox.com.ua/internal
```

Telegram надсилає webhook у бот:

```text
https://bot.technorent.lanbox.com.ua/webhook/telegram
```

Бот звертається назад до backend сайту через:

```env
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
```

## 2. Файли для bot app

Для окремого bot app потрібні:

```text
telegram-bot/
├── dist/
├── node_modules/
├── package.json
├── package-lock.json
├── start.cjs
└── .env
```

`start.cjs` вже підготовлений і імпортує `dist/index.js`.

## 3. Налаштування Node.js app у cPanel

У cPanel створи новий Node.js app:

- Node.js version: `20.x`
- Application mode: `Production`
- Application root: папка, куди завантажений bot app, наприклад `telegram-bot`
- Application URL: бажано окремий сабдомен, наприклад `bot.technorent.lanbox.com.ua`
- Application startup file: `start.cjs`

Важливо: бот слухає `process.env.PORT`, який cPanel дає автоматично. `TELEGRAM_BOT_PORT` на production можна не задавати.

## 4. `.env` для bot app

У `.env` bot app задай:

```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=...
TELEGRAM_INTERNAL_TOKEN=...
TELEGRAM_BOT_WEBHOOK_SECRET=...
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
TELEGRAM_BOT_LOG_PATH=telegram-bot.log
```

Правила:

- `TELEGRAM_INTERNAL_TOKEN` має бути однаковий у backend сайту і в bot app.
- `TELEGRAM_BOT_WEBHOOK_SECRET` має бути той самий, який передається в Telegram webhook `secret_token`.
- `BACKEND_INTERNAL_URL` має вести на production backend сайту.
- Не додавай ці змінні у frontend або `VITE_*`.

## 5. `.env` основного сайту

У `.env` основного сайту заміни локальний/ngrok URL:

```env
TELEGRAM_BOT_INTERNAL_URL=https://bot.technorent.lanbox.com.ua/internal
TELEGRAM_INTERNAL_TOKEN=...
```

Після зміни `.env` основного сайту зроби restart основного Node.js app.

## 6. Telegram webhook

Після запуску bot app потрібно поставити webhook на production URL бота:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://bot.technorent.lanbox.com.ua/webhook/telegram",
    "secret_token": "<TELEGRAM_BOT_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Перевірити webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## 7. Перевірки після запуску

1. Відкрити:

```text
https://bot.technorent.lanbox.com.ua/health
```

Очікувано:

```json
{ "status": "ok", "time": "..." }
```

2. Написати боту `/start` у Telegram.

3. Перевірити, що кандидат зʼявився в адмінці у вкладці `Працівники`.

4. Призначити працівника на тестове замовлення.

5. Перевірити кнопки:

- `Прийняти`;
- `Відхилити`;
- `Розпочати виконання`;
- `Завершити виконання`.

## 8. Якщо щось не працює

- Якщо `/start` відповідає помилкою, перевір `BACKEND_INTERNAL_URL` і `TELEGRAM_INTERNAL_TOKEN`.
- Якщо кнопки зависають, перевір webhook URL і `TELEGRAM_BOT_WEBHOOK_SECRET`.
- Якщо основний сайт не може відправити завдання працівнику, перевір `TELEGRAM_BOT_INTERNAL_URL` у `.env` основного сайту.
- Якщо app не стартує на cPanel, перевір startup file `start.cjs` і чи існує `dist/index.js`.
- Лог бота: `telegram-bot.log` у root папки bot app або шлях із `TELEGRAM_BOT_LOG_PATH`.
