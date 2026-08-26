# Admin Exposure Security Review — PR #347

**Date:** 2026-08-26
**PR:** `admin: protected studio and full admin API surface [#221]` (branch `t3code/221-4-admin`)
**Reviewers:** Alex Miller + automated governance (Greptile, CodeScene)
**Status:** Reviewed — see mitigations below.

## Scope
Protected studio pages:
- `/admin` and `/admin/route-simulator` (JWT via `apps/web/middleware.ts`, `requireAdminAuth`)
- Legacy `/admin/route-simulator-legacy` returns 404 via `notFound()`

Admin API surface (22 endpoints, all `requireAdminAuth` except `POST /api/admin/login`):
- `POST /api/admin/login` — token issuance
- `GET/POST /api/admin/locations`, `PUT/DELETE /api/admin/locations/[id]`, `POST /api/admin/locations/import`, `POST /api/admin/locations/validate`, `GET /api/admin/backup/export`
- `GET /api/admin/advent/days`, `GET/PUT /api/admin/advent/day/[day]`, `POST /api/admin/advent/day/[day]/toggle-unlock`, `POST /api/admin/advent/validate`, `GET /api/admin/advent/export`, `POST /api/admin/advent/import`
- `GET /api/admin/route/status`, `POST /api/admin/route/precompute`, `POST /api/admin/route/simulate`, `GET/POST/DELETE /api/admin/route/trial`, `POST /api/admin/route/trial/apply`, `POST /api/admin/route/trial/simulate`

## Auth Boundary
- Audit fix: removed password-as-token fallback (`apps/web/src/lib/auth.ts:verifyAdminToken` returns `false` on failure, does not compare raw `ADMIN_PASSWORD`).
- JWT: HS256 via `jose`, `SECRET_KEY`-signed, 24h expiry (`apps/web/src/lib/auth.ts:createAdminToken`), `admin: true` claim checked in `verifyAdminToken` and `requireAdminAuth`.
- Server-owned boundary: `middleware.ts:18` protects page shell, per-route `requireAdminAuth` enforces API boundary.
- Secret config: `SECRET_KEY` defaults to `dev-secret-key` for local dev only; production must set env var (`apps/web/src/lib/config.ts`).

## Mitigations Landed in This PR
- **Invalid ID handling:** `locateByIndex` validates `Number.isInteger` and bounds before any `splice`/index access, so `DELETE /locations/foo` correctly returns 404 instead of deleting index 0 (`apps/web/src/lib/admin-locations.ts:locateByIndex`).
- **Lost-update protection:** Admin mutations that do read-modify-write on `santa_route.json` / `advent_calendar.json` now serialize through `withWriteLock` (`apps/web/src/lib/file-lock.ts`), preventing interleaved loads from silently overwriting each other. File writes remain atomic via tmp + `rename` (`apps/web/src/lib/locations.ts:atomicWrite`, `apps/web/src/lib/advent.ts`).
- **Validation parity:** Explicit ranges for latitude/longitude/UTC offset, `createLocationFromPayload`, `validateLocations` / `validateAdventCalendar`, and `AdminApiResult` response shapes mirror Flask behavior.
- **Login hardening:** Per-IP rate limiting (`MAX_LOGIN_ATTEMPTS=10` per 60s) in `admin-login.ts`, plus `HttpOnly` `admin_token` cookie set by `POST /api/admin/login` (24h `maxAge`, `SameSite=Lax`, `Secure` in production) in addition to Bearer header flow.

## Residual / Recommended Follow-ups (not blocking)
- Edge/WAF rate limiting and brute-force alerting in front of `/api/admin/login` for production.
- Token revocation (e.g., short-lived JWT + rotation or blocklist) and CSRF protection for cookie-authenticated mutating routes if cookie-only flow is adopted.
- `localStorage` + non-`HttpOnly` client cookie in `apps/web/src/app/(admin)/admin/page.tsx` is intentional for API Bearer usage; a future iteration can move to `HttpOnly`-only with a server `POST /api/admin/logout` to clear the cookie.
- `SECRET_KEY` in production must be a strong random value; consider documenting rotation procedure.

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass locally.
- CodeScene `Clean Code Collective` gates now pass (complex methods refactored into `lib/admin-*` with `NumericRange`/`GeoCoordinate`/`ImportItem` value objects).
- Greptile P1 `splice(NaN,1)` and P1 lost-update threads acknowledged and fixed; governance exposure declared here.

## Sign-off
Exposure for the 22-endpoint admin surface is intentional and reviewed. Release automation may treat this file as the required exposure/server/security review declaration for PR #347.
