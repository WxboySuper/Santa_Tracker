# Changelog — per-PR exhaustive (enforced in CI)

## [Unreleased] - Admin passkey setup and sign-in screens

- **Sign-in:** The admin sign-in screen offers a passkey first, the password until a passkey exists, and a recovery code as the way back in. If no passkey is set up, a passkey attempt switches to the password form and says why. Throttled attempts show the wait time.
- **Sign-in security panel:** The dashboard lists registered passkeys and the recovery codes left, adds a passkey on this device, removes a passkey (never the last one) and replaces the recovery codes, asking for confirmation before destructive steps.
- **Recovery codes:** New codes are shown once, with copy and download buttons. The panel stays open until the owner ticks that they have saved them. After the first passkey, password sessions end, so the panel sends the owner back to sign in with the passkey.
- **Recovery sessions:** A session that signed in with one recovery code is asked for a second code before it can change passkeys, as the API requires.
- **Client:** `lib/admin-passkey-client.ts` wraps the passkey API with `@simplewebauthn/browser` 14 and the CSRF header, and turns failures into messages fit to show. Unit tests cover code trimming, throttling messages, network failures, response filtering and the second-code check.
- **Recovery code download:** The .txt download attaches its link to the page and frees the file URL a second later, so Firefox and Safari save it too.
- **Docs:** Corrects the auth-state storage key in `docs/ADMIN_PASSKEY_AUTH.md` to `admin-auth/state.json`.

## [Unreleased] - Admin passkeys and recovery (#295)

- **WebAuthn owner authentication:** Adds passkey registration and login ceremonies, one-time recovery codes stored as hashes, and disables existing password sessions after a passkey is registered.
- **Session safety:** Makes signed admin sessions persisted, expiring, and revocable; adds session listing/revocation, double-submit CSRF checks for cookie mutations, shared login throttling, and bounded auth audit records. Recovery sessions need a second code before passkey or session management; logout remains available to revoke a valid session and clear cookies.
- **Authentication edge cases:** Revokes legacy and current password sessions atomically during first passkey setup, writes successful-login audit events with session creation in one state update, rejects signature-counter regressions including a reset to zero, returns accurate recovery, registration conflict, session-storage, and missing trusted-IP statuses, preserves retryable cookies if logout revocation fails, handles failed revocation after a late login lockout, applies a separate 30-request/15-minute challenge-issuance limit, and keeps throttle initialization and post-login checks safe for production builds and simpler to review.
- **Failure handling:** Keeps CSRF rejection at 403 if audit storage fails, treats only `EEXIST` as local lock contention so permission errors surface immediately, and splits the recovery error handler to keep the route reviewable.
- **API and E2E contracts:** Groups throttle inputs into named objects and updates Playwright API writes to send the double-submit token with the configured public test origin.
- **Documentation and tests:** Documents API and origin/RP-ID configuration; tests registration, authentication, one-time recovery, recovery step-up, session revocation, CSRF, and throttling.
- **Admin screens:** The emergency switches and route simulator send the `X-CSRF-Token` header (read from the `admin_csrf` cookie) on their changes, through a shared `adminCsrfHeaders()` helper.
- **Production config:** The deploy job sets `ADMIN_WEBAUTHN_RP_ID` and `ADMIN_WEBAUTHN_ORIGIN` for santa.weatherboysuper.com and `tools/configure-webauthn.mjs` adds them to the Worker vars for that deploy only, so passkeys work in production while local and preview runs keep using their own request host.

## [Unreleased] - Version IDs sort in creation order

- **Snapshots:** Version IDs created in the same millisecond now carry a zero-padded sequence after the timestamp, so they always sort in creation order. Before this, the random suffix decided which one counted as newer: rollback could select the wrong previous version, and a #539 test failed intermittently on `main`.
- **Tests:** Adds a fake-clock test that IDs made within one millisecond sort in creation order.

## [Unreleased] - Route draft autosave and restore points (#296)

