# Archive — Flask-era artifacts

This directory preserves historical data that is no longer read by the running TypeScript application.

- `route-data-2025-12-20/` — Snapshot of `Route Data/` as of the Flask audit commit `41c96a6`. Contains legacy text, candidate route lists, trial routes, and map visualization inputs. The new runtime reads only the immutable published snapshot (`apps/web/data/santa_route.json` and `src/static/data/santa_route.json` via fallback), not multiple competing sources. See audit: Route tools and data files → Archive disposition.
- `offline-flask-legacy.html` — Previous Flask `offline.html` template. The offline fallback is now `apps/web/src/app/offline/page.tsx` with PWA handling in `apps/web/public/sw.js`.

These files remain discoverable for provenance but are excluded from the production build.
