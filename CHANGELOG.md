# Changelog
<!-- markdownlint-disable -->

All notable changes to this project will be documented in this file.

## [Unreleased]

### Next major / beta

Work toward the next major release continues in the beta channel while the final stable release is prepared.

#### Added

- **Built-in outlook opacity:** Add per-outlook fill opacity controls to the forecast workflow and preserve the selected values in saved and exported forecasts.
- **Forecast Grade:** Add the verification workspace, source adapters, score breakdowns, report-quality checks, share cards, trend views, and premium snapshot support.
- **NOAA DAT verification evidence:** Add a direct NOAA Damage Assessment Toolkit adapter and a prototype Forecast Grade survey layer that uses EF-coded damage points as supplemental tornado severity evidence.
- **Workflow continuity:** Add reusable workflow templates, persistent workflow metadata, scoped discussion/draft persistence, package review and completion flows, lifecycle analytics, and handoff guidance.
- **Custom products:** Add local custom layers and reusable hosted products with category styling, snapshots, exports/imports, owner-scoped storage, and premium enforcement.
- **Monitor and custom styles:** Add free built-in WPC-style Excessive Rainfall Outlook and Tropical AOI products that are available to everyone and do not consume personal product slots.
- **Auto-TSTM:** Add cached SPC guidance, scheduled ingestion, preview/apply/cancel flows, cache health reporting, and stale-result protection.
- **Feature exposure controls:** Add typed local/beta/staging/production target matrices, server capability gates, emergency disable controls, exposure diagnostics, and rollout validation.
- **Account management:** Add recent-authentication account deletion with subscription cleanup, hosted-data removal, and local/offline-save preservation.
- **Operations and delivery:** Add manual release workflows, staging support, release manifests, OpenCode review automation, and maintenance reports.
- **Monitor reference layers:** Add opt-in official NDFD temperature and SPC mesoscale discussion adapters with source metadata, valid-time state, and bounded caching.

#### Changed

- **Forecast and verification:** Rework the forecast and verification experience around versioned workflow data, report-aware grading, event capture, severity intent, spatial scoring, probability skill, and false-alarm discipline.
- **Telemetry and privacy:** Replace legacy analytics with privacy-gated self-hosted Umami while preserving native page views and minimizing tracker data.
- **Server platform:** Move the analytics service to Express 5 and Stripe Node 22, harden billing/webhook handling, and add shared capability boundaries.
- **Build and test tooling:** Upgrade to TypeScript 7, modernize the Jest/Babel toolchain, add production/test type checks, expand E2E coverage, and align dependency lockfiles.
- **Deployment configuration:** Separate beta, staging, and production feature configuration and make release publication the only automatic deployment trigger.
- **Maintenance dependencies:** Keep frontend, server, test, and build dependencies current through regular automated updates.
- **Pricing copy:** Consolidate the free/premium boundary into one shared copy contract used by Pricing, Account, and Cloud Library, and remove repeated explanatory sentences and duplicated plan-card summaries.

#### Fixed

