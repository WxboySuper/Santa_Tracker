# Timed production rollout — legacy implementation plan

> Superseded by [GFC delivery architecture](release-workflow.md). This file
> remains as historical context for the optional timed rollout implementation;
> it is not the branch or release procedure.

**Status:** Planned (not implemented)  
**Historical goal:** After a reviewed promotion, production kept serving the **current live version** until `rolloutAt`, then atomically promoted a **staged** build.

**Out of scope (v1):** Gradual % rollout, extra deploy Discord bots, delaying the git merge until `rolloutAt`.

---

## 1. Single source of truth

Add **`deploy/production-release.json`** on `main` (committed in the promotion PR, same as changelog).

```json
{
  "releaseId": "v1.6.0",
  "version": "1.6.0",
  "rolloutAt": "2026-06-06T23:00:00.000Z",
  "action": "stage",
  "banner": {
    "phases": [
      {
        "id": "v1.6-pre",
        "message": "v1.6 goes live Friday at 6:00 PM Eastern. Brief downtime possible during the update.",
        "type": "warning",
        "dismissible": true,
        "expiresAt": "2026-06-06T23:00:00.000Z"
      },
      {
        "id": "v1.6-live",
        "message": "v1.6 is live — meet the new Monitor workspace.",
        "type": "info",
        "dismissible": true,
        "startsAt": "2026-06-06T23:00:00.000Z",
        "expiresAt": "2026-06-13T23:00:00.000Z",
        "linkUrl": "/updates",
        "linkLabel": "What's new"
      }
    ]
  }
}
```

| Field | Purpose |
|-------|---------|
| `releaseId` | Stable id for this release attempt (e.g. `v1.6.0`). Bumped when you **reschedule** or **re-stage** after a failed promote. |
| `version` | Must match stable `package.json` on `main` after post-merge strip. |
| `rolloutAt` | ISO instant when VPS cron may promote staged → live. |
| `action` | What this deploy run may do (see §3). |
| `banner` | Written to `public/alert-banner.json` on **live** during stage/promote (see §5). |

**VPS copy:** workflow rsyncs the same file to `/opt/gfc-analytics/config/production-release.json` for the promote cron.

---

## 2. VPS layout (one-time + per release)

```text
/var/www/gfc/
  releases/<version>/     # static build artifacts
  current -> releases/…   # nginx docroot

/opt/gfc-analytics/
  releases/<version>/     # server code for that release
  current -> releases/…
  config/production-release.json
  scripts/promote-release.sh
  scripts/check-rollout.mjs

/etc/cron.d/gfc-rollout   # * * * * * root node …/check-rollout.mjs
```

**Nginx:** point docroot at `/var/www/gfc/current` (adjust if today uses `/var/www/gfc/` directly).

**Promote script** (runs at `rolloutAt` or manual): symlink `current` → staged version, `npm install` in analytics release, `pm2 restart gfc-analytics`, sync banner to live web root, set VPS config `status: "live"`.

---

## 3. Deploy `action` values

| `action` | When set | Workflow behavior |
|----------|----------|-------------------|
| `stage` | Promotion PR (`beta` → `main`) | Build in GHA; rsync to `releases/<version>/` only; **do not** change `current`; deploy **live** `public/alert-banner.json` from pre-rollout phase only (warning). |
| `promote` | Cron / manual after `rolloutAt` | Local on VPS via script (not GHA), or `workflow_dispatch` emergency. |
| `live` | Hotfix / emergency | Legacy behavior: rsync straight to `current` (no timed rollout). |
| `none` | Maintenance | Skip deploy job (document only). |

Default for **`beta` → `main`:** `action: "stage"`.

---

## 4. Validation — reject outdated or invalid deploys

Add **`scripts/validate-production-release.mjs`** and run it at the start of **Deploy Production to VPS** (and in CI on PRs that touch `deploy/production-release.json`).

### Hard failures (exit 1)

