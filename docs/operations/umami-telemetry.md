# Umami telemetry operations

GFC uses one self-hosted Umami instance with two website records: one for production GFC and one for beta GFC. Do not combine the website records, Firebase identities, or forecast data.

## Prerequisites

1. Create an A record for telemetry.gfc.weatherboysuper.com pointing to the VPS.
2. Copy deploy/umami to /opt/umami on the VPS.
3. Create /opt/umami/.env from .env.example. Generate both secrets on the VPS. The database password inside DATABASE_URL must match POSTGRES_PASSWORD.
4. Run docker compose up -d in /opt/umami.
5. Enable nginx.bootstrap.conf first, create /var/www/certbot, request the certificate with `certbot certonly --webroot -w /var/www/certbot -d telemetry.gfc.weatherboysuper.com`, then replace the bootstrap host with nginx.conf. Test Nginx and reload it.

## First login and zones

Change the initial Umami administrator password immediately. Create exactly two websites:

- Production: gfc.weatherboysuper.com
- Beta: beta-gfc.weatherboysuper.com

Put their IDs in GitHub Actions secrets named VITE_UMAMI_PRODUCTION_WEBSITE_ID and VITE_UMAMI_BETA_WEBSITE_ID. Add VITE_UMAMI_HOST with the public telemetry HTTPS origin. Production and beta builds receive both IDs but choose only their matching hostname at runtime.

## Privacy contract

The client waits until the current Privacy Policy is accepted, then loads no tracker and sends no event when localStorage contains gfc-analytics-enabled=false. The Privacy Policy modal exposes this local-only switch. Events and allowed event properties must be registered in src/lib/productAnalytics.ts before use. Do not add identity, forecast contents, coordinates, names, free text, filenames, raw URLs with query strings, or error messages as properties.

## Verification

Verify the Umami containers are healthy, the database is not publicly bound, Nginx validates, and both website records receive only their own zone traffic. Test the local opt-out in both production and beta. Confirm that GA4 and browser calls to /api/collect are absent from the final production bundle.