- **Draft isolation:** Adds authenticated route draft autosave APIs backed by a separate immutable version dataset, with `If-Match` protection, a 5 MB/100-level data limit, and validation feedback for incomplete edits.
- **Named revisions:** Adds named restore point listing, comparison, and restore into a new draft version without changing the active published route. Revision creation rejects unavailable draft content instead of pinning a broken restore point.
- **Documentation and tests:** Documents the admin API contract and covers autosave isolation, concurrent and stale writes, bounded request bodies, comparison, restore, corrupt revision data, and invalid-draft feedback. Filesystem lock failures now stop writes instead of proceeding without serialization.

## [Unreleased] - Fill sourced stop-card null notes

- **Coverage:** Adds 46 original, source-backed cultural notes across the existing 307 cards, reducing null notes from 97 to 51.
- **Priority:** Covers Christmas Eve at the Vatican, city festivals, foodways, music, crafts and seasonal customs across country capitals and major cities.
- **Review:** Keeps unsupported places null; all cards remain in draft status and retain their existing Commons photo metadata.

## [Unreleased] - Representative city stop cards batch 3

- **Candidate coverage:** Adds 114 verified draft cards from the next city-tier candidates, keyed by stable generator place IDs.
- **Research quality:** Adds 37 original, source-linked cultural notes and 104 permissively licensed, attributed photos; 77 cards remain without a sourced note.
- **Entity matching:** Includes only candidates matched to an English Wikidata entity within 40 km; 11 candidates remain unresolved.

## [Unreleased] - Validated route snapshot release controls (#302)

- **Route validation:** Adds a read-only validator for stored route versions, with season, schema, SHA-256 checksum, coordinate, duplicate-name, and schedule checks.
- **Activation and rollback:** Adds authenticated APIs guarded by `If-Match`; successful pointer changes keep the actor, reason, previous version, checksum, and timestamp in the same atomic active-pointer write.
- **Docs and tests:** Documents the operator API and tests route validation, checksum stability, activation audit history, and rollback.

## [Unreleased] - Representative city stop cards batch 2

- **Candidate coverage:** Adds 93 verified draft cards from the next country and territory candidates, keyed by stable generator place IDs.
- **Research quality:** Adds 80 original, source-linked cultural notes and 83 permissively licensed, fully attributed photos; 13 cards remain without a sourced note.
- **Entity matching:** Leaves seven candidates unresolved where the research tool could not verify a matching Wikidata entity by exact English label and location.

## [Unreleased] - Weather cron Worker no longer bundles Next.js (#542)

- **Weather:** `lib/weather.ts` builds responses with the standard `Response.json` instead of `NextResponse`. The weather cron Worker imports this module, and `next/server` pulled Next's Node-only code (`__dirname`) into its bundle, so Cloudflare rejected the upload. The cron bundle drops from 242 KiB to 35 KiB. The `/api/weather` responses are unchanged.

## [Unreleased] - Fix weather cron deploy order (#542)

- **Deploy:** Deploys the weather cron Worker before the vinext app build. Wrangler refuses to deploy while the build's `.cloudflare/output` exists, which failed the first deploy after #545 before the app Worker was updated.

## [Unreleased] - Bounded weather provider calls (#542)

- **Scheduled weather refresh:** Adds a 15-minute Worker cron that runs from 30 minutes before takeoff through the 26-hour flight and replay window. It reads the active route, fetches upcoming and current stop weather in batches of at most 50 cells, and stores results in shared KV for 30 minutes.
- **Global provider limit:** `/api/weather` checks shared KV first. Both cron and request-time provider calls pass through one Durable Object budget capped at 900 per UTC day and 300 per minute. Missing data returns `null` when the budget or bindings are unavailable.
- **Emergency switch and setup:** `WEATHER_ENABLED=false` disables both cron refresh and the endpoint. The launch runbook documents KV provisioning and the GitHub repository variable required before deployment.
## [Unreleased] - Representative city stop cards batch 1

- **Candidate coverage:** Adds draft cards for the top 100 country or territory candidates by population, keyed to stable generator place IDs.
- **Research quality:** Adds original, source-linked cultural notes and permissively licensed landscape photos where matching attribution metadata is available; unsupported notes remain null.
- **Research matching:** Audits Wikidata entities against candidate coordinates and retains only supported source and photo metadata.
- **Topic uniqueness:** Keeps country/topic duplicates subject to the per-card exemption rule.

