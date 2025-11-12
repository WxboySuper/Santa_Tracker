# Deployment Guide

This guide covers deploying Santa Tracker to various hosting platforms.

## 🚀 General Deployment Requirements

### Prerequisites
- Python 3.10+
- Git repository access
- Environment variables configured
- Production-ready database (if needed)

### Pre-Deployment Checklist
- [ ] Set `FLASK_ENV=production`
- [ ] Set `FLASK_DEBUG=False`
- [ ] Configure strong `SECRET_KEY`
- [ ] Set secure `ADMIN_PASSWORD`
- [ ] Test application locally
- [ ] Run all tests: `python -m pytest`
- [ ] Run linters
- [ ] Review security settings
- [ ] Prepare environment variables
- [ ] Test with production-like data

---

## 🔴 Heroku Deployment

### Quick Deploy

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create santa-tracker-app

# Set environment variables
heroku config:set FLASK_ENV=production
heroku config:set SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')
heroku config:set ADMIN_PASSWORD=your-secure-password

# Deploy
git push heroku main

# Open app
heroku open
```

### Procfile

Create `Procfile` in project root:

```
web: gunicorn src.app:app
```

### Runtime

Create `runtime.txt`:

```
python-3.10.12
```

### Heroku Configuration

```bash
# Scale dynos
heroku ps:scale web=1

# View logs
heroku logs --tail

# Run commands
heroku run python src/generate_static.py

# Database (if needed)
heroku addons:create heroku-postgresql:mini
```

### Custom Domain

```bash
# Add custom domain
heroku domains:add www.santatracker.example.com

# Configure DNS
# Add CNAME record pointing to Heroku app URL
```

---

## ⚡ Vercel Deployment

### Quick Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Production deployment
vercel --prod
```

### vercel.json

Create `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/app.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/app.py"
    }
  ],
  "env": {
    "FLASK_ENV": "production"
  }
}
```

### Environment Variables

Add via Vercel dashboard or CLI:

```bash
vercel env add SECRET_KEY
vercel env add ADMIN_PASSWORD
```

### Static Site Deployment

For static-only version:

```bash
# Generate static files
python src/generate_static.py

# Deploy dist/ directory
vercel --prod dist/
```

---

## 🟢 Netlify Deployment

### Quick Deploy via Git

1. Push code to GitHub
2. Connect repository in Netlify dashboard
3. Configure build settings:
   - **Build command**: `python src/generate_static.py`
   - **Publish directory**: `dist`
4. Add environment variables in Netlify UI
5. Deploy

### netlify.toml

Create `netlify.toml`:

```toml
[build]
  command = "python src/generate_static.py"
  publish = "dist"

[build.environment]
  PYTHON_VERSION = "3.10"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Environment Variables

```bash
# Using Netlify CLI
netlify env:set SECRET_KEY "your-secret-key"
netlify env:set ADMIN_PASSWORD "your-password"
```

### Functions (Optional)

For serverless functions, create `netlify/functions/`:

```javascript
// netlify/functions/api.js
exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from Netlify Functions" })
  };
};
```

---

## 🐳 Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 5000

# Set environment
ENV FLASK_ENV=production
ENV FLASK_DEBUG=False

# Run with gunicorn
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "src.app:app"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
      - SECRET_KEY=${SECRET_KEY}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - ./instance:/app/instance
    restart: unless-stopped
```

### Build and Run

```bash
# Build image
docker build -t santa-tracker .

# Run container
docker run -p 5000:5000 \
  -e SECRET_KEY="your-secret-key" \
  -e ADMIN_PASSWORD="your-password" \
  santa-tracker

# Using docker-compose
docker-compose up -d
```

### Docker Hub

```bash
# Tag image
docker tag santa-tracker username/santa-tracker:latest

# Push to Docker Hub
docker push username/santa-tracker:latest

# Pull and run on server
docker pull username/santa-tracker:latest
docker run -d -p 5000:5000 username/santa-tracker:latest
```

