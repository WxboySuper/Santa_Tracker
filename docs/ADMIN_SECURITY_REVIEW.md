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
- JWT: HS256 via `jose`, `SECRET_KEY`-signed, 12h expiry (`ADMIN_SESSION_TTL_SECONDS` in `apps/web/src/lib/auth.ts:createAdminToken`), `admin: true` claim checked in `verifyAdminToken` and `requireAdminAuth`. The login cookie uses the same constant for `maxAge` and always sets `Secure`, keeping login and logout cookie attributes consistent even if proxy headers differ. Tokens issued before this change keep their embedded 24h expiry and can remain valid for up to 24h after deployment.
- Server-owned boundary: `middleware.ts:18` protects page shell, per-route `requireAdminAuth` enforces API boundary.
- Secret config: `SECRET_KEY` defaults to `dev-secret-key` for local dev only; production must set env var (`apps/web/src/lib/config.ts`).

## Mitigations Landed in This PR
- **Invalid ID handling:** `locateByIndex` validates `Number.isInteger` and bounds before any `splice`/index access, so `DELETE /locations/foo` correctly returns 404 instead of deleting index 0 (`apps/web/src/lib/admin-locations.ts:locateByIndex`). `splice` now uses validated `locationId` directly.
- **Lost-update protection (single + multi-process):** Admin mutations that do read-modify-write on `santa_route.json` / `advent_calendar.json` / `trial_route.json` now serialize through `withWriteLock` (`apps/web/src/lib/file-lock.ts`) — in-memory promise queue for single-process plus file-system lock file `.admin-write.lock` (exclusive `wx` create, 5s timeout, stale-mtime cleanup) for cross-worker/PM2/clustered deployments. File writes remain atomic via tmp + `rename` (`apps/web/src/lib/locations.ts:atomicWrite`, `apps/web/src/lib/advent.ts`) + `.history` versioning. Full `load→mutate→save` is inside the lock so second writer sees first writer's persisted state.
- **Validation parity:** Explicit ranges for latitude/longitude/UTC offset, `createLocationFromPayload`, `validateLocations` / `validateAdventCalendar`, and `AdminApiResult` response shapes mirror Flask behavior.
- **Login hardening:** Login throttling keys on Cloudflare's `cf-connecting-ip`, then `x-real-ip`. It ignores client-supplied `x-forwarded-for`. The local development fallback is the shared key `unknown`; production requests without either trusted header receive 429. Five failures per IP in 15 minutes trigger a 15-minute lockout. Repeated lockouts double up to one hour, and a correct password is refused while locked. 429 responses include `Retry-After` and use a generic body. A successful login clears that IP's failure and lockout state. There is no global failure bucket, so one client cannot lock the single owner out through a site-wide cap.
- **Throttle storage limits:** `admin-login-throttle.ts` uses an injectable `ThrottleStore` with in-memory state capped at 10,000 IP entries. Checks do not create state for unknown IPs. When full, the store evicts expired entries first and then the least-recently-failed non-locked entry. It never evicts an active lockout. If every entry is actively locked, it rejects new IPs with 429. This can discard an unlocked IP's recent failures during heavy distinct-IP traffic. Workers isolates are ephemeral and do not share memory, so the per-IP limit is best-effort and may reset after an isolate restarts or when a request reaches another isolate. This is a deliberate limit for a single-owner site. A future shared adapter needs an atomic pre-verification check-and-record flow as well as atomic failure updates; a plain KV get/set pair is not enough, and the current route fails closed if its synchronous check is used with non-memory storage. No KV binding is configured today.
- **Login request size and concurrency:** The route checks per-IP lockout before JWT verification or body parsing. It accepts at most 4 KiB; larger bodies receive 413 without JSON parsing. After reading a valid body, it checks the in-memory lockout synchronously immediately before password verification, then records a failed password synchronously before yielding. A regression test confirms that in a 20-request same-IP burst only five passwords are verified. Workers isolates still have independent counters. The route has no login queue or timed processing layer.
- **Cookie transport:** Login and logout share `shouldUseSecureAdminCookie`, which always sets `Secure`. This covers HTTPS requests and `x-forwarded-proto=https`, and keeps the clearing cookie consistent if request schemes or proxy headers differ. The deployed admin service is HTTPS-only; a non-local plain-HTTP deployment cannot persist the Secure admin cookie. Both use `HttpOnly`, `SameSite=Lax`, and `path=/`; the login cookie and JWT share the 12-hour `ADMIN_SESSION_TTL_SECONDS` value.
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
