# GFC-WEB-Q — `TypeError: Failed to fetch` (unhandled rejection) on `/forecast`

**Issue ID:** 7650124388 · **Short ID:** GFC-WEB-Q · **Project:** gfc-web
**Release:** `graphical-forecast-creator@1.6.30` · **Date:** Aug 3, 2026 5:55:15 PM UTC
**Severity:** Low (telemetry noise — no user-visible impact)
**Mechanism:** `auto.browser.global_handlers.onunhandledrejection` · **Handled:** no

## Summary

A `TypeError: Failed to fetch` fired as an **unhandled promise rejection** in the browser
while a user was editing a categorical outlook on the forecast map. This is the standard
browser-level error thrown when a network `fetch()` fails at the transport layer (connection
dropped, Wi-Fi/cellular blip, request interrupted, CORS/blocked). It is **not** an
application logic bug: the app kept working, data remained memory-cached and locally saved,
and Firestore reconnected on its own.

Two facts make this issue a **Sentry reporting gap** rather than a product bug:

1. The failure almost certainly came from the **Firebase/Firestore realtime transport**
   (the webchannel long-poll), which is the only un-caught network work running in the
   session. Every app-level `fetch()` call site is wrapped in `try/catch` (see Evidence).
   The final breadcrumb is a successful Firestore `Listen/channel` request immediately
   before the rejection.
2. The Sentry `beforeSend` noise filter in `src/instrument.ts` does **not** drop this
   event. `Failed to fetch` is missing from `REQUEST_LIFECYCLE_MESSAGES`, and the
   breadcrumb-present check short-circuits the noise filter before it can run.

## What the user did (breadcrumb trail)

All on Chrome OS / Chrome 150, dark mode, production, `/forecast`, outlook type set to
Categorical:

1. `forecast/applyAutoCategoricalSync` dispatched twice — automatic categorical derivation
   ran (Turf geometry work, CPU only).
2. Clicked the map canvas.
3. Clicked the integrated toolbar, then the **Categorical** type button →
   `forecast/setActiveOutlookType`.
4. `forecast/setMapView` twice.
5. Clicked the map canvas again.
6. Firestore `Listen/channel` fetch returned **200** (realtime sync active).
7. Immediately after: unhandled rejection `TypeError: Failed to fetch`.

The actions in steps 1–5 are ordinary forecast editing and contain no network calls. The
only live network connection is the Firestore realtime sync (step 6). A transient network
drop on the Chromebook killed the next long-poll; the Firestore SDK's internal fetch
promise rejected and nothing in the SDK/app attached a handler, so it surfaced through
`window.onunhandledrejection`.

## Root cause analysis

### Why the error is a transport/network failure, not app code

`TypeError: Failed to fetch` is produced by the browser Fetch API when the network request
never completes (no HTTP status). It is distinct from handled app errors. Audit of every
fetch path reachable from `/forecast`:

| Call site | Wrapped? |
| --- | --- |
| `src/utils/tstmGeneration.ts` `requestLatestTstmData` (`/api/tstm/latest`) | Yes — awaited inside `runAutoTstmPreviewFetch` try/catch (`autoTstmPreviewFetch.ts:80`) |
| `src/utils/productMetrics.ts` `/api/metrics/event` | Yes — `catch {}` + `.catch(() => undefined)` |
| `src/billing/EntitlementProvider.tsx` `/api/billing/config` | Yes — `fetchBillingConfig` `catch` |
| `src/components/useAlertBanner.ts` banner JSON | Yes — `.catch` |
| `src/lib/openFreeMap.ts`, `OpenLayersForecastMap.tsx` tile/style fetches | Map already rendered (user clicking canvas), style fetch succeeded earlier; errors surfaced as app `Error`s, not raw `Failed to fetch` |
| Firebase SDK (`@firebase/webchannel-wrapper` + Firestore transport) | **No** — SDK internal promise, outside app control |

The remaining unhandled path is the Firestore transport. The final 200 breadcrumb on the
`Listen/channel` request confirms the realtime listener (cloud-cycle subscription from
`cloudCyclesService.ts` `subscribeToCloudCycles`) was live at the moment of failure.

### Why Sentry accepted the event (the actual defect)

`src/instrument.ts` `isKnownBrowserNoise` / `beforeSend`:

```ts
const REQUEST_LIFECYCLE_MESSAGES = [
  /^(NetworkError: )?A network error occurred\.?$/i,
  /^(AbortError: )?The user aborted a request\.?$/i,
];
```

