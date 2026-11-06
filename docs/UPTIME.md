# Uptime checks

Set up an external monitor for `https://santa.weatherboysuper.com/api/health`. The endpoint returns only `{"status":"ok"}`, responds with HTTP 200 in every season, and sends `Cache-Control: private, no-store`. It does not reveal deployment IDs, timestamps, secrets, or data-store state. It confirms that the Worker can answer a request; it does not prove that R2 or route data is healthy.

Add a second check for `https://santa.weatherboysuper.com/` to catch failures that affect the home page. During Dec 24-25, also monitor `https://santa.weatherboysuper.com/api/route`. It returns 404 while the tracker season is closed or its emergency switch is on, and 200 while it is open and visible. Do not configure the route check to treat closed-season 404 as an outage. The tracker opens at Dec 24 09:50 UTC and closes Jan 7 00:00 UTC. Advent APIs have their own window, which opens Nov 30 00:00 UTC.

| Check | Closed season | Open and visible season |
| --- | --- | --- |
| `/api/health` | 200 | 200 |
| `/` | 200 | 200 |
| `/api/route` | 404 with `Cache-Control: private, no-store` | 200 with the shared-cache policy |
| `/api/advent/manifest` | 404 with `Cache-Control: private, no-store` | 200 with `Cache-Control: private, no-store` |

An emergency hide intentionally returns 404 from the affected feature's gated route. Treat that as expected only when the owner has deliberately hidden the feature. The health endpoint itself remains 200.

## Monitor settings for Dec 24-25

- Check `/api/health` and `/` once per minute from Dec 23 through Dec 26. Add `/api/route` at 09:45 UTC on Dec 24 and keep it through Dec 25. Configure its expected status to change from 404 to 200 at 09:50 UTC on Dec 24; if the monitor cannot schedule expected codes, use separate checks before and after opening.
- Alert on two consecutive failed checks, which gives a 2-minute signal at a 1-minute interval. Count network errors, timeouts, and unexpected 5xx responses as failures. For `/api/route`, count 404 as failure only after the tracker is expected to be open and the owner has not hidden it.
- Use a 10-second request timeout. Send alerts to the owner through the primary on-call channel and keep a second recipient for Dec 24-25.
- Keep alert recovery notifications enabled. After an alert, check the Cloudflare Worker error logs, request/CPU analytics, the current deployment, the `/api/health` response, and `GET /api/route` from a private session. Use [the rollback runbook](ROLLBACK_RUNBOOK.md) if the Worker or data needs recovery.

UptimeRobot can check the health URL as an HTTP(s) monitor with status code 200. Cloudflare Health Checks can also monitor a public URL; configure the same expected status and interval rules if that product is enabled for the account. Do not make the monitor use an admin cookie or token.
