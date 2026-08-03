# Changelog
<!-- markdownlint-disable -->

All notable changes to this project will be documented in this file.

## [Unreleased]

### Next major / beta

#### Beta development notes

<!-- Consolidated beta development history. -->
- **PR #806 (Changed):** Recalibrate Forecast Grade as `gfc-ver-3`: prioritize event capture, tier-aware placement, proportional event yield, and significant-threat placement while retaining probability and false-alarm metrics as transparent diagnostics.
- **PR #792 (Changed):** Refresh `AGENTS.md` with durable GFC project context for modern coding agents.
- **PR #793 (Added):** Add the foundational Forecast Grade verification workspace structure and grading workflow needed by the stacked verification v2 rollout.
- **PR #794 (Changed):** Refine the Forecast Grade verification workspace into the analysis-deck layout and align its visual language with the product UI.
- **PR #795 (Changed):** Complete the Forecast Grade verification workspace viewport, grading-state, sidebar, and control polish.
- **PR #791 (Changed):** Make Forecast Grade actionable after a package is loaded: preserve the outlook’s valid report date, keep the grading action and status visible, expose retry state, and keep SPC evidence readable over a softened verification map with an on-demand legend. Complete the desktop viewport fit, grading progress state, custom selectors, report legend, score breakdown, and one-entry-per-day trend presentation.
- **PR #790 (Changed):** Enable the new Forecast Grade verification page for beta testers while keeping staging and production disabled.
- **PR #778 (Added):** Add anonymous Forecast Grade share card with download, share, and copy actions.
- **PR #777 (Changed):** Add Forecast Grade result workspace with score breakdown, report table, and grade trend.
- **PR #776 (Added):** Forecast Grade dashboard shell: replace the 06b stub with the map-first workspace chrome (`ForecastGradeDashboard` plus dedicated `ForecastGradeMapPane` / `ForecastGradeMapControls`), categorical map layer as a display-only toggle, and `applyGradeSnapshot` to reopen premium cards through the shared verification map.
- **PR #776 (Added):** `useForecastGrade` gains `activeMapLayer` state, `deserializeForecast` import, and the `applyGradeSnapshot` callback alongside the 06b `runGeneration` / `hasReachedReportDate` stale-run and future-date guards that the rebase would otherwise drop.
- **PR #789 (Added):** Add icon-based Undo and Redo controls to the map tools panel, aligned to the right of the Pan, Draw, Delete, and Key controls on desktop and mobile.
- **PR #775 (Added):** Add Forecast Grade dashboard supporting components (`SourcePanel`, `DataQualityPanel`, `GradeHeadline`, `RunProgress`, grade formatters, methodology copy) and the `useForecastGrade` run hook that turns the verified report date, source panel selection, and source entitlements into a `runForecastGrade` invocation gated until the report date is reached. Source panel is split into `SourcePanel` + `sourcePanelParts` for code health.
- **PR #774 (Added):** Wire the `verificationRelaunch` gate, surfaces, and classic `/verification` coexistence routing so the Forecast Grade dashboard shell can land in the next stacked PR (06b/06c/07). The flag stays off on every build target until that shell flips it; classic `/verification` is the default in the meantime.
- **PR #774 (Added):** Land a temporary `ForecastGradeDashboard` stub so the lazy import resolves before the real shell lands.
- **PR #773 (Added):** Add explicit package source adapters (`loadForecastFromFile`, `loadReportsForDate`) and capability-aware `resolveAccountTier` / `availablePackageSources` for the Forecast Grade dashboard. Signed-in tiers keep 25-card trend history; premium also stores restorable immutable snapshots, scoped per user id.
- **PR #773 (Added):** Convert ISO `YYYY-MM-DD` report dates to SPC `YYMMDD` before archive fetch so the file-based source works with native date inputs. Move the converter into a dedicated `archiveDate` module and validate against a real calendar.
- **PR #787 (Changed):** Dependency: @radix-ui/react-dialog ^1.1.20 → ^1.1.23
- **PR #787 (Changed):** Dependency: @radix-ui/react-dropdown-menu ^2.1.21 → ^2.1.24
- **PR #787 (Changed):** Dependency: @radix-ui/react-popover ^1.1.20 → ^1.1.23
- **PR #787 (Changed):** Dependency: @radix-ui/react-slot ^1.3.0 → ^1.3.3
- **PR #787 (Changed):** Dependency: @radix-ui/react-tabs ^1.1.18 → ^1.1.21
- **PR #787 (Changed):** Dependency: @radix-ui/react-tooltip ^1.2.13 → ^1.2.16
- **PR #787 (Changed):** Dependency: @sentry/react ^10.67.0 → ^10.68.0
- **PR #787 (Changed):** Dependency: @testing-library/jest-dom ^6.6.3 → ^7.0.0
- **PR #787 (Changed):** Dependency: lucide-react ^1.25.0 → ^1.27.0
- **PR #787 (Changed):** Dependency: ol-mapbox-style ^13.4.1 → ^13.4.2
- **PR #787 (Changed):** Dependency: react ^19.2.7 → ^19.2.8
- **PR #787 (Changed):** Dependency: react-dom ^19.2.7 → ^19.2.8
- **PR #787 (Changed):** Dependency: rollup >=4.62.2 → >=4.62.3
- **PR #787 (Changed):** Dependency: web-vitals ^5.3.0 → ^6.0.1
- **PR #787 (Changed):** Dependency: @playwright/test ^1.61.1 → ^1.62.0
- **PR #787 (Changed):** Dependency: @vitejs/plugin-react ^6.0.3 → ^6.0.4
- **PR #787 (Changed):** Dependency: @sentry/node ^10.67.0 → ^10.68.0 (`server`)
- **PR #787 (Changed):** Dependency: express-rate-limit ^8.6.0 → ^8.6.1 (`server`)
- **PR #772 (Changed):** Add composite rollup, the `runForecastGrade` orchestrator, and the public `verificationV2` engine entry point. Address the CodeRabbit review on `runForecastGrade` (reuse staged product grades), `gradeProduct` (handle report-only products), and the data-quality gate (count per-product reports).
- **PR #771 (Changed):** Add event yield and severity intent-layer component scorers for Forecast Grade. `scoreEventYield` filters reports to the supplied hazard product before scoring so reports for other hazards never influence the product's yield.
- **PR #770 (Added):** Add probability skill (Brier/BSS), spatial contingency, and false-alarm discipline component scorers.
- **PR #769 (Added):** Add SPC 25-mile neighborhood and Armchair-style area geometry helpers for Forecast Grade spatial scoring.
- **PR #768 (Changed):** Start Verification v2 / Forecast Grade (`gfc-ver-1`) with the versioned formula contract (constants, bands, and component weight scaffolding) behind upcoming `verificationRelaunch` work. Follow-up stacked PRs add the engine, sources, gated dashboard, share card, and docs (#769–#780; umbrella index #766).
- **PR #765 (Changed):** Upgrade the compiler to TypeScript 7, replace the incompatible `ts-jest` bridge with Babel/Jest tooling, and enforce production plus test-regression typechecking in CI.
- **PR #784 (Changed):** Replace `public/favicon.ico` with the cloud icon so apps that request `/favicon.ico` directly show the correct branding instead of the React logo.
- **PR #763 (Changed):** Route Auto-TSTM previews exclusively through scheduled cached guidance and retire the direct generation API.
- **PR #760 (Changed):** Restore native Umami page views for accurate traffic metrics, make non-essential telemetry an explicit opt-in, minimize tracker URL data, and clarify GFC's cookie-free pseudonymous telemetry disclosure.
- **PR #759 (Changed):** Replace GA4 and the legacy collector with privacy-gated, self-hosted Umami telemetry that keeps beta and production reporting separate.
- **PR #758 (Changed):** Dependency: @radix-ui/react-dialog ^1.1.19 → ^1.1.20
- **PR #758 (Changed):** Dependency: @radix-ui/react-dropdown-menu ^2.1.20 → ^2.1.21
- **PR #758 (Changed):** Dependency: @radix-ui/react-popover ^1.1.19 → ^1.1.20
- **PR #758 (Changed):** Dependency: @radix-ui/react-tabs ^1.1.17 → ^1.1.18
- **PR #758 (Changed):** Dependency: @radix-ui/react-tooltip ^1.2.12 → ^1.2.13
- **PR #758 (Changed):** Dependency: @sentry/react ^10.65.0 → ^10.67.0
- **PR #758 (Changed):** Dependency: immer ^11.1.11 → ^11.1.15
- **PR #758 (Changed):** Dependency: lucide-react ^1.24.0 → ^1.25.0
- **PR #758 (Changed):** Dependency: @tailwindcss/postcss ^4.3.2 → ^4.3.3
- **PR #758 (Changed):** Dependency: autoprefixer ^10.5.2 → ^10.5.4
- **PR #758 (Changed):** Dependency: tailwindcss ^4.3.2 → ^4.3.3
- **PR #758 (Changed):** Dependency: vite ^8.1.4 → ^8.1.5
- **PR #758 (Changed):** Dependency: @sentry/node ^10.65.0 → ^10.67.0 (`server`)
- **PR #758 (Changed):** Dependency: express-rate-limit ^8.5.2 → ^8.6.0 (`server`)
- **PR #758 (Changed):** Dependency: firebase-admin ^14.1.0 → ^14.2.0 (`server`)
- **PR #758 (Changed):** Dependency: stripe ^22.3.1 → ^22.3.2 (`server`)
- **PR #752 (Changed):** Enable the approved Custom Products workspace for beta testers while keeping staging and production disabled.
- **PR #751 (Changed):** Refine the local-only Saved products experience with a responsive library layout, a respectful free-user Premium path, and a simple local-preview tester checklist.
- **PR #746 (Changed):** Integrate local custom layers with forecast workflows, exports, imports, map legends, and workflow disclosures.
- **PR #744 (Changed):** Add reusable custom product creation, editing, lifecycle management, and snapshot-based use in local forecasts.
- **PR #757 (Changed):** Keep custom layer and category picker popovers above forecast safety and status overlays.
- **PR #743 (Changed):** Add local-only custom forecast layers with category styling, polygon drawing, map legend support, and regression coverage while hosted environments remain unchanged.
- **PR #755 (Changed):** Repair custom diagonal, reverse-diagonal, and crosshatch map fills so their repeated canvas tiles align cleanly.
- **PR #745 (Changed):** Secure reusable custom products with owner-scoped Firestore rules, premium enforcement, and hostile-client coverage.
- **PR #756 (Changed):** Match exported forecast JPEG bounds to the OpenLayers viewport to remove unused white space below the map.
- **PR #750 (Changed):** Polish the local custom-product forecast workspace with an animated mode switch, compact controls, saved-product modal, and cohesive color picker.
- **PR #742 (Changed):** Define versioned one-off custom layer, reusable hosted product, embedded snapshot, and expiration/read-only contracts with strict validation and local-only exposure.
- **PR #740 (Changed):** Require protected reviewer approval and pre-promotion build/test validation for the legacy direct beta-to-main emergency workflow.
- **PR #741 (Changed):** Prevent replayed Stripe webhook deliveries from double-counting premium upgrade and cancellation metrics.
- **PR #729 (Changed):** Enable the validated forecast workflow v2 surfaces for beta testers while keeping staging and production disabled.
- **PR #720 (Changed):** Add authenticated workflow continuity E2E coverage across all built-in scopes, discussion grouping, package transfer, and second-page restore paths.
- **PR #711 (Changed):** Clear scoped autosaves when users confirm a fresh blank or workflow start, restore workflow metadata from saved cycles, and keep workflow confirmation and completion dialogs usable on small screens.
- **PR #712 (Changed):** Add guarded localhost free and premium account fixtures for authenticated workflow E2E testing without hosted Firebase sessions or cloud writes.
- **PR #723 (Changed):** Add hostile-client hosted authorization coverage, protect server-managed account fields, enforce trusted premium eligibility for cloud writes, and preserve bounded beta workflow data plus owner export/delete access after downgrade.
- **PR #788 (Changed):** Fix beta Auto-TSTM ingestion by configuring the analytics worker to use the project virtual-environment Python interpreter.
- **PR #699 (Changed):** Add post-completion handoff guidance for workflow and complete-cycle exports, eligible Monitor navigation, return-to-map, and duplicate-prompt suppression.
- **PR #698 (Changed):** Add distinct workflow-scoped and complete-cycle package exports with compatibility-preserving manifests.
- **PR #697 (Changed):** Add privacy-safe, allowlisted workflow lifecycle analytics with failure isolation.
- **PR #696 (Changed):** Preserve forecast sessions and cloud handoffs across day rollover choices.
- **PR #695 (Changed):** Add consented, metadata-only workflow awareness synchronization with strict persistence safeguards.
- **PR #694 (Changed):** Preserve discussions and drafts across workflow grouping, scope, and route changes.
- **PR #693 (Changed):** Dependency: @radix-ui/react-dialog ^1.1.18 → ^1.1.19
- **PR #693 (Changed):** Dependency: @radix-ui/react-dropdown-menu ^2.1.19 → ^2.1.20
- **PR #693 (Changed):** Dependency: @radix-ui/react-popover ^1.1.18 → ^1.1.19
- **PR #693 (Changed):** Dependency: @radix-ui/react-tabs ^1.1.16 → ^1.1.17
- **PR #693 (Changed):** Dependency: @radix-ui/react-tooltip ^1.2.11 → ^1.2.12
- **PR #693 (Changed):** Dependency: @sentry/react ^10.63.0 → ^10.65.0
- **PR #693 (Changed):** Dependency: @types/node ^26.1.0 → ^26.1.1
- **PR #693 (Changed):** Dependency: firebase ^12.15.0 → ^12.16.0
- **PR #693 (Changed):** Dependency: lucide-react ^1.23.0 → ^1.24.0
- **PR #693 (Changed):** Dependency: @sentry/vite-plugin ^5.3.0 → ^5.4.0
- **PR #693 (Changed):** Dependency: vite ^8.1.3 → ^8.1.4
- **PR #693 (Changed):** Dependency: @sentry/node ^10.63.0 → ^10.65.0 (`server`)
- **PR #693 (Changed):** Dependency: stripe ^22.3.0 → ^22.3.1 (`server`)
- **PR #692 (Changed):** Preserve the exact forecast day and outlook section when navigating from a workflow completion missing-item prompt.
- **PR #685 (Changed):** Add Home workflow entry points for starting, resuming, updating, and uploading workflow packages.
- **PR #685 (Changed):** Protect workflow starts from disabled exposure targets and unsaved-cycle loss.
- **PR #684 (Changed):** Add a persistent workflow banner across the Forecast and Discussion routes with map, discussion, review, update, and export actions.
- **PR #684 (Changed):** Keep the workflow feature gated by the existing exposure policy until rollout adoption is updated.
- **PR #682 (Changed):** Add reusable workflow templates for Day 1, Day 2, Day 3, Days 4-8, and Full Outlook workflows with persistent activation in localStorage.
- **PR #682 (Changed):** Start workflow templates on the correct forecast day and support same-cycle updates plus start-from-previous-cycle behavior.
- **PR #682 (Changed):** Preserve workflow metadata when loading workflow-ready `forecast_cycle.json` files.
- **PR #682 (Changed):** Fix completion validation to respect the active workflow groupings and invalidate stale package completion when map or discussion content changes.
- **PR #682 (Changed):** Prevent local session restore from overwriting in-progress unsaved forecast or discussion state.
- **PR #688 (Changed):** Add the sliding active-tab background indicator and a touch of top breathing room around toolbar tabs.
- **PR #688 (Changed):** Slow and smooth the tab, panel, and button motion for a calmer feel.
- **PR #688 (Changed):** Make horizontal toolbar scrolling easier to use and styles Days as a segmented control.
- **PR #688 (Changed):** Separate Tools groups with compact tags.
- **PR #687 (Changed):** Replace the repeated header selection/status pill with compact context text and tighten the Days tab width.
- **PR #687 (Changed):** Add structure for grouped Tools actions and breathing room between ghost-layer icons and labels.
- **PR #686 (Changed):** Add horizontal breathing room to the forecast toolbar selection swatch (wider min width, larger padding and gap) and switch the probability digits to tabular-nums so the chip stays balanced with longer outlook names.
- **PR #686 (Changed):** Widen the Current Selection toolbar section to 360px so the swatch and toggle fit without crowding.
- **PR #683 (Changed):** Modernize the package review and completion dialogs with shared dialog primitives and review/export actions.
- **PR #691 (Changed):** Filter known no-stack browser telemetry noise tracked by GFC-WEB-K and GFC-WEB-M while preserving actionable errors.
- **PR #681 (Changed):** Dependency: @radix-ui/react-dialog ^1.1.17 → ^1.1.18
- **PR #681 (Changed):** Dependency: @radix-ui/react-dropdown-menu ^2.1.18 → ^2.1.19
- **PR #681 (Changed):** Dependency: @radix-ui/react-popover ^1.1.17 → ^1.1.18
- **PR #681 (Changed):** Dependency: @radix-ui/react-tabs ^1.1.15 → ^1.1.16
- **PR #681 (Changed):** Dependency: @radix-ui/react-tooltip ^1.2.10 → ^1.2.11
- **PR #681 (Changed):** Dependency: @sentry/react ^10.62.0 → ^10.63.0
- **PR #681 (Changed):** Dependency: @types/node ^26.0.1 → ^26.1.0
- **PR #681 (Changed):** Dependency: immer ^11.1.8 → ^11.1.11
- **PR #681 (Changed):** Dependency: lucide-react ^1.22.0 → ^1.23.0
- **PR #681 (Changed):** Dependency: react-router-dom ^7.18.0 → ^7.18.1
- **PR #681 (Changed):** Dependency: vite ^8.1.0 → ^8.1.3
- **PR #681 (Changed):** Dependency: @sentry/node ^10.62.0 → ^10.63.0 (`server`)
- **PR #670 (Changed):** Address Greptile and CodeScene review feedback from prematurely merged #664: preserve legacy grouping data via `migrateLegacyForecastToSerializedPackage`, remove dead helpers, add typed `cycleMetadata` on `GFCForecastSaveData`, and reduce serialization complexity.
- **PR #676 (Changed):** Added 8-step agentic development workflow to AGENTS.md
- **PR #664 (Changed):** Added backward-compatible cycle and workflow serialization with v2 metadata support
- **PR #666 (Changed):** Added workflow completion validation with actionable missing item navigation and omission acknowledgement
- **PR #660 (Changed):** Define workflow v2 schema types: stable cycle/workflow IDs, cycle and outlook status enums, outlook versioning with derivation tracking, standard and custom groupings, workflow/cycle/package metadata, and schema version constant (WF-01, #451).
- **PR #660 (Changed):** Add 27 focused unit tests covering all type definitions and acceptance criteria.
- **PR #660 (Changed):** Re-export new types from `outlooks.ts` for backward compatibility.
- **PR #655 (Changed):** Move Monitor UI and map components under `src/monitor/components` so Monitor domain logic and implementation components share one feature-owned area.
- **PR #654 (Changed):** Add the #445 codebase inventory and reorganize docs into architecture, operations, product, releases, and review-removal archive areas.
- **PR #653 (Changed):** Port deployment feature-switch config from #651: add per-target config files under `deploy/` and wire beta, staging, and production analytics env generation through the checked-out deploy ref.
- **PR #653 (Changed):** Harden deployment config validation for newline injection, path traversal, and readable CLI errors.
- **PR #650 (Changed):** Add Auto-TSTM beta tester plans, including a short step-by-step test, a full forecast test, and copy-ready report templates.
- **PR #650 (Changed):** Document that beta deployment enables Auto-TSTM generation and ingestion through `deploy/beta-deployment-config.json`.
- **PR #649 (Changed):** Integrate Auto-TSTM preview, apply, cancel, and stale-result protection in the forecast editor (TSTM-05, #476).
- **PR #649 (Changed):** Fetch cached guidance via `requestLatestTstmData`, render ephemeral map preview with run/source/validity metadata, and apply through one undoable `replaceTstmFeatures` replacement.
- **PR #649 (Changed):** Reject late cycle/day responses using `isCurrentTstmRequest`; preserve existing polygons on failure or cancel.
- **PR #649 (Changed):** Enable `autoTstm` on beta behind `ServerBackedFeatureBoundary` when server capability is available.
- **PR #648 (Changed):** Harden cached Auto-TSTM API: public read policy, rate limits on `GET /api/tstm/latest` and `GET /api/tstm/status`, structured stale/unavailable/corrupt error reasons, and operational cache health (TSTM-04, #475).
- **PR #648 (Changed):** Align ingestion cache schema with client response validation (`forecastHours`, `warnings`).
- **PR #648 (Changed):** Extend Auto-TSTM server/client tests and exposure contracts for the latest and status routes.
- **PR #648 (Changed):** Document Auto-TSTM operational behavior in `docs/auto-tstm-operations.md`.
- **PR #647 (Changed):** Reduce redundant Turf feature collection allocation in Auto-Categorical hatching and cumulative risk generation (PERF-04, #589).
- **PR #647 (Changed):** Extend Auto-Categorical tests for hatching splits, cumulative risk rings, and allocation regression coverage.
- **PR #646 (Changed):** Add scheduled TSTM ingestion: periodic server-side discovery of new HREF runs with golden-copy caching that only replaces confirmed data (TSTM-03, #474).
- **PR #646 (Changed):** Add `GET /api/tstm/latest` endpoint for pre-cached TSTM data.
- **PR #646 (Changed):** Add `--ingestion-mode` flag to Python generator for completeness metadata.
- **PR #646 (Changed):** Add `requestLatestTstmData()` client utility.
- **PR #645 (Changed):** Fix Sentry GFC-WEB-G by portaling the Forecast Cycle History modal to `document.body`, unifying its overlay/dialog shell with `notranslate`, deferring parent close after nested confirm actions, and stacking confirm overlays above the history dialog.
- **PR #644 (Changed):** Adopt the feature exposure registry across all six v1.7 workstreams: adoption manifest, registry-only acknowledgements, v1.7 adoption policy rule, adoption exposure tests, gated-route smoke checks, and tracker cross-links (FND-14, #530).
- **PR #643 (Changed):** Add reusable feature exposure test fixtures and harness for client/server disabled-side-effect contracts, exemplar coverage for `tropicalWorkspace` and `autoTstm`, `pnpm test:exposure`, and documentation (FND-13, #529).
- **PR #637 (Changed):** Dependency: @sentry/react ^10.59.0 → ^10.62.0
- **PR #637 (Changed):** Dependency: @types/node ^26.0.0 → ^26.0.1
- **PR #637 (Changed):** Dependency: lucide-react ^1.21.0 → ^1.22.0
- **PR #637 (Changed):** Dependency: @playwright/test ^1.61.0 → ^1.61.1
- **PR #637 (Changed):** Dependency: @tailwindcss/postcss ^4.3.1 → ^4.3.2
- **PR #637 (Changed):** Dependency: @vitejs/plugin-react ^6.0.2 → ^6.0.3
- **PR #637 (Changed):** Dependency: autoprefixer ^10.4.27 → ^10.5.2
- **PR #637 (Changed):** Dependency: tailwindcss ^4.3.1 → ^4.3.2
- **PR #637 (Changed):** Dependency: vite ^8.0.16 → ^8.1.0
- **PR #637 (Changed):** Dependency: @sentry/node ^10.59.0 → ^10.62.0 (`server`)
- **PR #637 (Changed):** Dependency: firebase-admin ^14.0.0 → ^14.1.0 (`server`)
- **PR #637 (Changed):** Dependency: stripe ^22.2.2 → ^22.3.0 (`server`)
- **PR #635 (Changed):** Add feature exposure diagnostics for maintainers: typed resolution helpers, `pnpm exposure:diagnostics` CLI, and a local-only dev page showing why each feature is enabled or disabled (FND-12).
- **PR #636 (Changed):** Document Cursor Cloud development environment setup in `AGENTS.md` (dependency install flow, frontend/backend run commands, and non-obvious lint/typecheck/test caveats).
- **PR #632 (Changed):** Add server-authoritative emergency capability disable via `EMERGENCY_DISABLED_CAPABILITIES`, including fail-closed parsing, `/api/capabilities/status`, and client runtime fallback for already-mounted server-backed features (FND-11, #527).
- **PR #631 (Changed):** Add weekly/manual stale branch reporting for `feature/*`, `fix/*`, and `research/*` branches with a 14-day grace period, orphaned vs open-PR grouping, and commits-behind-`beta` metadata (#494).
- **PR #630 (Changed):** Harden `cleanup-port-branches` workflow: replace `pull_request_target` with `pull_request`, validate port branch names against the automation allowlist before ref deletion, and document security-critical guards (#606).
- **PR #629 (Changed):** Pin all third-party workflow actions to immutable commit SHAs; enable Dependabot `github-actions` updates (#604).
- **PR #616 (Changed):** Complete PR #612 porting on beta: hotfix merges into `main` use reviewable port PRs instead of direct post-merge beta sync. Preserves `betaContainsMain` port PR policy checks from earlier beta work.
- **PR #610 (Changed):** Add beta-to-main production exposure report (\`pnpm exposure:report\`), promotion CI gate, and single upserted PR comment with pass/fail status tables for promotion PRs (FND-07).
- **PR #609 (Changed):** Complete FND-06 feature exposure CI policy with bidirectional client/server registry alignment, side-effect key validation, and acknowledgement manifest enforcement for gated features.
- **PR #590 (Changed):** Add feature exposure labels (`exposure:production`, `exposure:server-backed`, `exposure:registry-change`) to automatically tag PRs that change feature exposure configuration.
- **PR #582 (Changed):** Dependency: @radix-ui/react-dialog ^1.1.16 → ^1.1.17
- **PR #582 (Changed):** Dependency: @radix-ui/react-dropdown-menu ^2.1.17 → ^2.1.18
- **PR #582 (Changed):** Dependency: @radix-ui/react-popover ^1.1.16 → ^1.1.17
- **PR #582 (Changed):** Dependency: @radix-ui/react-slot ^1.2.5 → ^1.3.0
- **PR #582 (Changed):** Dependency: @radix-ui/react-tabs ^1.1.14 → ^1.1.15
- **PR #582 (Changed):** Dependency: @radix-ui/react-tooltip ^1.2.9 → ^1.2.10
- **PR #582 (Changed):** Dependency: @sentry/react ^10.58.0 → ^10.59.0
- **PR #582 (Changed):** Dependency: @types/node ^25.9.3 → ^26.0.0
- **PR #582 (Changed):** Dependency: firebase ^12.14.0 → ^12.15.0
- **PR #582 (Changed):** Dependency: lucide-react ^1.18.0 → ^1.21.0
- **PR #582 (Changed):** Dependency: react-router-dom ^7.17.0 → ^7.18.0
- **PR #582 (Changed):** Dependency: rollup >=4.62.0 → >=4.62.2
- **PR #582 (Changed):** Dependency: uuid ^14.0.0 → ^14.0.1
- **PR #582 (Changed):** Dependency: @babel/core ^7.29.7 → ^8.0.1
- **PR #582 (Changed):** Dependency: @babel/preset-env ^7.29.7 → ^8.0.2
- **PR #582 (Changed):** Dependency: @babel/preset-react ^7.29.7 → ^8.0.1
- **PR #582 (Changed):** Dependency: @babel/preset-typescript ^7.29.7 → ^8.0.1
- **PR #582 (Changed):** Dependency: @sentry/node ^10.58.0 → ^10.59.0 (`server`)
- **PR #582 (Changed):** Dependency: stripe ^22.2.1 → ^22.2.2 (`server`)
- **PR #579 (Changed):** Add CI policy validation for feature exposure metadata, gated routes, navigation, and matching server capabilities.
- **PR #577 (Changed):** Replace mutable Redux product flags with typed build-target exposure selectors so core forecast capabilities read from the feature registry instead of browser state.
- **PR #573 (Changed):** Add centralized server capability lookup, route gates, and `SERVER_TARGET` deploy env wiring so experimental APIs reject before expensive work and stay aligned with the client feature exposure registry.
- **PR #572 (Changed):** Gate client routes, navigation, lazy modules, and mount boundaries through the feature exposure registry so disabled v1.7 work never registers paths, shows nav links, or initializes effects.
- **PR #571 (Changed):** Add the typed feature exposure registry with per-target matrices, lifecycle metadata, and `isFeatureExposed` helpers for v1.7 workstreams.
- **PR #568 (Changed):** Add explicit, validated local, beta, staging, and production frontend build targets while preserving the existing beta access gate.
- **PR #548 (Changed):** Document Auto-TSTM SPC calibrated thunder inputs, thresholds, and Day 1/2 window definitions; add fixture tests for period hours and thresholds.
- **PR #547 (Changed):** Dependency: @sentry/react ^10.56.0 → ^10.58.0
- **PR #547 (Changed):** Dependency: @types/node ^25.9.2 → ^25.9.3
- **PR #547 (Changed):** Dependency: lucide-react ^1.17.0 → ^1.18.0
- **PR #547 (Changed):** Dependency: rollup >=4.61.1 → >=4.62.0
- **PR #547 (Changed):** Dependency: @playwright/test ^1.59.1 → ^1.61.0
- **PR #547 (Changed):** Dependency: @tailwindcss/postcss ^4.2.4 → ^4.3.1
- **PR #547 (Changed):** Dependency: tailwindcss ^4.2.2 → ^4.3.1
- **PR #547 (Changed):** Dependency: @sentry/node ^10.56.0 → ^10.58.0 (`server`)
- **PR #547 (Changed):** Dependency: firebase-admin ^13.8.0 → ^14.0.0 (`server`)
- **PR #547 (Changed):** Dependency: stripe ^22.2.0 → ^22.2.1 (`server`)
- **PR #526 (Changed):** Preserve the hidden Auto-TSTM client API boundary, response validation, and stale-request identity without mounting unfinished controls.
- **PR #525 (Changed):** Preserve the Auto-TSTM Python GRIB2 generator and server adapter behind a default-off deployment capability with focused tests; retire the obsolete generic HREF inventory probe.


