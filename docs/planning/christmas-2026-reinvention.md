# Christmas 2026 Reinvention — Living Draft

> Status: planning-complete draft; ready for GitHub execution after final review
> Started: June 20, 2026
> This document is intentionally not final. Decisions, tracker breakdowns, and implementation details will be refined through continued discussion before the GitHub planning environment is created.

## Purpose

Reinvent Santa Tracker as a modern holiday experience before Christmas 2026. The result should be enjoyable for children and adults, mixing Christmas magic with an educational journey around the world.

The site is not a SaaS product. Product structure, navigation, writing, motion, sound, and administration should serve a seasonal experience rather than imitate a conventional dashboard or business application.

Development capacity is variable. Work must therefore be organized so that critical infrastructure and Christmas Eve behavior are completed first, followed by progressively more ambitious experiences. A larger push is expected in November and December, with passive development before then.

## Decisions Made So Far

### Product direction

- Treat Christmas 2026 as a complete reinvention, not a maintenance release.
- Design for families, younger visitors, and adults who still enjoy Christmas magic.
- Prioritize bonus content and anticipation before Christmas Eve.
- Make the live journey the dominant experience on Christmas Eve.
- Combine a magical presentation with sourced geography, local-time context, cultural information, and world facts.
- Keep useful off-season experiences: the next-Christmas countdown, previous journey replay, and archive.
- Use a storybook-cinematic visual tone that is playful without feeling exclusively juvenile.

### Technical direction

The accepted application boundary is recorded in [ADR 0001](../adr/0001-application-architecture.md).

- Replace Flask with a modern Next.js and TypeScript application.
- Consolidate reusable route and application logic in TypeScript rather than retaining a permanent Python service.
- Use the existing VPS as the primary production host.
- Borrow mature infrastructure patterns from Graphical Forecast Creator only where they solve an actual need.
- Prefer free, open-source, or self-hosted services.
- Use PostgreSQL for drafts, editorial data, configuration, audit records, and publication metadata.
- Serve immutable, versioned published snapshots to visitors instead of reading live editorial tables.
- Use a secured, single-owner integrated admin studio.
- Use admin-controlled season modes, typed feature flags, and operational kill switches.
- Keep visitor accounts out of the 2026 core scope. Store progress and preferences locally with a schema that can support future synchronization.
- Ship in English while making interface and content systems localization-ready.
- Use privacy-first aggregate analytics.

### Experience direction

- Build 24 varied, browser-native Advent unlocks for December 1–24.
- Prioritize digital games, interactive stories, puzzles, quizzes, creative toys, map discoveries, and animated reveals.
- Do not depend on filmed videos, printable crafts, or physical materials.
- Build several polished mini-games on a shared activity framework.
- Present educational content first as concise sourced story cards, with deeper location articles as an expansion path.
- Require source metadata and editorial review for educational claims.
- Provide an optional soundscape with explicit opt-in and persistent controls.
- Use optional on-device browser geolocation without sending precise coordinates to the server.
- Start with journey statistics and local context; treat live weather as a flagged expansion.
- Include in-app reminders and calendar links; investigate web push only as a stretch feature.

### Journey direction

- Preserve a scheduled global timezone sweep beginning near the earliest Christmas timezone.
- Rebuild the timing and pacing model rather than copying the current route unchanged.
- Explicitly solve weak pacing and confidence problems in the Western Hemisphere.
- Derive live state deterministically from an immutable route snapshot and trusted time.
- Do not manually drive, pause, or offset the active journey.
- Recover through a prevalidated replacement snapshot, previous snapshot, simplified tracker, or no-map fallback.
- Use a polished cinematic 2D map rather than requiring a true 3D globe.
- Provide an automatic broadcast camera while allowing visitors to explore and intentionally return to Santa.
- Ensure current location, next stop, ETA, progress, and facts remain usable when map tiles fail.

## Experience Concept: The Interactive North Pole

The preferred custom-navigation concept is an interactive North Pole rather than a conventional website shell.

