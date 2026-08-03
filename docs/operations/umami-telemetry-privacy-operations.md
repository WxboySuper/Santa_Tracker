# Umami Telemetry: Privacy Operations

Last reviewed: July 21, 2026

This is an engineering and operational record, not a legal certification. GFC uses this configuration as a conservative baseline for privacy principles commonly reflected in GDPR/UK GDPR, PECR, CCPA/CPRA, and similar regimes. Obtain qualified legal advice before representing the service as compliant in every jurisdiction.

## Purpose and data boundary

GFC uses self-hosted, cookie-free **pseudonymous product analytics** only to understand aggregate product use and prioritize improvements. It is not used for advertising, sale, cross-site tracking, or profiling tied to a Firebase account.

| Category | Current handling |
| --- | --- |
| Route/page activity | Manual native Umami page views use a normalized path only; query strings and hashes are excluded. |
| Product events | A small allowlist of workflow, export, cloud-save, and custom-layer milestones. Properties are coarse and allowlisted. |
| Technical metadata | Browser, operating system, device type, timestamps, and the Umami pseudonymous visitor/session grouping. |
| Location | Umami can derive location from an IP address, but the Nginx telemetry proxy now substitutes a loopback address. New GFC analytics records should not contain visitor country, region, or city. |
| Excluded | Firebase UID, email, account identity, auth token, forecast contents, coordinates, layer text, filenames, export contents, user-created event properties, session replay, heatmaps, and content capture. |

There is no `umami.identify()` call in GFC. The visitor/session grouping is not linked to Firebase account records.

## Consent and application behavior

- Product analytics are non-essential and disabled by default.
- Privacy Policy acceptance does not enable analytics.
- A separate optional control appears at the top of the policy in both acceptance and view-only flows.
- Enabling is an affirmative local choice; declining does not block GFC.
- Withdrawal removes the tracker and clears queued page views/events.
- The tracker is configured for manual SPA page views, `Do Not Track`, search exclusion, and hash exclusion.
- Production and beta are separate Umami websites/zones.

## Infrastructure and access path

| Component | Role / control |
| --- | --- |
| GFC web app | Loads Umami only after local opt-in and only on the matching production or beta hostname. |
| Nginx | TLS terminates `telemetry.gfc.weatherboysuper.com`; HTTP redirects to HTTPS. The telemetry vhost disables access logging and substitutes `127.0.0.1` for forwarded client-IP headers before proxying to Umami. |
| Umami | Dockerized, self-hosted dashboard/service on the GFC VPS. `PRIVATE_MODE=1`, `DISABLE_TELEMETRY=1`, `FORCE_SSL=1`, and trailing-slash normalization are enabled. |
| PostgreSQL | Umami’s private Docker volume. It is bound inside the Docker network; the database is not publicly exposed. |
| Hostinger/VPS | Infrastructure provider and host for Nginx, Docker, Umami, and PostgreSQL. |

As of this review, the Umami instance has one admin user, the service is behind valid HTTPS, the PostgreSQL volume is local to Docker, and no Umami-specific backup artifact was found. Docker JSON logs are capped at three 10 MB files. Nginx’s general logrotate policy retains 14 daily rotations, but the telemetry vhost now has `access_log off`; old global access-log entries age out under that policy.

## Retention and deletion

**Unresolved business decision:** a fixed event-level Umami retention period and automated deletion job have not yet been adopted. Do not describe a fixed telemetry deletion window publicly until the decision and mechanism both exist.

Before enabling general production collection beyond the current opt-in baseline, decide and implement:

1. Event/session retention period (recommended engineering target: 90 days or less unless a documented product need requires more).
2. A tested, scheduled deletion job that removes expired `website_event`, `event_data`, `session`, and any enabled replay/heatmap data in dependency-safe order.
3. Encrypted database backup cadence, backup retention, restore testing, and the matching deletion behavior for backups.

If region-level product insight becomes necessary, do not restore raw client-IP forwarding to Umami. First deploy and test a trusted country/region-only GeoIP resolver or proxy that never forwards city or raw IP to Umami, then update the policy and this record before enabling it.

Firebase account deletion cannot automatically remove Umami data because no account identifier is sent to Umami. For access/deletion requests, the operator should ask for approximate date/time, browser/device, route/event details, and consent state; explain the limits of locating a pseudonymous record, perform the scoped Umami deletion where feasible, and record the request/response outside the analytics system.

## Operational ownership and incident response

- Privacy questions and access/deletion requests: `alex@weatherboysuper.com`.
- VPS/Umami/Nginx/backup operator: GFC operator.
- On a suspected telemetry or VPS breach: preserve minimum necessary evidence, rotate impacted access credentials/secrets, assess affected systems and records, consult counsel on notification duties, notify affected people/regulators where required, and document remediation.
- Restrict Umami admin access to named operators, use unique strong credentials and HTTPS, and review access after any role or infrastructure change.

## Verification checklist

- Unit tests cover default-off, explicit opt-in, tracker removal/queue clearing on withdrawal, normalized native page views, and tracker privacy attributes.
- Browser checks cover acceptance and view-only policy flows, top-of-document choice, disabled default, explicit opt-in, and withdrawal.
- VPS checks cover Nginx syntax/health, TLS, Docker runtime flags, database exposure, logs, and replay/heatmap row counts.
