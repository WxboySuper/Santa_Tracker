# Configuration

This document describes environment variables and configuration options for Santa Tracker.

## 🔐 Environment Variables

### Required Variables

#### ADMIN_PASSWORD
Admin dashboard password for authentication.

```bash
export ADMIN_PASSWORD="your-secure-password"
```

**Best Practices:**
- Use 16+ characters
- Include uppercase, lowercase, numbers, symbols
- Never commit to version control
- Use different passwords per environment
- Store in password manager

---

### Optional Variables

#### FLASK_ENV
Application environment mode.

```bash
export FLASK_ENV="development"  # or "production"
```

**Values:**
- `development`: Development mode with debugging
- `production`: Production mode (optimized)

**Default:** `production`

---

#### FLASK_DEBUG
Enable debug mode and detailed error pages.

```bash
export FLASK_DEBUG="True"  # or "False"
```

**Features when enabled:**
- Auto-reload on code changes
- Interactive debugger
- Detailed error traces
- Development tools enabled

**Default:** `False`

**Warning:** Never enable in production!

---

#### FLASK_RUN_PORT
Port number for Flask development server.

```bash
export FLASK_RUN_PORT="8080"
```

**Default:** `5000`

---

#### SECRET_KEY
Flask session encryption key.

```bash
export SECRET_KEY="your-secret-key-here"
```

**Best Practices:**
- Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`
- Change between environments
- Keep secure and private
- Never commit to version control

**Default:** Generated randomly (not persistent)

---

#### FLASK_RUN_HOST
Host address for Flask development server.

```bash
export FLASK_RUN_HOST="0.0.0.0"  # Listen on all interfaces
```

**Default:** `127.0.0.1` (localhost only)

---

## 📄 .env File

### Creating .env File

Create a `.env` file in the project root:

```env
# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
FLASK_RUN_PORT=5000
FLASK_RUN_HOST=127.0.0.1

# Security
SECRET_KEY=your-secret-key-here-change-in-production
ADMIN_PASSWORD=your-secure-admin-password

# Optional: Database (if using external DB)
# DATABASE_URL=postgresql://user:pass@localhost/dbname

# Optional: External APIs
# SANTA_API_KEY=your-api-key
# SANTA_API_URL=https://api.example.com
```

### Loading .env File

The application automatically loads `.env` using `python-dotenv`:

```python
from dotenv import load_dotenv
load_dotenv()
```

### Security Note

**IMPORTANT:** Add `.env` to `.gitignore`:

```gitignore
# Environment variables
.env
.env.local
.env.*.local
```

---

## ⚙️ Configuration File (config.py)

### Basic Configuration

```python
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key'
    ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')
    
    # Flask
    DEBUG = False
    TESTING = False
    
    # Session
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # File paths
    ROUTE_DATA_FILE = 'santa_route.txt'
    STATIC_FOLDER = 'static'
    TEMPLATE_FOLDER = 'templates'

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    SESSION_COOKIE_SECURE = False  # Allow HTTP in dev

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    SESSION_COOKIE_SECURE = True  # Require HTTPS

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
```

### Using Configuration

```python
from config import DevelopmentConfig, ProductionConfig

# In app.py
config_class = ProductionConfig if os.environ.get('FLASK_ENV') == 'production' else DevelopmentConfig
app.config.from_object(config_class)
```

---

## 🗄️ Data File Configuration

### Route Data File
Location of Santa's route data.

**Default:** `santa_route.txt`

```python
ROUTE_DATA_FILE = os.environ.get('ROUTE_DATA_FILE', 'santa_route.txt')
```

### Advent Calendar Data
Location of advent calendar content.

**Default:** `src/static/data/advent_calendar.json`

```python
ADVENT_DATA_FILE = 'src/static/data/advent_calendar.json'
```

### Database Files
SQLite databases for geographic data.

**Files:**
- `cities.sqlite3`
- `countries.sqlite3`
- `regions.sqlite3`
- `states.sqlite3`
- `subregions.sqlite3`
- `world.sqlite3`

---

## 🌐 External API Configuration

### Santa Tracking API (Optional)

If integrating with external Santa tracking APIs:

```env
SANTA_API_KEY=your-api-key
SANTA_API_URL=https://api.santatracker.example.com
SANTA_API_TIMEOUT=30
```

```python
# In config.py
class Config:
    SANTA_API_KEY = os.environ.get('SANTA_API_KEY')
    SANTA_API_URL = os.environ.get('SANTA_API_URL')
    SANTA_API_TIMEOUT = int(os.environ.get('SANTA_API_TIMEOUT', 30))