The six core destinations are:

- Santa Tracker observatory or mission center.
- Advent village or calendar street.
- Game workshop.
- World discovery library or globe room.
- Journey archive lodge.
- Settings and accessibility station.

The North Pole should evolve with the active season:

- **Off-season:** quiet village, countdown, archives, and replay.
- **Preparation:** workshop activity, previews, and North Pole updates.
- **Advent:** daily doors, lights, activities, and increased village activity.
- **Christmas Eve:** mission launch and immediate emphasis on the live journey.
- **Post-flight:** celebration, completed statistics, replay, and archive.

A compact accessible menu must remain available for keyboard navigation, screen readers, direct access, deep linking, reduced motion, and visitors who do not want to navigate the illustrated world.

### Locked navigation model

- Use a panoramic illustrated village built from responsive DOM/SVG/image layers plus canvas effects; do not introduce a game engine for the shell.
- Provide six core destinations: Observatory/Mission Control, Advent Plaza, Game Workshop, World Library, Archive Lodge, and Welcome Center.
- Snap between landmarks on phones using swipe controls and a destination tray instead of tiny free-panning targets.
- Keep unavailable destinations visible and evolving through preparation states, countdowns, ambient activity, and previews.
- Build a committed, skippable 3–6 second programmatic arrival that reuses hub assets and bypasses itself under reduced motion.
- Use Santa, elves, and reindeer as supporting guides and ambient characters rather than requiring quests or a dialogue engine.
- Keep a compact accessible menu available at all times.
- Use the Welcome Center for accessibility, audio, language, performance, help, and direct navigation.
- Transform the Observatory from preparation/route preview into Christmas Eve Mission Control and then post-flight replay/statistics.
- Create a fresh visual identity using generated concepts followed by deliberate curation, editing, layering, optimization, and a formal style guide.
- Ensure direct links reach their destination without forcing the arrival sequence.

## Proposed System Shape

### Public application

- Next.js App Router with strict TypeScript.
- Server-rendered content surfaces and lazy-loaded client experiences.
- Shared design system and seasonal scene system.
- Map adapter around an open map stack, with provider replacement and no-map fallback.
- Shared activity SDK for games and daily digital experiences.
- Versioned local profile for progress, achievements, favorites, and settings.
- Seasonal modes: off-season, preparation, Advent, Christmas Eve, and post-flight.
- Default annual schedule: preparation begins November 1, Advent runs December 1–23, the live journey owns December 24, and post-flight runs December 25–January 6 before returning to off-season.
- Allow an audited, expiring admin override of the calculated mode.
- Keep unlocked Advent activities playable through later modes and the archive unless editorially withdrawn.
- Target current and previous major Chrome, Edge, Firefox, and Safari releases plus current iOS Safari and Android Chrome.
- Meet WCAG 2.2 AA for navigation, tracker, content, admin, and the shared activity shell; test each game and document/provide alternatives for mechanic-specific limitations.
- Use progressive enhancement with strict fast-shell and interaction budgets, then enable richer scene effects based on capability and visitor preference.

### Admin studio

- Passkey owner authentication with generated one-time recovery codes, session expiry/revocation, CSRF protection, throttling, and audit records.
- Seasonal control center.
- Route editor, compiler, simulator, validation reports, and preview clock.
- Location facts, source review, and deeper article authoring.
- Advent planner and typed digital-activity authoring.
- Media library for images, audio, sprites, and activity assets.
- Typed feature flags and emergency fallbacks.
- Draft preview, immutable publication, audit history, and snapshot rollback.
- Autosave drafts with revision history, named restore points, explicit validation, and explicit publication.
- Provide one launch-day emergency panel for simplified/no-map modes, optional-feature kill switches, and activation of a prevalidated snapshot.

### Publishing

1. Edit drafts in PostgreSQL.
2. Validate schemas, sources, timings, flags, and media.
3. Compile an immutable versioned snapshot.
4. Store its checksum, author, season, validation report, and timestamp.
5. Activate it atomically.
6. Retain previous snapshots for rollback and later archives.

