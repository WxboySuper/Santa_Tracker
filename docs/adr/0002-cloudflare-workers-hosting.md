# ADR 0002: Cloudflare Workers hosting (Christmas Eve 2026)

**Status:** Accepted (2026-10-05)  
**Supersedes:** VPS-only production assumption in `docs/planning/christmas-2026-reinvention.md` (technical direction bullet — primary host).

## Context

The family site peaks at tens of visitors on Christmas Eve. Cloudflare Workers Free tier is viable only when public traffic does not invoke the Worker on every tracker tick. The research note `uploads/santa-hosting-comparison.md` documents limits and architecture options.

## Decision

1. **Runtime:** Deploy `apps/web` with **vinext** on **Cloudflare Workers + Static Assets** (88% `vinext check` compatibility; only `next.config.mjs` `__dirname` note — already uses `import.meta.url`).
2. **Public tracker:** Serve `santa_route.json` and `advent_calendar.json` as **static assets** under `/data/*` with long `Cache-Control`. The browser fetches once and computes Santa position client-side via `@santa-tracker/route-engine` (`deriveJourneyState`). No `run_worker_first` on public paths.
3. **Admin + APIs:** Remain on the Worker (JWT via `proxy.ts`, `nodejs_compat`). Route/advent edits use a **versioned snapshot store** backed by **R2** (`SANTA_SNAPSHOTS` binding) with filesystem adapter for local dev/tests.
4. **Publish path:** `pnpm santa:publish` mirrors repo JSON to `public/data/` and can upload active snapshots to R2 via Wrangler.
5. **VPS workflow:** Retained as legacy until the owner cuts over after review.

## Consequences

- Filesystem writes in `locations.ts` / `advent.ts` are replaced by the snapshot store; rollback is activating the previous R2 version.
- Deploy requires owner-provisioned R2 bucket, bindings, and secrets (documented in `docs/DEPLOY.md`).
- Optional **Workers Paid ($5/mo)** remains Eve insurance if admin/API volume grows; public tracker still works on static assets alone.
