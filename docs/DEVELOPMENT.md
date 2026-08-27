# Development Guide

This guide covers development workflows, testing, linting, and building the Santa Tracker application.

## 🏃 Running the Application — pnpm workspace (Christmas 2026, primary)

### Prerequisites

- Node.js 20+ and pnpm 9+ (`npm install -g pnpm` or `corepack enable`)
- PostgreSQL 16+ for studio/publication flows (shell runs without it)

### One-command install (fresh clone)

```bash
pnpm install
```

### One-command local bootstrap

```bash
pnpm bootstrap
```

This checks for Node.js 22.13+, pnpm 10+, and Docker Desktop with Compose. It starts the PostgreSQL 16 service,
waits until `pg_isready` succeeds, and starts the Next.js dev server. The default connection string is
`postgresql://santa:santa@localhost:5432/santa_tracker`, matching `packages/config` and the Drizzle config.

The command works from PowerShell, Command Prompt, macOS, and Linux because it uses Node's process APIs instead of
shell-specific syntax. If a prerequisite is missing, it prints the install or startup action to take. To validate
the Node and pnpm path without starting Docker, use `pnpm bootstrap --check --skip-docker`.

To remove the local database volume and its data, run `docker compose down --volumes`.

### Next.js shell

```bash
pnpm dev          # http://localhost:3000 — App Router shell
pnpm typecheck    # tsc --noEmit, strict
pnpm lint         # eslint flat config, strict TypeChecked
pnpm test         # vitest run — 22 tests
pnpm build        # pnpm -r build → next build (standalone on Linux)
```

### Legacy Flask (maintenance until parity)

```bash
# Standard development server
python src/app.py

# With debug mode enabled
FLASK_DEBUG=True python src/app.py

# Custom port
FLASK_RUN_PORT=8080 python src/app.py
```

### Production Mode (legacy)

```bash
# Using Gunicorn (recommended)
gunicorn -w 4 -b 0.0.0.0:5000 src.app:app

# With configuration file
gunicorn -c gunicorn_config.py src.app:app
```

## 🧪 Testing

### Workspace (TypeScript)

```bash
pnpm test              # vitest run — all 22 tests
pnpm test:watch        # watch mode
pnpm test:coverage     # v8 coverage
pnpm --filter @santa-tracker/contracts test
pnpm --filter @santa-tracker/route-engine test
```

Contracts, route-engine, config, ui, activity-sdk, database, and test-fixtures each own focused tests. Production domain code injects clocks, routes, and feature flags — never the machine clock.

### Legacy Python tests

```bash
# Run all tests
python -m pytest

# Run with verbose output
python -m pytest -v

# Run specific test file
python -m pytest tests/test_tracker.py

# Run specific test
python -m pytest tests/test_tracker.py::test_location_validation
```

### Test Coverage
```bash
# Run tests with coverage
coverage run -m pytest

# Generate coverage report
coverage report

# Generate HTML coverage report
coverage html
# Open htmlcov/index.html in browser

# Show missing lines
coverage report -m
```

### Test Organization
```
tests/
├── test_app.py           # Flask application tests
├── test_tracker.py       # Tracker logic tests
├── test_locations.py     # Location data tests
├── test_advent.py        # Advent calendar tests
└── test_advent_api.py    # Advent API tests
```

## 🔍 Code Quality & Linting

### Python Linters

#### Black (Code Formatting)
```bash
# Check formatting
black --check .

# Auto-format code
black .

# Format specific file
black src/app.py
```

#### isort (Import Sorting)
```bash
# Check import order
isort --check-only .

# Auto-fix imports
isort .

# Check specific file
isort --check-only src/app.py
```

#### Flake8 (Style Guide Enforcement)
```bash
# Check all files
flake8 .

# Check specific directory
flake8 src/

# Check with statistics
flake8 --statistics .
```

Configuration in `.flake8`:
```ini
[flake8]
max-line-length = 88
extend-ignore = E203, W503
exclude = .git,__pycache__,venv
```

### TypeScript / Workspace Lint

```bash
pnpm lint         # eslint flat config — strict TypeChecked, no warnings
pnpm lint:fix     # auto-fix
pnpm typecheck    # tsc --noEmit (workspace-wide strict)
```