### Route production model

- You retain editorial ownership through approved anchor locations and regional intent; tooling may suggest gaps, ordering, and timing but cannot add stops without approval.
- Optimize for broad geographic representation rather than maximum raw stop count or population alone.
- Prototype and compare three accelerated pacing models early, using documented regional metrics and an ADR before full route production.
- Start with continuous motion plus selected richer story treatments, but keep this reversible until the pacing prototype is approved.
- Always prioritize the current or most-recent location in the tracker UI. Richer spotlight treatment may change content depth or cinematics but cannot displace the active location.
- Move older location cards into an optional recent-journey drawer and World Library rather than presenting a continuously overwhelming feed.
- Require a concise, sourced, owner-reviewed card for every published stop.
- Commit deeper articles for selected major stops and expand beyond them only as capacity permits.
- Calculate an approximate private regional arrival window from nearby route segments for visitors who opt into on-device location; label it clearly as an estimate.
- Generate playful delivery statistics deterministically so values remain consistent during live tracking and replay.
- Treat map hosting and live weather as bounded feasibility investigations. Map implementation must use a project-owned adapter and preserve a complete no-map experience regardless of the selected provider.

### Advent content slate

The 24-day target uses an escalating cadence, alternating lighter modules with larger releases and placing major experiences on weekends and near Christmas.

Category allocation:

- Six custom games.
- Four puzzles.
- Four connected interactive story chapters.
- Four lightweight creative experiences.
- Three quizzes.
- Three world-discovery experiences.

Custom games:

1. Rebuilt Ornament Smash.
2. Sleigh Route Challenge.
3. Workshop Toy Designer.
4. Workshop Conveyor Puzzle.
5. Reindeer Signal Sequence.
6. North Pole Snowball Dash.

Other modules:

- Puzzles: jigsaw/reveal, logic-grid mystery, maze/pathfinding challenge, and word/symbol cipher.
- Stories: one four-chapter connected North Pole preparation arc using supporting characters and interactive scenes.
- Creative: digital ornament maker, snowflake designer, holiday postcard studio, and North Pole light-show composer.
- Quizzes: world traditions/geography, winter/weather science, and playful Santa Tracker knowledge.
- World discovery: global timezones, winter around the world, and traditions through an interactive map journey.

Activities should normally provide 3–8 minute replayable sessions. Games share lifecycle, input abstraction, audio, saves, achievements, error isolation, and telemetry while retaining distinct mechanics, renderers, and visual identities. If a custom activity misses the content gate, substitute a prebuilt high-quality puzzle, fact experience, or interactive reveal rather than exposing a placeholder.

### Local progress and rewards

- Track progress at the device level without asking for a visitor name or avatar.
- Store personal bests and achievements locally; do not build public leaderboards.
- Tie achievements and world discoveries to themed ornaments, lights, snow sculptures, window displays, and other village decorations.
- Place unlocked decorations through curated responsive slots rather than unrestricted dragging.
- Version the local schema and test migrations, reset, export, and future synchronization boundaries.

### Infrastructure

- Containerized Next.js application and PostgreSQL.
- Nginx and TLS on the existing VPS.
- Separate local, persistent staging, and production environments with isolated staging and production databases/media roots.
- Health and readiness endpoints.
- Structured logs and request correlation.
- Error monitoring and privacy-first product/operational metrics.
- Database and media backups with restoration tests.
- Atomic releases, post-deploy smoke tests, and rollback.
- Build one immutable release artifact, deploy it to staging, run promotion gates, and manually promote the same artifact to production.
- Use VPS filesystem media storage behind an adapter, immutable hashed paths, and tested backups rather than operating object storage initially.
- Prefer self-hosted structured logs, probes, lightweight metrics, uptime checks, and error capture.

## Objective Planning Model

All implementation planning will use objective tasks. An issue is not complete because code exists; it is complete when its observable acceptance criteria pass.

### Hierarchy