#### Security
- **Hosted authorization boundaries:** Add source-controlled Firestore rules, hostile-client emulator coverage, reserved profile-field protection, trusted premium enforcement for cloud writes, and bounded cloud-cycle documents while retaining owner export/delete access after downgrade.
- **CI shell injection:** Pass PR branch refs through `env` in `ci.yml` and `pr-governance.yml` `git fetch` steps so branch names cannot break out of the shell command.
- **Dependabot changelog workflow:** Require Dependabot PR provenance before checking out PR head code with `GH_PAT`; pass base ref through env in shell steps; pin `actions/checkout` to an immutable SHA.
- **Beta deploy supply chain:** Use `pnpm install --frozen-lockfile` in the beta deploy workflow so builds cannot silently resolve new dependency versions at deploy time.
- **Production deploy supply chain:** Use `pnpm install --frozen-lockfile` in the production deploy workflow so builds cannot silently resolve new dependency versions at deploy time.

#### Changed
- **Deploy feature config:** Move server-backed feature switches into `deploy/beta-deployment-config.json` and `deploy/production-deployment-config.json`, with deploy workflows appending the target config into analytics env files.
- **Deploy env:** Add explicit `SERVER_TARGET` values to beta, staging, and production analytics server deploy env files.
- **Deploy triggers:** Run **Deploy Beta** on beta prerelease publish and **Deploy Production** on stable release publish (one deploy per version bump; merge pushes no longer trigger VPS deploys).