```

---

## 🚀 Production Configuration

### Environment Variables for Production

```bash
# Production environment
export FLASK_ENV=production
export FLASK_DEBUG=False

# Security (use strong values!)
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export ADMIN_PASSWORD="your-very-secure-password"

# Server
export FLASK_RUN_HOST=0.0.0.0
export FLASK_RUN_PORT=5000

# Optional: Gunicorn workers
export WEB_CONCURRENCY=4
```

### Gunicorn Configuration

Create `gunicorn_config.py`:

```python
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
backlog = 2048

# Worker processes
workers = int(os.environ.get('WEB_CONCURRENCY', 4))
worker_class = 'sync'
worker_connections = 1000
timeout = 30
keepalive = 2

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# Process naming
proc_name = 'santa-tracker'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None
```

Run with:
```bash
gunicorn -c gunicorn_config.py src.app:app
```

---

## 🔒 Security Hardening

### Session Security

```python
# Secure cookies
SESSION_COOKIE_SECURE = True       # HTTPS only
SESSION_COOKIE_HTTPONLY = True     # No JavaScript access
SESSION_COOKIE_SAMESITE = 'Lax'    # CSRF protection

# Session lifetime
PERMANENT_SESSION_LIFETIME = 3600  # 1 hour
```

### HTTPS Configuration

For production behind reverse proxy:

```python
from werkzeug.middleware.proxy_fix import ProxyFix

app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_proto=1,
    x_host=1
)
```

### Content Security Policy

Add CSP headers:

```python
@app.after_request
def set_csp(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net unpkg.com; "
        "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net unpkg.com; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:;"
    )
    return response
```

---

## 🧪 Testing Configuration

### Test Environment

```env
# .env.test
FLASK_ENV=testing
FLASK_DEBUG=True
TESTING=True

# Use test password
ADMIN_PASSWORD=test-password

# Test database
DATABASE_URL=sqlite:///test.db
```

### Loading Test Config

```python
# In tests/conftest.py
import os
os.environ['FLASK_ENV'] = 'testing'
os.environ['ADMIN_PASSWORD'] = 'test-password'
```

---

## 📊 Logging Configuration

### Basic Logging

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('santa-tracker.log'),
        logging.StreamHandler()
    ]
)

# Use in app
app.logger.info('Application started')
```

### Production Logging

```python
if not app.debug:
    # File handler
    file_handler = RotatingFileHandler(
        'santa-tracker.log',
        maxBytes=10240000,
        backupCount=10
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    
    app.logger.setLevel(logging.INFO)
    app.logger.info('Santa Tracker startup')
```

---

## 🔧 Example Configurations

### Development Setup

```bash
# .env.development
FLASK_ENV=development
FLASK_DEBUG=True
FLASK_RUN_PORT=5000
SECRET_KEY=dev-secret-key-not-secure
ADMIN_PASSWORD=admin123
```

### Production Setup

```bash
# .env.production
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_RUN_HOST=0.0.0.0
FLASK_RUN_PORT=8080
SECRET_KEY=<generated-secure-key>
ADMIN_PASSWORD=<strong-password>
```

### Docker Setup

```dockerfile
# Environment in Dockerfile
ENV FLASK_ENV=production
ENV FLASK_DEBUG=False
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000

# Or use docker-compose.yml
environment:
  - FLASK_ENV=production
  - SECRET_KEY=${SECRET_KEY}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD}
```

---

## ✅ Configuration Checklist

### Development
- [ ] Create `.env` file
- [ ] Set `FLASK_ENV=development`
- [ ] Set `FLASK_DEBUG=True`
- [ ] Set `ADMIN_PASSWORD`
- [ ] Add `.env` to `.gitignore`

### Production
- [ ] Set `FLASK_ENV=production`
- [ ] Set `FLASK_DEBUG=False`
- [ ] Generate secure `SECRET_KEY`
- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Enable HTTPS
- [ ] Configure CSP headers
- [ ] Set up logging
- [ ] Configure reverse proxy
- [ ] Set appropriate worker count
- [ ] Test all endpoints