1. **Christmas 2026 Reinvention program tracker** — complete product and launch outcome.
2. **Subsystem trackers** — coherent areas such as Platform Foundation, North Pole Experience, Route Engine, Admin Studio, Advent, Infrastructure, and Launch Readiness.
3. **Capability trackers** — deliverable slices within a subsystem.
4. **Leaf tasks** — independently implementable and verifiable work.

Trackers describe outcomes and own dependency ordering. Leaf tasks contain:

- Objective.
- User or operator value.
- Included and excluded behavior.
- Concrete acceptance criteria.
- Required tests and evidence.
- Dependencies and blocked work.
- Feature flag and rollout behavior.
- Documentation and maintenance impact.

Avoid vague tasks such as “improve the tracker” or “work on accessibility.” Split them into results that can be proven.

## Initial Program Trackers

These are draft planning containers, not yet GitHub issues.

### 1. Product foundation and legacy migration

Objective: establish the modern TypeScript platform and deliberately migrate or retire useful Flask-era behavior and data.

Candidate capabilities:

- Next.js workspace and package boundaries.
- Design system and seasonal theme primitives.
- Database and migrations.
- Shared schemas and identifiers.
- Legacy route/advent fixture extraction.
- Behavior parity inventory.
- Removal or archival of obsolete Flask surfaces.

### 2. Interactive North Pole and custom navigation

Objective: make navigation itself a memorable, accessible holiday experience.

Candidate capabilities:

- North Pole world model and destination registry.
- Responsive scene composition.
- Seasonal scene states.
- Destination interactions and transitions.
- Compact accessible navigation.
- Deep-link arrival behavior.
- Reduced-motion and low-performance presentations.
- Committed skippable programmatic arrival sequence.
- Ambient characters and environmental events.

### 3. Route engine and 2026 journey production

Objective: compile and validate a confident global route with strong pacing throughout every region.

Candidate capabilities:

- Canonical route schema.
- Constraint-based route compilation.
- Distance, speed, timing, timezone, and antimeridian validation.
- Regional pacing and coverage reports.
- Western Hemisphere confidence suite.
- Immutable snapshots.
- Accelerated and real-time simulation.
- Replacement snapshot and rollback rehearsal.
- Final 2026 route editorial workflow.

### 4. Cinematic public tracker

Objective: deliver a reliable, magical, educational Christmas Eve experience across devices and connection conditions.

Candidate capabilities:

- Deterministic live state synchronization.
- Cinematic map and broadcast camera.
- Visitor exploration and return-to-Santa behavior.
- Santa animation and route visualization.
- Story cards and local context.
- Optional private geolocation.
- Journey statistics.
- Text, reduced-motion, low-performance, and no-map modes.
- Completed journey replay.

### 5. Educational world content

Objective: attach respectful, memorable, and sourced world learning to the journey.

Candidate capabilities:

- Source-required editorial schema.
- Story-card authoring and review.
- Cultural-language guidance.
- Location pages.
- Fact verification workflow.
- Content completeness and stale-source reports.
- Localization-ready content structure.

### 6. Advent and digital activity platform

Objective: publish 24 finished daily digital experiences without making each day a separate technical invention.

Candidate capabilities:

- Activity SDK and lifecycle contract.
- Story, quiz, puzzle, reveal, creative-canvas, and map-discovery modules.
- Shared input, audio, scoring, progress, and accessibility systems.
- Six polished custom mini-games with distinct identities.
- Advent unlock and preview engine.
- Twenty-four-day content production tracker.
- Failure isolation and fallback activities.

### 7. Admin studio and publication control

Objective: safely manage, preview, validate, publish, flag, and roll back the complete seasonal experience.

Candidate capabilities:

- Owner authentication and session security.
- Seasonal control center.
- Route editor and simulator.
- Content and activity editors.
- Media library.
- Feature flags and emergency modes.
- Snapshot validation and activation.
- Audit history and rollback.

### 8. Local visitor profile and personalization

Objective: provide rich anonymous progress and preferences without requiring accounts or collecting precise location.

