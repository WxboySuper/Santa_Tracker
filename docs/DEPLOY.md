# Deployment Guide for VPS/Systemd Environments

This guide covers deploying Santa Tracker to a VPS using systemd for process management, focusing on proper file ownership and permissions to avoid common deployment issues.

## Overview

The Santa Tracker deployment workflow uses a release-based approach where:
1. Each deployment creates a timestamped release directory
2. A symlink (`current`) points to the active release
3. The systemd service runs from the `current` symlink
4. All files are owned by the deploy user (not root)

## File Ownership and Permissions

### Why Ownership Matters

**Problem**: If the virtualenv and application files are created as root during deployment, the systemd service running as a non-root user cannot access them properly, leading to:
- Permission denied errors
- Failed service starts
- nginx 502 Bad Gateway errors

**Solution**: Create all release files (virtualenv, pip packages, etc.) as the deploy user from the start.

### Recommended Ownership Structure

```
/srv/santa-tracker/                    # DEPLOY_PATH
├── releases/                          # owned by deploy-user:deploy-user
│   ├── 20231201-120000/              # owned by deploy-user:deploy-user
│   │   ├── venv/                     # owned by deploy-user:deploy-user
│   │   ├── src/                      # owned by deploy-user:deploy-user
│   │   └── .env                      # owned by deploy-user:deploy-user (mode 600)
│   └── 20231201-140000/              # owned by deploy-user:deploy-user
├── current -> releases/20231201-140000/  # symlink owned by deploy-user:deploy-user
└── data/                              # owned by deploy-user:deploy-user
```

## Systemd Service Configuration

### Recommended Unit File

The systemd service should run as the **deploy user** (typically `santa` or the user specified in `PROD_DEPLOY_USER`), not as root.

Example `/etc/systemd/system/santa-tracker.service`:

```ini
[Unit]
Description=Santa Tracker Web App
After=network.target

[Service]
Type=simple
User=santa
Group=santa
WorkingDirectory=/srv/santa-tracker/current

# Main application command
ExecStart=/srv/santa-tracker/current/venv/bin/python -m src.app

# Or if using gunicorn:
# ExecStart=/srv/santa-tracker/current/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 src.app:app

# Environment
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/srv/santa-tracker/current/.env

# Restart policy
Restart=on-failure
RestartSec=5

# If the app creates a socket that nginx needs to access:
# ExecStartPost=/bin/sh -c 'while [ ! -S /tmp/santa-tracker.sock ]; do sleep 0.1; done; chmod 666 /tmp/santa-tracker.sock'

[Install]
WantedBy=multi-user.target
```

### Key Points

1. **User=santa**: Run as the deploy user, not root
2. **No ExecStartPre chown**: The deploy workflow ensures correct ownership; systemd should not try to chown files
3. **ExecStartPost for sockets**: If your app creates a Unix socket for nginx, use `ExecStartPost` to adjust socket permissions (not file ownership)
4. **EnvironmentFile**: Load environment variables from `.env` in the current release

### What NOT to Do

❌ **DO NOT** use `ExecStartPre` to chown files:

```ini
# WRONG - This will fail if User=santa
ExecStartPre=/bin/chown -R santa:santa /srv/santa-tracker/current
```

The deploy user cannot chown files owned by root. Instead, the deployment workflow handles ownership.

## GitHub Actions Deployment Workflow

The deployment workflows (`.github/workflows/deploy-on-release.yml` and `first-deploy.yml`) ensure proper ownership:

### Key Steps in Deploy Workflow

1. **Create venv as deploy user**:
   ```bash
   sudo -u "${PROD_DEPLOY_USER}" bash -lc "python3 -m venv '${REMOTE_DIR}/venv' && ..."
   ```
   This ensures the virtualenv is owned by the deploy user from creation.

2. **Install packages as deploy user**:
   ```bash
   sudo -u "${PROD_DEPLOY_USER}" bash -lc "'${REMOTE_DIR}/venv/bin/pip' install -r requirements.txt"
   ```

3. **Run migrations as deploy user** (if needed):
   ```bash
   sudo -u "${PROD_DEPLOY_USER}" bash -lc "cd '${REMOTE_DIR}' && './venv/bin/alembic' upgrade head"
   ```

