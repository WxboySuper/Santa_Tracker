# Graphical Forecast Creator (GFC) Roadmap

This roadmap outlines the evolution of the platform into a comprehensive suite of weather tools: the **Outlook Creator**, the **WarnGen Simulator**, and the **WxSim Game**. Each version is a focused, bite-sized milestone.

---

## Versioning Guide

- **Format:** vX.Y.Z (e.g., v0.1.0, v0.2.0, v1.0.0)
  - **Major (X):** Fundamental changes to the platform's scope (e.g., Launching the Simulator Game).
  - **Minor (Y):** New modules or significant feature sets (increments often!).
  - **Patch (Z):** Bug fixes or polish.
  - **Pre-release:** Suffix with `-alpha`, `-beta`, etc., for unstable versions (e.g., v0.2.0-alpha).
- **Pre-1.0:** Use v0.Y.0 for the initial build of the **Outlook Creator**.
- **Philosophy:** Release early, release often. Every checkmark is a victory.

---

## v0.1.0-alpha: The Foundation (Retroactive)

- [x] Initialize React project with TypeScript.
- [x] Set up Redux Toolkit for state management.
- [x] Implement basic Leaflet Map container.
- [x] Basic layer toggling logic.

## v0.2.0-alpha: The "Geoman" Fix

**Goal:** Fix the broken map drawing by swapping the library.

- [x] Uninstall `react-leaflet-draw` (Legacy/Broken).
- [x] Install `@geoman-io/leaflet-geoman-free`.
- [x] Implement basic polygon drawing using Geoman controls.
- [x] Verify ability to "cut" holes in polygons (essential for doughnut-hole risks).

## v0.3.0-alpha: Outlook Data Structure

**Goal:** Teach the app what an "Outlook" is.

- [x] Define TypeScript interfaces for `Outlook`, `RiskArea`, and `Hazard`.
- [x] Update Redux store to hold the current outlook state.
- [x] Connect drawn polygons to the Redux store (updating coordinates in state).

## v0.4.0-alpha: The Save System

**Goal:** Never lose a forecast.

- [x] Design a unique JSON schema for saving and loading GFC outlook data.
- [x] Implement `Export to JSON` functionality.
- [x] Schema validation (ensure the JSON is valid GFC data).
- [x] Add "Auto-save" to LocalStorage (prevent data loss on refresh).

## v0.5.0-alpha: The Load System

**Goal:** The "Forecast Cycle" workflow.
**Description:** We develop a forcast cycle workflow of handling multiple days of outlooks.

- [x] Add Day 3 Outlook Support.
- [x] Add Day 4-8 Outlook Support.
- [x] Add navigation between multiple outlook day styles.
- [x] Update schema to support different outlook days and importing older day schema to newer day schema (importing day 4 outlook to update in the day 3 style.)
- [x] Implement `Import JSON` functionality.
- [x] Allow re-uploading a saved file to populate the map with editable polygons.
- [x] Handle version migration (if schema changes).

## v0.6.0-alpha: Map Overlays & Context

**Goal:** Make it look like professional software.

- [x] Add "State Borders" overlay (GeoJSON).
- [x] Add "County/CWA Boundaries" overlay (GeoJSON).
- [x] Add "Highways/Cities" toggle for reference.

## v0.7.0-alpha: Categorical Logic

**Goal:** Implementing categorical risk levels and visual style.

- [x] Add "Risk Category" selector (TSTM, MRGL, SLGT, ENH, MDT, HIGH).
- [x] Implement dynamic polygon styling based on category (Green, Yellow, Orange, Red, Magenta).
- [x] Add standard labels/tooltips to polygons.

## v0.8.0-alpha: Verification Tools

**Goal:** "How did I do?"

- [x] Implement "Storm Report Upload" (CSV/JSON import from NOAA storm report archive).
- [x] Plot Tornado/Wind/Hail reports as distinct icons over the user's outlook.
- [x] Basic "Hit/Miss" visual check.

## v0.9.0-alpha: Discussion Editor

**Goal:** Explaining the forecast.

- [x] Add "Forecast Discussion" text editor (Markdown support?).
- [x] Add simple text formatting tools.

## v0.10.0-alpha: Sharing & Export

**Goal:** Sharing the product.

- [x] Implement "Snapshot" feature (Export Map View to PNG/JPG).
- [x] Combine Forecast JSON + Discussion text into a downloadable package.
  - This could be a ZIP file or it could be a single JSON file with both data and text.
- [x] Re-implement different map styles with a selector
- [x] Migrate documentation from Leaflet to OpenLayers

## v0.11.0-beta: Release Hardening

**Goal:** Close final quality gaps before the stable v1.0.0 release.

- [x] Complete dark-mode coverage across core workflow panels and modals.
- [x] Add cycle history and copy-from-previous workflow polish.
- [x] Add export loading feedback and verification UX improvements.
- [x] Final accessibility pass for modal dialogs and keyboard focus states.
- [x] Final release documentation pass (README/CHANGELOG/How-to).

## v1.0.0: The Outlook Creator (Stable Release) 🌪️ — Released 2026-03-01

**Goal:** A complete, standalone tool for creating, saving, and verifying weather outlooks.

- [x] Final UI Polish (Sidebar cleanup, Help modal).
- [x] Deployment to GitHub Pages / Vercel.
- [x] Public documentation on "How to create an Outlook."