Candidate capabilities:

- Versioned local-storage schema.
- Advent completion and achievements.
- Game scores.
- Favorites and recently explored content.
- Audio, motion, contrast, text, language, and performance settings.
- Save migration and reset/export controls.
- Future synchronization contract.

### 9. Reliability, security, and maintainability

Objective: make regressions difficult to introduce and seasonal operation easy to understand.

Candidate capabilities:

- Unit, integration, component, browser, accessibility, performance, security, and load tests.
- Deterministic time and route fixtures.
- Visual regression coverage for major seasonal states.
- Dependency and supply-chain maintenance.
- Health checks, logs, monitoring, and alerts.
- Backups and restoration.
- Staging, atomic deployment, smoke verification, and rollback.
- Architecture decisions, runbooks, and generated reference documentation.

### 10. Christmas 2026 readiness and operations

Objective: prove the complete production experience is ready before December 24.

Candidate capabilities:

- Route and content freeze criteria.
- Full accelerated journey rehearsal.
- Multi-hour real-time soak test.
- Cross-device and cross-browser matrix.
- Tile/provider outage rehearsal.
- Snapshot rollback rehearsal.
- Backup restoration rehearsal.
- Launch-week change controls.
- Christmas Eve operator runbook.
- Post-season incident review and archive.

## GitHub Planning and Maintenance Environment

Create this environment in one coordinated GitHub CLI/API pass after this draft receives final approval. The implementation may proceed in dependency order, but the planning environment itself should be comprehensive rather than rolled out timidly.

When finalized, use GitHub as the canonical execution system:

- Six subsystem delivery milestones: Foundation; North Pole Experience; Journey and World Content; Advent Experiences; Studio and Operations; Christmas 2026 Readiness. Do not attach due dates because availability is variable.
- A GitHub Project with custom fields for subsystem, scope tier, status, risk, release gate, and readiness. Do not add effort estimates.
- A top-level program issue with native sub-issue relationships.
- Nested subsystem and capability trackers.
- Native blocked-by relationships to express implementation order.
- Leaf issues with objective acceptance criteria.
- Issue forms for bugs, implementation tasks, content tasks, route-data work, operational work, and proposals.
- Scope tiers named Launch Blocker, Core, Enhancement, and Stretch rather than ambiguous numeric priorities.
- Labels for subsystem and work type; avoid duplicating Project fields in labels.
- PR templates linked to issues, acceptance criteria, flags, screenshots, testing evidence, migration notes, and rollback impact.
- CODEOWNERS or equivalent review routing if collaborators are added.
- Protect `main` with all applicable required CI and resolved review conversations. The owner may merge their own PR after CI and Greptile pass; outside contributors require owner approval.
- Preserve merge commits and enforce Conventional Commit-style PR titles.
- Dependabot or Renovate configured for the new workspace and GitHub Actions.
- Code scanning, secret scanning, dependency review, lockfile review, and artifact attestations where available.
- Automated unit, integration, component, browser, accessibility, visual, performance, schema, migration, and build checks.
- Preview or staging deployments for pull requests that change public or admin behavior.
- Maintain two changelogs: an exhaustive per-PR changelog that every PR must update and CI enforces, plus a curated human changelog containing meaningful highlights, migrations, operational changes, and release notes.
- Apply SemVer throughout the Christmas 2026 season. Each successful main deployment receives a unique incremental version/build identity; significant checkpoints deliberately advance the appropriate higher SemVer component.
- Generate release notes from PR metadata and the exhaustive changelog, then curate important entries into the main changelog.
- Scheduled production smoke checks and backup verification.
- Discussions for open-ended product ideation; issues only after an idea has an objective and acceptance boundary.

The current repository has basic issue forms, a broad PR template, Dependabot for Python only, file-based labeling, and CI for the Flask application. These must be redesigned for the new TypeScript workspace rather than mechanically retained.

### GitHub execution rules