## [Unreleased] - Source-backed stop card contract (#260)

- **Card schema:** Defines stable place IDs, concise sourced notes, unique topic keys, review status, and fully attributed permissive-license photos.
- **Validation:** Adds CI checks for missing sources, repeated place IDs or topics, near-duplicate notes, and unlicensed or unattributed photos.
- **Research tooling:** Adds a cached, rate-limited research script for Wikidata entities, Wikipedia summaries, and Wikimedia Commons image license metadata.

## [Unreleased] - Advent fallback library and takedown lock (#270, #421)

- Added a day-specific fallback activity for all 24 Advent dates using the existing typed activity modules. The fallback flag is on by default and in the Cloudflare Worker config; authenticated previews expose fallback payloads only for unlocked days.
- Made flag parsing case-insensitive and kept preview output aligned with whether the fallback flag is enabled.
- Documented the exceptional takedown procedure in launch readiness and clarified the API contract for live, preview, and archive reads.
- Added tests for every day's fallback and for hiding a past takedown-locked day from live, preview, and archive reads.

## [Unreleased] - Route freeze moved to Dec 5 (#321)

- **Freeze gates:** Records the owner's 2026-11-26 decision to move the route freeze from Nov 25 to Dec 5, 18:00 UTC. The other gates are unchanged.
- **Launch readiness:** Moves route approval and activation in the dates table to the Dec 5 freeze.

## [Unreleased] - Current stop weather API (#320)

- **Weather endpoint:** Adds `GET /api/weather?lat={latitude}&lon={longitude}` with Celsius and Fahrenheit temperatures, the provider's numeric weather code, and a short label.
- **Caching and failure handling:** Rounds coordinates to a 0.25 degree grid, caches at the edge for 12 minutes, times out provider calls, and returns `null` when weather is unavailable.
- **Provider terms:** Uses Open-Meteo. Its no-key free endpoint permits non-commercial use within published rate limits; weather data is CC BY 4.0 and requires attribution. Commercial use needs a paid plan. See https://open-meteo.com/en/terms.

## [Unreleased] - Environment-aware seasonal configuration (#301)

- **Corruption handling:** Flags invalid JSON, schema-invalid data, and environment mismatches in admin reads and previews; runtime reads use safe defaults, normal writes refuse corrupt data, and an explicit ETag-guarded repair preserves the original bytes under a backup key.
- **Bounded request bodies:** Caps streamed preview and update bodies at 8 KiB regardless of `Content-Length`.
- **Typed flags:** Promotes the feature registry from scaffold-only metadata to strict, typed configuration and includes the effective seasonal config in canonical immutable snapshots.
- **Environment controls:** Adds separate development, preview, and production flag overrides with compare-and-set writes, operator reasons, audit history, and per-flag expiry. Unknown persisted flags fall back to registry defaults; expired flags stop applying.
- **Preview API:** Adds a non-mutating preview for a chosen UTC time and candidate overrides, including derived mode, effective flags, and the active route snapshot ID.
- **Docs and tests:** Documents the configuration API and adds tests for environment isolation, unknown keys, expiration, audit records, and stale writes.

## [Unreleased] - Launch-day emergency controls API (#303)

- **Emergency switches:** Adds audited, compare-and-set controls for no-map mode, simplified tracker mode, and weather/soundscape kills. Updates require an operator reason and retain the prior and next values.
- **Runtime contract:** Adds a safe public projection at `GET /api/runtime-controls`; malformed stored controls fail closed to no-map, simplified mode, and disabled optional features.
- **Docs and tests:** Documents the admin and runtime API contracts and tests defaults, fail-safe parsing, audit history, and stale-write rejection.

## [Unreleased] - Cross-browser readiness matrix (#324)

- **Opt-in Playwright profiles:** Adds open and closed fixture runs for Firefox and WebKit desktop, iPhone 13, Pixel 5, and iPad emulation, a 3840x2160 desktop viewport, and a 740x360 landscape phone viewport. The default project set stays unchanged.
- **Evidence:** Adds scratch screenshot capture and a QA report with reproducible findings, rerun commands, and owner-run device and screen-reader checks.

## [Unreleased] - Season modes and expiring overrides (issue #236)

