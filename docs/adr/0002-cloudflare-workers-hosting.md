# ADR 0002: Cloudflare Workers hosting (Christmas Eve 2026)

**Status:** Accepted (2026-10-05)  
**Supersedes:** VPS-only production assumption in `docs/planning/christmas-2026-reinvention.md` (technical direction bullet — primary host).

## Context

The family site peaks at tens of visitors on Christmas Eve. The tracker computes Santa's position in the browser, so the Worker only serves route data when a map loads; it does not run for each position update. The research note `uploads/santa-hosting-comparison.md` documents limits and architecture options.

## Decision

1. **Runtime:** Deploy `apps/web` with **vinext** on **Cloudflare Workers + Static Assets** (88% `vinext check` compatibility; only `next.config.mjs` `__dirname` note — already uses `import.meta.url`).
2. **Public tracker:** `/api/route` reads the active route snapshot from R2 and permits shared caches to reuse it for 60 seconds. The browser fetches it once and computes Santa's position client-side via `@santa-tracker/route-engine` (`deriveJourneyState`).
3. **Advent:** `/api/advent/manifest` returns calendar metadata without payloads; `/api/advent/[day]` checks the unlock time on the server before returning content. Advent data is never copied into public assets.
4. **Admin + APIs:** Remain on the Worker (JWT via `proxy.ts`, `nodejs_compat`). Route/advent edits use a **versioned snapshot store** backed by **R2** (`SANTA_SNAPSHOTS` binding) with filesystem adapter for local dev/VPS.
5. **Publish path:** `pnpm santa:publish:remote` seeds versioned snapshots in R2. Worker writes update the active pointer only; they do not attempt filesystem or generated-asset writes.
6. **VPS workflow:** Retained as legacy until the owner verifies Cloudflare production and completes cutover.

## Consequences

- Worker filesystem writes in `locations.ts` / `advent.ts` are replaced by the snapshot store; rollback is activating the previous R2 version. Admin mutations serialize with an R2 conditional-write lock.
- Deploy requires owner-provisioned R2 bucket, bindings, and secrets (documented in `docs/DEPLOY.md`).
- The tracker invokes the Worker once per map load; subsequent position updates stay in the browser. Optional Workers Paid may be needed if API volume grows beyond Free tier limits.