- Default to one focused issue producing one reasonably sized PR.
- Every dependency, including small prerequisite relationships, must be represented with native blocked-by/blocking relationships.
- Contributors may self-assign any ready issue; do not create subsystem ownership lanes.
- An issue enters the ready queue only when it is unblocked, fully specified, has accepted criteria/test expectations, and contains no unresolved product decision.
- A leaf issue closes through a linked evidence-bearing merged PR that satisfies acceptance criteria, tests, documentation, screenshots where relevant, rollout notes, and changelog governance.
- Use bounded research/design issues for unresolved feasibility questions. Each requires comparison evidence, a written ADR/decision, and explicit updates to newly unblocked follow-up issues.
- Do not create vague future placeholders. Keep unspecifiable work inside tracker checklists until its decision issue makes leaf work actionable.
- Use native sub-issues for the program → subsystem → capability → leaf hierarchy.
- Audit the existing Flask-era backlog. Migrate still-relevant intent into the new graph, close superseded issues with links, and retire the obsolete v1.0 milestone.
- Create Project views for ready execution, blocked work, subsystem boards, roadmap/release gates, launch-critical work, content production, and maintenance.

### Required GitHub maintenance automation

- CI for formatting, linting, strict types, unit, integration, component, route-schema, database-migration, production-build, and changelog checks.
- Playwright browser suites for public, admin, seasonal, and activity flows.
- WCAG checks plus tracked manual assistive-technology review evidence.
- Versioned deterministic screenshots for seasonal/device states; baseline changes require owner approval.
- Performance budgets and bundle analysis using tiered experience targets.
- CodeQL, secret scanning, dependency review, lockfile review, and available artifact attestations.
- Greptile advisory review, with DeepSource and CodeScene maintainability integration where supported.
- Grouped scheduled dependency updates; isolate major upgrades and urgent security updates, and run the full relevant suite.
- Staging deployment and smoke verification of the immutable artifact before manual production promotion.
- Scheduled production health probes, backup checks, and restoration rehearsal tracking.

Access to GitHub Projects currently requires an additional token scope before project automation can be performed. This will be handled only when the planning structure is ready to create.

## Maintenance Principles

- Treat time as an injectable dependency everywhere seasonal behavior is tested.
- Keep public data contracts versioned and validated.
- Make every major visual state reproducible through fixtures.
- Require tests alongside behavior changes.
- Prefer shared activity and scene primitives over one-off implementations.
- Keep feature flags typed, documented, owned, and removable.
- Track flag retirement so temporary branches do not become permanent complexity.
- Keep public rendering independent of mutable draft data.
- Make deployment, rollback, backup, and restore routine and documented.
- Maintain a supported browser/device matrix.
- Record architectural decisions that future maintainers would otherwise have to rediscover.
- Never advertise incomplete Advent content or silently publish placeholders.

## Priority Philosophy

If capacity becomes constrained, preserve work in this order:

1. Maintainable modern foundation.
2. Route correctness and 2026 route production.
3. Reliable public tracker and fallbacks.
4. Admin publishing, flags, and rollback.
5. Testing, monitoring, deployment, and launch rehearsal.
6. Interactive North Pole core navigation.
7. Sourced educational story cards.
8. Complete Advent platform and content.
9. Additional games, deeper articles, characters, and premium effects.
10. Weather, web push, and other external integrations.

The custom North Pole is a central product goal, but essential tracker routes and accessible direct navigation must remain functional if its most ambitious presentation is reduced.

## Bounded Decisions To Resolve Through Actionable Issues

The remaining unknowns no longer require synchronous product clarification. Create focused research/design issues with explicit outputs and block dependent implementation work behind them:

1. Compare three route pacing models using the 2025 route and regional metrics; approve one model through an ADR.
2. Evaluate zero-cost map data, tile, PMTiles/self-hosting, caching, attribution, storage, and load options; select a provider architecture through an ADR.
3. Evaluate live-weather value, free-provider constraints, caching, attribution, and failure modes; either approve a flagged implementation or formally defer it.
4. Produce and approve the North Pole visual style guide, scene composition, asset pipeline, and responsive landmark specifications.
5. Write the four-chapter North Pole story outline and final 24-day ordering before individual content-production issues enter ready status.
6. Define measurable route coverage and Western Hemisphere confidence thresholds during the route prototype rather than guessing them in advance.