#### Fixed
- **Favicon branding:** Replace `public/favicon.ico` with the cloud icon so apps that request `/favicon.ico` directly show the correct branding instead of the React logo.
- **Deploy reliability:** Harden beta and production VPS deploy workflows against flaky `ssh-keyscan` host-key discovery with pinned known-host secrets, retries, deploy concurrency, and explicit `StrictHostKeyChecking` on SSH/rsync.
- **GFC-WEB-H/J Sentry noise:** Filter the known OpenLayers canvas renderer `requestAnimationFrame` noise before it reaches Sentry while preserving actionable application TypeErrors.
- **GFC-WEB-K/F/E Sentry noise:** Filter no-stack browser `NetworkError`/`AbortError` promise-rejection noise before it reaches Sentry while preserving actionable exceptions.

#### Added
- **Account lifecycle:** Add recently authenticated self-service account deletion that ends linked subscriptions, removes hosted account data, and preserves local/offline saves.
- **OpenCode GitHub Actions workflow:** Trigger `/oc` or `/opencode` comments on issues and PR review threads to run the pinned OpenCode GitHub action with repository `GITHUB_TOKEN` auth.
- **Explicit build targets:** Define and validate local, beta, staging, and production frontend build targets while preserving the existing beta access gate.
- **PR governance:** Add feature exposure labels (`exposure:production`, `exposure:server-backed`, `exposure:registry-change`) to automatically tag PRs that change feature exposure configuration.

