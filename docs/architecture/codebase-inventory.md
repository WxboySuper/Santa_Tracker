# Codebase Inventory

Issue: [#445](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/445)
Parent tracker: [#428](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/428)
Snapshot branch: `docs/issue-445-codebase-audit` from `origin/beta` on 2026-07-02.

## Purpose

This is the current-state audit for repository organization. It documents folder purpose, entry points, shared dependencies, import risks, and reviewable move batches. It does not move product code or change runtime behavior.

## Major Folders

| Folder | Purpose | Current owner |
|--------|---------|---------------|
| `src/root` | App bootstrap, app shell routing, global test setup, Sentry instrumentation, styles. | Application shell |
| `src/pages` | Route-level page composition for home, forecast, discussion, verification, monitor, beta, account, pricing, admin, updates, and diagnostics. | Application shell with feature page owners |
| `src/components` | UI components plus substantial feature implementation for forecast editor, map, monitor UI, verification UI, cycle manager, Auto-TSTM, beta guard, and shared UI primitives. | Mixed; largest migration target |
| `src/store` | Redux store and slices for forecast, overlays, storm reports, app mode, theme, verification, and monitor state. | Shared state |
| `src/hooks` | Cross-page workflow hooks for auto-save, categorical derivation, Firestore recovery, Auto-TSTM apply/generation, cloud cycles, keyboard shortcuts, and monitor data loading. | Shared workflow logic |
| `src/utils` | Serialization, export/import, geometry, forecast metrics, Auto-TSTM request helpers, analytics, keyboard labels, and persistence helpers. | Shared utilities, with some feature-owned logic |
| `src/monitor` | Monitor domain data, WMS/radar/satellite configs, NWS alerts, storm reports, outlook layers, settings normalization, and live layer hooks. | Monitor feature |
| `src/config` | Build target, feature exposure registry, feature surfaces/navigation, product exposure selectors, Firebase/Sentry/GA config, and runtime capability status. | Platform/config |
| `src/features` | Feature boundary wrappers for exposure-gated and server-backed features. | Platform/config |
| `src/auth` and `src/billing` | Hosted auth provider, entitlement provider, and hosted-mode tests. | Hosted account/billing |
| `src/types` and `src/maps` | Shared type contracts and map adapter contracts. | Shared contracts |
| `server/root` | Express analytics app, beta/auth/billing/capability/metrics/Sentry/Auto-TSTM route registration, config loading, and server tests. | Analytics/API server |
| `server/lib` | Server-side capability, production release, deployment target, emergency disable, and shared server helpers. | Server platform |
| `server/release` | VPS rollout cron and live-promotion helpers. | Release operations |
| `server/weather` | Weather generation and Auto-TSTM support files. | Weather/Auto-TSTM |
| `scripts/root` and `scripts/lib` | Version, changelog, PR governance, feature-exposure, release, stale-branch, and porting automation. | Repository automation |
| `.github` | Workflows, PR templates, Copilot instructions, and porting shell automation. | CI/release automation |
| `deploy` | Deployment target and production release configuration. | Release operations |
| `e2e` | Playwright smoke tests and fixtures. | End-to-end validation |
| `docs` | Active architecture, operations, product, release, and review-removal documentation. | Documentation |

## Public Entry Points

- Frontend bootstrap: `src/index.tsx` creates the React root, wires Sentry React handlers when enabled, initializes cycle history persistence, renders `App`, and records a page view.
- App shell and route table: `src/App.tsx` owns provider composition, launch/coming-soon gate, beta access guard, route registration, and feature-gated lazy routes.
- Feature exposure: `src/config/featureExposure.ts`, `src/config/featureSurfaces.ts`, `src/config/featureNavigation.ts`, `src/routing/buildFeatureGatedRoutes.tsx`, and `src/features/*Boundary.tsx`.
- Redux state: `src/store/index.ts` exports the configured store, `RootState`, and `AppDispatch`; slices remain the practical write surface for feature state.
- Forecast editor surface: `src/pages/ForecastPage.tsx` composes the editor workflow from `components/ForecastWorkspace`, `components/Map`, `components/DrawingTools`, `components/CycleManager`, hooks, store, and utils.
- Monitor surface: `src/pages/MonitorPage.tsx`, `src/components/Monitor/*`, and `src/monitor/*` jointly own monitor data, controls, OpenLayers sync, and popup rendering.
- Server API: `server/analytics.js` boots the analytics server; `server/analytics-app.js` composes beta, billing, capability, metrics, Sentry tunnel, and Auto-TSTM routes.
- Deployment/release automation: `.github/workflows/ci.yml`, `.github/workflows/deploy-main-to-vps.yml`, `.github/workflows/pr-governance.yml`, `scripts/*`, and `server/release/*`.

## Static Analysis Snapshot

Read-only scan scope: `src`, `server`, `scripts`, `.github`, `deploy`, and `e2e`. It found 591 files in scope. Code/import files were scanned for relative `import`, dynamic `import()`, and `require()` edges.

Largest owner/file counts:

| Owner | Files |
|-------|------:|
| `src/components` | 155 |
| `src/utils` | 57 |
| `scripts/lib` | 50 |
| `src/pages` | 44 |
| `scripts/root` | 33 |
| `src/monitor` | 31 |
| `server/root` | 21 |
| `src/hooks` | 20 |
| `server/lib` | 19 |
| `src/config` | 15 |
| `src/store` | 13 |
| `.github/workflows` | 12 |

Highest cross-owner import edges:

| Edge | Count | What it means |
|------|------:|---------------|
| `src/components -> src/store` | 55 | Feature components mutate/read global state directly instead of through feature APIs. |
| `src/pages -> src/components` | 49 | Route pages are thin composition surfaces, but they depend on many component internals. |
| `src/components -> src/monitor` | 47 | Monitor UI and monitor domain logic are split across two owners. |
| `scripts/root -> scripts/lib` | 45 | Healthy automation entrypoint-to-library pattern. |
| `src/components -> src/types` | 36 | Shared outlook/cloud/TSTM types are consumed broadly. |
| `src/pages -> src/store` | 31 | Pages still reach directly into slices/selectors. |
| `src/components -> src/utils` | 26 | Utilities are a shared dependency and include feature-specific helpers. |
| `src/components -> src/lib` | 24 | Shared UI/helpers are used from feature components. |
| `src/hooks -> src/utils` | 19 | Hooks wrap utility/domain helpers, especially Auto-TSTM and persistence. |
| `src/hooks -> src/types` | 17 | Hooks depend on shared contracts. |

Mutual owner edges worth untangling before moves:

- `src/components <-> src/monitor`
- `src/components <-> src/pages`
- `src/components <-> src/hooks`
- `src/monitor <-> src/store`
- `src/store <-> src/utils`
- `src/root <-> src/pages`
- `src/root <-> src/store`
- `src/config <-> src/features`
- `src/config <-> src/pages`
- `src/lib <-> src/utils`
- server test helpers have expected mutual edges with `server/root` and `server/lib`.

## Risks And Cycles

- `src/components` is both a shared UI library and a feature implementation bucket. Moving anything out of it needs owner-by-owner batches, not broad folder shuffles.
- Monitor ownership is split between `src/monitor` domain modules and `src/components/Monitor` OpenLayers/UI modules. `src/monitor` also imports layout context from components, which creates a feature-to-UI back edge.
- App routes live directly in `src/App.tsx`; this keeps route behavior visible but makes the app root depend on pages, beta guard, layout, config, store, and feature routing at once.
- `src/store` imports `src/utils` for normalization and persistence-adjacent helpers, while utilities import shared types and sometimes store-facing shapes. Keep reducers pure before extracting feature packages.
- `src/utils` mixes stable shared primitives with feature-specific behavior. Treat every utility as either feature-owned or platform-owned before moving it into a shared destination.
- Tests are interleaved with source files and often create reverse edges in the owner graph. Ignore test-only edges when deciding runtime boundaries, but keep them in mind for move PR blast radius.

## Reviewable Move Batches

These are proposed follow-up batches for #428. Each batch should be a behavior-preserving PR with compatibility exports only when needed.

1. Application shell and routing: move route table and launch/beta gates behind an app-shell boundary, leaving `src/App.tsx` as provider composition.
2. Forecast feature: group `ForecastPage`, forecast workspace, drawing tools, cycle manager, day/outlook controls, forecast-specific hooks, and forecast utilities behind a feature API.
3. Monitor feature: merge `src/monitor` and `src/components/Monitor` ownership, then expose route/page-level APIs instead of cross-importing domain and component internals.
4. Verification feature: group verification page, verification map/panel components, verification slice selectors, and storm-report utilities.
5. Platform/config: keep feature exposure, build target, runtime capability status, and feature boundaries together with explicit public exports.
6. Shared contracts: keep `src/types`, `src/maps/contracts.ts`, and truly generic `src/lib`/`src/utils` helpers small; do not create a dumping-ground `shared` folder.
7. Hosted client/server: isolate auth, billing, metrics, capability status, and analytics API surfaces after feature boundaries stop importing them directly.
8. Automation/release docs: keep `scripts/lib` as the library layer and root scripts as entry points; continue documenting release and porting behavior under `docs/operations`.

## Verification Notes

- The audit used a read-only Node import scan plus direct inspection of app bootstrap, route composition, feature exposure, store setup, and server route composition.
- This document intentionally proposes move order only; it does not authorize deleting compatibility exports or moving runtime code in the #445 PR.
