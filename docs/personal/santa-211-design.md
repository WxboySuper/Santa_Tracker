# Santa Tracker #211 — Define shared public IDs and versioned schemas (Option A)

**Status:** Draft design doc for issue #211 (blocked gate for #218 fixtures, 185 route nodes)
**Branch:** `santa-211-optionA` (worktree `C:/Users/super/projects/santa-211-optionA`, base `b25abba7`)
**Date:** 2026-09-01
**Decision:** Option A recommended — `route-{season}-{slug}-{hash8}` + `schemaVersion: "v1"`

## 1. Objective (from #211)

Create stable identifier + schema-version contracts used by snapshots, saves, routes, activities.
- Zod schemas cover IDs, schema version, season, publication, checksum, timestamps
- Invalid + unsupported versions fail with typed errors
- Fixtures are consumed by server + client tests

## 2. Option A Spec (Recommended)

### ID format
- Route: `route-{season}-{slug}-{hash8}`
  - Ex: `route-2026-north-pole-express-a1b2c3d4`, `route-2025-candy-cane-corridor-9f8e7d6c`
  - `season`: 4-digit `2026`
  - `slug`: kebab-case, `[a-z0-9-]{1,40}`, derived from canonical name
  - `hash8`: first 8 hex of `sha256(canonicalJson)` — prevents collisions without central counter
- Advent: `advent-{season}-day{day}-{hash8}` — Ex: `advent-2026-day12-b4e7f1a2`
- Snapshot: `snap-{season}-{ulid}` — time-sortable if needed

### Schema
```ts
// lib/schemas/publicId.ts
import { z } from "zod";

export const SeasonSchema = z.string().regex(/^\d{4}$/);
export const SchemaVersionSchema = z.enum(["v1"]); // future: v2

export const RouteIdSchema = z.string().regex(/^route-\d{4}-[a-z0-9-]{1,40}-[a-f0-9]{8}$/);
export const AdventIdSchema = z.string().regex(/^advent-\d{4}-day\d{1,2}-[a-f0-9]{8}$/);
export const PublicIdSchema = z.union([RouteIdSchema, AdventIdSchema]);

export const RouteSchema = z.object({
  publicId: RouteIdSchema,
  schemaVersion: SchemaVersionSchema,
  season: SeasonSchema,
  slug: z.string().min(1).max(40),
  publication: z.object({ publishedAt: z.string().datetime(), checksum: z.string().length(64) }),
  timestamps: z.object({ createdAt: z.string().datetime(), updatedAt: z.string().datetime() }),
  payload: z.record(z.unknown()), // route-specific
});

export class InvalidIdError extends Error { code = "INVALID_ID" as const; field: string; }
export class UnsupportedVersionError extends Error { code = "UNSUPPORTED_VERSION" as const; }
```

### Versioning
- `schemaVersion` is separate field, not embedded in ID — ID stays stable on v1→v2, version field drives migration. Unsupported versions throw `UnsupportedVersionError` with `expected: ["v1"]`.

### Collision handling
- No central counter. Hash of canonical JSON (sorted keys) + slug ensures deterministic, sharded by season. On hash collision (1 in 4B for 8 hex), fallback to 12 hex.

## 3. Alternatives Considered

**Option B: `2026_<uuidv4>`**
- `2026_550e8400-e29b-41d4-a716-446655440000`
- Pro: guaranteed unique, simple
- Con: opaque, not sortable, no slug, larger index

**Option C: `rt_2025_001_v1` numeric sequential**
- `rt_2025_183_v1`
- Pro: short
- Con: needs central counter (bottleneck), version in ID makes ID unstable, season sharding manual

**Decision: A** — readable, sortable, collision-safe, version-stable.

## 4. Fixtures (for #211 acceptance + #218 prep)

`fixtures/contracts/`:
- `valid-route-v1.json` — route-2026-north-pole-express-a1b2c3d4, v1, season 2026
- `valid-advent-v1.json`
- `invalid-id.json` — route-2026-BAD_ID (fails RouteIdSchema)
- `unsupported-v2.json` — schemaVersion v2 (fails UnsupportedVersionError)
- `stale-route.json` — missing checksum

These same fixtures are consumed by `server/tests/schemas.test.ts` and `src/lib/schemas.test.ts`.

## 5. Tests
- `tests/schemas.test.ts` (server) + `src/lib/schemas.test.ts` (client): valid passes, invalid throws InvalidIdError, unsupported throws UnsupportedVersionError, fixtures round-trip.
- `fixtures.test.ts`: all 5 fixtures load via Zod, invalid/unsupported fail with typed errors.

## 6. Delivery Contract (per #211)
- 1 focused PR (this branch), 5-7 files: `lib/schemas/*`, `fixtures/contracts/*`, tests, docs
- Update CHANGELOG and `THIRD_PARTY_NOTICES.md` if new dep (zod already present)
- Evidence: `pnpm test` output + fixture validation log

## 7. Next Step to Unblock #218
After #211 merges, #218 can convert 185 route nodes via:
```
for node in nodes2025:
  publicId = `route-2025-${slugify(node.name)}-${hash8(node)}`
  fixture = { publicId, schemaVersion: "v1", season: "2025", ... }
  validate via RouteSchema.parse(fixture)
```
185 fixtures go to `fixtures/routes/2025/*.json`, validated, immutable.

## Verifiable Artifact
- Branch: `santa-211-optionA` (worktree `C:/Users/super/projects/santa-211-optionA`)
- Doc: `C:/Users/super/projects/santa-211-optionA/docs/personal/santa-211-design.md` (this file)
- Next: push draft PR with this doc, then implement Zod schemas as second commit.
