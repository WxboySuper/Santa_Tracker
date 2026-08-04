# Hosted server

`server/analytics.js` is the process entry point and
`server/analytics-app.js` composes Express routes for metrics, Sentry, billing,
account lifecycle, capability status, and Auto-TSTM.

Validate external input at route boundaries, keep secrets server-side, and
fail closed for hosted capability checks. Colocate tests with their module.
Use `server/package.json` for server dependencies and run its focused tests when
server behavior changes.