---

## Post-v1.0: Live Product Evolution

The roadmap below reflects the product as it actually evolved after the stable `v1.0.0` release. GFC's immediate next milestone is no longer WarnGen-first; `v1.4.0` is focused on accounts, hosted sync, and sustainability so the app can keep growing without locking core forecasting behind a paywall.

## v1.1.0: Workflow Reliability (Released 2026-03-07)

- [x] Fix discussion auto-save so guided and DIY discussion edits persist reliably.
- [x] Improve verification storm report loading and same-day NOAA archive handling.
- [x] Fix dark-mode export failures and add clearer export warnings.
- [x] Improve map label and overlay layering for readability.
- [x] Add polygon snapping for forecast editing workflows.

## v1.2.0: Editing Safety Nets (Released 2026-03-15)

- [x] Add forecast-page undo/redo controls.
- [x] Support standard undo/redo keyboard shortcuts.
- [x] Harden related internal workflow automation around branch porting.

## v1.3.0: Workflow Polish and Visibility (Released 2026-03-24)

- [x] Add ghost outlook overlays for cross-hazard comparison.
- [x] Add expanded verification storm report windows.
- [x] Add an alert banner system for in-app messaging.
- [x] Fix per-day undo/redo history behavior when switching days.

## v1.4.0: Accounts, Cloud Sync, and Sustainability

**Goal:** Make GFC sustainable and more user-friendly without violating the promise that the app stays open source and that core features remain free.

Detailed planning lives in [docs/releases/v1.4.0-plan.md](docs/releases/v1.4.0-plan.md). The original phase PRDs are archived for deletion review under `docs/archive/review-removal/prds/`.

- [ ] Add optional accounts using Firebase Auth.
- [ ] Support Google, GitHub, and email/password sign-in.
- [ ] Sync account profile data and app settings across devices for free users.
- [ ] Add premium hosted cloud storage for forecast cycles and discussions.
- [ ] Integrate Stripe billing for `$3/month`, `$25/year` intro pricing, and `$30/year` standard annual pricing.
- [ ] Add progress-first account metrics such as streaks and output counts.
- [ ] Add aggregate anonymous admin metrics and a minimal private dashboard.
- [ ] Update ToS, privacy, roadmap, and release docs to explain the hosted-service model clearly.

## Future WarnGen Roadmap (Version Numbers TBD After v1.4.0)

WarnGen remains part of GFC's future, but the exact version numbers after `v1.4.0` are intentionally flexible while the hosted foundation lands.

### Real-Time Data Integration

- [ ] Integrate Iowa State Mesonet (IEM) WMS service.
- [ ] Add "Base Reflectivity" (N0Q) layer.
- [ ] Add "Velocity" (N0U) layer.
- [ ] Add opacity sliders for radar layers.

### WarnGen Interface

**Goal:** A dedicated "Operations" page, separate from the Outlook creator.

- [ ] Create `WarnGenPage.tsx` (new route).
- [ ] Implement a split-screen UI (Map vs. Warning Controls).
- [ ] Ensure map state is isolated from the Outlook Creator page.

### Outlook Layer Integration

**Goal:** Bring outlook context into the warning process.

- [ ] Add "Load Outlook JSON" button to the WarnGen toolbar.
- [ ] Render outlook polygons as a reference layer (read-only / non-editable).
- [ ] Ensure outlook polygons appear below warning polygons.

### Warning Polygons

- [ ] Add a warning type selector (Severe Thunderstorm, Tornado, Flash Flood).
- [ ] Implement warning-style polygons with distinct styling and drag handles.
- [ ] Keep WarnGen polygons visually and behaviorally distinct from outlook polygons.

### Timer and Status

**Goal:** Simulate the pressure of operations.

- [ ] Add issue-time and expiration-time logic.
- [ ] Implement a countdown timer for active warnings.
- [ ] Add visual cues for expiring warnings.

### Educational Text Generation

**Goal:** Teach why a warning is issued, not just how to draw one.

- [ ] Create the warning text modal.
- [ ] Add reasoning prompts.
- [ ] Add hazard-tag dropdowns.
- [ ] Generate educational summary text focused on the warning rationale.

### Warning Updates

**Goal:** Manage active events over time.

- [ ] Implement edit-warning workflows.
- [ ] Allow shrinking or trimming active polygons.
- [ ] Generate simplified update-status text.

---

## v2.0.0+: The Simulator Game (WxSim) 🎮

**Goal:** A standalone game that utilizes the Outlook and WarnGen components for historical simulations.

## v2.1.0: Game Architecture

- [ ] Build a new "Game Mode" wrapper that isolates the user from real-time data.
- [ ] Create a "Session Manager" to track game state.

## v2.2.0: Scenario Engine

- [ ] Develop a system to replay archived radar/outlook data (not real-time).
- [ ] Create the first playable scenario (e.g., "April 27, 2011").

## v2.3.0: Scoring & Progression

- [ ] Implement points system for lead time and polygon accuracy (POD/FAR).
- [ ] Add "Career Mode" to track performance across multiple sessions.

## v3.0.0: Long-Term Maintenance

**Goal:** Stability and community content.

- [ ] **Maintenance Mode:** Bug fixes and performance updates.
- [ ] **Scenario Editor:** Allow users to create and share their own historical scenarios.
