# ADR 0001: Christmas 2026 application architecture

- Status: Accepted
- Date: 2026-06-21
- Season: Christmas 2026
- Decision owner: WxboySuper
- Issue: [#209](https://github.com/WxboySuper/Santa_Tracker/issues/209)
- Parent tracker: [#199](https://github.com/WxboySuper/Santa_Tracker/issues/199)

## Context

Santa Tracker is being rebuilt as a seasonal holiday experience rather than incrementally extending the existing Flask application. The new product must support a cinematic public tracker, an interactive North Pole, 24 digital Advent experiences, a secured owner studio, versioned editorial content, and reliable Christmas Eve operation.

The existing repository mixes Flask routes, Jinja templates, large browser scripts, standalone React tooling, and mutable JSON data. Preserving that shape would make the reinvention harder to test, deploy, and maintain. At the same time, splitting a single-owner seasonal application into multiple services would add operational work without a demonstrated need.

This ADR fixes the application and package boundaries before scaffolding begins. It intentionally does not select map delivery, route pacing, or detailed schemas; those decisions belong to their focused issues.

## Decision

### Runtime and application model

Use one deployable **Next.js App Router application** written in **strict TypeScript**.

- Public pages, the authenticated admin studio, route handlers, and server-side publication work live in one application under `apps/web`.
- Admin pages use protected route groups inside the same application. They are not a second frontend or deployment.
- Build the application with Next.js standalone output and run it as one containerized Node.js service behind Nginx on the existing VPS.
- Use PostgreSQL as the only application database.
- Do not retain a permanent Flask or Python service. Python may be used temporarily for migration verification or one-off development scripts, but it is not part of the target runtime.
- Introduce another deployable service only through a later ADR supported by measured scaling, isolation, or reliability evidence.

### Workspace and package manager

Use a **pnpm workspace** with one application and focused internal packages:

```text
apps/
  web/                 # Next.js public site, admin studio, APIs, and jobs
packages/
  activity-sdk/        # Activity lifecycle, inputs, saves, audio, achievements
  config/              # Typed environment and build configuration
  contracts/           # Versioned Zod schemas and stable public identifiers
  database/            # Drizzle schema, migrations, repositories, transactions
  route-engine/        # Pure route validation, compilation, state, and simulation
  test-fixtures/       # Deterministic clocks, routes, snapshots, and content
  ui/                  # Shared accessible components and design tokens
```

Packages must have explicit exports. Avoid convenience barrel files that cause unrelated client modules to enter browser bundles. Import from a documented package subpath when that keeps server-only or heavy modules out of client code.

### Dependency rules

The dependency direction is:

```text
apps/web
  -> activity-sdk
  -> database
  -> route-engine
  -> ui
  -> contracts
  -> config

activity-sdk -> contracts, ui
database     -> contracts, config
route-engine -> contracts
test-fixtures-> contracts, route-engine
ui           -> contracts only when a shared public type is required
contracts    -> no internal runtime package
config       -> no feature or UI package
```

Additional rules:

- `contracts` contains serializable data contracts, stable IDs, and schema-version logic. It does not contain database queries, React components, or environment reads.
- `route-engine` is pure domain logic. It receives time, route data, and configuration as arguments; it does not import Next.js, React, Drizzle, browser APIs, or mutable global clocks.
- `database` owns Drizzle, SQL migrations, transactions, and repositories. Drizzle types must not leak into public snapshot contracts.
- `ui` contains shared presentational and accessible interaction primitives. It does not fetch data or import the database.
- `activity-sdk` owns common activity infrastructure without forcing games to share mechanics or renderer implementations.
- `apps/web` is the composition root. Only it wires authentication, repositories, route handlers, server actions, caching, and rendering together.
- Server-only modules use explicit server-only guards and are never re-exported through client-safe entry points.
- Cyclic package dependencies are prohibited and checked in CI.

### Data and publication boundaries

PostgreSQL stores mutable drafts, editorial metadata, media metadata, configuration, feature flags, audit events, and publication records.

The public experience does **not** read mutable editorial tables directly:

1. The owner edits revisioned drafts in the studio.
2. Publication validates contracts, route timing, content review, media references, and effective feature configuration.
3. The publisher compiles an immutable versioned snapshot.
4. The snapshot records its schema version, season, publication ID, checksum, author, validation report, and generation time.
5. Activation atomically changes the active publication reference.
6. Public server rendering and APIs read the active immutable snapshot.

Rollback activates a previously validated snapshot. It does not mutate historical snapshot contents.

Drizzle is the database layer because this project benefits from explicit SQL-oriented schemas and migrations without requiring Prisma's generated client and abstraction model. Database implementation records remain private to `database`; public contracts remain Zod-defined in `contracts`.

### Server and client rendering rules

Use React Server Components by default.

- Content pages, archive pages, initial seasonal configuration, and initial snapshot reads render on the server.
- Client components are limited to genuine browser interactions: maps, games, audio, local progress, panoramic navigation, real-time interpolation, and rich editors.
- Keep client boundaries narrow. Pass minimal serializable props rather than entire database or snapshot objects.
- Fetch independent server data in parallel and place Suspense boundaries around independently useful surfaces.
- Start required asynchronous work early and await it as late as its dependency permits.
- Dynamically import maps, games, canvas effects, editors, analytics, and other heavy optional modules.
- Load a feature's code only when the active publication enables that feature or the visitor enters it.
- Defer analytics and nonessential monitoring until after the primary experience becomes interactive.
- Use a deduplicating client data layer only for state that genuinely requires client refetching. Do not mirror stable server-rendered content into client fetches by default.
- Version and minimize local storage. Read it through the local-profile boundary rather than throughout components.

### API and mutation rules

- Version public HTTP contracts under `/api/v1`.
- Keep admin contracts under `/api/admin/v1` or authenticated server actions with equivalent authorization and CSRF protection.
- Authenticate and authorize every mutation at the server boundary; UI visibility is not authorization.
- Validate all external input through shared Zod contracts before domain or database operations.
- Return typed error codes suitable for accessible UI messaging without exposing stack traces or sensitive data.
- Long-running compilation and publication operations report durable status rather than relying on a single browser connection.

### Configuration and feature flags

- `config` validates environment variables once at process start and exposes typed server configuration.
- Public configuration is an explicit safe projection; secrets never enter client bundles or snapshots.
- Seasonal modes and feature flags are typed domain data, included in publication validation, and resolved to a deterministic effective configuration.
- Operational fallbacks such as simplified tracking and no-map mode remain designed capabilities, not arbitrary runtime code switches.

### Testing ownership

- `contracts`: schema compatibility, invalid input, version negotiation, and serialization tests.
- `route-engine`: pure unit, property/boundary, deterministic clock, pacing, timezone, and antimeridian tests.
- `database`: migration, repository, transaction, constraint, and rollback tests against isolated PostgreSQL.
- `ui`: Storybook, accessibility, interaction, and deterministic visual tests.
- `activity-sdk`: lifecycle, input, save migration, audio preference, completion, and renderer-adapter contract tests.
- `apps/web`: route-handler, authentication, publication integration, server/client boundary, Playwright, performance, and deployment smoke tests.
- `test-fixtures`: fixture validation ensures a malformed fixture cannot create false confidence.

Tests inject clocks, route snapshots, feature configuration, providers, and failures. Production domain code must not depend directly on the machine clock when deterministic seasonal behavior is required.

## Rejected alternatives

### Continue modernizing Flask

Rejected because the reinvention requires new rendering, interaction, content, and testing boundaries. Retaining Flask/Jinja would preserve the architectural constraints being replaced while still requiring a large frontend rebuild.

### Keep Python as a permanent route microservice

Rejected because the route engine is deterministic domain logic that can live in a pure TypeScript package shared by the studio, simulator, publisher, and tests. A second runtime would duplicate contracts, deployment, observability, and failure modes without current evidence that isolation is needed.

### React/Vite SPA with a separate backend

Rejected because the project benefits from server-rendered seasonal/content pages, metadata and deep links, server-owned authentication, streaming, and one deployment boundary. Reassembling these around a client-only SPA would add infrastructure without a product advantage.

### Separate public and admin applications

Rejected for the initial architecture because both surfaces share contracts, preview rendering, design primitives, authentication boundaries, and publication logic. Protected route groups and lazy loading provide isolation without creating another deployable application.

### Public reads directly from editorial tables

Rejected because partially edited content, inconsistent route/content revisions, and live database dependencies are unacceptable during Christmas Eve. Immutable published snapshots make validation, caching, replay, and rollback explicit.

### Prisma

Rejected in favor of Drizzle's explicit SQL-oriented schema and migration model. This is not a permanent prohibition: changing database tooling requires a later ADR and migration evidence.

### Premature microservices, job queues, or game engines

Rejected until measured requirements justify them. Compilation may begin in-process with durable database status. The North Pole uses layered DOM/SVG/images and canvas effects. Individual activities may select an appropriate renderer behind the shared SDK without imposing one engine on the whole product.

## Consequences

### Positive

- One language and contract system spans public UI, studio, route engine, activities, and tests.
- One deployable application reduces VPS operations while preserving internal boundaries.
- Server rendering, narrow client islands, and lazy loading protect the fast shell from cinematic features.
- Immutable snapshots isolate visitors from draft data and enable deterministic replay and rollback.
- Pure route logic and injected time make seasonal behavior testable months before Christmas.

### Costs and constraints

- Useful Flask/Python behavior must be deliberately ported and parity-tested.
- Package boundaries and server/client restrictions require CI enforcement to remain meaningful.
- Snapshot compilation introduces a publication workflow instead of immediate database visibility.
- One application remains a shared failure boundary, so fallback modes, health checks, and artifact rollback are mandatory.

## Follow-up issues unlocked by this decision

- [#210](https://github.com/WxboySuper/Santa_Tracker/issues/210): Drizzle and PostgreSQL migration workflow.
- [#211](https://github.com/WxboySuper/Santa_Tracker/issues/211): shared public IDs and versioned schemas.
- [#213](https://github.com/WxboySuper/Santa_Tracker/issues/213): Next.js pnpm workspace scaffold.
- [#252](https://github.com/WxboySuper/Santa_Tracker/issues/252): zero-cost map delivery ADR.

Those issues may refine their own implementation details but must preserve the boundaries accepted here. A conflicting decision requires a superseding ADR.