| Check | Reason |
|-------|--------|
| File missing on `main` deploy | Every promotion must declare intent. |
| `version` ≠ stable `package.json` | Prevents shipping wrong tree. |
| `releaseId` empty / malformed | Traceability. |
| `action: stage` and `rolloutAt` ≤ now + 5 min skew | Cannot stage a release that is already due (clock skew buffer). |
| `action: stage` and `rolloutAt` > now + 90 days | Absurd schedule guard. |
| `action: live` on a commit that only has `stage` without promote | Optional: block accidental full deploy during timed release window (config flag). |
| Staged version already exists on VPS and `releaseId` unchanged | Re-run must bump `releaseId` or use `workflow_dispatch` with `force: true`. |
| `banner.phases` invalid (overlaps, bad ISO, empty message) | Same rules as `alertBannerConfig` tests. |

### Warnings (log, do not fail)

- `rolloutAt` on weekend if you add team preference later.
- Banner post-live phase missing `linkUrl` for major versions.

### CI on promotion PR

- `pr-governance` or dedicated job: validate `deploy/production-release.json` when base is `main` and head is `beta`.
- Require file present in **beta → main** PR diff (like changelog).

---

## 5. Alert banner integration

**Problem:** Banner today is `public/alert-banner.json`; timed rollout needs phases tied to `rolloutAt`.

**Approach:**

1. **Author** banner in `deploy/production-release.json` → `banner.phases[]`.
2. **Stage deploy (GHA):**
   - Resolve **active phase for “live site”** at deploy time: only the pre-rollout phase (warning), because users still run old static bundle until promote.
   - Write derived `public/alert-banner.json` to **live** web root (`/var/www/gfc/current/...`) via rsync of generated file in CI **or** scp single file.
3. **Promote (VPS script):**
   - Regenerate `alert-banner.json` from `banner.phases` (active phase at `now`).
   - Rsync into **new** `current` release dir so 1.6 static assets and banner match.

**App change (beta PR):** extend `alertBannerConfig` to support `phases[]` (backward compatible with flat config). Tests in `alertBannerConfig.test.ts` + `AlertBanner.test.tsx`.

**Manual override:** hotfix `public/alert-banner.json` on `main` with `action: live` still allowed for emergencies; validator warns if it diverges from `production-release.json`.

---

## 6. GitHub Actions changes

### `deploy-main-to-vps.yml`

1. Checkout.
2. **`node scripts/validate-production-release.mjs`** — fail job if invalid.
3. Read `action` + `version` from config.
4. **`action: stage`:** build; rsync `build/` → `releases/$VERSION/`; rsync `server/` → analytics `releases/$VERSION/`; rsync `deploy/production-release.json` → VPS config; emit derived `alert-banner.json` to live `current` only; **do not** update `current` symlink.
5. **`action: live`:** today’s behavior (rsync to `current`, restart PM2).
6. **`workflow_dispatch` inputs:** `action` override, `forceRestage`, `skipBanner`.

### `beta_to_main.md` template

Add checklist (§7).

### Optional: `deploy-main-stage-only.yml`

Only if splitting workflows helps readability; otherwise one workflow with branching is fine.

---

## 7. Release checklists

### Promotion PR (`beta` → `main`) — author must complete

- [ ] `CHANGELOG.md` section for this version.
- [ ] **`deploy/production-release.json`** added/updated:
  - [ ] `version` matches expected stable after merge.
  - [ ] `releaseId` unique for this attempt (bump if re-staging).
  - [ ] `rolloutAt` set (UTC) — end of week or specific instant.
  - [ ] `action` is `"stage"`.
  - [ ] `banner.phases`: pre-rollout message mentions user-visible time; post-rollout phase has `startsAt` = `rolloutAt`, CTA to `/updates`, `expiresAt` set.
- [ ] Beta smoke done.
- [ ] Staging URL smoke planned (§8) after merge.

### After merge (automatic)

- [ ] Post-merge: stable version on `main`, GitHub Release.
- [ ] Deploy workflow: **stage only** — confirm job green.
- [ ] SSH or staging URL: staged `1.6.0` build present under `releases/1.6.0`.
- [ ] Live site still previous version (check footer/build hash or `/updates` only on staging).
- [ ] Live banner shows **warning** phase only.

### At / after `rolloutAt`

- [ ] Cron promote ran (check VPS log / `production-release.json` `status`).
- [ ] Production shows new version; Monitor available.
- [ ] Banner shows **live** phase + link works.
- [ ] Sentry release tag matches.
- [ ] X / Discord posts (manual).

### If promote fails

- [ ] Live still on previous symlink; investigate log.
- [ ] Fix forward: bump `releaseId`, restage, or manual `promote-release.sh`.
- [ ] Rollback: repoint `current` to previous `releases/*` dir.

