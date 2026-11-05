# ADR 0003: Drop PostgreSQL; R2 versioned snapshots are the store

**Status:** Accepted (2026-11-05)
**Supersedes:** PostgreSQL decisions in ADR 0001 and the planning doc (Postgres for drafts, editorial data, audit).

## Context

ADR 0002 moved production to Cloudflare Workers with a versioned R2 snapshot store. The `packages/database`
scaffold (three empty tables, issue #210) was never imported by the app, and the site collects no visitor data.

## Decision

1. Remove `packages/database`, `docker-compose.yml`, the Postgres CI job, and `DATABASE_URL`.
2. The versioned snapshot store (R2 in production, filesystem locally) holds drafts and published snapshots.
3. If audit history or queryable drafts are needed later, use Cloudflare D1 behind a storage adapter, via a new ADR.

## Consequences

- Local development and CI need no Docker.
- One platform to operate on Christmas Eve.
- ADR 0001 sections describing Postgres/Drizzle are historical.