- **Forecast reliability:** Repair legacy serialized map shapes, auto-categorical restoration, export sizing, map popup teardown, keyboard shortcuts, and Safari Firestore sleep/reconnect behavior.
- **Import hardening:** Bound and schema-validate imported forecast files (size, nesting, arrays, features, strings, and coordinates) before any state mutation, with supported geometry types and finite coordinates enforced at every import entry point.
- **Auto-categorical integrity:** Prevent silent geometry loss during categorical derivation by replacing partial union/hatching fallbacks with explicit failures that preserve the last known-good result and surface an editor-visible recovery banner.
- **Monitoring and data products:** Stabilize radar/satellite refresh, alert and storm-report display, cached TSTM readiness, and source metadata handling.
- **Hosted safety:** Harden Firestore authorization, premium entitlement writes, Stripe replay handling, account deletion races, deployment configuration validation, and rate limits.
- **Map reliability:** Vendor runtime boundary datasets (US states, countries, lakes) under `public/geodata` with pinned checksums and single-source routing so mutable upstream branch URLs can no longer alter the product without a release.
- **Error reporting:** Filter known browser telemetry noise while preserving actionable application errors, including `TypeError: Failed to fetch` promise-rejection noise from the Firestore realtime transport (GFC-WEB-Q).
- **Deployment safety:** Fail production, beta, and staging deployments when Sentry sourcemap publication is configured but cannot be verified against the Sentry API, and delete local maps only after confirmed success so failed uploads retain recovery artifacts.
- **Build and tooling:** Fix pre-existing TypeScript errors in the outlook constraints and outlook panel probability utilities so `pnpm typecheck` passes on `main`.
- **Tooling:** Split application and tooling TypeScript configs so `typecheck` runs cleanly from a fresh checkout, add a coverage summary and dependency-audit gate to CI, remove blanket coverage exclusions for covered map and hosted-cloud files, and document the coverage-exclusion inventory.
- **Accessibility and polish:** Improve toolbar organization, responsive controls, package dialogs, custom-product editing, and forecast map controls.
- **License compliance:** Define an allowed/review-required/prohibited dependency-license policy, generate a reproducible `THIRD_PARTY_NOTICES.md` from root, server, and Python dependencies, and enforce it in CI.
- **Status schema hardening:** Make public capability/status responses explicit allowlisted DTOs with schema-snapshot tests that fail on accidental field additions, and document which fields are monitoring-safe versus authenticated diagnostics.
- **Editor responsiveness:** Move auto-categorical geometry derivation behind a cancellable Web Worker with request/version tracking so stale responses cannot overwrite newer edits, the editor stays responsive during expensive geometry work, and the last known-good result is preserved on failure or timeout.
- **Bundle size:** Lazy-load heavy feature routes so the application shell loads independently from the map/editor and secondary workflow chunks, split vendor families into separate chunks, and enforce an entry-chunk budget in CI.
- **Session restore:** Make restore idempotent by keying it to the user scope so React Strict Mode and remounts cannot reapply the same payload or fire duplicate notifications, bound the toast queue, keep mobile toasts clear of the forecast toolbar, and preserve live-region semantics.
- **Monitor resilience:** Harden reference-layer attribution, z-ordering, retry/backoff, stale and malformed-source states, Sentry filtering, and phone layouts.
- **Discussion editing:** Introduce a local `datetime-local` formatter/parser pair so validity times are displayed and persisted in the user's local wall-clock time instead of being shifted through UTC.
- **Dialog accessibility:** Consolidate custom dialogs on one hardened focus-trap behavior (trapped Tab/Shift+Tab, initial focus, focus restore, Escape, background isolation), associate discussion validity/forecaster fields with accessible labels, and add primary `h1` landmarks to forecast, verification, and monitor routes.
- **Same-day verification:** Route current-day SPC storm reports to the live `today.csv` feed instead of the not-yet-published dated archive, so in-event grading no longer fails for forecasts dated today.
- **Selector stability:** Return shared immutable empty outlook data from forecast selectors so repeated selection against unchanged state yields the same reference and avoids avoidable renders and selector-stability warnings.
- **Previous-day verification:** Route the previous calendar day's SPC storm reports to the live `yesterday.csv` feed, closing the same publication-window gap for forecasts dated the day before today.
- **SPC report-day routing:** Align report-source selection and reached-date gating with SPC's 1200Z–1159Z report window instead of the browser's local calendar boundary.

#### Security and operations

- Use immutable action references, protected reviewer gates, shell-safe branch handling, frozen dependency installs, pinned deployment host keys, concurrency controls, and explicit release validation.

#### Architecture

- **Deterministic Redux transitions:** Remove clock, storage, and DOM reads from forecast/theme/custom-product reducers. Timestamps are stamped onto action meta by a store middleware, and theme/workflow-active persistence moved into store subscriptions. Replaying the same action sequence from the same state now produces deeply equal output.
- **Forecast map styling seam:** Extract the pure OpenLayers styling, feature identity, and base-map source helpers out of `OpenLayersForecastMap.tsx` into `src/components/Map/openLayersMapStyles.ts`, with focused unit tests and documented ownership/dependency direction.

#### Performance

- **Forecast snapshot cloning:** Reduce recursive forecast feature clone allocations used by history snapshots while preserving deep-copy behavior.
- **Forecast map synchronization:** Reconcile OpenLayers forecast layers incrementally by stable feature ID, preserving unchanged feature identity and avoiding full rehydration.
- **SPC storm report parsing:** Reduce allocations in shared SPC storm-report CSV tokenization and traverse `today.csv` sections in a single pass.
- **Cloud library efficiency:** Store forecast payloads in a dedicated `cloudCycles/{id}/payload` subcollection so library listings and realtime subscriptions never download payload content, and replace the tenancy-wide Firestore storage scan with bounded server-side aggregate queries.

### Stable 1.6.x hotfixes

<!-- Production hotfix entries only. Do not put next-major work in this lane. -->

#### Fixed

