# Cybersecurity Audit - TechnoRent

Date: 2026-05-28
Scope: local TechnoRent app at `http://localhost:3101`, source review, frontend build scan, API forced browsing, auth checks, SQL injection spot checks, dependency audit.

Skills used: `conducting-api-security-testing`, `bypassing-authentication-with-forced-browsing`.

Update 2026-05-29: all findings except local-only seeded admin credentials were remediated. The weak `admin/password` pair is intentionally kept for local development only per project owner instruction. Production auto-seed now skips admin creation unless `ADMIN_AUTO_SEED=true` is explicitly set.

## Executive Summary

The admin API is not reachable without an admin token in the tested routes. Customer account object access is also constrained by `CustomerRequestAccountLink`. No server secrets were found in the frontend build.

Critical issue found: the local/prod-style env seeds an admin account with weak default credentials `admin/password`, and that login currently works. This is not a passwordless bypass, but it is enough for full admin compromise if deployed or reused. Per owner instruction, these credentials remain for local testing only; production auto-seed guard was added.

## Findings

### SEC-001 - Weak Seeded Admin Credentials

Severity: Critical
Status: Accepted local-only risk; production guard added 2026-05-29.

Evidence:
- `.env` and `server/.env` contain admin seed values for an `admin` account with a weak password.
- Runtime login to `POST /api/auth/login` with that credential pair returned `200 OK`.
- The returned token could access `GET /api/admin/rent-orders` with `200 OK`.

Impact:
An attacker who guesses the default credentials can access the full CRM/admin API.

Remediation:
- Rotate the `admin` password immediately in the local/staging/production database.
- Remove weak admin seed credentials from all production env files.
- Enforce a strong `ADMIN_PASSWORD` policy during auto-seed.
- Consider disabling admin auto-seed in production unless explicitly enabled.

Implemented:
- `autoSeed()` now skips admin creation in `NODE_ENV=production` unless `ADMIN_AUTO_SEED=true`.
- Existing local credentials were intentionally not changed.

### SEC-002 - CSP Is Disabled

Severity: High
Status: Fixed 2026-05-29.

Evidence:
- `server/src/index.ts` configures `helmet({ contentSecurityPolicy: false })`.
- Admin auth token is stored in `localStorage`, so any XSS in admin UI can steal the bearer token.

Impact:
If an XSS is introduced anywhere in the frontend/admin UI, it can become full admin session compromise.

Remediation:
- Add a restrictive CSP.
- Prefer moving admin auth from `localStorage` bearer token to an `HttpOnly; Secure; SameSite` cookie or a BFF session model.

Implemented:
- Added Helmet CSP with `default-src 'self'`, restricted scripts, images, frames, objects, base URI, and form actions.
- Runtime check confirmed `Content-Security-Policy` header is present.

### SEC-003 - Admin Notification HTML Preview Uses `dangerouslySetInnerHTML`

Severity: High
Status: Fixed 2026-05-29.

Evidence:
- `client/src/pages/AdminNotificationsPage.tsx` renders HTML notification preview with `dangerouslySetInnerHTML`.
- Notification template editing endpoints are under authenticated admin API, but the route currently relies on `authMiddleware`, not `requireAdminRole`.

Impact:
A lower-privileged manager or compromised admin account may be able to store/render malicious HTML in the admin interface. Combined with `localStorage` admin tokens and disabled CSP, this is high impact.

Remediation:
- Sanitize preview HTML before rendering or render it in a sandboxed iframe.
- Restrict notification template editing to `ADMIN` if managers do not need that capability.
- Add CSP to reduce exploitability.

Implemented:
- Added client-side allowlist sanitizer before rendering notification preview HTML.
- CSP now reduces exploitability if HTML preview handling regresses.

### SEC-004 - Dependency Vulnerabilities In Server Package

Severity: High/Moderate
Status: Fixed 2026-05-29.

Evidence:
- `npm --prefix server audit --omit=dev` reported 6 production dependency vulnerabilities:
  - `tmp` high severity via transitive dependency
  - `express-rate-limit` / `ip-address` moderate
  - `qs` moderate
  - `exceljs` / `uuid` moderate
- `npm --prefix telegram-bot audit --omit=dev` reported `qs` moderate.
- `npm --prefix client audit --omit=dev` reported no production vulnerabilities.

Remediation:
- Run controlled dependency updates for `server` and `telegram-bot`.
- Re-test finance export, rate limiting, and bot flows after updates.

Implemented:
- Updated `express-rate-limit`.
- Added npm overrides for vulnerable transitive packages.
- `npm --prefix server audit --omit=dev`, `npm --prefix telegram-bot audit --omit=dev`, and `npm --prefix client audit --omit=dev` now report 0 vulnerabilities.

### SEC-005 - Public Health Endpoint Reveals Database Connectivity

Severity: Low
Status: Fixed 2026-05-29.

Evidence:
- `GET /api/health` returns `database: "connected"`.

Impact:
This is low-risk information disclosure, but it gives attackers a quick signal about backend and database state.

Remediation:
- For public production, return only generic `{ status: "ok" }`.
- Expose detailed health only behind admin/internal auth or infrastructure-level access control.

Implemented:
- In production, `/api/health` now returns only `{ "status": "ok" }` or `{ "status": "unavailable" }`.
- Detailed database status remains available only outside production mode.

## Checks Passed

### Admin Forced Browsing

Unauthenticated requests to representative admin endpoints returned `401`:
- `/api/admin`
- `/api/admin/rent-orders`
- `/api/admin/settings/homepage`
- `/api/admin/admins`
- `/api/admin/finance/summary`

HTTP method checks on `/api/admin/rent-orders` also returned `401` for state-changing methods.

### Customer Object Access

Authenticated customer could access own request, but foreign request/payment attempts returned `404`:
- `GET /api/customer/requests/:foreignId`
- `POST /api/customer/requests/:foreignId/pay/monobank`

### JWT Bypass

Unsigned `alg: none` JWT was rejected with `401`. The server verifies admin JWT with `algorithms: ["HS256"]`.

### SQL Injection Spot Checks

Login SQL injection payloads against admin and customer login returned `401`, not a bypass. Source review shows DB queries are mostly parameterized. Dynamic SQL fragments reviewed were built from allowlisted internal field names or validated enum-like branches.

### Frontend Secret Exposure

Search across `client/src`, `client/dist`, and `client_dist` did not find backend secrets such as monobank token, JWT secret, database URL, Telegram tokens, SMTP password, or EquGPS password.

### Sensitive File Exposure

Requests to `/.env`, `/.git/HEAD`, `/server.log`, and `/uploads/.env` did not expose file contents. Upload serving is restricted to generated UUID `.webp` files.

### Monobank Webhook

Unsigned fake webhook did not process payment data and returned failure. The route checks signature/secret before processing.

## Recommended Fix Order

1. Rotate/remove weak admin credentials.
2. Add CSP and address admin token storage.
3. Sanitize or sandbox notification HTML preview.
4. Update vulnerable server and telegram-bot dependencies.
5. Reduce public `/api/health` detail.
6. Add automated security regression tests for unauthenticated admin access, customer IDOR, and SQLi login payloads.