4. **Switch symlink (privileged)**:
   ```bash
   sudo ln -sfn "${REMOTE_DIR}" "${PROD_DEPLOY_PATH}/current"
   ```

5. **Ensure ownership (final privileged step)**:
   ```bash
   sudo chown -R "${PROD_DEPLOY_USER}:${PROD_DEPLOY_USER}" "${REMOTE_DIR}"
   sudo chown -h "${PROD_DEPLOY_USER}:${PROD_DEPLOY_USER}" "${PROD_DEPLOY_PATH}/current"
   sudo chown -R "${PROD_DEPLOY_USER}:${PROD_DEPLOY_USER}" "${PROD_DEPLOY_PATH}/data"
   ```

6. **Restart service**:
   ```bash
   sudo systemctl restart santa-tracker
   ```

7. **Verify deployment**:
   ```bash
   # Check ownership
   stat -c '%U:%G' "${PROD_DEPLOY_PATH}/current"
   # Check service is active
   sudo systemctl is-active --quiet santa-tracker
   ```

## Troubleshooting

### Service Fails to Start (Permission Denied)

**Symptoms**:
- `systemctl status santa-tracker` shows "Permission denied"
- nginx shows 502 Bad Gateway
- Logs show: `[Errno 13] Permission denied`

**Diagnosis**:
```bash
# Check ownership of current symlink and target
ls -la /srv/santa-tracker/current
stat -c '%U:%G' /srv/santa-tracker/current

# Check venv ownership
ls -la /srv/santa-tracker/current/venv/

# Check what user the service runs as
systemctl show santa-tracker | grep '^User='
```

**Fix**:
```bash
# As root or with sudo, fix ownership
sudo chown -R santa:santa /srv/santa-tracker/releases/$(readlink /srv/santa-tracker/current | xargs basename)
sudo chown -h santa:santa /srv/santa-tracker/current
sudo systemctl restart santa-tracker
```

### Service Starts but Cannot Write Logs/Data

**Symptoms**:
- Service runs but crashes when trying to write files
- "Permission denied" on data directory

**Fix**:
```bash
# Ensure data directory ownership
sudo chown -R santa:santa /srv/santa-tracker/data
sudo systemctl restart santa-tracker
```

### Deployment Verification Fails

**Symptoms**:
- GitHub Action fails at "Post-deploy verification" step
- Error: "current symlink is not owned by ..."

**Diagnosis**:
The deployment workflow created files as root instead of the deploy user.

**Fix**:
Ensure the deploy workflow uses `sudo -u "${PROD_DEPLOY_USER}"` for venv/pip operations, not direct commands as root.

## Required Server Setup

Before first deployment, ensure:

1. **Deploy user exists**:
   ```bash
   sudo useradd -m -s /bin/bash santa
   ```

2. **Deploy user can sudo** (for symlink switching and service restart):
   ```bash
   # Add to /etc/sudoers.d/santa
   santa ALL=(ALL) NOPASSWD: /bin/ln, /bin/systemctl, /bin/chown, /usr/bin/stat
   ```

3. **Deployment directory exists with correct ownership**:
   ```bash
   sudo mkdir -p /srv/santa-tracker/{releases,data}
   sudo chown -R santa:santa /srv/santa-tracker
   ```

4. **Python and dependencies installed**:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-venv python3-pip
   ```

## Security Considerations

1. **Minimal sudo permissions**: The deploy user should only have sudo access to specific commands needed for deployment
2. **.env file permissions**: Always set `.env` to mode 600 (readable only by owner)
3. **Separate users**: Consider separate users for deployment (santa) and web server (www-data) if serving static files
4. **Socket permissions**: If using Unix sockets for nginx, use `ExecStartPost` in systemd to set socket permissions, not file ownership

## References

- [systemd.service(5) man page](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [systemd.exec(5) - User/Group directives](https://www.freedesktop.org/software/systemd/man/systemd.exec.html)
- [Python venv documentation](https://docs.python.org/3/library/venv.html)

## Related Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - General deployment guide for various platforms
- [CONFIGURATION.md](./CONFIGURATION.md) - Environment variables and configuration
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Local development setup