- **Season modes:** Adds a pure UTC-derived annual mode for off-season, preparation, Advent, flight, and post-season, sharing schedule boundaries with the existing feature gates without changing public access behavior.
- **Admin override:** Adds a single-owner admin API to set and clear audited mode overrides with compare-and-set writes, required reasons, and a hard 48-hour expiry limit. Expired overrides are ignored and reported.
- **Docs and tests:** Describes the mode schedule and emergency-switch relationship, with tests for each UTC boundary, expiry behavior, auth, validation, audit records, and storage conflicts.

## [Unreleased] - Journey statistics and replay (#257, #259)

- **Route engine:** Adds deterministic distance, stop, country, time zone, flight-time, and speed statistics. Presents now follow a smooth flight-and-dwell schedule from zero to the documented 7 billion playful estimate, allocated across route UTC-offset bands using the complete candidate pool as a population proxy.
- **Replay:** Adds injected-clock play, pause, seek, speed, and reset controls. Replay owns copies of its route, stop metadata, and candidate-pool snapshot and returns the same state and statistics as live calculations for the same journey instant.
- **Package exports:** Exposes the stats and replay APIs from the route-engine root and dedicated ./stats and ./replay entry points.
- **Docs and tests:** Adds docs/JOURNEY_STATS.md and boundary, parity, determinism, localization, speed, and sampled monotonicity tests.

## [Unreleased] — Authoritative tracker state and map fallback (#251, #253)

- **Route snapshot metadata:** `GET /api/route` now returns an additive SHA-256 content version alongside the unchanged `route_nodes` field. `GET /api/time` provides a separate dynamic server timestamp with `Cache-Control: no-store`.
- **Journey timing:** Adds exact arrival, departure, first-stop, last-stop, shared timestamp, and single-stop boundary coverage. Exports request midpoint clock sync and per-route progress guard helpers for the tracker client.
- **Map adapter:** Makes OpenLayers teardown idempotent and ignores mount calls after teardown. Adds reusable contract tests for the fake and OpenLayers adapters, including provider failures and text fallback state.
- **Docs and tests:** Documents the additive route fields and helper integration point; tests cover clock offset, route-version resets, fallback behavior, and map lifecycle.

## [Unreleased] — Activity save contract (PR #420, issue #266)

- **Activity SDK:** Defines renderer-independent load, loaded, start, pause, resume, reset, complete, error, exit, score, and achievement events with lifecycle transition validation.
- **Breaking lifecycle contract:** Adds the `exited` state and expands the default transition graph. `canTransition` now throws `ActivityLifecycleError` for malformed graphs or unknown runtime states instead of returning `false`. Consumers persisting lifecycle state separately must handle the new state and review the changed transitions; save envelopes do not version lifecycle state.
- **Package exports:** Adds explicit `./lifecycle` and `./save` entry points and named root exports so consumers can import these contracts independently.
- **Saves:** Adds activity-specific versioned save envelopes and consecutive migration steps; missing, ambiguous, invalid, and downgrade paths fail explicitly.
- **Migration handlers:** Rejects async functions, generators, and bound functions at registry validation so unused steps also uphold the synchronous migration contract.
- **Runtime validation:** Rejects sparse transition lists, inherited/accessor lifecycle fields, and invalid lifecycle states with stable SDK errors, while preserving support for legacy graphs that omit exited transitions. Save validation accepts plain objects and arrays across JavaScript realms, limits JSON nesting to 100 levels, and rejects unknown migration keys.
- **Docs and tests:** Documents integration for DOM, canvas, and optional WebGL renderers and tests lifecycle events, progress events, and migration behavior.

## [PR #419] - 2026-10-12 - feat(advent): add trusted unlock preview and archive access (issue #269)

- **Unlocks:** Public Advent reads use the server clock, with explicit clock injection available to deterministic tests.
- **Preview:** Adds an authenticated, read-only admin preview endpoint at `/api/admin/advent/preview?at=...`; preview time is never written to calendar data or used by public routes.
- **Archive:** Adds `/api/advent/archive/:day` for activities whose scheduled unlock has passed, so they remain playable after the live season changes.
- **Tests:** Covers UTC boundary equality, preview isolation, and archive access rules.
- **Docs:** Documents the clock, preview, and archive contracts in `docs/ADVENT_CALENDAR_API.md`.