### Stable 1.6.x hotfixes

<!-- Production hotfix entries only. Do not put next-major work in this lane. -->

#### Fixed

<!-- No unreleased stable hotfixes. -->

## v1.6.6

### Dependencies
<!-- dependabot-automation -->

- **uuid:** ^14.0.0 → ^14.0.1

### Security
- **Dependency vulnerability remediation:** Upgraded `protobufjs` to 7.6.4 across the browser and analytics server dependency graphs, `js-yaml` to 4.2.0 in test tooling, and `ws` to 8.21.0 in jsdom tooling to resolve Dependabot denial-of-service and schema-name collision advisories.
## v1.6.4

### Fixed
- **OpenLayers map stability (GFC-WEB-5, GFC-WEB-9, GFC-WEB-C):** Completed the Monitor map popup fix by rendering NWS alert overlays imperatively instead of portaling React into OpenLayers-moved DOM nodes. Hardened map teardown order and marked map shells `notranslate` so Chrome auto-translate is less likely to trigger `removeChild` errors on forecast, verification, and monitor maps.
- **Build dependency security (Dependabot #128 and #129):** Replaced the transitive `esbuild` 0.27.x installation with an explicit patched `esbuild` 0.28.1 development dependency and added a `pnpm.overrides` guard to prevent the vulnerable resolution from returning.

## v1.6.1

### Dependencies
- **qs:** ^6.14.2 → ^6.15.2 (override; `server` and root)

### Fixed
- **GFC-WEB-B (Auth Persistence):** Explicitly set `browserLocalPersistence` for Firebase Auth to prevent session drops.
- **GFC-WEB-A (Firestore Sync):** Aggressive background network disconnection now waits for pending writes and uses a serialized transition pattern to prevent race conditions.
- **qs DoS in `stringify` (Dependabot #125):** Bumped `qs` to `^6.15.2` in root and analytics server to resolve the array-format DoS vulnerability.

## v1.6

### Dependencies
<!-- dependabot-automation -->

- **express-rate-limit:** ^8.5.1 → ^8.5.2 (`server`)
- **express:** ^4.21.2 → ^5.2.1 (`server`)
- **stripe:** ^22.1.1 → ^22.2.0 (`server`)
- **@types/node:** ^25.5.0 → ^25.9.1
- **@types/react-dom:** 18.2.18 → 19.2.3
- **immer:** ^11.1.4 → ^11.1.8
- **react-redux:** ^9.2.0 → ^9.3.0
- **react-router-dom:** ^7.15.1 → ^7.16.0
- **rollup:** >=4.60.4 → >=4.61.0
- **@babel/core:** ^7.29.0 → ^7.29.7
- **@babel/preset-env:** ^7.29.2 → ^7.29.7
- **@babel/preset-react:** ^7.28.5 → ^7.29.7
- **@babel/preset-typescript:** ^7.28.5 → ^7.29.7
- **ts-jest:** ^29.4.9 → ^29.4.11
- **vite:** ^8.0.14 → ^8.0.16
- **@sentry/react:** ^10.53.1 → ^10.56.0
- **@types/react:** 19.2.15 → 19.2.16
- **firebase:** ^12.12.0 → ^12.14.0
- **lucide-react:** ^1.16.0 → ^1.17.0
- **react:** ^19.2.6 → ^19.2.7
- **react-dom:** ^19.2.6 → ^19.2.7
- **web-vitals:** ^5.2.0 → ^5.3.0
- **@sentry/node:** ^10.53.1 → ^10.56.0 (`server`)

### Added
- **Monitor (`/monitor`):** Live weather workspace with radar and satellite WMS layers (site and composite modes, opacity, animation speed), read-only overlay of the active forecast cycle / saved local cycles / premium cloud library outlooks, NWS watches-warnings-advisories layer, and storm reports with hazard filters plus optional outlook-type matching. Redux `monitorSlice`, `MonitorControls` / `MonitorMap`, premium settings sync via `usePremiumMonitorSettingsSync`, and navbar route with shortcut.
- **Monitor — NWS alerts & storm reports:** `useMonitorNwsAlerts` and `useMonitorStormReports` integrations, panel toggles, and map rendering for alert polygons and report markers.
- **Monitor — outlook on map:** `buildMonitorOutlookOptions`, cloud outlook fetch hook, and OpenLayers outlook layer styling aligned with forecast outlook types.
- **What's New page:** Public `/updates` route with v1.6 copy in `src/content/updates/v1.6.ts` and screenshot directory `public/updates/v1.6/` (hero promo image and section screenshots as assets are added).
- **What's New navigation:** Navbar Resources overflow menu links to `/updates` so the release page is discoverable without typing the URL.
- **What's New images:** Release screenshots open in a full-size lightbox when clicked so promo and section images remain readable on narrow layouts.

### Changed
- **Release automation:** Post-merge beta bump after `main` releases no longer resets an in-progress beta line when `main` is still on an older stable (e.g. `1.5.3` infra merge while beta stays on `1.6.0-beta.N`). New `X.Y.0-beta.1` only after a real promotion of that line.
- **Alert banner tests:** Repair corrupted `AlertBanner.test.tsx` from release sync (syntax error and broken dismissible test).
- **Analytics server:** Land Express 5 and Stripe Node 22 on beta (`server/analytics.js` / `configureApp`) and shared smoke-test app wiring for CodeQL rate-limit coverage on `/collect`.
- **Alert banner:** Optional `linkUrl` / `linkLabel`, `startsAt` / `expiresAt` scheduling, and `id` on `public/alert-banner.json`; client normalizes config in `alertBannerConfig.ts`. See `docs/alert-banner.md`.


### Fixed
- **Monitor radar/satellite after theme change:** Keep the OpenLayers map mounted when toggling light/dark mode (update basemap tiles only) and re-apply WMS layers on theme changes so satellite and radar imagery no longer disappear or show “Latest time unavailable” until a full page refresh.
- **GFC-WEB-8 (beta routes after `/updates` split):** `BetaAccessGuard` forwards `AppLayout` outlet context so home, forecast, and other guarded routes can destructure `addToast` again.
- **Signed-in home (light mode):** Primary gradient “Resume Forecast” buttons use white text instead of `#067aff` on the concept home layout (`.home-concept-top-primary`, `.home-concept-action-primary`).
- **Analytics server tests:** Share `configureApp` with production so `/collect` stays rate-limited in server smoke tests (fixes CodeQL `js/missing-rate-limiting` on `beta`).
- **Analytics server (beta):** Restored a broken partial merge in `server/analytics.js` so the hosted collector starts again before Express 5 / Stripe 22 land.
- **Stripe subscription webhooks:** Read `current_period_end` from subscription items for Stripe API 2025-03-31+ (stripe-node v22) with fallback for older payloads.
- **Map layer transparency:** Restored `transparencyScale` on forecast map fill/stroke opacity after the main sync dropped the multiplier (fixes CI on `beta`).
- **OpenLayers popups:** Avoid `removeChild` NotFoundError when React popup nodes are moved during map teardown.
- **Forecast keyboard shortcuts (GFC-WEB-3):** Ignore `keydown` events where the browser omits `KeyboardEvent.key` (Sentry on `/forecast`) instead of throwing when normalizing the key for shortcuts. Centralized the guard in `keyboardShortcutKey` and applied it to forecast, navbar, and day-selector shortcuts.
- **Safari overnight IndexedDB disconnects:** Switched hosted Firestore to an in-memory local cache so Safari/macOS sleep no longer hits WebKit’s “Connection to Indexed Database server lost” error from Firestore’s default IndexedDB persistence. Pauses Firestore network sync while the tab is hidden and resumes it on wake to reduce failures on long-lived forecast editor tabs.
- **GFC-WEB-6 (auto-save/export crash):** Added runtime guards in `mapToArray` and `arrayToMap` so `serializeForecast`/`deserializeForecast` return fallback values instead of crashing when `OutlookData` Map fields are plain objects at runtime.
- **GFC-WEB-7 (auto-categorical crash):** Coerce legacy plain-object probability maps to `Map` before auto-categorical iteration so `/forecast` no longer throws `forEach is not a function` when loading old saved cycles from localStorage.
## v1.5.3

### Changed
- **Privacy policy v1.2.0:** Added a clear disclosure for hosted error monitoring (Sentry): what is collected, what is not (no session replay, no default IP/cookie payloads, forecast contents not sent in breadcrumbs), and separate production vs beta environments.
- **In-app privacy modal:** Bumped to v1.2.0 with the same Sentry disclosure; users who accepted an older policy version will be prompted to accept again on next visit.
- **Hosted error monitoring (Sentry):** Production and beta now use the same privacy-safe SDK settings — `sendDefaultPii: false`, session replay disabled, browser SDK routed through `/api/sentry-tunnel`, and server tunnel validation against the web project DSN (`SENTRY_BROWSER_DSN`).
- **Analytics server:** Node Sentry init uses `sendDefaultPii: false`; deploy workflows set `SENTRY_BROWSER_DSN` from the web DSN secret so the tunnel accepts browser envelopes in the recommended two-project setup.
- **Version:** Bumped package version to `1.5.3`.

### Fixed
- **Sentry tunnel security:** Removed client-controlled ingest URLs and query-string forwarding; malformed envelope bodies return 400 instead of 500.

## v1.5.2

### Fixed
- Fixed the primary button on the signed-out Home Page being incorrectly white/blank
- Fixed an issue where you couldn't export an outlook as an image

## v1.5.1

### Fixed
- Fixed an issue where maps wouldn't render on Chromebooks
- Updated package version to v1.5.1
- Removed old beta selector from account screen

## v1.5.0

### Dependencies
<!-- dependabot-automation -->

### Changed
- **PR governance labels:** Content labels are diff-applied (no strip/re-add churn); `ci:*` labels aggregate all check runs on the PR head and only change when the overall state changes.
- **Post-merge beta version:** `computeBetaVersionAfterMainRelease` preserves in-progress beta prereleases when `main` is on an older stable line; bump script accepts pre-merge beta version and restores `package.json` after `main` merge; skips duplicate beta GitHub releases when unchanged.
- **Timed production rollout:** `deploy/production-release.json` drives stage-vs-live deploys; staged builds land under `releases/<version>/` until `rolloutAt`, then VPS cron runs `promote-release.sh`. Staging preview at `staging-gfc.weatherboysuper.com` (beta access gate). See `docs/hosted-rollout.md`.
- **Dependabot grouping:** Root and `server/` npm version updates are combined into one multi-ecosystem Dependabot PR targeting `beta` instead of one PR per package; `target-branch` is set on the `npm-beta` group (required by Dependabot when using multi-ecosystem groups).
- **Post-merge `release/*` → main:** Automation now merges `main` into `beta` after every `release/*` merge (same as `feature/release-*`), not only when `package.json` changes — prevents beta from drifting behind main.
- **Porting vs post-merge:** PR porting no longer opens `port/* → beta` when post-merge automation already syncs `main` into `beta` (beta promotion, `release/*`, and `feature/release-*` merges). CI fails redundant `port/* → beta` PRs so duplicate port work cannot merge.
- **GitHub Releases on every version bump:** Post-merge automation now publishes a release whenever `package.json` changes — stable tags on `main` (promotion, hotfix, release branch, bootstrap backfill) and prerelease tags on `beta` after each `-beta.N` integration merge.
- **Release automation:** Beta → main stays a normal PR; merge triggers stable versioning on `main`, GitHub Releases from CHANGELOG (including hotfixes), and beta prerelease bumps. CI enforces branch routing (preferred `feature/*`/`fix/*` → beta; only `hotfix/*` blocked on beta), changelog checks, and automated PR labels. Workflow definitions ship on `main` so GitHub can run them for repository pull requests.
- **Post-merge bootstrap:** `feature/release-*` → `main` syncs automation to `beta`, backfills the stable GitHub Release for `main`, starts the next `-beta.N` line, and publishes the first prerelease; manual `workflow_dispatch` recovery when bootstrap was missed.
- **Dependabot:** Version update PRs for root and `server/` npm ecosystems target `beta` (not `main`). **Dependabot changelog** workflow maintains `### Dependencies` under `[Unreleased]`; CI validates those bullets instead of skipping changelog checks.

## v1.5.2

### Fixed
- Fixed the primary button on the signed-out Home Page being incorrectly white/blank
- Fixed an issue where you couldn't export an outlook as an image

## v1.5.1

### Fixed
- Fixed an issue where maps wouldn't render on Chromebooks
- Updated package version to v1.5.1
- Removed old beta selector from account screen

## v1.5.0

### Changed
- **Forecast Page nitpicks:** Fixed UI alignment on the forecast Draw tab (spacing for sections/menus and Current Selection breathing room), ensured the tab bar touches its bottom tray properly, expanded the Cycle Date fields horizontally on the Days tab, improved Ghost Layers labels placement, eliminated duplicated basemap dropdowns favoring the toolbar, standardized tools buttons on the right side to match the new Integrated Toolbar format, and gave map control buttons neutral hover colors.
- **Home forecast workspace:** Refined the current cycle card with clearer header hierarchy, stronger status/date chips, and more balanced day and utility action tiles to reduce the cramped feel in the landing page layout.
- **Discussion editor:** Neutralized colored toolbar button backgrounds in light mode for the DIY editor toolbar and leveled/centered the DIY/Guided tabs to fix alignment issues (files: src/pages/DiscussionPage.css, src/pages/DiscussionPage.tsx, src/components/DiscussionEditor/DIYDiscussionEditor.tsx).
- **Verification header:** Compacted the verification header to reduce vertical space usage and increase map/controls visible area (file: src/components/VerificationMode/VerificationMode.css).
- **Developer:** Documented local beta dev workflow and the local beta bypass option in README.md to allow running beta features locally without hosted Firebase credentials.
- **Version bump:** Updated version to `1.5.0-beta.1` for the upcoming `v1.5.0` beta release.

### Fixed
- **Dependency/security cleanup:** Updated the Firebase/OpenLayers dependency tree and server admin stack to address the reported Dependabot vulnerabilities in protobufjs, lodash, protocol-buffers-schema, and `@tootallnate/once`.
- **Lucide brand icons:** Replaced Lucide brand icon usage with inline SVGs so the UI no longer depends on Lucide's removed brand set.
- **Unused dependency cleanup:** Removed stale geoman/react-leaflet dependencies and corresponding export-only selectors that no longer matched the codebase.
- **Map export guard:** Blocked image export on OpenLayers maps and surfaced a clear warning instead of attempting the old Leaflet export path.

## [1.4.0] - 2026-04-03

### Added
- **Hosted accounts and entitlements:** Added Firebase-backed account profiles, hosted sign-in, premium entitlements, and account management flows for the `v1.4.0` hosted release.
- **Cloud forecast library:** Added hosted cloud save/load support, a dedicated cloud library page, toolbar cloud actions, and read-only handling for expired premium users.
- **User metrics and admin dashboard:** Added progress-style account metrics, aggregate admin metrics, and a hidden admin dashboard for hosted beta operations.
- **Closed beta access flow:** Added beta-only access gating, invite onboarding, beta account activation, and deployment-specific beta access checks.

### Changed
- **Cloud hosted forecasts:** Moved cloud forecast storage out of `userSettings` into a dedicated `cloudCycles` collection so forecast payloads have a long-term home separate from profile preferences.
- **Pricing and account experience:** Refined the hosted pricing, account, billing, and cloud surfaces to match the newer card/surface design language used across the app.
- **Forecast toolbar styling:** Rebalanced the forecast utility toolbar layout and brought the cloud save/cloud library buttons back into the same visual system as the rest of the tool buttons, including dark-mode compliant color treatments.
- **Map layer rendering:** Promoted the elevated vector/reference-layer basemap treatment into the released map stack and standardized released outlook fill rendering around the new layer model.
- **Beta deployment flow:** Updated the beta and production deployment workflows to support hosted env configuration, separate beta/prod webhook secrets, and a dedicated beta backend process.
- **Privacy disclosures:** Updated the privacy policy and in-app privacy modal to reflect hosted sync, billing metadata, beta metrics, and operational logging behavior.

### Fixed
- **Billing route throttling:** Added explicit rate limiting to the Stripe billing checkout, portal, and webhook endpoints so authorization-bearing billing routes are consistently protected.
- **Cloud library UX:** Rebuilt the cloud library page and save dialog into clearer operational surfaces and corrected toolbar integration issues around cloud actions.
- **Beta backend loading:** Fixed server env loading for deployed hosted backends so colocated server `.env` files are respected on VPS deployments.
- **Closed beta activation:** Fixed beta access routing and deployment wiring so invite claims, billing config, and other hosted `/api/*` routes can reach the beta backend correctly.
- **Toolbar color consistency:** Corrected recent cloud-toolbar light/dark mode regressions so the hosted cloud actions follow the same custom toolbar color standards as the rest of the forecast tools.
- **Day 3 Total Severe colors:** Corrected the Day 3 `5%` Total Severe color back to the intended brown styling instead of the incorrect green treatment.

## [1.3.0] - 2026-03-24

### Added
- **Ghost overlays:** New overlay type that shows previous outlooks as semi-transparent ghosts on the map for comparison. Toggle visibility in the toolbar, with ghost overlays defaulting to off.
- **Verification storm report windows:** Added support for loading both today's and yesterday's storm reports in the Verification panel.
- **Alert banner system:** Added configurable alert banner with info/warning/error types and dismissible behavior.

### Fixed
- **Per-day undo/redo:** Undo and redo history now persists correctly when switching between forecast days.

## [1.2.0] - 2026-03-15

### Added
- **Forecast undo/redo:** Added undo and redo controls to the forecast page toolbar, along with standard keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, and `Ctrl/Cmd+Shift+Z`) for reversible drawing edits.

### Fixed
- **Porting automation:** Updated the internal PR porting workflow so it cherry-picks only the original merged PR commits and cleans up temporary `port/*` branches after their PRs close, which keeps branch synchronization cleaner and avoids noisy port PRs.
## [1.1.0] - 2026-03-07

### Fixed
- **Discussion auto-save:** Discussion editor changes now auto-save after a short debounce by syncing local editor state back to Redux, which ensures the existing global auto-save-to-localStorage flow captures discussion updates even without clicking Save.
- **Verification storm reports:** Prevented same-day NOAA storm report fetch attempts (which often return 404 before archive publication) by detecting local "today" and showing an informational message instead of a fetch error. Also added a distinct info-state message style for "no reports found" and same-day availability notices.
- **Export (dark mode):** Fixed issue where map exports could render as a blank (black) image in dark mode. Root cause was an OpenLayers canvas being tainted by tile images requested without CORS. The fix sets `crossOrigin: 'anonymous'` on OpenLayers `OSM`/`XYZ` sources, ensures cloned images request CORS during export, and waits for the OpenLayers `rendercomplete` / tile load before capturing with `html2canvas`. Verified on branch `fix/blank-dark-mode-export`.
- **Export warnings:** Added a console warning and an on-screen export banner (for live exports) when map tiles/images fail to load before capture, so users and developers can tell when the issue is network-related rather than a bug. Verified during manual export tests.
- **Layer ordering (forecast + verification maps):** Added top overlay layers so state outlines and map labels/city names render above outlook polygons, improving readability when polygons cover dense areas.
- **Polygon snapping:** Added OpenLayers Snap interactions for both probabilistic and categorical sources so drawing and editing can snap to existing vertices/segments (disabled only in delete mode).

## [1.0.0] - 2026-03-01

### Added
- **Focus trap in modals:** Tab/Shift+Tab cycles focus within CycleHistoryModal and CopyFromPreviousModal; first focusable element auto-focused on open.
- **In-app documentation:** 4-tab help panel (Overview, How to Use, Outlook Types, Categorical Conversion) accessible via the Help (?) button in the Navbar.

### Changed
- All `window.alert()` calls replaced with toast notifications app-wide (8 calls across 3 components).
- `FileReader.onerror` handlers added to file import flows for proper error feedback.
- `OutlookPanel` component removed (dead code — superseded by `IntegratedToolbar` + `OutlookSelectorPanel`).
- Version bumped to stable 1.0.0.

## [0.11.0-beta] - 2026-02-25

### Added
- **Cycle Management:**
  - Save named forecast cycles with optional labels (e.g., "Morning", "00Z").
  - Cycle history browser — view, load, or delete any saved cycle.
  - Copy features between cycles or days (e.g., yesterday's Day 2 → today's Day 1).
  - Cycle history persists to localStorage (`gfc-cycle-history`) and hydrates on app load.
- **Discussion Editor:**
  - Two-tab system: Edit and Preview modes.
  - DIY mode: plain text editor with formatting toolbar.
  - Guided mode: question-based builder walking through synopsis, threats, and confidence.
  - Export discussion as `.txt` in GFC style (no aviation jargon, no official terminators).
- **Map Migration:**
  - Migrated from Leaflet/Geoman to OpenLayers for map rendering and drawing.
  - Map tile source swaps between Standard/Light/Satellite/Terrain/Dark styles.
  - Dark mode auto-switches the base layer to CartoDB Dark.
- **Export Package:**
  - ZIP download containing forecast JSON + discussion text + map image.
  - Export loading feedback on the image export button.
- **Verification:**
  - Isolated `verificationSlice` prevents cross-contamination when verifying old cycles while editing.
  - Statistics fix: storm reports counted only at the highest containing risk level (no double-counting).
  - Visual hit/miss overlay for tornado, wind, and hail reports.

### Changed
- App branding: `<title>` and manifest updated to "Graphical Forecast Creator" / "GFC".
- `OutlookDaySelector` completely rewritten with CSS variables — was hardcoded dark regardless of theme.
- Duplicate localStorage hydration on startup removed; `ForecastPage.tsx` is the sole authority.
- All debug `console.log` / `console.error` removed from production code across 14+ files.
- Full dark mode coverage for all UI panels (VerificationMode, VerificationPanel, DrawingTools, ExportModal, OverlayControls, Toast, Documentation, OutlookDaySelector).

## [0.10.0-alpha] - 2026-01-30

### Added
- **Snapshot Export:**
  - Export current map view to PNG via `html2canvas`.
- **Map Styles:**
  - Map style selector in toolbar: Standard (OSM), Light, Dark, Satellite (Esri), Terrain (OpenTopoMap).
- **Re-implemented Map Overlays:**
  - Migrated state/county/CWA overlays to OpenLayers GeoJSON layers.

## [0.9.0-alpha] - 2026-01-30

### Added
- **Forecast Discussion Editor:**
  - Dedicated discussion editor accessible from the toolbar.

## [0.8.0-alpha] - 2026-01-30

### Added
- **Verification Tools:**
  - "Storm Report Upload" — import NOAA storm report CSV archive by date.
  - Plot tornado (red triangles), wind (blue squares), and hail (green circles) reports over the outlook.
  - Visual hit/miss check against drawn risk areas.

## [0.7.0-alpha] - 2026-01-30

### Added
- **Categorical Logic:**
  - Risk category selector: TSTM, MRGL, SLGT, ENH, MDT, HIGH.
  - Dynamic polygon colors and labels per category.
  - Auto-categorical logic: categorical risk derived from tornado/wind/hail probabilistic outlooks.

## [0.6.0-alpha] - 2026-01-30

### Added
- **Map Overlays:**
  - State borders overlay (GeoJSON).
  - County/CWA boundaries overlay (GeoJSON).
  - Toggle controls for overlay visibility.

## [0.5.0-alpha] - 2026-01-30

### Added
- **Forecast Cycle Workflow:**
  - Day 3 outlook support (totalSevere + categorical).
  - Day 4–8 outlook support (probabilistic only — 15%, 30%).
  - Day navigation: switch between Day 1–8 active outlook sets.
  - Schema supports importing older-day data into newer-day format (e.g., Day 4 → Day 3 style).
  - `Import JSON` functionality — re-upload a saved file to populate map with editable polygons.
  - Version migration handling for schema changes between releases.

## [0.4.0-alpha] - 2026-01-30

### Added

- **Load System:**
  - Implemented importing forecasts from JSON files (`.json`).
  - Added "Load Forecast" button to the toolbar.
  - Implemented automatic session restoration (auto-load) from LocalStorage on startup.
- **Map Styles:**
  - Added support for multiple base map layers.
  - Included styles: Standard (OSM), Light (Carto), Dark (Carto), Satellite (Esri), and Terrain (OpenTopoMap).
  - Added layer control to switch between styles.
- **Persistence:**
  - Added `useAutoSave` hook to automatically save work to LocalStorage every 5 seconds.
- **Save System:**
  - Defined JSON schema for GFC outlook data (`GFCForecastSaveData`).
  - Implemented `exportForecastToJson` utility to download forecasts.
  - Added schema validation (`validateForecastData`) to ensure data integrity.
- **Auto-save:**
  - Integrated auto-save logic (initially part of v0.4.0 scope, refined in v0.5.0).

### Changed

- Refactored `DrawingTools` to handle file input for loading.
- Updated `App.tsx` to manage save/load workflows using new utility functions.
- Renamed "Save Forecast" action to perform a file export (JSON).

## [0.3.0-alpha] - 2026-01-30

### Added

- **New Outlook Format:**
  - Implemented support for the updated convective outlook format (effective March 2026).
  - Added "Hatching" as a separate property/layer per probability type (Tornado, Wind, Hail).
  - Added CIG levels (CIG1, CIG2, CIG3) with specific hatching patterns.
  - Updated color mappings and categorical conversion logic (`useAutoCategorical`) to use geometric intersection with `@turf/turf`.
- **UI Updates:**
  - Updated `OutlookPanel` to support CIG selection.
  - Updated `Legend` to display mixed probability and hatching keys.
  - Removed legacy "Significant" toggle in favor of specific probability/hatching selection.

### Fixed

- Fixed bug where hatching patterns would replace fill colors (implemented as separate layers/ordering).
- Fixed categorical conversion logic to correctly account for hatching overlays.
- Fixed `SLGT%` label issue in tooltips.

## [0.2.0-alpha]

### Changed

- Switched mapping library to `@geoman-io/leaflet-geoman-free` for better drawing controls.
- Enabled polygon editing, cutting, and removal.

## [0.1.0-alpha]

### Added

- Initial project setup with React, TypeScript, and Redux Toolkit.
- Basic Leaflet map integration.
- Basic layer toggling.