These are actionable deliverables, not vague placeholders. Their implementation dependents remain blocked until the recorded decision is accepted.

## Discussion Log

### June 20, 2026 — Initial direction

- Chose a complete modern reinvention.
- Chose Next.js, TypeScript, PostgreSQL, immutable snapshots, and the existing VPS.
- Defined the seasonal product balance: anticipation and activities before Christmas Eve; journey first on Christmas Eve.
- Chose an all-ages storybook-cinematic direction.
- Chose anonymous local personalization, sourced educational content, 24 digital Advent unlocks, and several polished mini-games.
- Chose a deterministic global timezone-sweep journey with a redesigned pacing model.
- Identified the Interactive North Pole as the preferred custom-navigation concept.
- Agreed that planning will continue over time and eventually become a native GitHub tracker and dependency system.

### June 20, 2026 — Decision-complete planning interview

- Locked the six-destination panoramic North Pole, programmatic arrival, mobile landmark snapping, supporting characters, fresh identity, and layered DOM/canvas scene architecture.
- Locked seasonal dates, admin override behavior, activity availability, accessibility target, browser policy, tiered performance, and visual-regression approval.
- Locked editorial route anchors plus tooling suggestions, broad geographic representation, active-location UI priority, layered recent-location information, and an early comparative pacing prototype.
- Locked owner-reviewed sourced cards for every stop and selected deeper articles for major stops.
- Locked the 24-day category allocation, all six custom game concepts, puzzle mix, story structure, creative set, quiz themes, and world-discovery trio.
- Locked device-only progress, personal bests, achievement-driven village decorations, and curated decoration slots.
- Locked admin studio scope, autosaved revisions, passkey/recovery authentication, publication snapshots, and emergency controls.
- Locked local/staging/production isolation, immutable artifact promotion, VPS media storage, and self-hosted essential monitoring.
- Locked one-focused-issue/one-PR defaults, dependency-ready self-assignment, native blockers, evidence-bearing closure, bounded research issues, and no effort estimates.
- Locked six subsystem milestones without due dates, plain-language scope tiers, comprehensive Project views, merge commits, required CI/Greptile, owner review for outside contributors, and grouped dependency maintenance.
- Locked SemVer under the Christmas 2026 season, incremental deployment versions, mandatory per-PR changelog updates, and a curated highlights changelog.

## Next Action

After final approval and outside Plan mode, update this document with any final corrections, obtain the required GitHub Projects authentication scope, and create the complete GitHub planning/maintenance environment in one coordinated pass. Verify all created milestones, fields, views, labels, issues, native relationships, forms, protections, and automation definitions through readback before declaring the planning environment complete.

## GitHub Execution Record — June 20, 2026

The approved plan was converted into the repository-native execution graph:

- Program tracker: GitHub issue #198.
- Ten subsystem trackers: #199–#208.
- Six undated delivery milestones: Foundation, North Pole Experience, Journey and World Content, Advent Experiences, Studio and Operations, and Christmas 2026 Readiness.
- Focused leaf issues through #329, including all 24 named Advent experiences.
- GitHub governance completion issue: #330.
- Native program/subsystem/leaf sub-issue hierarchy: verified through GraphQL readback.
- Native blocked-by graph: 227 relationships created and representative launch dependencies verified.
- Flask-era issue #153 was superseded with links to the new graph; milestone v1.0 was retired.
- Ten duplicate issues created during early concurrent CLI batches (#214, #222–#224, and #228–#233) were closed with references to their dependency-wired canonical issues.

GitHub Project creation, custom fields/views, forms, protections, and supporting governance remain tracked by #330. The current CLI credential must first receive the `project` scope; required checks must not be configured until their workflows exist on the default branch.