- **GFC-WEB-P Sentry noise:** Filter no-stack `AbortError` DOMException promise-rejection noise from the Firebase SDK's IndexedDB heartbeat storage before it reaches Sentry, even when breadcrumbs are present, while preserving actionable exceptions.

## v1.6.6

### Dependencies
<!-- dependabot-automation -->

- **uuid:** ^14.0.0 → ^14.0.1

### Security
- **Dependency vulnerability remediation:** Upgraded `protobufjs` to 7.6.4 across the browser and analytics server dependency graphs, `js-yaml` to 4.2.0 in test tooling, and `ws` to 8.21.0 in jsdom tooling to resolve Dependabot denial-of-service and schema-name collision advisories.
## v1.6.4

### Fixed
- **OpenLayers map stability (GFC-WEB-5, GFC-WEB-9, GFC-WEB-C):** Completed the Monitor map popup fix by rendering NWS alert overlays imperatively instead of portaling React into OpenLayers-moved DOM nodes. Hardened map teardown order and marked map shells `notranslate` so Chrome auto-translate is less likely to trigger `removeChild` errors on forecast, verification, and monitor maps.
- **Build dependency security (Dependabot #128 and #129):** Replaced the transitive `esbuild` 0.27.x installation with an explicit patched `esbuild` 0.28.1 development dependency and added a `pnpm.overrides` guard to prevent the vulnerable resolution from returning.

## v1.6.1

### Dependencies
- **qs:** ^6.14.2 → ^6.15.2 (override; `server` and root)

### Fixed
- **GFC-WEB-B (Auth Persistence):** Explicitly set `browserLocalPersistence` for Firebase Auth to prevent session drops.
- **GFC-WEB-A (Firestore Sync):** Aggressive background network disconnection now waits for pending writes and uses a serialized transition pattern to prevent race conditions.
- **qs DoS in `stringify` (Dependabot #125):** Bumped `qs` to `^6.15.2` in root and analytics server to resolve the array-format DoS vulnerability.

## v1.6

### Dependencies
<!-- dependabot-automation -->

- **express-rate-limit:** ^8.5.1 → ^8.5.2 (`server`)
- **express:** ^4.21.2 → ^5.2.1 (`server`)
- **stripe:** ^22.1.1 → ^22.2.0 (`server`)
- **@types/node:** ^25.5.0 → ^25.9.1
- **@types/react-dom:** 18.2.18 → 19.2.3
- **immer:** ^11.1.4 → ^11.1.8
- **react-redux:** ^9.2.0 → ^9.3.0
- **react-router-dom:** ^7.15.1 → ^7.16.0
- **rollup:** >=4.60.4 → >=4.61.0
- **@babel/core:** ^7.29.0 → ^7.29.7
- **@babel/preset-env:** ^7.29.2 → ^7.29.7
- **@babel/preset-react:** ^7.28.5 → ^7.29.7
- **@babel/preset-typescript:** ^7.28.5 → ^7.29.7
- **ts-jest:** ^29.4.9 → ^29.4.11
- **vite:** ^8.0.14 → ^8.0.16
- **@sentry/react:** ^10.53.1 → ^10.56.0
- **@types/react:** 19.2.15 → 19.2.16
- **firebase:** ^12.12.0 → ^12.14.0
- **lucide-react:** ^1.16.0 → ^1.17.0
- **react:** ^19.2.6 → ^19.2.7
- **react-dom:** ^19.2.6 → ^19.2.7
- **web-vitals:** ^5.2.0 → ^5.3.0
- **@sentry/node:** ^10.53.1 → ^10.56.0 (`server`)

### Added
- **Monitor (`/monitor`):** Live weather workspace with radar and satellite WMS layers (site and composite modes, opacity, animation speed), read-only overlay of the active forecast cycle / saved local cycles / premium cloud library outlooks, NWS watches-warnings-advisories layer, and storm reports with hazard filters plus optional outlook-type matching. Redux `monitorSlice`, `MonitorControls` / `MonitorMap`, premium settings sync via `usePremiumMonitorSettingsSync`, and navbar route with shortcut.
- **Monitor — NWS alerts & storm reports:** `useMonitorNwsAlerts` and `useMonitorStormReports` integrations, panel toggles, and map rendering for alert polygons and report markers.
- **Monitor — outlook on map:** `buildMonitorOutlookOptions`, cloud outlook fetch hook, and OpenLayers outlook layer styling aligned with forecast outlook types.
- **What's New page:** Public `/updates` route with v1.6 copy in `src/content/updates/v1.6.ts` and screenshot directory `public/updates/v1.6/` (hero promo image and section screenshots as assets are added).
- **What's New navigation:** Navbar Resources overflow menu links to `/updates` so the release page is discoverable without typing the URL.
- **What's New images:** Release screenshots open in a full-size lightbox when clicked so promo and section images remain readable on narrow layouts.

### Changed
- **Release automation:** Post-merge beta bump after `main` releases no longer resets an in-progress beta line when `main` is still on an older stable (e.g. `1.5.3` infra merge while beta stays on `1.6.0-beta.N`). New `X.Y.0-beta.1` only after a real promotion of that line.
- **Alert banner tests:** Repair corrupted `AlertBanner.test.tsx` from release sync (syntax error and broken dismissible test).
- **Analytics server:** Land Express 5 and Stripe Node 22 on beta (`server/analytics.js` / `configureApp`) and shared smoke-test app wiring for CodeQL rate-limit coverage on `/collect`.
- **Alert banner:** Optional `linkUrl` / `linkLabel`, `startsAt` / `expiresAt` scheduling, and `id` on `public/alert-banner.json`; client normalizes config in `alertBannerConfig.ts`. See `docs/alert-banner.md`.


### Fixed
- **Monitor radar/satellite after theme change:** Keep the OpenLayers map mounted when toggling light/dark mode (update basemap tiles only) and re-apply WMS layers on theme changes so satellite and radar imagery no longer disappear or show “Latest time unavailable” until a full page refresh.
- **GFC-WEB-8 (beta routes after `/updates` split):** `BetaAccessGuard` forwards `AppLayout` outlet context so home, forecast, and other guarded routes can destructure `addToast` again.
- **Signed-in home (light mode):** Primary gradient “Resume Forecast” buttons use white text instead of `#067aff` on the concept home layout (`.home-concept-top-primary`, `.home-concept-action-primary`).
- **Analytics server tests:** Share `configureApp` with production so `/collect` stays rate-limited in server smoke tests (fixes CodeQL `js/missing-rate-limiting` on `beta`).
- **Analytics server (beta):** Restored a broken partial merge in `server/analytics.js` so the hosted collector starts again before Express 5 / Stripe 22 land.
- **Stripe subscription webhooks:** Read `current_period_end` from subscription items for Stripe API 2025-03-31+ (stripe-node v22) with fallback for older payloads.
- **Map layer transparency:** Restored `transparencyScale` on forecast map fill/stroke opacity after the main sync dropped the multiplier (fixes CI on `beta`).
- **OpenLayers popups:** Avoid `removeChild` NotFoundError when React popup nodes are moved during map teardown.
- **Forecast keyboard shortcuts (GFC-WEB-3):** Ignore `keydown` events where the browser omits `KeyboardEvent.key` (Sentry on `/forecast`) instead of throwing when normalizing the key for shortcuts. Centralized the guard in `keyboardShortcutKey` and applied it to forecast, navbar, and day-selector shortcuts.
- **Safari overnight IndexedDB disconnects:** Switched hosted Firestore to an in-memory local cache so Safari/macOS sleep no longer hits WebKit’s “Connection to Indexed Database server lost” error from Firestore’s default IndexedDB persistence. Pauses Firestore network sync while the tab is hidden and resumes it on wake to reduce failures on long-lived forecast editor tabs.
- **GFC-WEB-6 (auto-save/export crash):** Added runtime guards in `mapToArray` and `arrayToMap` so `serializeForecast`/`deserializeForecast` return fallback values instead of crashing when `OutlookData` Map fields are plain objects at runtime.
- **GFC-WEB-7 (auto-categorical crash):** Coerce legacy plain-object probability maps to `Map` before auto-categorical iteration so `/forecast` no longer throws `forEach is not a function` when loading old saved cycles from localStorage.
## v1.5.3

### Changed
- **Privacy policy v1.2.0:** Added a clear disclosure for hosted error monitoring (Sentry): what is collected, what is not (no session replay, no default IP/cookie payloads, forecast contents not sent in breadcrumbs), and separate production vs beta environments.
- **In-app privacy modal:** Bumped to v1.2.0 with the same Sentry disclosure; users who accepted an older policy version will be prompted to accept again on next visit.
- **Hosted error monitoring (Sentry):** Production and beta now use the same privacy-safe SDK settings — `sendDefaultPii: false`, session replay disabled, browser SDK routed through `/api/sentry-tunnel`, and server tunnel validation against the web project DSN (`SENTRY_BROWSER_DSN`).
- **Analytics server:** Node Sentry init uses `sendDefaultPii: false`; deploy workflows set `SENTRY_BROWSER_DSN` from the web DSN secret so the tunnel accepts browser envelopes in the recommended two-project setup.
- **Version:** Bumped package version to `1.5.3`.

### Fixed
- **Sentry tunnel security:** Removed client-controlled ingest URLs and query-string forwarding; malformed envelope bodies return 400 instead of 500.

## v1.5.2

### Fixed
- Fixed the primary button on the signed-out Home Page being incorrectly white/blank
- Fixed an issue where you couldn't export an outlook as an image

## v1.5.1

### Fixed
- Fixed an issue where maps wouldn't render on Chromebooks
- Updated package version to v1.5.1
- Removed old beta selector from account screen

## v1.5.0

### Dependencies
<!-- dependabot-automation -->

### Changed
- **PR governance labels:** Content labels are diff-applied (no strip/re-add churn); `ci:*` labels aggregate all check runs on the PR head and only change when the overall state changes.
- **Post-merge beta version:** `computeBetaVersionAfterMainRelease` preserves in-progress beta prereleases when `main` is on an older stable line; bump script accepts pre-merge beta version and restores `package.json` after `main` merge; skips duplicate beta GitHub releases when unchanged.
- **Timed production rollout:** `deploy/production-release.json` drives stage-vs-live deploys; staged builds land under `releases/<version>/` until `rolloutAt`, then VPS cron runs `promote-release.sh`. Staging preview at `staging-gfc.weatherboysuper.com` (beta access gate). See `docs/hosted-rollout.md`.
- **Dependabot grouping:** Root and `server/` npm version updates are combined into one multi-ecosystem Dependabot PR targeting `beta` instead of one PR per package; `target-branch` is set on the `npm-beta` group (required by Dependabot when using multi-ecosystem groups).
- **Post-merge `release/*` → main:** Automation now merges `main` into `beta` after every `release/*` merge (same as `feature/release-*`), not only when `package.json` changes — prevents beta from drifting behind main.
- **Porting vs post-merge:** PR porting no longer opens `port/* → beta` when post-merge automation already syncs `main` into `beta` (beta promotion, `release/*`, and `feature/release-*` merges). CI fails redundant `port/* → beta` PRs so duplicate port work cannot merge.
- **GitHub Releases on every version bump:** Post-merge automation now publishes a release whenever `package.json` changes — stable tags on `main` (promotion, hotfix, release branch, bootstrap backfill) and prerelease tags on `beta` after each `-beta.N` integration merge.
- **Release automation:** Beta → main stays a normal PR; merge triggers stable versioning on `main`, GitHub Releases from CHANGELOG (including hotfixes), and beta prerelease bumps. CI enforces branch routing (preferred `feature/*`/`fix/*` → beta; only `hotfix/*` blocked on beta), changelog checks, and automated PR labels. Workflow definitions ship on `main` so GitHub can run them for repository pull requests.
- **Post-merge bootstrap:** `feature/release-*` → `main` syncs automation to `beta`, backfills the stable GitHub Release for `main`, starts the next `-beta.N` line, and publishes the first prerelease; manual `workflow_dispatch` recovery when bootstrap was missed.
- **Dependabot:** Version update PRs for root and `server/` npm ecosystems target `beta` (not `main`). **Dependabot changelog** workflow maintains `### Dependencies` under `[Unreleased]`; CI validates those bullets instead of skipping changelog checks.

## v1.5.2

### Fixed
- Fixed the primary button on the signed-out Home Page being incorrectly white/blank
- Fixed an issue where you couldn't export an outlook as an image

## v1.5.1

### Fixed
- Fixed an issue where maps wouldn't render on Chromebooks
- Updated package version to v1.5.1
- Removed old beta selector from account screen

## v1.5.0

### Changed
- **Forecast Page nitpicks:** Fixed UI alignment on the forecast Draw tab (spacing for sections/menus and Current Selection breathing room), ensured the tab bar touches its bottom tray properly, expanded the Cycle Date fields horizontally on the Days tab, improved Ghost Layers labels placement, eliminated duplicated basemap dropdowns favoring the toolbar, standardized tools buttons on the right side to match the new Integrated Toolbar format, and gave map control buttons neutral hover colors.
- **Home forecast workspace:** Refined the current cycle card with clearer header hierarchy, stronger status/date chips, and more balanced day and utility action tiles to reduce the cramped feel in the landing page layout.
- **Discussion editor:** Neutralized colored toolbar button backgrounds in light mode for the DIY editor toolbar and leveled/centered the DIY/Guided tabs to fix alignment issues (files: src/pages/DiscussionPage.css, src/pages/DiscussionPage.tsx, src/components/DiscussionEditor/DIYDiscussionEditor.tsx).
- **Verification header:** Compacted the verification header to reduce vertical space usage and increase map/controls visible area (file: src/components/VerificationMode/VerificationMode.css).
- **Developer:** Documented local beta dev workflow and the local beta bypass option in README.md to allow running beta features locally without hosted Firebase credentials.
- **Version bump:** Updated version to `1.5.0-beta.1` for the upcoming `v1.5.0` beta release.

### Fixed
- **Dependency/security cleanup:** Updated the Firebase/OpenLayers dependency tree and server admin stack to address the reported Dependabot vulnerabilities in protobufjs, lodash, protocol-buffers-schema, and `@tootallnate/once`.
- **Lucide brand icons:** Replaced Lucide brand icon usage with inline SVGs so the UI no longer depends on Lucide's removed brand set.
- **Unused dependency cleanup:** Removed stale geoman/react-leaflet dependencies and corresponding export-only selectors that no longer matched the codebase.
- **Map export guard:** Blocked image export on OpenLayers maps and surfaced a clear warning instead of attempting the old Leaflet export path.

## [1.4.0] - 2026-04-03

### Added
- **Hosted accounts and entitlements:** Added Firebase-backed account profiles, hosted sign-in, premium entitlements, and account management flows for the `v1.4.0` hosted release.
- **Cloud forecast library:** Added hosted cloud save/load support, a dedicated cloud library page, toolbar cloud actions, and read-only handling for expired premium users.
- **User metrics and admin dashboard:** Added progress-style account metrics, aggregate admin metrics, and a hidden admin dashboard for hosted beta operations.
- **Closed beta access flow:** Added beta-only access gating, invite onboarding, beta account activation, and deployment-specific beta access checks.

### Changed
- **Cloud hosted forecasts:** Moved cloud forecast storage out of `userSettings` into a dedicated `cloudCycles` collection so forecast payloads have a long-term home separate from profile preferences.
- **Pricing and account experience:** Refined the hosted pricing, account, billing, and cloud surfaces to match the newer card/surface design language used across the app.
- **Forecast toolbar styling:** Rebalanced the forecast utility toolbar layout and brought the cloud save/cloud library buttons back into the same visual system as the rest of the tool buttons, including dark-mode compliant color treatments.
- **Map layer rendering:** Promoted the elevated vector/reference-layer basemap treatment into the released map stack and standardized released outlook fill rendering around the new layer model.
- **Beta deployment flow:** Updated the beta and production deployment workflows to support hosted env configuration, separate beta/prod webhook secrets, and a dedicated beta backend process.
- **Privacy disclosures:** Updated the privacy policy and in-app privacy modal to reflect hosted sync, billing metadata, beta metrics, and operational logging behavior.

### Fixed
- **Billing route throttling:** Added explicit rate limiting to the Stripe billing checkout, portal, and webhook endpoints so authorization-bearing billing routes are consistently protected.
- **Cloud library UX:** Rebuilt the cloud library page and save dialog into clearer operational surfaces and corrected toolbar integration issues around cloud actions.
- **Beta backend loading:** Fixed server env loading for deployed hosted backends so colocated server `.env` files are respected on VPS deployments.
- **Closed beta activation:** Fixed beta access routing and deployment wiring so invite claims, billing config, and other hosted `/api/*` routes can reach the beta backend correctly.
- **Toolbar color consistency:** Corrected recent cloud-toolbar light/dark mode regressions so the hosted cloud actions follow the same custom toolbar color standards as the rest of the forecast tools.
- **Day 3 Total Severe colors:** Corrected the Day 3 `5%` Total Severe color back to the intended brown styling instead of the incorrect green treatment.

## [1.3.0] - 2026-03-24

### Added
- **Ghost overlays:** New overlay type that shows previous outlooks as semi-transparent ghosts on the map for comparison. Toggle visibility in the toolbar, with ghost overlays defaulting to off.
- **Verification storm report windows:** Added support for loading both today's and yesterday's storm reports in the Verification panel.
- **Alert banner system:** Added configurable alert banner with info/warning/error types and dismissible behavior.

### Fixed
- **Per-day undo/redo:** Undo and redo history now persists correctly when switching between forecast days.

## [1.2.0] - 2026-03-15

### Added
- **Forecast undo/redo:** Added undo and redo controls to the forecast page toolbar, along with standard keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, and `Ctrl/Cmd+Shift+Z`) for reversible drawing edits.

### Fixed
- **Porting automation:** Updated the internal PR porting workflow so it cherry-picks only the original merged PR commits and cleans up temporary `port/*` branches after their PRs close, which keeps branch synchronization cleaner and avoids noisy port PRs.
## [1.1.0] - 2026-03-07

### Fixed
- **Discussion auto-save:** Discussion editor changes now auto-save after a short debounce by syncing local editor state back to Redux, which ensures the existing global auto-save-to-localStorage flow captures discussion updates even without clicking Save.
- **Verification storm reports:** Prevented same-day NOAA storm report fetch attempts (which often return 404 before archive publication) by detecting local "today" and showing an informational message instead of a fetch error. Also added a distinct info-state message style for "no reports found" and same-day availability notices.
- **Export (dark mode):** Fixed issue where map exports could render as a blank (black) image in dark mode. Root cause was an OpenLayers canvas being tainted by tile images requested without CORS. The fix sets `crossOrigin: 'anonymous'` on OpenLayers `OSM`/`XYZ` sources, ensures cloned images request CORS during export, and waits for the OpenLayers `rendercomplete` / tile load before capturing with `html2canvas`. Verified on branch `fix/blank-dark-mode-export`.
- **Export warnings:** Added a console warning and an on-screen export banner (for live exports) when map tiles/images fail to load before capture, so users and developers can tell when the issue is network-related rather than a bug. Verified during manual export tests.
- **Layer ordering (forecast + verification maps):** Added top overlay layers so state outlines and map labels/city names render above outlook polygons, improving readability when polygons cover dense areas.
- **Polygon snapping:** Added OpenLayers Snap interactions for both probabilistic and categorical sources so drawing and editing can snap to existing vertices/segments (disabled only in delete mode).

## [1.0.0] - 2026-03-01

### Added
- **Focus trap in modals:** Tab/Shift+Tab cycles focus within CycleHistoryModal and CopyFromPreviousModal; first focusable element auto-focused on open.
- **In-app documentation:** 4-tab help panel (Overview, How to Use, Outlook Types, Categorical Conversion) accessible via the Help (?) button in the Navbar.

### Changed
- All `window.alert()` calls replaced with toast notifications app-wide (8 calls across 3 components).
- `FileReader.onerror` handlers added to file import flows for proper error feedback.
- `OutlookPanel` component removed (dead code — superseded by `IntegratedToolbar` + `OutlookSelectorPanel`).
- Version bumped to stable 1.0.0.

## [0.11.0-beta] - 2026-02-25

### Added
- **Cycle Management:**
  - Save named forecast cycles with optional labels (e.g., "Morning", "00Z").
  - Cycle history browser — view, load, or delete any saved cycle.
  - Copy features between cycles or days (e.g., yesterday's Day 2 → today's Day 1).
  - Cycle history persists to localStorage (`gfc-cycle-history`) and hydrates on app load.
- **Discussion Editor:**
  - Two-tab system: Edit and Preview modes.
  - DIY mode: plain text editor with formatting toolbar.
  - Guided mode: question-based builder walking through synopsis, threats, and confidence.
  - Export discussion as `.txt` in GFC style (no aviation jargon, no official terminators).
- **Map Migration:**
  - Migrated from Leaflet/Geoman to OpenLayers for map rendering and drawing.
  - Map tile source swaps between Standard/Light/Satellite/Terrain/Dark styles.
  - Dark mode auto-switches the base layer to CartoDB Dark.
- **Export Package:**
  - ZIP download containing forecast JSON + discussion text + map image.
  - Export loading feedback on the image export button.
- **Verification:**
  - Isolated `verificationSlice` prevents cross-contamination when verifying old cycles while editing.
  - Statistics fix: storm reports counted only at the highest containing risk level (no double-counting).
  - Visual hit/miss overlay for tornado, wind, and hail reports.

### Changed
- App branding: `<title>` and manifest updated to "Graphical Forecast Creator" / "GFC".
- `OutlookDaySelector` completely rewritten with CSS variables — was hardcoded dark regardless of theme.
- Duplicate localStorage hydration on startup removed; `ForecastPage.tsx` is the sole authority.
- All debug `console.log` / `console.error` removed from production code across 14+ files.
- Full dark mode coverage for all UI panels (VerificationMode, VerificationPanel, DrawingTools, ExportModal, OverlayControls, Toast, Documentation, OutlookDaySelector).

## [0.10.0-alpha] - 2026-01-30

### Added
- **Snapshot Export:**
  - Export current map view to PNG via `html2canvas`.
- **Map Styles:**
  - Map style selector in toolbar: Standard (OSM), Light, Dark, Satellite (Esri), Terrain (OpenTopoMap).
- **Re-implemented Map Overlays:**
  - Migrated state/county/CWA overlays to OpenLayers GeoJSON layers.

## [0.9.0-alpha] - 2026-01-30

### Added
- **Forecast Discussion Editor:**
  - Dedicated discussion editor accessible from the toolbar.

## [0.8.0-alpha] - 2026-01-30

### Added
- **Verification Tools:**
  - "Storm Report Upload" — import NOAA storm report CSV archive by date.
  - Plot tornado (red triangles), wind (blue squares), and hail (green circles) reports over the outlook.
  - Visual hit/miss check against drawn risk areas.

## [0.7.0-alpha] - 2026-01-30

### Added
- **Categorical Logic:**
  - Risk category selector: TSTM, MRGL, SLGT, ENH, MDT, HIGH.
  - Dynamic polygon colors and labels per category.
  - Auto-categorical logic: categorical risk derived from tornado/wind/hail probabilistic outlooks.

## [0.6.0-alpha] - 2026-01-30

### Added
- **Map Overlays:**
  - State borders overlay (GeoJSON).
  - County/CWA boundaries overlay (GeoJSON).
  - Toggle controls for overlay visibility.

## [0.5.0-alpha] - 2026-01-30

### Added
- **Forecast Cycle Workflow:**
  - Day 3 outlook support (totalSevere + categorical).
  - Day 4–8 outlook support (probabilistic only — 15%, 30%).
  - Day navigation: switch between Day 1–8 active outlook sets.
  - Schema supports importing older-day data into newer-day format (e.g., Day 4 → Day 3 style).
  - `Import JSON` functionality — re-upload a saved file to populate map with editable polygons.
  - Version migration handling for schema changes between releases.

## [0.4.0-alpha] - 2026-01-30

### Added

- **Load System:**
  - Implemented importing forecasts from JSON files (`.json`).
  - Added "Load Forecast" button to the toolbar.
  - Implemented automatic session restoration (auto-load) from LocalStorage on startup.
- **Map Styles:**
  - Added support for multiple base map layers.
  - Included styles: Standard (OSM), Light (Carto), Dark (Carto), Satellite (Esri), and Terrain (OpenTopoMap).
  - Added layer control to switch between styles.
- **Persistence:**
  - Added `useAutoSave` hook to automatically save work to LocalStorage every 5 seconds.
- **Save System:**
  - Defined JSON schema for GFC outlook data (`GFCForecastSaveData`).
  - Implemented `exportForecastToJson` utility to download forecasts.
  - Added schema validation (`validateForecastData`) to ensure data integrity.
- **Auto-save:**
  - Integrated auto-save logic (initially part of v0.4.0 scope, refined in v0.5.0).

### Changed

- Refactored `DrawingTools` to handle file input for loading.
- Updated `App.tsx` to manage save/load workflows using new utility functions.
- Renamed "Save Forecast" action to perform a file export (JSON).

## [0.3.0-alpha] - 2026-01-30

### Added

- **New Outlook Format:**
  - Implemented support for the updated convective outlook format (effective March 2026).
  - Added "Hatching" as a separate property/layer per probability type (Tornado, Wind, Hail).
  - Added CIG levels (CIG1, CIG2, CIG3) with specific hatching patterns.
  - Updated color mappings and categorical conversion logic (`useAutoCategorical`) to use geometric intersection with `@turf/turf`.
- **UI Updates:**
  - Updated `OutlookPanel` to support CIG selection.
  - Updated `Legend` to display mixed probability and hatching keys.
  - Removed legacy "Significant" toggle in favor of specific probability/hatching selection.

### Fixed

- Fixed bug where hatching patterns would replace fill colors (implemented as separate layers/ordering).
- Fixed categorical conversion logic to correctly account for hatching overlays.
- Fixed `SLGT%` label issue in tooltips.

## [0.2.0-alpha]

### Changed

- Switched mapping library to `@geoman-io/leaflet-geoman-free` for better drawing controls.
- Enabled polygon editing, cutting, and removal.

## [0.1.0-alpha]

### Added

- Initial project setup with React, TypeScript, and Redux Toolkit.
- Basic Leaflet map integration.
- Basic layer toggling.
