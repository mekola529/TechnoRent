# План впровадження кабінету користувача

## Summary

Клієнт може створити заявку без акаунта. Після реєстрації він бачить тільки ті старі заявки, право на які підтверджено через email або телефон. Старі заявки не прив'язуються лише за збігом введених даних без OTP-підтвердження.

Основою кабінету є `CustomerRequest`, бо вона вже об'єднує заявки з форм, послуг, евакуатора, доставки матеріалів і зв'язок із `RentOrder`.

## Key Changes

- Додати `CustomerAccount`, `CustomerContactVerification`, `CustomerSession`, `CustomerRequestAccountLink`.
- Додати normalized phone/email поля або індекси для `CustomerRequest`.
- Додати `/api/customer-auth`: register, verify, login, logout, me.
- Додати `/api/customer`: profile, requests, request details.
- Використовувати `HttpOnly`, `Secure`, `SameSite=Lax` cookie для клієнтських сесій.
- Зберігати тільки hash OTP і hash session token.
- Прив'язувати старі заявки тільки після підтвердження відповідного контакту.
- Не змінювати guest checkout і поточні admin flows.

## OTP

- Email OTP обов'язковий канал першого релізу.
- Telegram/Viber OTP для телефону реалізуються через provider adapters.
- Якщо provider не налаштований, канал вимкнений і API повертає зрозумілу помилку.
- TTL коду: 10 хвилин.
- Максимум 5 спроб на код.
- Rate limit для OTP, login і register.

## Cabinet

- `/account/register`
- `/account/login`
- `/account/verify`
- `/account`
- `/account/orders`
- `/account/orders/:id`

У кабінеті показувати список заявок/замовлень, статус, погоджену вартість і статус розрахунку. Не показувати внутрішні витрати, зарплати, прибуток, UTM або службові коментарі.

## Security

- Password hash через bcrypt cost 12.
- Пароль: мінімум 8 символів, хоча б одна літера і одна цифра.
- Єдині повідомлення для login/register, щоб не розкривати існування акаунта.
- Customer auth middleware окремо від admin auth middleware.
- Ownership перевіряти через `CustomerRequestAccountLink`.
- Не зберігати customer token у `localStorage`.

## Test Plan

- Guest order і service request flows не ламаються.
- Register створює акаунт і OTP.
- Login до підтвердження контакту заборонений.
- Verify підтверджує контакт і прив'язує старі заявки.
- Customer API не повертає чужі заявки.
- Cabinet UI показує заявки без розрахунку і з погодженою сумою.
- `npm run build` проходить.
