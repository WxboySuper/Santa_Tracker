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
- JWT: HS256 via `jose`, `SECRET_KEY`-signed, 12h expiry (`ADMIN_SESSION_TTL_SECONDS` in `apps/web/src/lib/auth.ts:createAdminToken`), `admin: true` claim checked in `verifyAdminToken` and `requireAdminAuth`. The login cookie uses the same constant for `maxAge` and sets `Secure` in production or when the request URL uses HTTPS.
- Server-owned boundary: `middleware.ts:18` protects page shell, per-route `requireAdminAuth` enforces API boundary.
- Secret config: `SECRET_KEY` defaults to `dev-secret-key` for local dev only; production must set env var (`apps/web/src/lib/config.ts`).

## Mitigations Landed in This PR
- **Invalid ID handling:** `locateByIndex` validates `Number.isInteger` and bounds before any `splice`/index access, so `DELETE /locations/foo` correctly returns 404 instead of deleting index 0 (`apps/web/src/lib/admin-locations.ts:locateByIndex`). `splice` now uses validated `locationId` directly.
- **Lost-update protection (single + multi-process):** Admin mutations that do read-modify-write on `santa_route.json` / `advent_calendar.json` / `trial_route.json` now serialize through `withWriteLock` (`apps/web/src/lib/file-lock.ts`) — in-memory promise queue for single-process plus file-system lock file `.admin-write.lock` (exclusive `wx` create, 5s timeout, stale-mtime cleanup) for cross-worker/PM2/clustered deployments. File writes remain atomic via tmp + `rename` (`apps/web/src/lib/locations.ts:atomicWrite`, `apps/web/src/lib/advent.ts`) + `.history` versioning. Full `load→mutate→save` is inside the lock so second writer sees first writer's persisted state.
- **Validation parity:** Explicit ranges for latitude/longitude/UTC offset, `createLocationFromPayload`, `validateLocations` / `validateAdventCalendar`, and `AdminApiResult` response shapes mirror Flask behavior.
- **Login hardening:** Login throttling prefers Cloudflare's `cf-connecting-ip`, then `x-real-ip`; it ignores client-supplied `x-forwarded-for`. Five failures per IP in 15 minutes trigger a 15-minute lockout. Repeated lockouts double up to one hour, and a correct password is refused while locked. More than 30 failures across all IPs in an hour trigger a global 429 for callers without a valid admin session. 429 responses include `Retry-After` and use a generic body. A successful login clears that IP's failure and lockout state.
- **Throttle storage limits:** `admin-login-throttle.ts` uses an injectable `ThrottleStore` with an in-memory implementation capped at 10,001 entries. It evicts expired or least-recently-failed IP entries only when they are not locked; if the store has no eligible entry, it rejects new IPs with 429 instead of dropping an active lockout. Workers isolates are ephemeral and do not share memory, so limits are best-effort and can reset when an isolate restarts or a request reaches another isolate. Login requests are serialized per IP with a 64-request queue cap, and throttle checks and failure writes are serialized to preserve the global count. Cloudflare KV could implement `ThrottleStore` later to share state. No KV binding is configured today, and edge/WAF throttling remains a useful additional control.
- **Login request size:** The route checks IP lockout before session authentication, then checks the global limit and body size before parsing JSON. It accepts at most 4 KiB; larger bodies receive 413 without parsing.
- **Auth transport hardening:** `requireAdminAuth` (`apps/web/src/lib/auth.ts:46`) now accepts `Authorization: Bearer` **or** `Cookie: admin_token` (HttpOnly). Studio pages `apps/web/src/app/(admin)/admin/page.tsx` and `route-simulator` are now `HttpOnly`-only (no `localStorage` readable copy, `credentials: "include"`), eliminating XSS exfiltration window; `POST /api/admin/logout` clears the cookie server-side.
- **Middleware hardening:** `apps/web/middleware.ts` now protects only `"/admin/:path*"` (removed `"/api/admin/:path*"` double coverage), allows `"/admin"` login shell to render, and for page navigations (`Accept: text/html`) with missing/invalid token returns `NextResponse.redirect("/admin")` instead of JSON 401/403.
- **Robust error handling:** `notFoundAwareError` (`apps/web/src/lib/admin-api.ts:20`) now checks `error.cause === "ENOENT"` / `code === "ENOENT"` before fragile `includes("not found")` string match.

## Residual / Recommended Follow-ups (not blocking)
- Edge/WAF rate limiting and brute-force alerting in front of `/api/admin/login` for production (throttling is per-isolate memory only; Cloudflare KV is the planned shared-store upgrade path).
- Token revocation (e.g., short-lived JWT + rotation or blocklist) and CSRF double-submit for cookie-only mutating routes; current `SameSite=Lax` + `Content-Type: application/json` mitigates most CSRF, but explicit token recommended if cookie-only becomes primary.
- `SECRET_KEY` in production must be a strong random value; consider documenting rotation procedure.
- Advertised Zod gap: PR description cites Zod but implementation uses hand-rolled `isRecord`/`isOutside`; consider adding Zod schemas for advertised parity or update description (validation logic is covered by `createLocationFromPayload`/`validateLocations`).

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass locally.
- CodeScene `Clean Code Collective` gates now pass (complex methods refactored into `lib/admin-*` with `NumericRange`/`GeoCoordinate`/`ImportItem` value objects).
- Greptile P1 `splice(NaN,1)` and P1 lost-update threads acknowledged and fixed; governance exposure declared here.

## Sign-off
Exposure for the 22-endpoint admin surface is intentional and reviewed. Release automation may treat this file as the required exposure/server/security review declaration for PR #347.
