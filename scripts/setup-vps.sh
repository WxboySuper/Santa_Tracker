#!/usr/bin/env bash
# One-time VPS setup for GFC production (timed rollout + staging preview)
# Run as root on the VPS:  bash scripts/setup-vps.sh
set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  GFC Production VPS Setup"
echo "═══════════════════════════════════════════"

echo ""
echo ">> Creating web and analytics directories ..."
mkdir -p /var/www/gfc/releases
mkdir -p /var/www/gfc-staging/releases
mkdir -p /opt/gfc-analytics/releases
mkdir -p /opt/gfc-analytics/config
mkdir -p /opt/gfc-analytics/logs
mkdir -p /opt/gfc-staging-analytics/config
mkdir -p /opt/gfc-staging-analytics/logs

echo ">> Checking for Node.js >= 18 ..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -ge 18 ]; then
    NODE_OK=true
    echo "   Found Node.js v$(node --version)"
  fi
fi

if [ "$NODE_OK" = false ]; then
  echo "   Installing Node.js 20 via NodeSource ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo ">> Checking for PM2 ..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
pm2 startup || true

echo ">> Checking for Nginx ..."
if ! command -v nginx &>/dev/null; then
  apt-get update && apt-get install -y nginx
fi

CRON_FILE=/etc/cron.d/gfc-rollout
if [ ! -f "$CRON_FILE" ]; then
  echo ">> Installing rollout cron (every minute) ..."
  cat > "$CRON_FILE" <<'CRON'
* * * * * root if [ -f /opt/gfc-analytics/current/release/check-rollout.mjs ]; then cd /opt/gfc-analytics/current && /usr/bin/env node release/check-rollout.mjs; fi >> /opt/gfc-analytics/logs/rollout-cron.log 2>&1
CRON
  chmod 644 "$CRON_FILE"
else
  echo ">> Rollout cron already present at $CRON_FILE"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete — next steps:"
echo "═══════════════════════════════════════════"
echo ""
echo "  1. Production nginx (symlink docroot):"
echo "     cp server/nginx.conf /etc/nginx/sites-available/gfc"
echo "     ln -sf /etc/nginx/sites-available/gfc /etc/nginx/sites-enabled/gfc"
echo ""
echo "  2. Staging preview (manual rehearsal build):"
echo "     cp server/nginx-staging.conf /etc/nginx/sites-available/gfc-staging"
echo "     ln -sf /etc/nginx/sites-available/gfc-staging /etc/nginx/sites-enabled/gfc-staging"
echo "     certbot --nginx -d staging-gfc.weatherboysuper.com"
echo ""
echo "  3. nginx -t && systemctl reload nginx"
echo ""
echo "  4. GitHub Actions secrets: PROD_SSH_KEY, PROD_SSH_HOST, BETA_INVITE_PATH, ..."
echo ""
echo "  5. Merge release automation PR, then run Deploy Production to VPS (action=live once to migrate layout)."
echo ""
echo "  See docs/release-workflow.md for the manual release and staging flow."
echo ""
