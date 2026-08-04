# Graphical Forecast Creator

**A web application for creating professional severe weather outlooks, verifying forecasts, and writing forecast discussions.**

Live App: [gfc.weatherboysuper.com](https://gfc.weatherboysuper.com/)

---

## Features

### Outlook Creation
- Draw, edit, and cut polygons for tornado, wind, hail, categorical, and Day 3-8 outlooks
- Automatic categorical risk derivation from probabilistic outlooks (no manual editing needed)
- CIG hatching levels (CIG1-CIG3) for significant threat areas
- Full Day 1-8 forecast cycle support with day-specific outlook types
- General Thunderstorm (TSTM) manual drawing on categorical layer

### Forecast Cycles
- Multi-day forecast cycles (Days 1-8) with individual outlook layers per day
- Save named cycles (e.g., "Morning Update", "00Z Run") with timestamps
- Cycle history browsing - load any previous cycle to resume editing
- Copy features between cycles or days (e.g., yesterday's Day 2 today's Day 1)
- Auto-save to browser localStorage every 5 seconds; session restored on reload

### Verification
- Load NOAA storm reports (tornado, wind, hail) by date
- Plot reports on top of your outlook for visual hit/miss analysis
- Statistics: report counts per risk level (highest risk only, no double-counting)
- Isolated verification state - reviewing old outlooks won't affect your active cycle

### Forecast Discussion
- Two-tab editor: **Edit** (live writing) and **Preview** (formatted render)
- **DIY mode**: plain text with formatting toolbar shortcuts
- **Guided mode**: question-based discussion builder that teaches forecasting thought process
- Export discussion as `.txt` file in GFC style (readable times, forecaster name at bottom)

### Export & Sharing
- **Export Image**: Capture the current map view as a PNG
- **Export Package**: Download a ZIP containing the forecast JSON + discussion text + map image
- Copy cycle JSON to clipboard for sharing

### Map & UI
- Multiple base map styles: Standard (OSM), Light (CartoDB), Dark (CartoDB), Satellite (Esri), **Blank (Weather)** (classic weather-style flat map — cream US, gray neighbors, blue ocean)
- Map auto-switches to dark tile set when dark mode is enabled
- Overlay toggles: state borders, county/CWA boundaries
- Full light/dark theme with persistent preference
- Toast notifications for all major actions

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` - `8` | Switch to Day 1-8 |
| `T` | Switch to Tornado outlook |
| `W` | Switch to Wind outlook |
| `H` | Switch to Hail outlook |
| `C` | Switch to Categorical outlook |
| `G` | Add General Thunderstorm (TSTM) to current day |
| `Ctrl+S` | Export forecast JSON |
| `Ctrl+O` | Open/load a forecast JSON file |
| `Ctrl+E` | Export map image |
| `Ctrl+D` | Toggle dark mode |

---

## Getting Started

### Prerequisites

- Node.js `20.19.0` or later
- pnpm `9`

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/WxboySuper/Graphical-Forecast-Creator.git
   cd Graphical-Forecast-Creator
   ```

2. Install the dependencies:
   ```sh
   pnpm install
   ```

Use `pnpm` consistently for this repo so the checked-in `pnpm-lock.yaml` remains the source of truth.

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Vite dev server at http://localhost:3000 |
| `pnpm run dev` | Vite dev server at http://localhost:3000 |
| `pnpm test` | Run Jest unit test suite |
| `pnpm run lint` | Run ESLint over the codebase |
| `pnpm run test:e2e` | Run Playwright end-to-end tests |
| `pnpm run build` | Production build to `/build` via Vite |

### Build targets

Every frontend build resolves one deployment target through `VITE_BUILD_TARGET`: `local`, `beta`, `staging`, or `production`. Local development and builds default to `local`; hosted deployment workflows set their target explicitly and invalid values stop the build. This target identifies the deployment surface and is separate from Vite's bundling mode and the existing beta access gate.

### Local Beta Mode (developer)

Run the app with beta-only features locally (useful for testing forecast redesigns, verification flows, and discussion changes).

- Start a beta dev server on a different port with the Vite env flag:
  - Unix/mac:
    ```sh
    cross-env VITE_BETA_MODE=true pnpm run dev -- --port 3002
    ```
  - Windows (PowerShell):
    ```ps1
    $env:VITE_BETA_MODE='true'; pnpm run dev -- --port 3002
    ```

- Bypass hosted Firebase sign-in (local-only):
  - Open: http://localhost:3002/?localBetaBypass=1
  - Or set in browser console:
    localStorage.setItem('gfc-local-beta-bypass','1')

- To enable hosted auth locally, provide Firebase web config via env vars: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID and restart the dev server.

### Hosted error monitoring (Sentry)

Sentry is enabled on **production** (`stable/X.Y.x` → gfc.weatherboysuper.com) and **beta** (a prerelease from `main` → beta-gfc.weatherboysuper.com) when deploy secrets provide a DSN. Local dev builds without `VITE_SENTRY_DSN` stay inert. Events are separated in Sentry by environment (`production` vs `beta`).

Hosted monitoring includes:

- Error monitoring (React 19 `reactErrorHandler` + unhandled errors)
- Performance tracing (React Router v7 navigation, 10% sample)
- Redux action breadcrumbs (forecast map payloads stripped from breadcrumbs)
- Structured logs (`Sentry.logger.*`)
- Server-side errors on the analytics API (`@sentry/node`)

Session replay is **disabled**. `sendDefaultPii` is **false** (no IP/cookies in error payloads by default).

Create two Sentry projects (recommended):

- **Web** — React client (`@sentry/react`)
- **Analytics API** — Express server on the VPS (`@sentry/node`)

Add these GitHub Actions secrets (repo → Settings → Secrets and variables → Actions):

| Secret | Used for |
|--------|----------|
| `VITE_SENTRY_DSN` | Browser error + performance monitoring |
| `SENTRY_DSN` | Analytics/billing API server |
| `SENTRY_AUTH_TOKEN` | Upload source maps during the main deploy build (use a Sentry **Organization Auth Token**; `org:ci` scope is correct and fixed) |
| `SENTRY_ORG` | Your Sentry organization slug |
| `SENTRY_PROJECT` | Web project slug (source maps) — not the API project |

Deploy workflows copy `VITE_SENTRY_DSN` to `SENTRY_BROWSER_DSN` on the analytics VPS so `/api/sentry-tunnel` validates browser envelopes against the web project.

After the next `main` deploy, verify in Sentry with a test error from the browser console on production (not from DevTools while paused — use a one-off button or `throw new Error('Sentry test')` in the console on the live site).

---

## Project Structure

```
src/
 components/
    CycleManager/       # Cycle history modal, copy-from-previous modal
    DaySelector/        # Day tab navigation panel
    DiscussionEditor/   # DIY + Guided discussion editor
    Documentation/      # In-app help/docs panel
    DrawingTools/       # Export modal, map export hook
    IntegratedToolbar/  # Main toolbar (all action buttons)
    Map/                # OpenLayers map, overlay controls, legend
    OutlookPanel/       # Probability/CIG selector panel
    OutlookSelector/    # Outlook type picker
    Toast/              # Notification toasts
    Verification/       # Storm report panel
    VerificationMode/   # Verification page layout
 hooks/
    useAutoCategorical.ts   # Auto-derives categorical from hazards
    useAutoSave.ts          # localStorage auto-save every 5s
 pages/
    ForecastPage.tsx        # Main forecast editing page
    VerificationPage.tsx    # Forecast verification page
    DiscussionPage.tsx      # Discussion editor page
    HomePage.tsx            # Landing / cycle overview page
 store/
    forecastSlice.ts        # Active forecast editing state
    verificationSlice.ts    # Isolated verification state
    overlaysSlice.ts        # Map overlay toggle state
    themeSlice.ts           # Dark mode state
 types/
    outlooks.ts             # Core TypeScript interfaces
 utils/
     fileUtils.ts            # JSON import/export, ZIP package
     exportUtils.ts          # Map image capture (html2canvas)
     verificationUtils.ts    # Storm report spatial analysis
     outlookUtils.ts         # Color mappings, categorical rules
```

---

## Documentation

- [Outlook Information](docs/Outlook_Info.md) - risk levels, probability values, categorical conversion rules
- [Roadmap](ROADMAP.md) - versioning plan and feature milestones
- [Changelog](CHANGELOG.md) - release history

---

## Disclaimer

- First and foremost, GFC is a creative and educational tool. It is NOT an official source of weather warnings, watches, or advisories. Always consult official sources (e.g., weather.gov) for accurate and authoritative weather information.
- Second AI was used in the development of this project. The final product and code in this codebase has been reviewed by me (Alex/ WeatherboySuper) to ensure quality outputs and good code. However I am not perfect, and there may be issues or bugs that I missed or I caused. If you see any problems, please report them via GitHub Issues or the GFC Support Discord.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
