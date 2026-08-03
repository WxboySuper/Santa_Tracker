# Emergency feature disable runbook

Use this when a server-backed beta capability must be turned off immediately without rebuilding the frontend.

## Scope

- **Disable-only:** `EMERGENCY_DISABLED_CAPABILITIES` can never enable a feature.
- **Server-backed only:** only keys declared in `server/lib/serverFeatureExposure.js` are accepted.
- **Current capability keys:** `TSTM_GENERATION_ENABLED` (Auto-TSTM).

Normal rollout still comes from the checked-in registry in `src/config/featureExposure.ts` plus deployment env switches such as `TSTM_GENERATION_ENABLED=true`.

## Disable Auto-TSTM routes (beta)

1. SSH to the beta analytics host.
2. Edit `/opt/gfc-beta-analytics/.env`.
3. Add or update:

```bash
EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED
```

4. Restart the analytics process:

```bash
cd /opt/gfc-beta-analytics
pm2 restart gfc-beta-analytics
```

No frontend rebuild or redeploy is required.

## Stop Auto-TSTM ingestion (beta)

Use this when the incident is caused by the background ingestion loop itself, such as upstream rate limiting, disk growth, runaway polling, or repeated cache writes. Route disable alone prevents user-triggered generation but does not keep a running ingestion loop from polling after restart.

The beta deploy workflow preserves an active `TSTM_INGESTION_ENABLED=false` value and any existing `EMERGENCY_DISABLED_CAPABILITIES` value from `/opt/gfc-beta-analytics/.env` when it writes a fresh env file. This keeps an in-flight emergency stop from being silently undone by a hotfix deployment. After the incident is resolved, complete the rollback steps below so future deployments resume normal ingestion.

1. SSH to the beta analytics host.
2. Edit `/opt/gfc-beta-analytics/.env`.
3. Set:

```bash
TSTM_INGESTION_ENABLED=false
```

4. If user-facing Auto-TSTM should also be hidden while ingestion is stopped, add or keep:

```bash
EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED
```

5. Restart the analytics process so the scheduled loop is not registered:

```bash
cd /opt/gfc-beta-analytics
pm2 restart gfc-beta-analytics
```

6. Confirm the process restarted cleanly:

```bash
pm2 status gfc-beta-analytics
pm2 logs gfc-beta-analytics --lines 100
```

Expected results:

- No new `[tstm-ingest]` polling or cache-write log lines appear after restart.
- `GET /api/tstm/status` reports `"ingestionEnabled": false`.
- If `EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED` is also set, `/api/capabilities/status` reports `"available": false` with `"reason": "emergency_disabled"`.

No frontend rebuild or redeploy is required.

## Verification

Prerequisite: the capability must be registry-exposed on the deployment target you are testing. Today that means `autoTstm.exposure.beta` is `true` in both `src/config/featureExposure.ts` and `server/lib/serverFeatureExposure.js`. Emergency disable only appears in `/api/capabilities/status` for capabilities the registry already exposes on that target.

From a shell with access to the beta site:

```bash
curl -s https://beta-gfc.weatherboysuper.com/api/capabilities/status
curl -s 'https://beta-gfc.weatherboysuper.com/api/tstm/latest?day=1&period=full'
```

Expected results:

- Status endpoint reports `"available": false` with `"reason": "emergency_disabled"`.
- Direct generation remains unavailable; cached guidance routes return `404` with `{ "error": "Auto-TSTM is not enabled on this deployment." }`.
- Server logs include lines like:
  - `[capabilities] emergency_disabled=["TSTM_GENERATION_ENABLED"] target=beta`
  - `[capabilities] rejected capability=TSTM_GENERATION_ENABLED reason=emergency_disabled`

Already-open beta sessions should stop showing server-backed controls after the status endpoint refresh or the next disabled API response.

## Rollback

1. Remove `EMERGENCY_DISABLED_CAPABILITIES` from `/opt/gfc-beta-analytics/.env`, or set it to an empty value.
2. If ingestion was stopped, restore `TSTM_INGESTION_ENABLED=true`.
3. Restart `gfc-beta-analytics` with pm2.
4. Re-run the verification commands and confirm `"available": true` when registry exposure and `TSTM_GENERATION_ENABLED=true` are both in effect.
5. Confirm `GET /api/tstm/status` reports `"ingestionEnabled": true` when ingestion should be running.
6. If a hotfix deployed during the incident, confirm `/opt/gfc-beta-analytics/.env` no longer carries the preserved emergency values.

## Ownership and audit

- **Registry owner:** see the feature entry in `src/config/featureExposure.ts` (`owner` field).
- **On-call maintainer:** repository maintainer with VPS access.
- **Audit trail:** pm2/server logs record startup disable state and per-request emergency rejections. No secrets are logged.

## Local incident drill

The manual curl drill below mirrors production only after the registry exposes Auto-TSTM on the target under test. Until that beta enablement lands, use the automated gate test instead.

Automated gate verification (works with the current all-off registry via test overrides):

```powershell
node --test server/tstm.test.js
```

Manual server drill (requires registry exposure on the target):

1. Confirm `autoTstm.exposure.beta` is `true` in `server/lib/serverFeatureExposure.js`, or run this drill against a deployment where Auto-TSTM is already live on beta.
2. Start the analytics server locally with emergency disable enabled:

```powershell
$env:SERVER_TARGET='beta'
$env:TSTM_GENERATION_ENABLED='true'
$env:TSTM_INGESTION_ENABLED='false'
$env:EMERGENCY_DISABLED_CAPABILITIES='TSTM_GENERATION_ENABLED'
node server/analytics.js
```

3. In another shell:

```powershell
curl http://127.0.0.1:3006/api/capabilities/status
curl 'http://127.0.0.1:3006/api/tstm/latest?day=1&period=full'
```

4. Confirm the status payload includes `TSTM_GENERATION_ENABLED` with reason `emergency_disabled`, cached guidance routes return `404`, and no Python worker starts.
5. Remove the emergency env var, restore `TSTM_INGESTION_ENABLED=true` if needed, restart the server, and confirm normal disabled/enabled behavior resumes according to the registry matrix.

## Public status endpoint security

`GET /api/capabilities/status` is intentionally unauthenticated and rate-limited. It returns only non-sensitive availability booleans and reason codes for registry-exposed server-backed capabilities. The `emergency_disabled` reason can signal incident response state, so treat the endpoint as operational metadata rather than a secret control plane.

## Malformed override behavior

If `EMERGENCY_DISABLED_CAPABILITIES` is malformed (for example `true`, `false`, or control characters), the server logs an error and applies **zero** emergency disables. Malformed input must never enable a capability.

Unknown keys in the list are ignored with a startup warning logged once when the analytics server boots.
