# План дизайну кабінету користувача

## Summary

Кабінет має виглядати як частина публічного TechnoRent: Montserrat, білий фон, темний текст, жовтий акцент `#F2B705`, округлі картки, `border #EAEAEA`, CTA-кнопки як у поточних формах.

## Key Screens

- Header: додати пункт `Кабінет`.
- Mobile tab bar: додати `Кабінет` як окремий пункт.
- Auth pages: `/account/login`, `/account/register`, `/account/verify`.
- Dashboard: `/account`.
- Orders list: `/account/orders`.
- Order detail: `/account/orders/:id`.

## Visual Rules

- Основний фон: `bg-white`.
- Секції: `bg-light-bg` або white cards.
- Primary button: `rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-dark`.
- Inputs: `rounded-[10px] border border-border bg-[#F9FAFB] px-3 py-3`.
- Cards: `rounded-2xl border border-border bg-white p-5 shadow-[0_8px_20px_rgba(0,0,0,0.08)]`.
- Не використовувати admin sidebar/table layout для клієнта.

## Components

- `AccountLayout`
- `AccountCard`
- `AccountStatusBadge`
- `AccountRequestCard`
- `AccountFinanceSummary`
- `OtpInput`
- `VerifiedContactBadge`
- `AccountEmptyState`

## Status Labels

- `NEW`: Нова
- `IN_PROGRESS`: В обробці
- `CONFIRMED`: Підтверджено
- `CONVERTED`: Передано в роботу
- `ACTIVE`: Виконується
- `COMPLETED`: Завершено
- `CANCELLED`: Скасовано

## Test Scenarios

- Header/mobile navigation не мають overflow.
- Auth screens відповідають стилю поточного сайту.
- Empty state кабінету коректний.
- Список заявок показує статус, погоджену вартість і статус розрахунку.
- Detail page не показує внутрішні фінансові поля.
- Mobile layout не потребує горизонтального scroll.