- **`Failed to fetch` is not in `REQUEST_LIFECYCLE_MESSAGES`.** Prior noise fixes
  (GFC-WEB-K/F/E) covered `A network error occurred.` and `The user aborted a request.`
  but this message variant was missed.
- Even if it were listed, `isKnownBrowserNoise` returns early when the event has
  **any breadcrumbs or stack frames** (`hasActionableContext`, `instrument.ts:82`). This
  event has 9 breadcrumbs, so `beforeSend` always keeps it — the noise path is
  unreachable for any event that occurred during a session with context.

Empirical confirmation (jest test against `beforeSend`):

| Event shape | Before fix | After fix |
| --- | --- | --- |
| `Failed to fetch` + breadcrumbs + SDK stack | KEPT (reported) | DROPPED |
| `Failed to fetch` + breadcrumbs, no stack | KEPT (reported) | DROPPED |
| `Failed to fetch`, no breadcrumbs, no stack | KEPT (reported) | DROPPED |
| `Failed to fetch` + application stack frame | KEPT (reported) | KEPT (reported) |

## Impact

- **Users:** None. No crash, no data loss, no broken flow. Firestore reconnects; forecast
  editing and auto-save are unaffected.
- **Maintainer:** Sentry issue queue noise. Same family as GFC-WEB-K/F/E/H/J, which were
  all filtered in `beforeSend`. GFC-WEB-Q is the `Failed to fetch` variant of that same
  browser-network-noise class.

## Plan

> Status: implementation complete. The filter fix (step 1) ships in this worktree
> (`fix/gfc-web-q-sentry-noise`) with unit tests. Steps 2–3 remain follow-up.

### 1. Fix the reporting gap (implemented)

In `src/instrument.ts`:

- Add the fetch-failure variants to `REQUEST_LIFECYCLE_MESSAGES`:
  - `/^(TypeError: |NetworkError: )?Failed to fetch\.?$/i` covers the raw,
    `TypeError:`-prefixed, and `NetworkError:`-prefixed forms.
- Reorder `isKnownBrowserNoise` so request-lifecycle messages with **no application stack
  frames** are dropped even when breadcrumbs exist, and scope the breadcrumb exemption to
  only the opaque-global-error case. A frame counts as application code when its filename
  does not point into `node_modules/`, `@firebase/`, or the `firebase` package. This
  mirrors the existing "keep matching lifecycle errors with stack frames" test.
- Add unit tests in `src/instrument.test.ts`:
  - drops `Failed to fetch` (no stack, no breadcrumbs)
  - drops `Failed to fetch` (breadcrumbs present, SDK/minified frames only)
  - keeps `Failed to fetch` with an application stack frame (real bug signal)

### 2. Consider reducing Firestore transport unhandled rejections

`useFirestoreSleepRecovery` already pauses/resumes the network on `visibilitychange`
(GFC-WEB-A). It cannot prevent a network drop while the tab is visible. Optional follow-up:

- Wrap the cloud-cycle `onSnapshot` (`cloudCyclesService.ts:613`) and the auth/metrics
  reads so transport failures route into existing `onError` handlers instead of surfacing
  as unhandled rejections. This is best-effort because the SDK transport rejection happens
  outside the listener callbacks.

### 3. Close out the Sentry issue

- Mark GFC-WEB-Q as `No stack`, group it with the existing network-noise issues, or
  resolve-as-expected once the filter ships. It requires no user-facing fix.

## Evidence / files referenced

- `src/instrument.ts` — `REQUEST_LIFECYCLE_MESSAGES`, `isKnownBrowserNoise`, `beforeSend`.
- `src/instrument.test.ts` — existing noise-filter tests for GFC-WEB-K/F/E/H/J.
- `src/hooks/useAutoCategorical.ts` — the only code the breadcrumb trail implicates; pure
  CPU (Turf), no fetch.
- `src/hooks/autoTstmPreviewFetch.ts`, `src/utils/tstmGeneration.ts` — Auto-TSTM fetch,
  correctly error-handled.
- `src/lib/cloudCyclesService.ts` — Firestore `onSnapshot` subscription behind the
  `Listen/channel` breadcrumb.
- `src/hooks/useFirestoreSleepRecovery.ts` — visibility-based network pause/resume.
- `CHANGELOG.md` — prior noise fixes (GFC-WEB-K/F/E/H/J, Safari IndexedDB/Firestore).
