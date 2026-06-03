# TechnoRent — Коротка шпаргалка по cPanel

> Швидка версія. Повний сценарій дивись у [DEPLOY_PRODUCTION_CPANEL.md](./DEPLOY_PRODUCTION_CPANEL.md).

## Restart app

У `Setup Node.js App`:

- application root: `/home/xkiavukt/technorent.lanbox.com.ua`
- startup file: `server/dist/start.cjs`
- далі `Restart`

## Якщо бот локально через ngrok

Автоматичний запуск для production-сайту:

```bash
node scripts/start-local-telegram-ngrok.mjs --production
```

На хостингу в production `.env` тимчасово став:

```env
TELEGRAM_BOT_INTERNAL_URL=https://YOUR-NGROK-DOMAIN.ngrok-free.app/internal
BACKEND_INTERNAL_URL=https://technorent.lanbox.com.ua/api/internal/telegram
```

Після кожної зміни ngrok URL:

- онови `TELEGRAM_BOT_INTERNAL_URL` на хостингу;
- зроби `Restart` Node app;
- онови Telegram webhook на `https://YOUR-NGROK-DOMAIN.ngrok-free.app/webhook/telegram`.

Для локальної розробки, коли backend запущений локально:

```bash
node scripts/start-local-telegram-ngrok.mjs --local
```

У цьому режимі cPanel `.env` не чіпати: бот працює з локальним backend, а ngrok потрібен тільки для Telegram webhook.

Також можна запускати без команди: двічі натиснути `Start TechnoRent Telegram Bot.command` у корені проєкту і вибрати потрібний режим.

## Правильний cron

```bash
/home/xkiavukt/nodevenv/technorent.lanbox.com.ua/server/20/bin/node /home/xkiavukt/technorent.lanbox.com.ua/server/dist/scripts/sync-tracker-from-equgps.js >> /home/xkiavukt/technorent.lanbox.com.ua/server.log 2>&1
```

Цей cron бере дані з `gps.equgps.com` і при кожному запуску оновлює два дні: сьогодні та попередній день. Старі стоянки за ці дні замінюються актуальними даними з EquGPS, а не накопичуються.

## Що перевірити після деплою

- `/api/health`
- головна сторінка
- `/admin`
- вкладка `GPS`
- вкладка `Мапа`
- сторінка послуги евакуатора

## Головні production-пастки

- `.env` має лежати в root сайту, не в `server/`
- у cron обов’язково є сегмент `/server/20/bin/node`
- GPS sync у cron: тільки `sync-tracker-from-equgps.js`, не legacy `sync-tracker-locations.js`
- якщо падає `TrackerDevice does not exist`, шукай першу помилку вище в `initSchema()`
