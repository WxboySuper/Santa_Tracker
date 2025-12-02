# Contributing to Santa Tracker

Thank you for your interest in contributing to Santa Tracker! This guide will help you get started with development and make the contribution process smooth.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Pre-commit Setup](#pre-commit-setup)
- [Logging Configuration](#logging-configuration)
- [Making Changes](#making-changes)
- [Submitting Contributions](#submitting-contributions)
- [Additional Resources](#additional-resources)

## Code of Conduct

Please be respectful and considerate of others when contributing. We aim to maintain a welcoming and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Python 3.10+
- pip (Python package manager)
- Node.js and npm (for frontend linting tools)
- Git
- Modern web browser

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/WxboySuper/Santa_Tracker.git
   cd Santa_Tracker
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv venv
   
   # On Linux/macOS
   source venv/bin/activate
   
   # On Windows
   venv\Scripts\activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

4. **Install Node.js dependencies** (for frontend linting)
   ```bash
   npm install
   ```

5. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

6. **Run the application**
   ```bash
   python src/app.py
   
   # Or with debug mode enabled
   FLASK_DEBUG=True python src/app.py
   ```

7. Navigate to `http://localhost:5000` to verify the setup.

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | Yes | - | Password for admin dashboard access |
| `SECRET_KEY` | No | Auto-generated | Flask session encryption key |
| `FLASK_DEBUG` | No | `False` | Enable debug mode (development only) |
| `FLASK_RUN_PORT` | No | `5000` | Port for development server |
| `ADVENT_ENABLED` | No | `False` | Enable advent calendar feature |

**Security Note:** Never commit `.env` to version control. The `.gitignore` already excludes this file.

For detailed configuration options, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Running Tests

### Quick Test Run

```bash
# Run all tests
pytest tests/

# Run with verbose output
pytest tests/ -v

# Run with coverage report
pytest --cov=src --cov-report=term-missing tests/
```

### Run Specific Tests

```bash
# Run a specific test file
pytest tests/test_tracker.py -v

# Run a specific test function
pytest tests/test_tracker.py::test_function_name -v
```

### Code Coverage

```bash
# Generate coverage report
coverage run -m pytest
coverage report -m

# Generate HTML coverage report
coverage html
# Open htmlcov/index.html in your browser
```

For complete testing documentation, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Pre-commit Setup

We recommend setting up pre-commit hooks to automatically check your code before committing.

1. **Install pre-commit**
   ```bash
   pip install pre-commit
   ```

2. **Create `.pre-commit-config.yaml`** (if not already present)
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

3. **Install the hooks**
   ```bash
   pre-commit install
   ```

4. **Run manually** (optional)
   ```bash
   pre-commit run --all-files
   ```

### Manual Linting

If you prefer to run linters manually:

```bash
# Python linting
black --check .
isort --check-only .
flake8 .

# Frontend linting
npm run lint
```

## Logging Configuration

The application uses Python's built-in logging module. For development:

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# Use Flask's logger in the app
app.logger.debug("Debug message")
app.logger.info("Info message")
app.logger.error("Error message")
```

For production logging configuration, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md#-logging-configuration).

## Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or for bug fixes
   git checkout -b fix/bug-description
   ```

2. **Make your changes** following the project's code style:
   - Python: PEP 8 style, formatted with Black (88 char line length)
   - JavaScript: ES6+, follow ESLint configuration
   - CSS: BEM naming convention, mobile-first approach

3. **Test your changes**
   ```bash
   pytest tests/ -v
   ```

4. **Run linters**
   ```bash
   black --check .
   isort --check-only .
   flake8 .
   npm run lint
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "Add descriptive commit message"
   ```

## Submitting Contributions

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template** with:
   - Description of changes
   - Type of change (bug fix, feature, etc.)
   - Related issues
   - Testing performed

4. **Wait for review** - maintainers will review your PR and may request changes

### PR Guidelines

- Keep PRs focused on a single change
- Include tests for new functionality
- Update documentation if needed
- Ensure all CI checks pass
- Respond to review feedback promptly

## Additional Resources

### Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - Design choices and system overview
- [Development Guide](docs/DEVELOPMENT.md) - Detailed development workflows
- [Configuration](docs/CONFIGURATION.md) - Environment variables and settings
- [API Documentation](docs/API.md) - API endpoints and usage
- [Deployment Guide](docs/DEPLOYMENT.md) - Deployment instructions

### Issue Templates

- [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml)
- [Questions](.github/ISSUE_TEMPLATE/question.yml)

### Getting Help

- 📫 [Create an issue](https://github.com/WxboySuper/Santa_Tracker/issues/new/choose)
- 💬 [Start a discussion](https://github.com/WxboySuper/Santa_Tracker/discussions)

---

Thank you for contributing to Santa Tracker! 🎅🎄
