# TechnoRent

TechnoRent is a rental and service CRM for construction equipment. The project includes a public website, customer cabinet, admin CRM, order finance, Monobank payments, GPS tracking, notifications, and service request management.

## Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL through `pg` and raw SQL runtime schema setup
- Integrations: Monobank acquiring, Telegram notifications, EquGPS/Traccar-compatible GPS source

## Project Structure

```text
client/          React public site, customer cabinet, admin UI
server/          Express API, PostgreSQL schema setup, integrations
docs/            Technical documentation and deploy notes
scripts/         Local helper scripts for ngrok/Monobank/Telegram
uploads/         Runtime uploads, not committed
client_dist/     Production frontend build copy, not committed
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment:

```bash
cp .env.example .env
```

Minimum local variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/technorent"
JWT_SECRET="generate-with-openssl-rand-base64-32"
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="your-local-password"
PORT=3001
CLIENT_URL="http://localhost:5173"
SITE_URL="http://localhost:5173"
```

Run the full local project:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`

## Build

Run a full production build:

```bash
npm run build
```

This builds:

- `server/dist`
- `client/dist`
- `client_dist` copy used for cPanel-style deploy archives

## Deployment Notes

The deploy archive is created manually when needed. It should include production build output and server runtime dependencies, but should not include:

- `.env`
- Docker files
- `telegram-bot/`
- local logs
- local ZIP artifacts

Telegram bot deployment is handled separately when required.

Before deploying, check:

```bash
npm run build
```

Then review:

- `docs/DEPLOY_PRODUCTION_CPANEL.md`
- `docs/CPANEL_DEPLOY.md`
- `docs/README.md`

## Important Environment Rules

Do not add `VITE_` to secret variables. Every `VITE_*` value is bundled into the frontend and becomes public.

Keep these backend-only:

- `DATABASE_URL`
- `JWT_SECRET`
- `MONOBANK_MERCHANT_TOKEN`
- `MONOBANK_PUBLIC_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_INTERNAL_TOKEN`
- `SMTP_PASSWORD`
- `EQUGPS_EMAIL`
- `EQUGPS_PASSWORD`

Allowed public frontend variables:

```env
VITE_API_URL="https://your-domain.example/api"
VITE_SITE_URL="https://your-domain.example"
VITE_GTM_ID="GTM-XXXXXXX"
```

## Documentation

Start with:

- `docs/README.md`
- `docs/TECHNICAL_OVERVIEW.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/API_REFERENCE.md`
- `docs/DEPLOY_PRODUCTION_CPANEL.md`

## Current Main Features

- Public catalog of equipment and services
- Equipment/service order forms
- Customer account and request/order cabinet
- Monobank payment links and webhook sync
- Admin CRM for requests, rent orders, finance, employees, customers, notifications, GPS, settings
- Worker assignment and optional customer-visible worker contact
- PostgreSQL schema initialization on backend startup
- Dynamic sitemap and SEO metadata