### Legacy JavaScript/CSS/HTML Linters

#### ESLint (legacy JS)
```bash
# Check all JavaScript files
npm run lint:js  # now pnpm lint covers TS; legacy JS is ignored via eslint ignores
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Check specific file
npx eslint src/static/script.js
```

#### Stylelint (CSS)
```bash
# Check all CSS files
npm run lint:css

# Auto-fix issues
npx stylelint "**/*.css" --fix

# Check specific file
npx stylelint src/static/styles.css
```

#### HTMLHint (HTML)
```bash
# Check all HTML files
npm run lint:html

# Check specific file
npx htmlhint index.html
```

#### Run All Linters
```bash
# Run all frontend linters
npm run lint

# Install all linters first
npm install
```

## 🔧 Development Tools

### Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate (Linux/Mac)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Deactivate
deactivate
```

### Environment Variables
Create a `.env` file for local development:
```env
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=dev-secret-key-change-in-production
ADMIN_PASSWORD=admin123
```

**Important:** Never commit `.env` to version control!

### Hot Reloading
Flask's debug mode includes automatic reloading:
```bash
FLASK_DEBUG=True python src/app.py
```

Changes to Python files will automatically reload the server.

## 📦 Dependency Management

### Installing Dependencies

One-command workspace install (issue #213):

```bash
pnpm install
```

Legacy:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install development dependencies
pip install -r requirements-dev.txt

# Legacy Node lint deps (now via pnpm)
pnpm install
```

### Updating Dependencies
```bash
# Update all Python packages
pip list --outdated
pip install --upgrade package-name

# Update requirements.txt
pip freeze > requirements.txt

# Update pnpm workspace
pnpm update -r
pnpm outdated
```

### Security Audits
```bash
# Python security check (if using safety)
pip install safety
safety check

# Node.js security check
pnpm audit
pnpm audit --fix  # or pnpm update
```

## 🐛 Debugging

### Python Debugging
```python
# Use built-in debugger
import pdb; pdb.set_trace()

# Use ipdb (enhanced debugger)
pip install ipdb
import ipdb; ipdb.set_trace()
```

### Flask Debug Toolbar
```python
# Install debug toolbar
pip install flask-debugtoolbar

# Enable in app.py
from flask_debugtoolbar import DebugToolbarExtension
toolbar = DebugToolbarExtension(app)
```

### Logging
```python
# Configure logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Use in code
app.logger.debug("Debug message")
app.logger.info("Info message")
app.logger.error("Error message")
```

## 📊 Performance Profiling

### Python Profiling
```bash
# Profile with cProfile
python -m cProfile -o profile.stats src/app.py

# Analyze with pstats
python -m pstats profile.stats
```

### Frontend Profiling
- Use browser DevTools Performance tab
- Chrome Lighthouse for audits
- Network tab for loading analysis

## 🔄 Continuous Integration

### GitHub Actions
Workflows located in `.github/workflows/`:
- `workspace.yml` - pnpm typecheck / lint / test / build + ADR 0001 dependency rules
- `testing.yml` - Legacy Python matrix (3.10–3.14)
- `linting.yml` - Python + TypeScript/HTML/CSS lint (pnpm), lockfile checks
- `deploy.yml` - Deploy on release

### Local CI Simulation
```bash
# Workspace — same as CI (workspace.yml)
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# Legacy Python — same as CI
python -m pytest
black --check .
isort --check-only .
flake8 .
```

## 📝 Code Style Guidelines

### Python
- Follow PEP 8 style guide
- Use Black for formatting (88 char line length)
- Use type hints where beneficial
- Write docstrings for public functions

### JavaScript
- Use ES6+ features
- Use const/let, not var
- Use arrow functions where appropriate
- Add JSDoc comments for complex functions

### CSS
- Use BEM naming convention
- Mobile-first media queries
- Group related properties
- Use CSS variables for theming

## 🚀 Pre-Commit Checks

Consider setting up pre-commit hooks:
```bash
# Install pre-commit
pip install pre-commit

# Create .pre-commit-config.yaml
pre-commit install

# Run manually
pre-commit run --all-files
```

Example `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks:
      - id: black
  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
  - repo: https://github.com/pycqa/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
```
