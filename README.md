<div align="center">

# 🏗️ TechnoRent

**Платформа для оренди будівельної спецтехніки у Львові**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)

</div>

---

## 📋 Про проект

**TechnoRent** — це повнофункціональний веб-додаток для компанії з оренди будівельної спецтехніки. Сайт включає публічну частину для клієнтів та адмін-панель для управління технікою, заявками та календарем зайнятості.

### Основні можливості

🔹 **Публічна частина**
- Головна сторінка з Hero-секцією, популярною технікою, перевагами
- Каталог техніки з фільтрами (категорія, бренд) та сортуванням
- Детальна сторінка техніки з характеристиками, календарем зайнятості та формою замовлення
- SEO-оптимізація: мета-теги, Open Graph, JSON-LD Schema.org, sitemap.xml

🔹 **Адмін-панель**
- Авторизація через JWT
- Управління технікою (CRUD)
- Обробка заявок клієнтів зі зміною статусів
- Календар зайнятості техніки з трьома типами бронювань:
  - 📋 Заброньовано
  - 🔧 Оренда
  - ⚙️ Техобслуговування

---

## 🛠️ Технології

| Шар | Стек |
|-----|------|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| **Backend** | Express 5, TypeScript, Prisma 6, Zod |
| **База даних** | PostgreSQL 16 |
| **Автентифікація** | JWT (jsonwebtoken + bcryptjs) |
| **Шрифти** | Montserrat (Google Fonts) |
| **Деплой** | Docker, Docker Compose |

---

## 📁 Структура проекту

```
TechnoRent/
├── client/                    # React frontend
│   ├── src/
│   │   ├── api/               # API клієнт (apiFetch)
│   │   ├── components/        # UI компоненти
│   │   ├── context/           # AuthContext
│   │   ├── data/              # Сервіси та типи даних
│   │   └── pages/             # Сторінки
│   ├── public/                # Статичні файли, robots.txt, sitemap.xml
│   └── index.html
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes/            # API маршрути
│   │   ├── middleware/        # Auth, validation
│   │   └── lib/               # Prisma клієнт
│   └── prisma/
│       ├── schema.prisma      # Схема бази даних
│       └── seed.ts            # Seed дані (6 одиниць техніки + адмін)
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # PostgreSQL + App
└── package.json               # Monorepo скрипти
```

---

## 🚀 Швидкий старт

### Вимоги

- **Node.js** ≥ 20
- **PostgreSQL** ≥ 16
- **npm**

### Встановлення

```bash
# 1. Клонувати репозиторій
git clone https://github.com/mekola529/TechnoRent.git
cd TechnoRent

# 2. Встановити залежності (клієнт + сервер)
npm install

# 3. Налаштувати змінні середовища
cp .env.example .env
# Відредагуйте .env — вкажіть DATABASE_URL та JWT_SECRET
```

### Налаштування бази даних

```bash
# Застосувати міграції
npm run db:migrate

# Наповнити тестовими даними (6 техніки + адмін)
npm run db:seed
```

### Запуск у режимі розробки

```bash
npm run dev
```

Сервер запуститься на `http://localhost:3001`, клієнт на `http://localhost:5173`.

### Запуск через Docker

```bash
# Генеруємо JWT_SECRET
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env

# Запуск
docker compose up -d
```

Додаток буде доступний на `http://localhost:3001`.

---

## ⚙️ Змінні середовища

| Змінна | Опис | Приклад |
|--------|------|---------|
| `DATABASE_URL` | Підключення до PostgreSQL | `postgresql://user:pass@localhost:5432/technorent` |
| `JWT_SECRET` | Секрет для JWT токенів | `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Email/логін адміна | `admin` |
| `ADMIN_PASSWORD` | Пароль адміна (для seed) | `password` |
| `PORT` | Порт сервера | `3001` |
| `CLIENT_URL` | URL фронтенду (CORS) | `http://localhost:5173` |

---

## 📡 API

### Публічні маршрути

| Метод | Шлях | Опис |
|-------|------|------|
| `GET` | `/api/equipment` | Список техніки (фільтри, сортування) |
| `GET` | `/api/equipment/:slug` | Деталі техніки |
| `GET` | `/api/equipment/meta/brands` | Унікальні бренди |
| `GET` | `/api/equipment/meta/types` | Доступні типи |
| `POST` | `/api/orders` | Створити заявку |
| `POST` | `/api/auth/login` | Авторизація адміна |

### Захищені маршрути (JWT)

| Метод | Шлях | Опис |
|-------|------|------|
| `POST` | `/api/admin/equipment` | Додати техніку |
| `PUT` | `/api/admin/equipment/:id` | Оновити техніку |
| `DELETE` | `/api/admin/equipment/:id` | Видалити техніку |
| `GET` | `/api/admin/orders` | Список заявок |
| `PATCH` | `/api/admin/orders/:id/status` | Змінити статус заявки |
| `DELETE` | `/api/admin/orders/:id` | Видалити заявку |
| `GET` | `/api/admin/occupancy` | Бронювання техніки |
| `POST` | `/api/admin/occupancy` | Додати бронювання |
| `PUT` | `/api/admin/occupancy/:id` | Оновити бронювання |
| `DELETE` | `/api/admin/occupancy/:id` | Видалити бронювання |

---

## 🎨 Дизайн

- **Основний колір:** `#F2B705` (жовтий)
- **Темний:** `#111111`
- **Фон:** `#F5F5F5`
- **Шрифт:** Montserrat (400, 500, 600, 700)
- **Адаптивний дизайн** для desktop, tablet та mobile

---

## 📄 Ліцензія

Цей проект створений в навчальних цілях.
