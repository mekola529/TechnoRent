# TechnoRent Docs

> Оновлено: 24 квітня 2026

Ця папка є єдиним місцем для всієї проєктної документації. Якщо треба швидко повернутись у контекст, починай саме звідси.

## З чого читати

1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
   Головний технічний контекст: стек, архітектура, ключові флоу, GPS, евакуатор, адмінка, auth, деплойний контур.

2. [API_REFERENCE.md](./API_REFERENCE.md)
   Актуальні API-маршрути, формат даних, auth, rate limiting, admin/public endpoints.

3. [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md)
   Короткий технічний опис проєкту: стек, структура, CRM, GPS, Telegram, БД, env і деплой.

4. [DEPLOY_PRODUCTION_CPANEL.md](./DEPLOY_PRODUCTION_CPANEL.md)
   Основна production-інструкція для деплою на cPanel і cron.

5. [CPANEL_DEPLOY.md](./CPANEL_DEPLOY.md)
   Коротка шпаргалка по деплою і cron без довгих пояснень.

6. [prompt_services_and_equipment_linking.md](./prompt_services_and_equipment_linking.md)
   Історичний промпт по розділу послуг і зв’язках техніка ↔ послуги.

7. [CRM_REDESIGN_PLAN.md](./CRM_REDESIGN_PLAN.md)
   Чернетка плану редизайну CRM: єдині заявки, замовлення, працівники, Telegram-флоу, GPS і поетапна реалізація.

8. [SEO_AUDIT_2026-04-24.md](./SEO_AUDIT_2026-04-24.md)
   SEO-аудит за 24.04.2026: що перевірено, що виправлено, що лишилось на майбутню оптимізацію.

9. [TELEGRAM_BOT_CPANEL_DEPLOY.md](./TELEGRAM_BOT_CPANEL_DEPLOY.md)
   Інструкція для деплою Telegram worker bot як окремого Node.js app на cPanel.

## Найважливіше зараз

- runtime-бекенд працює через `pg` і raw SQL, не через Prisma;
- GPS для евакуатора синхронізується з `gps.equgps.com`, не з Telegram;
- основний GPS cron `sync-tracker-from-equgps.js` при кожному запуску оновлює сьогоднішній і попередній день;
- денна GPS-статистика також може запускатись окремо через `tracker:sync-daily-equgps`, але основним production-контуром лишається `tracker:sync`;
- у адмінці є:
  - `GPS` список,
  - `Мапа`,
  - прив’язка GPS-маячка до техніки;
- типи техніки тепер:
  - зберігаються як звичайний текст,
  - нормалізуються в український формат,
  - можуть створюватись з адмінки,
  - перевикористовуються в техніці та послугах;
- auth-limiter тепер висить лише на `POST /api/auth/login`, а не на всьому `/api/auth`;
- публічна частина більше не повинна редиректити в `/admin` через прострочений admin token;
- автопідказки адрес закриваються після вибору адреси або переходу в інший input;
- Telegram-бот працює через webhook/ngrok локально, callback-кнопки відповідають одразу, а діагностика пишеться в `telegram-bot.log`;
- helper `node scripts/start-local-telegram-ngrok.mjs --local` запускає бота для локального backend, а `--production` для production backend на хостингу;
- для запуску без Terminal-команди є файл `Start TechnoRent Telegram Bot.command` у корені проєкту;
- повідомлення працівнику після призначення і після прийняття мають клікабельні адреси Google Maps на основі координат;
- у адмінці є вкладка `Сповіщення`: шаблони Telegram-повідомлень, preview, reset, service-specific тексти для евакуатора, доставки сипучих матеріалів і вивозу сміття;
- на головній є блок популярних послуг; у послугах додано прапорець `Популярна`;
- у техніки і послуг використовується спільний набір типів ціни, включно з калькулятором евакуатора і калькулятором сипучих матеріалів;
- hero-зображення головної керується з адмінки через вкладку `Налаштування`;
- `/sitemap.xml` і `/api/sitemap.xml` віддають актуальний динамічний sitemap, а `robots.txt` вказує на `/sitemap.xml`;
- якщо сайт на хостингу, а worker bot локально через ngrok, production `TELEGRAM_BOT_INTERNAL_URL` має бути `https://<ngrok>/internal`, не `127.0.0.1`;
- якщо worker bot винесений на cPanel як окремий Node.js app, production `TELEGRAM_BOT_INTERNAL_URL` має вести на його `/internal`, наприклад `https://bot.technorent.lanbox.com.ua/internal`;
- production deploy орієнтується на:
  - кореневий `.env`,
  - `server/dist/start.cjs`,
  - cron через `sync-tracker-from-equgps.js`,
  - правильний `nodevenv` шлях із сегментом `/server/20/`.

## Перед деплоєм

Завжди перевіряй:

- `cd server && npm run build`
- `cd client && npm run build`
- що в `docs/DEPLOY_PRODUCTION_CPANEL.md` не застарів шлях до `node`, `startup file` або структура ZIP

## Швидкий recovery контекст

Якщо пізніше треба швидко ввести нового агента в курс справи, достатньо дати йому:

1. `прочитай docs/README.md`
2. `прочитай docs/TECHNICAL_OVERVIEW.md`
3. `прочитай docs/PROJECT_CONTEXT.md`
4. `прочитай docs/DEPLOY_PRODUCTION_CPANEL.md`