---

## 8. Staging verification URL (recommended)

- **Option A:** `staging.gfc.weatherboysuper.com` → nginx `root` `releases/<staged>/` (read `production-release.json` for version).
- **Option B:** SSH + `curl` only for v1.6.

Document DNS + nginx in `docs/operations/hosted-rollout.md` (short ops appendix).

---

## 9. VPS cron + scripts

| Artifact | Responsibility |
|----------|----------------|
| `server/scripts/check-rollout.mjs` | Read config; if `scheduled` and `now >= rolloutAt`, exec promote. |
| `server/scripts/promote-release.sh` | Symlink swap, pm2, banner sync, atomicity. |
| `server/scripts/lib/release-config.mjs` | Shared parse/validate with CI script (import from repo root `scripts/` duplicate or shared `scripts/lib/production-release.mjs`). |
| `/etc/cron.d/gfc-rollout` | Every minute; installed by `scripts/setup-vps.sh` update. |

**Idempotency:** if already `status: live` for this `releaseId`, cron no-ops.

**Admin API (optional same day):** `GET/POST /api/admin/rollout` behind existing admin auth — read/write config, `POST …/promote-now` for testing.

---

## 10. Implementation order (later today)

Estimated **one focused day** if VPS/nginx access is available.

| Order | Task | Branch target | ~time |
|-------|------|---------------|-------|
| 1 | `scripts/lib/production-release.mjs` + `validate-production-release.mjs` + unit tests | `feature/timed-production-rollout` → **beta** | 1.5h |
| 2 | `alertBannerConfig` **phases[]** + hook/tests | same PR | 1h |
| 3 | Example `deploy/production-release.json` (disabled/`action:none` on beta) + `docs/operations/alert-banner.md` update | same PR | 30m |
| 4 | `deploy-main-to-vps.yml` stage path + validator gate | `feature/release-timed-deploy` → **main** or `feature/release-*` | 1.5h |
| 5 | VPS scripts + `setup-vps.sh` + `docs/operations/hosted-rollout.md` | same as 4 or ops PR | 1h |
| 6 | Nginx `current` symlink (manual VPS) | ops | 30m |
| 7 | PR template + `beta_to_main.md` checklist | beta | 15m |
| 8 | Promote cron dry-run on beta VPS optional | ops | 30m |

**v1.6 release usage:** merge infra to `main` first if needed, then promotion PR includes real `production-release.json` with end-of-week `rolloutAt`.

**Do not** run timed stage for v1.6 until steps 1–6 are on production VPS.

---

## 11. Future extensions (schema only)

```json
{
  "strategy": "instant",
  "gradual": null
}
```

Later: `allowlistUids`, client `release-control.json`, or second nginx upstream — without changing stage/promote core.

---

## 12. Files to add/change (summary)

| Path | Change |
|------|--------|
| `deploy/production-release.json` | New (per release; example on beta) |
| `scripts/lib/production-release.mjs` | Parse, validate, derive banner |
| `scripts/validate-production-release.mjs` | CI + deploy gate |
| `scripts/lib/production-release.test.mjs` | Tests |
| `src/components/alertBannerConfig.ts` | `phases[]` |
| `src/components/useAlertBanner.ts` | Resolve active phase |
| `.github/workflows/deploy-main-to-vps.yml` | Stage vs live |
| `server/scripts/check-rollout.mjs` | Cron entry |
| `server/scripts/promote-release.sh` | Promote |
| `scripts/setup-vps.sh` | Cron + dirs |
| `docs/operations/hosted-rollout.md` | Ops runbook |
| `docs/operations/alert-banner.md` | Phases + link to this doc |
| `.github/PULL_REQUEST_TEMPLATE/beta_to_main.md` | Checklist §7 |

---

## 13. Open decisions (confirm before coding)

1. **Staging subdomain** for v1.6 — yes/no.
2. **Failed promote** — auto-rollback symlink vs alert-only.
3. **Hotfix path** — always `action: live` skips staging (recommended yes).
4. **Re-stage same version** — require new `releaseId` (recommended yes).

---

*When implementation starts, branch from `beta` for app/validator/banner; use `feature/release-*` → `main` for workflow + VPS scripts per repo routing rules.*
