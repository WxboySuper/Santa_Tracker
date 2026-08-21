# 🎅 Santa Tracker

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/WxboySuper/Santa_Tracker/testing.yml?branch=main&label=tests&style=flat-square)](https://github.com/WxboySuper/Santa_Tracker/actions)
[![codecov](https://codecov.io/gh/WxboySuper/Santa_Tracker/graph/badge.svg)](https://codecov.io/gh/WxboySuper/Santa_Tracker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)](https://www.python.org/downloads/)
[![Code Quality](https://img.shields.io/badge/code%20quality-A-brightgreen?style=flat-square)](https://deepsource.io/gh/WxboySuper/Santa_Tracker)

Track Santa's magical journey around the world on Christmas Eve! This interactive Progressive Web App provides real-time updates on Santa's location, destinations, and estimated arrival times.

> **Christmas 2026 reinvention:** The Flask app in `src/` remains in maintenance mode while the production platform moves to a strict-TypeScript Next.js pnpm workspace (`apps/web` + `packages/*`). See [`docs/planning/christmas-2026-reinvention.md`](docs/planning/christmas-2026-reinvention.md) and [ADR 0001](docs/adr/0001-application-architecture.md) for the approved architecture.

## ✨ Features

- 🗺️ **Interactive Map** - Real-time visualization using Leaflet.js with OpenStreetMap
- 📍 **Location Tracking** - Current location, next destination, and route visualization
- 📏 **Distance Calculator** - Calculate distance from Santa to your location
- ⏱️ **Countdown Timer** - Live countdown to Christmas (UTC+14 timezone-aware)
- 🎄 **Advent Calendar** - Daily unlockable Christmas content (facts, games, stories, videos) *(requires `ADVENT_ENABLED=True`)*
- 🔐 **Admin Dashboard** - Comprehensive route and location management
- 📱 **Progressive Web App** - Installable with offline support
- ♿ **Accessible** - Full ARIA support, keyboard navigation, screen reader compatible
- 🎨 **Responsive Design** - Works seamlessly on all devices

## 🚀 Quick Start — Next.js pnpm workspace (Christmas 2026)

### Prerequisites

- Node.js 22.13+ and [pnpm](https://pnpm.io/installation) 10+
- Modern browser
- PostgreSQL 16+ for the studio/publication flow (optional for the shell; required for draft editing)

### Installation

Fresh clone installs with **one documented command** (issue #213):

```bash
git clone https://github.com/WxboySuper/Santa_Tracker.git
cd Santa_Tracker
pnpm install
```

### Run the new shell

```bash
pnpm dev          # Next.js App Router at http://localhost:3000
pnpm typecheck    # strict tsc --noEmit across the workspace
pnpm lint         # eslint --max-warnings=0 (strict TypeChecked)
pnpm test         # vitest run (22 workspace tests)
pnpm build        # pnpm -r build → next build (standalone on Linux)
```

### Legacy Flask (maintenance)

The legacy Flask app remains runnable until parity acceptance (`#199`):

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python src/app.py  # http://localhost:5000
```

Navigate to `http://localhost:3000` for the new workspace shell (legacy Flask at `http://localhost:5000` if running).

## 🚩 Feature Flags

**Typed workspace flags — scaffold-only, not yet wired** (`packages/contracts/src/schemas.ts:68` — `FEATURE_FLAG_REGISTRY`, owner `foundation`, validated at publication but **not yet consumed** in `apps/web`):

| Flag | Default | Status | Exposure | Description |
|------|---------|--------|----------|-------------|
| `adventEnabled` | `false` | scaffold-only | publication (future) | Enables 24-day Advent unlocks (Dec 1-24); gated by seasonal mode — follow-up #214 |
| `mapEnabled` | `true` | scaffold-only | publication (future) | Enables map adapter; `false` will fall back to no-map mode — follow-up #252 |
| `weatherEnabled` | `false` | scaffold-only | publication (future) | Enables live-weather overlay (stretch, flagged) — follow-up #253 |
| `soundscapeEnabled` | `false` | scaffold-only | publication (future) | Enables optional soundscape with explicit opt-in — follow-up |

> **Governance:** All 4 are scaffold-only in this PR; `apps/web/src/app/page.tsx:1` does not yet read `SeasonalConfig`. No visitor-facing toggle. Changes require ADR. See `CHANGELOG.md:9`.”

**Legacy Flask flag:**

| Flag | Default | Description |
|------|---------|-------------|
| `ADVENT_ENABLED` | `False` | Enables advent UI/API in legacy Flask (maintenance) |

To enable a legacy flag, set the environment variable:

```bash
# Via environment variable
export ADVENT_ENABLED=True
python src/app.py

# Or in your .env file
ADVENT_ENABLED=True
```

## 📁 Project Structure

```text
Santa_Tracker/
├── apps/
│   └── web/                 # Next.js App Router — public site, admin studio, APIs (composition root)
├── packages/
│   ├── activity-sdk/        # Activity lifecycle, inputs, saves, audio, achievements
│   ├── config/              # Typed environment at process start
│   ├── contracts/           # Versioned Zod schemas & stable IDs (no DB/React)
│   ├── database/            # Drizzle schema, migrations, repositories
│   ├── route-engine/        # Pure route validation, state, simulation
│   ├── test-fixtures/       # Deterministic clocks, routes, snapshots (dev-only)
│   └── ui/                  # Shared accessible components & design tokens
├── src/                     # Legacy Flask app (maintenance until parity)
│   ├── static/              # CSS, JS, images
│   ├── templates/           # HTML templates
│   ├── utils/               # Core logic (tracker, locations, advent)
│   └── app.py
├── tools/
│   └── route-editor/        # Standalone Vite route editor (remains npm-isolated)
├── docs/
│   ├── adr/                 # Architecture Decision Records
│   └── planning/            # Christmas 2026 reinvention plan
├── tests/                   # Legacy Python test suite
├── pnpm-workspace.yaml      # Workspace definition
└── pnpm-lock.yaml           # Single-command install lockfile
```

## 🛠️ Technology Stack

**New platform (Christmas 2026):** Next.js 15 App Router, React 19, strict TypeScript 5.8, pnpm workspaces, Tailwind CSS, Zod, Drizzle ORM + PostgreSQL, Vitest  
**Legacy (maintenance):** Flask, Gunicorn, Geopy, Python-dotenv, Tailwind CDN, Leaflet.js  
**DevOps:** GitHub Actions (pnpm 10 + Node 22 matrix + Python 3.10–3.14), Dependabot (pip + npm/pnpm), DeepSource  
**Testing:** Vitest 3 (22 workspace tests, type-aware) + pytest, pytest-cov (140 legacy tests)

## 🧪 Testing & Route Simulation

### Workspace (Next.js / TypeScript)

```bash
pnpm typecheck   # strict tsc --noEmit (root + 7 packages + web)
pnpm lint        # eslint flat config, strict TypeChecked, 0 warnings
pnpm test        # vitest run — 22 tests, type-aware
pnpm build       # pnpm -r build → Next.js production build (standalone on Linux)
```

Boundaries are verified in CI (`workspace.yml`): workspace imports must respect ADR 0001 (e.g., `contracts` imports no DB/React, `route-engine` is pure, `ui` fetches no data).

### Legacy Python tests

```bash
# Run all tests with coverage
pytest --cov=src --cov-report=term-missing tests/

# Run specific test files
pytest tests/test_tracker.py -v
pytest tests/test_route_generation.py -v

# Quick test run
pytest tests/ -q
```

### Route Simulation

The admin dashboard includes a **Route Testing & Simulation** feature that allows you to:

- Test Santa's route with different timing scenarios
- Preview routes before finalizing them
- Simulate with custom start times
- Test specific location subsets
- View detailed timing calculations and summaries

Access via Admin Dashboard → Route Testing & Simulation → Simulate Route

**API Endpoint:** `POST /api/admin/route/simulate`

- Accepts optional `start_time` (ISO 8601 format) and `location_ids` (array)
- Returns simulated route with arrival/departure times
- Does not modify stored route data

### Test Coverage

- **tracker.py**: 100% coverage
- **locations.py**: 94% coverage  
- **advent.py**: 95% coverage
- **app.py**: 75% coverage
- **Overall**: 79% coverage (140 tests passing)

## 🛠️ Developer Tools

### Santa Route Editor

A standalone visual route editor for creating and managing Santa's journey routes. This tool provides:

- Interactive map interface with geocoding search
- Drag-and-drop route ordering
- Editable location metadata (priority, UTC offset, notes, etc.)
- JSON export matching the Santa Tracker route format

**Quick Start:**

```bash
cd tools/route-editor
npm install
npm run dev
```

See [tools/route-editor/README.md](tools/route-editor/README.md) for detailed documentation.

## 📚 Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Design choices, performance, accessibility
- **[Development Guide](docs/DEVELOPMENT.md)** - Testing, linting, building, static generation
- **[Admin Dashboard](docs/ADMIN_DASHBOARD.md)** - Route management and admin features
- **[Countdown Timer](docs/COUNTDOWN_TIMER.md)** - Timer implementation details
- **[Advent Calendar API](docs/ADVENT_CALENDAR_API.md)** - Advent calendar system documentation
- **[Configuration](docs/CONFIGURATION.md)** - Environment variables and settings
- **[Deployment](docs/DEPLOYMENT.md)** - Deployment to Heroku, Vercel, Netlify
- **[API Usage](docs/API.md)** - API integration guide

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

See our [Pull Request Template](.github/pull_request_template.md) for guidelines.

### Issue Templates

- 🐛 [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml)
- ❓ [Questions](.github/ISSUE_TEMPLATE/question.yml)

## 🔒 Security

Report security vulnerabilities via [GitHub Security Advisories](https://github.com/WxboySuper/Santa_Tracker/security/advisories). All dependencies are automatically updated via Dependabot.

## 📄 License

Licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**WxboySuper** - [@WxboySuper](https://github.com/WxboySuper)

## 🎄 Acknowledgments

- Santa tracking route inspired by NORAD Santa Tracker
- Map tiles by OpenStreetMap contributors
- Icons from open-source projects

## 📞 Support

- 📫 [Create an issue](https://github.com/WxboySuper/Santa_Tracker/issues/new/choose)
- 💬 [Start a discussion](https://github.com/WxboySuper/Santa_Tracker/discussions)
- ⭐ Star this repo if you find it helpful!

---

Made with ❤️ for the holiday season

> _May your Christmas be merry and bright!_ 🎅🎄