## [Unreleased] - Security automation (#316)

- **Code scanning:** Uses the repository's existing GitHub default setup for weekly and pull-request analysis of JavaScript/TypeScript, Python, and GitHub Actions.
- **Dependency review:** Checks pull-request dependency changes and blocks new moderate-or-higher vulnerabilities across runtime, development, and unknown scopes. Existing Dependabot updates continue to supply lockfile changes for review. Adds weekly grouped minor and patch updates for GitHub Actions used by workflows.
- **Workflow hardening:** Pins dependency-review, checkout, and attestation actions to verified commit SHAs. Removes unused permissions, scopes release write access to its job, and disables persisted checkout credentials.
- **Reliability:** Prevents pushes from cancelling scheduled CodeQL scans, adds workflow concurrency and time limits, sanitizes release tags in archive filenames, and prevents release reruns from overwriting attested assets.
- **Secrets:** Records that secret scanning and push protection are already enabled in GitHub repository settings.
- **Release provenance:** Adds a source archive to each published GitHub release and attaches a signed GitHub artifact attestation for verification with the GitHub CLI.
- **Docs:** Documents the automated checks, repository settings, and release verification command in docs/SECURITY_AND_SUPPLY_CHAIN.md.

## [Unreleased] — CI: add OCR pull request reviews

- **Review:** Adds automated Muse Spark reviews with inline findings, a sticky digest, and a manual /ocr trigger.
- **Setup:** Uses the OpenCode Go Responses endpoint and skips with a clear notice until the repository Actions secret OPENCODE_API_KEY is configured.
- **Merge feedback:** Reports review findings and failures as a check; the existing branch ruleset continues to require review-thread resolution while this reviewer is evaluated.

## [PR #] - 2026-08-28 - feat(ui): add Storybook design baseline

- **Issue:** Closes #216, establishing the first shared UI baseline for the Christmas 2026 redesign.
- **Tokens:** Adds color, typography, spacing, layer, motion, focus, radius, and seasonal-state tokens, including CSS overrides for reduced motion and high contrast.
- **Stories:** Adds Button variants and a seasonal token gallery with mobile, high-contrast, and reduced-motion toolbar states.
- **Checks:** Adds Storybook build, axe accessibility, and per-story PNG screenshot checks to the workspace CI job.
- **Docs:** Adds `docs/UI_STORYBOOK.md` with local and CI-style commands.

## [Unreleased] — Shared public contracts (#211)

## [PR #373] - 2026-08-28 - feat(ui): add Storybook design baseline

- **Issue:** Closes #216, establishing the first shared UI baseline for the Christmas 2026 redesign.
- **Tokens:** Adds color, typography, spacing, layer, motion, focus, radius, and seasonal-state tokens, including CSS overrides for reduced motion and high contrast.
- **Stories:** Adds Button variants and a seasonal token gallery with mobile, high-contrast, and reduced-motion toolbar states.
- **Checks:** Adds Storybook build, axe accessibility, and per-story PNG screenshot checks to the workspace CI job.
- **Docs:** Adds `docs/UI_STORYBOOK.md` with local and CI-style commands.

- Added validated public ID schemas and constructors for locations, publications, snapshots, and activities.
- Added versioned route and snapshot contracts with publication metadata, checksums, timestamps, and typed version errors.
- Added deterministic snapshot metadata and consumed the fixture from the web contract test.
- Breaking contract change: snapshots now require `snapshotId`, `author`, and `validationReport`; old snapshot payloads must be republished with the current schema version.

## [Unreleased] — Flask retirement #221

## [Unreleased] — Migration fixtures #218

- Added shared Zod schemas and deeply frozen fixtures for all 185 nodes in the 2025 route and all 24 Advent days.
- The migration schema records two source exceptions without rewriting the fixture: unwrapped longitudes up to 360 degrees and legacy IDs containing repeated underscores. Runtime normalization still applies the canonical coordinate and ID rules.
- Published SHA-256 values in the fixture module make accidental source drift visible in tests. Legacy Advent payloads stay intentionally open-ended because the copied source uses different shapes by content type; a later content contract can tighten those fields without rewriting this provenance fixture.
- Removed the Next.js resolver's fallback to retired Flask data, so the new runtime has one route and Advent data source.
- Removed the remaining Next.js trial-route fallback to `src/static/data`; trial data now stays under the new app data directory.