---

## ☁️ AWS Deployment

### AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init -p python-3.10 santa-tracker

# Create environment
eb create santa-tracker-env

# Set environment variables
eb setenv FLASK_ENV=production SECRET_KEY=xxx ADMIN_PASSWORD=xxx

# Deploy
eb deploy

# Open app
eb open
```

### AWS Lambda + API Gateway

Use Zappa for serverless:

```bash
# Install Zappa
pip install zappa

# Initialize
zappa init

# Deploy
zappa deploy production

# Update
zappa update production
```

**zappa_settings.json:**

```json
{
  "production": {
    "app_function": "src.app.app",
    "aws_region": "us-east-1",
    "runtime": "python3.10",
    "s3_bucket": "santa-tracker-deployments",
    "environment_variables": {
      "FLASK_ENV": "production"
    }
  }
}
```

---

## 🌐 VPS Deployment (DigitalOcean, Linode, etc.)

### Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python
sudo apt install python3.10 python3-pip nginx -y

# Install supervisor (process manager)
sudo apt install supervisor -y
```

### Application Setup

```bash
# Clone repository
cd /var/www
sudo git clone https://github.com/WxboySuper/Santa_Tracker.git
cd Santa_Tracker

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
sudo nano .env
# Add environment variables
```

### Gunicorn Service

Create `/etc/supervisor/conf.d/santa-tracker.conf`:

```ini
[program:santa-tracker]
command=/var/www/Santa_Tracker/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 src.app:app
directory=/var/www/Santa_Tracker
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/santa-tracker/err.log
stdout_logfile=/var/log/santa-tracker/out.log
environment=PATH="/var/www/Santa_Tracker/venv/bin"
```

```bash
# Create log directory
sudo mkdir /var/log/santa-tracker

# Reload supervisor
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start santa-tracker
```

### Nginx Configuration

Create `/etc/nginx/sites-available/santa-tracker`:

```nginx
server {
    listen 80;
    server_name santatracker.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static {
        alias /var/www/Santa_Tracker/src/static;
        expires 30d;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/santa-tracker /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d santatracker.example.com

# Auto-renewal is configured automatically
```

---

## 🔒 Security Hardening

### Firewall Setup

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### Fail2Ban

```bash
# Install Fail2Ban
sudo apt install fail2ban -y

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Restart
sudo systemctl restart fail2ban
```

### Regular Updates

```bash
# Setup automatic security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 📊 Monitoring & Logging

### Application Logging

```python
# In app.py
import logging
from logging.handlers import RotatingFileHandler

if not app.debug:
    file_handler = RotatingFileHandler(
        'santa-tracker.log',
        maxBytes=10240000,
        backupCount=10
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s'
    ))
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
```

### Uptime Monitoring

Free services:
- UptimeRobot
- StatusCake
- Pingdom Free

### Error Tracking

Integrate Sentry:

```bash
pip install sentry-sdk[flask]
```

```python
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn="your-sentry-dsn",
    integrations=[FlaskIntegration()],
    traces_sample_rate=1.0
)
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "santa-tracker-app"
          heroku_email: "your-email@example.com"
```

### Automated Testing

```yaml
- name: Run tests
  run: |
    pip install -r requirements.txt
    python -m pytest
```

---

## 🚦 Health Checks

### Health Endpoint

Add to `app.py`:

```python
@app.route('/health')
def health():
    return {'status': 'healthy', 'version': '1.0.0'}, 200
```

### Readiness Check

```python
@app.route('/ready')
def ready():
    # Check database connection, etc.
    return {'status': 'ready'}, 200
```

---

## 📚 Additional Resources

- [Flask Deployment Options](https://flask.palletsprojects.com/en/2.3.x/deploying/)
- [Gunicorn Documentation](https://docs.gunicorn.org/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Heroku Python Guide](https://devcenter.heroku.com/articles/getting-started-with-python)
