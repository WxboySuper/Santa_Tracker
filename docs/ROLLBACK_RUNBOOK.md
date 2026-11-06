# Rollback runbook

Use this when a deploy, route snapshot, calendar, or feature flag causes a production problem. Keep the site closed while recovering data or code. The emergency switches hide the tracker and Advent, but they do not hide the home page or repair a broken Worker.

## 1. Hide the affected feature

If the admin site still works, open `/admin`, use **Emergency switches**, turn on **Hide tracker** or **Hide Advent**, and confirm. The flag is stored at `emergency/feature-flags.json` in the configured store. In production that is the `santa-tracker-snapshots` R2 bucket. A Worker isolate may keep the previous flag for up to 7 seconds.

The public `/api/route` response can remain at the edge for up to 120 seconds. Purge that URL after hiding the tracker. Follow [Cache purge instructions](CACHE_PURGE.md). Verify in a private browser window that `/tracker` and `/api/route` return 404. The API 404 must have `Cache-Control: private, no-store`.

If the Worker or admin page is failing, use the Cloudflare Workers rollback below first. Then hide the feature in `/admin` and purge `/api/route` if needed.

## 2. Roll back Worker code

1. Record the incident time, the failing URL, the deployment/version ID, and the relevant Worker error or request log. Check whether the problem followed a code deployment or a data change before choosing what to restore.
2. In Cloudflare, open **Workers & Pages**, select `santa-tracker`, then open **Deployments**. Review the active deployment and select the last known good deployment. Choose **Rollback** and confirm. Cloudflare creates a new active deployment from that version. A rollback changes Worker code/configuration; it does not restore the R2 objects.
3. Wait for the deployment to finish. Check Cloudflare Worker logs and analytics for new exceptions and 5xx responses. Check `https://santa.weatherboysuper.com/api/health` for HTTP 200, then check `/`, `/api/route`, and `/api/advent/manifest` against their expected season behavior in [UPTIME.md](UPTIME.md).
4. Keep the affected feature hidden until its data and page are verified. Re-enable it in `/admin` only after the public checks pass.

Cloudflare also documents rollback by version ID. The equivalent command is shown here for an approved deployment environment only. Do not run Wrangler or any remote write command from a developer workstation:

```sh
pnpm exec wrangler rollback <KNOWN_GOOD_VERSION_ID> --name santa-tracker --message "Rollback after incident YYYY-MM-DD"
```

## 3. Restore an R2 dataset or emergency flag

Worker rollback does not roll back route or Advent snapshots. The versioned dataset keys are:

- `santa-route/versions/<versionId>.json`
- `advent-calendar/versions/<versionId>.json`
- The active pointer is `santa-route/active.json` or `advent-calendar/active.json`.

Use the R2 dashboard to inspect the bucket and record the active pointer and candidate version IDs before changing anything. Each pointer is JSON with a `versionId` and `updatedAt`. To restore a version, replace only that dataset's `active.json` with a pointer to the selected existing version. Keep the previous pointer value in the incident notes so the operation can be reversed.

If using the R2 S3-compatible API from an approved, access-controlled operator environment, first configure R2 credentials in the environment. Do not put credentials in the command line or shell history. Set `<ACCOUNT_ID>` to the Cloudflare account ID and `<KNOWN_GOOD_VERSION_ID>` to the inspected version. For the route example:

```sh
printf '{"versionId":"<KNOWN_GOOD_VERSION_ID>","updatedAt":"<CURRENT_UTC_TIMESTAMP>"}\n' > active.json
aws s3api put-object --bucket santa-tracker-snapshots --key santa-route/active.json --body active.json --content-type application/json --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```

Use `advent-calendar/active.json` for Advent. Do not upload a new version file or overwrite a file under `versions/`; those files are historical snapshots. Do not run the example from this checkout.

The emergency flag is separate from both active pointers and is not versioned. Prefer the `/admin` Emergency switches panel to restore its value. If the application cannot reach that panel, inspect `emergency/feature-flags.json` in R2 and restore a known-good JSON document using the same controlled R2 API process. Preserve the other feature's flag value. Do not reset the entire file to defaults during an incident.

## 4. Verify and record recovery

After restoring code or data, purge the relevant edge URL as described in [CACHE_PURGE.md](CACHE_PURGE.md). Check Worker logs, the health endpoint, and the public route or Advent API. During closed season the tracker and Advent pages remain 404 to visitors; during open season they should return 200 unless the matching emergency switch remains enabled. Record the restored Worker version, dataset version IDs, flag state, verification time, and follow-up owner.

## Change-control note

The current deployment workflow can activate checked-in route or Advent data, but it cannot select an arbitrary historical R2 version. This runbook describes the pointer restore operation for an approved operator environment. Never use `tools/santa-publish.mjs --remote`, `pnpm santa:publish:remote`, Wrangler, or R2 write credentials from a local checkout. See [DEPLOY.md](DEPLOY.md).

Cloudflare references: [Workers rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) and [Wrangler rollback command](https://developers.cloudflare.com/workers/wrangler/commands/#rollback).