### Foundation — retire Flask runtime after parity acceptance

**Implements audit** https://plans.weatherboysuper.com/santa-tracker-flask-audit-217/ (inventory at 41c96a6) and issue #221 / tracker #199 / ADR 0001.

#### Added

## [PR #346] - 2026-08-25 - fix(public): harden Next.js public surfaces

- **Security:** Replaced Advent client-side `innerHTML` rendering with server-rendered React elements, so calendar data is escaped before it reaches the DOM.
- **Consistency:** Unified the Advent feature flag and countdown behavior through shared helpers/components; moved Leaflet CSS to the tracker surface only.
- **Reliability:** Made Advent and route status metadata reads asynchronous, made the health endpoint explicitly dynamic, and derived legacy `/index` redirects from the incoming request origin.
- **Offline behavior:** Added cache-first handling for OpenStreetMap tiles and normalized `/api/route` cache keys in the service worker.
- **Public API exposure review:** `/api/route`, `/api/health`, and `/api/advent/*` are intentionally unauthenticated public endpoints. They expose route/health data and feature-gated Advent metadata only; no admin mutation or secret-bearing data is exposed. The Advent API withholds locked payloads server-side. See `docs/API.md`.
- **Evidence:** Typecheck ✓, lint ✓, 35 workspace tests ✓, production Next.js build ✓, service-worker syntax check ✓.

## [PR #370] - 2026-08-27 - feat(foundation): add local stack bootstrap

- **Issue:** Fixes #219, the one-command local developer bootstrap.
- **Bootstrap:** Adds `pnpm bootstrap`, which checks Node.js, pnpm, and Docker Compose, starts PostgreSQL 16 with
  `docker-compose.yml`, waits for database readiness, and starts the Next.js dev server. `--check --skip-docker`
  supports CI and toolchain-only checks.
- **CI:** Adds explicit Linux bootstrap coverage that starts the compose PostgreSQL service and waits for readiness,
  alongside the Windows prerequisite-path job. macOS is not included in the CI matrix.
- **Docs and tests:** Documents Windows, macOS, Linux, and CI usage and tests the help and prerequisite paths.

## [PR #350] - 2026-08-21 - feat(foundation): scaffold Next.js pnpm workspace

