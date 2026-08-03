# Auto-TSTM operations

Operational notes for the cached Auto-TSTM server API introduced in TSTM-03 (#474) and hardened in TSTM-04 (#475).

## Public read policy

Auto-TSTM exposes only cached, read-only guidance routes once the deployment enables the capability:

| Route | Method | Auth | Work when disabled |
| --- | --- | --- | --- |
| `/api/tstm/latest` | GET | None | Capability gate returns `404` before cache reads |
| `/api/tstm/status` | GET | None | Capability gate returns `404` before cache reads |
| `/api/capabilities/status` | GET | None | Always available; lists exposed server capabilities |

Interactive requests cannot start generator workers. Generation runs only through the process-owned scheduled ingestion loop. Disabled routes perform **no expensive work** (no cache reads beyond the gate).

Registry exposure (`autoTstm.exposure.*`) and deployment env (`TSTM_GENERATION_ENABLED=true`) must both be enabled before routes accept traffic. Emergency disable overrides are documented in [emergency-feature-disable.md](./emergency-feature-disable.md).

## Rate limits

| Route | Limit |
| --- | --- |
| `GET /api/tstm/latest` | 120 requests / minute / client |
| `GET /api/tstm/status` | 120 requests / minute / client |
| `GET /api/capabilities/status` | 120 requests / minute / client |

## Structured errors

Cached read failures return sanitized JSON with a machine-readable `reason`:

| `reason` | Meaning | Typical HTTP status |
| --- | --- | --- |
| `cache_miss` | No cached entry for the requested day/period | `404` |
| `cache_stale` | Cache exists but is past its valid window | `404` |
| `cache_corrupt` | Cache file exists but is unreadable or invalid | `404` |
| `unavailable` | Generator or upstream guidance is temporarily down | `503` |

Capability-disabled responses use the standard gate body and **do not** include internal `reason` codes.

Responses never include filesystem paths, Python stderr, stack traces, or other internal details.

## Operational health

`GET /api/tstm/status` returns a public-safe summary:

- `ingestionEnabled` — whether `TSTM_INGESTION_ENABLED=true` on this process
- `cache.day1` / `cache.day2` — per-period availability with `available`, `stale`, `reason`, `run`, `ingestedAt`, and `effectiveEnd` when known

Use this endpoint (or server logs prefixed with `[tstm-ingest]`) to confirm ingestion health. Expected ingestion skips log at **info** level and do not report to Sentry.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `TSTM_GENERATION_ENABLED` | Deployment capability switch (`true` to allow gated routes) |
| `TSTM_INGESTION_ENABLED` | Start the scheduled ingestion loop |
| `TSTM_INGESTION_INTERVAL_MS` | Poll interval (default 30 minutes) |
| `TSTM_CACHE_DIR` | Cache root (default `server/cache/tstm`) |
| `TSTM_GENERATION_TIMEOUT_MS` | Python worker timeout |
| `SERVER_TARGET` | Cache partition (`local`, `beta`, `staging`, `production`) |
| `EMERGENCY_DISABLED_CAPABILITIES` | Immediate disable override (see emergency runbook) |

## Client behavior

`requestLatestTstmData()` in `src/utils/tstmGeneration.ts`:

- Returns parsed guidance on success
- Returns `null` for expected `cache_miss`, `cache_stale`, and disabled responses (no thrown errors, no Sentry noise)
- Marks the server capability unavailable when the standard disabled gate message is returned

### Preview / apply flow (TSTM-05)

On beta builds with `autoTstm` exposure enabled and `TSTM_GENERATION_ENABLED=true` supplied by `deploy/beta-deployment-config.json`:

1. Forecast editor **Tools** tab exposes **Auto-TSTM** behind `ServerBackedFeatureBoundary`.
2. Opening the panel fetches `GET /api/tstm/latest` for the active Day 1/2 context.
3. Guidance renders on a separate map preview layer until the forecaster applies or cancels.
4. **Apply** dispatches one undoable `replaceTstmFeatures` replacement; **Cancel** clears the preview and closes the panel without applying.
5. Late cycle/day responses are ignored via `isCurrentTstmRequest` before preview or apply can mutate forecast state.

Controls stay absent when registry exposure or the server capability gate is off.

## Related docs

- [auto-tstm-beta-test-plans.md](./auto-tstm-beta-test-plans.md) — beta tester smoke and workflow plans
- [auto-tstm-beta-tester-post.md](./auto-tstm-beta-tester-post.md) — concise copy-ready tester instructions
- [feature-exposure-workstreams.md](./feature-exposure-workstreams.md) — Auto-TSTM registry and beta enablement criteria
- [emergency-feature-disable.md](./emergency-feature-disable.md) — incident disable runbook
