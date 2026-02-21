# Admin Auth Flow

This document explains the current admin authentication model.

## Why We Changed It

Old behavior sent admin token in query params (`?token=...`), which can leak via:

- browser history
- logs
- analytics/referrer data

Current behavior uses `httpOnly` cookie session to reduce exposure.

## Request Flow

1. User opens `GET /admin`.
2. If no valid admin cookie, page shows login form.
3. Form posts token to `POST /api/admin/session`.
4. API validates token against `ADMIN_TOKEN`.
5. If valid, API sets cookie `bwc_admin_session` and redirects back to `/admin`.
6. `/admin` loads records.
7. User can logout via `POST /api/admin/logout`, which clears cookie.

## Files Involved

- `/src/app/admin/page.tsx`
  - reads cookie and gates page UI
  - login form submits to `/api/admin/session`
  - logout form submits to `/api/admin/logout`
- `/src/app/api/admin/session/route.ts`
  - validates submitted token
  - sets auth cookie (`httpOnly`, `sameSite=lax`, `secure` in production)
- `/src/app/api/admin/logout/route.ts`
  - clears auth cookie
- `/src/lib/security.ts`
  - `ADMIN_SESSION_COOKIE` constant
  - timing-safe token validation
  - `readAdminTokenFromRequest` now checks auth header, `x-admin-token`, and cookie

## Current Limitation

Cookie stores raw admin token value. This is better than query-string transport but not ideal.

Recommended next improvement:

- store signed, short-lived session token instead of raw admin token.