- pnpm workspace (`pnpm-workspace.yaml`, root `package.json` workspaces) with `apps/web` (Next.js 15 App Router, TypeScript, Tailwind, `output: standalone`) and packages `config`, `contracts`, `route-engine`, `database`, `ui`, `activity-sdk`, `test-fixtures` per ADR dependency rules.
- TypeScript domain ports: `apps/web/src/lib/locations.ts`, `advent.ts`, `route-sim.ts`, `auth.ts`, `config.ts` + pure `packages/route-engine` and `packages/contracts` (Zod). No `itsdangerous` password fallback — JWT HS256 24h only.
- Public pages: `/` (home), `/tracker`, `/advent` (gated by `ADVENT_ENABLED`), `GET /index` → 301 `/tracker` (archive disposition), `/offline` + `public/sw.js` (fixed cache list, no `/index.html` split), `public/offline.html` compat.
- Protected admin: `/admin`, `/admin/route-simulator` (client login → JWT → cookie `admin_token`, middleware verifies HS256, `x-admin-auth` header, no page shell without token). Legacy `/admin/route-simulator-legacy` → 404 (Retire).
- Public APIs: `GET /api/advent/manifest`, `GET /api/advent/day/:day` (403 metadata when locked, server-authoritative), `GET /api/health`.
- Admin APIs (Bearer JWT, all under `requireAdminAuth`): `POST /api/admin/login`, `GET/POST /api/admin/locations`, `PUT/DELETE /api/admin/locations/:id`, `POST /api/admin/locations/validate`, `POST /api/admin/locations/import`, `GET /api/admin/route/status`, `POST /api/admin/route/precompute` (validation), `POST /api/admin/route/simulate`, `GET/POST/DELETE /api/admin/route/trial`, `POST /api/admin/route/trial/apply`, `POST /api/admin/route/trial/simulate`, `GET /api/admin/backup/export`, `GET /api/admin/advent/days`, `GET/PUT /api/admin/advent/day/:day`, `POST /api/admin/advent/day/:day/toggle-unlock`, `POST /api/admin/advent/validate`, `GET /api/admin/advent/export`, `POST /api/admin/advent/import`.
- Deployment: `Dockerfile` (standalone), updated `deploy-on-release.yml` / `first-deploy.yml` to Node (no venv/pip), `docs/DEPLOY.md` rewritten for `node server.js` + `/api/health` probe.
- Data: atomic writes (`.tmp` → `rename`) + versioned `.history/` snapshots (last 5) for both route and advent, rollback via activating previous snapshot. `apps/web/data/` + `public/data/` + fallback to legacy `src/static/data/` (no competing `Route Data/` reads). `archive/route-data-2025-12-20/` snapshot, `archive/offline-flask-legacy.html`, `archive/flask-legacy/` (app.py, config.py, utils, requirements, pyproject).
- Security fixes: removed `ADMIN_PASSWORD` bearer fallback, admin page boundary now protected in `middleware.ts` (not just API decorator), config fail-closed in production (`packages/config`), `SECRET_KEY` placeholder detection retained.
- PWA: `POST /sw.js` uses `/offline` and `/data/santa_route.json` (not stale `/src/static/...`), CDN `isExternalUrl` kept, cache version `next-v1`.
- Workspace CI: `testing.yml` → archive-only Python compatibility matrix; `workspace.yml` → Node + pnpm + typecheck + lint + build + vitest; `linting.yml` → tsc + eslint + stylelint plus archive-only Python lint. `DEPLOYMENT.md` archived.
- Tests: `apps/web/src/lib/__tests__/parity.test.ts` (13 parity checks: normalization, validation, simulation sort, advent unlock, JWT vs password fallback, no-Flask).

#### Changed

- `next.config.ts`: `standalone` (Linux), `transpilePackages`, redirects for `/index` + `/index.html`, rewrites for `/static/data/*` compat.
- `.env.example`: Node keys (`ADMIN_PASSWORD`, `SECRET_KEY`, `ADVENT_ENABLED`).
- `.gitignore`: Node/Next ignores + `.history/` + trial files.
- `README.md`, `CONTRIBUTING.md`: Node/pnpm instructions.

#### Retired

- Flask runtime: `src/app.py`, `config.py`, `src/utils/locations.py`, `src/utils/advent.py`, `src/utils/tracker.py`, `src/logging_config.py`, `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `.coveragerc`, `.flake8`, root `sw.js` + `offline.html` (now in `apps/web/public`), `tools/route-editor` remains but not deployed (Replace disposition), undocumented `/api/santa/*` not ported.

#### Migration notes

- `SEC
RET_KEY` must be ≥16 chars; set via `PROD_DOTENV` on VPS (`.env` mode 600).
- After deploy, verify `GET /api/health` and `current` symlink ownership per `DEPLOY.md`.
- Historical `Route Data/` remains under `archive/` for provenance; new runtime does not read it.

## [Unreleased] - Localization-ready boundaries (#220)

- Added typed localization with English fallback and visible missing-key behavior.
- Routed public UI messages through the localization layer.
- Added localized content contracts and tests. See `docs/LOCALIZATION.md`.

## [PR #368] - 2026-08-27 - feat(migrations): establish postgres migration workflow

- **Database:** Adds the initial Drizzle SQL migration and metadata for the publications, locations, and audit events tables.
- **Workflow:** Adds a reusable migration runner, an isolated PostgreSQL integration test, and a PostgreSQL 16 CI service. The test applies migrations to an empty database and runs it a second time to verify repeatability.
- **Documentation:** Documents local migration commands and the transactional failure and rollback behavior used for production migrations.
# Unreleased

- Added typed activity SDK helpers for keyboard, pointer, and touch input normalization, opt-in audio preferences, reduced-sensory support, and identity-free completion and failure telemetry.
