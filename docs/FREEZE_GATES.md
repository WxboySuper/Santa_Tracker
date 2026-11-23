# 2026 launch freeze gates

Takeoff is scheduled for **2026-12-24 10:00 UTC**. These proposed dates leave time for review and rehearsal. The owner may move them earlier; moving a gate later requires recording the reason and remaining evidence in the launch log.

| Gate | Freeze date, UTC | Required evidence | Approver |
| --- | --- | --- | --- |
| Route freeze | Nov 25, 18:00 | Generated report and final route snapshot; regional pacing and confidence report; source review for every stop; geometry and local-time validation; replay simulation; replacement snapshot and rollback rehearsal. | Product/route owner |
| Content freeze | Dec 1, 18:00 | Advent day-by-day inventory; source and rights review; copy and accessibility review; links and media checked; all 24 days have a complete fallback or approved activity; archive/takedown procedure confirmed. | Editorial owner |
| Feature freeze | Dec 3, 18:00 | Launch-blocker and core scope complete; critical flows work in supported browsers; feature flags and emergency switches recorded; no open critical accessibility or security issue; rehearsal evidence attached. | Product owner |
| Code freeze | Dec 10, 18:00 | Release candidate SHA; required checks green; dependency and security review complete; smoke, browser, mobile, load, and rollback evidence; deploy and rollback instructions current. | Engineering owner and release owner |
| Launch readiness | Dec 23, 18:00 | Production health checks and alerts verified; route and Advent pointers verified; emergency switches tested; owner and backup operator available; final no-map and service-failure checks complete. | Release owner |
| Takeoff | Dec 24, 10:00 | `/api/health`, route API, tracker shell, current location, ETA, map and no-map mode observed. Confirm launch log has no unresolved blocker. | Release owner |

The dates align with the existing Nov 25 route checkpoint and Dec 23 rehearsal in [launch readiness](LAUNCH_READINESS.md). They are proposed operational gates, not existing repository automation.

## Change classes

- **Launch blocker:** prevents takeoff, hides or corrupts route state, exposes locked content, compromises visitor safety/privacy, or blocks emergency operation. Fix or roll back before launch.
- **Core:** required for the agreed 2026 experience, including route, Advent access, and accessible tracker essentials. Complete before the relevant freeze or remove from the release with owner approval and a visible fallback.
- **Enhancement:** useful quality improvement that can wait without breaking an acceptance criterion. Defer after feature freeze.
- **Stretch:** optional experiment or polish. Keep disabled after feature freeze unless the release owner accepts specific evidence and risk.

## Exceptions and post-freeze approval

After a gate, a change request must state the user impact, reason, affected code/content/data, evidence, rollback plan, and whether it changes route or published snapshot state. The owner for that gate and release owner must approve it in the PR or launch log. A security or privacy incident may use the emergency procedure immediately; record the action and notify the owner as soon as practical. No one may use a freeze exception to bypass required CI checks or source review.

After code freeze, allow only blocker fixes, security/privacy fixes, or a change needed to restore a failed launch function. Each needs a fresh release candidate, successful required checks, focused smoke test, and an explicit owner-approved rollback point. Keep enhancements and stretch work out of the release.

## Rollback conditions

Roll back the deployment or activate a previously validated snapshot if any of these occur:

- The tracker serves invalid route data, inconsistent position/ETA, or a route that fails hard validation.
- A deploy causes persistent tracker, Advent, admin, or health-check failure.
- A privacy/security issue exposes credentials, personal data, or locked Advent payloads.
- Map delivery fails and the no-map state also fails to present current location, next stop, ETA, progress, or facts.
- The operator cannot verify a safe state within the incident response window.

Follow [rollback](ROLLBACK_RUNBOOK.md), [cache purge](CACHE_PURGE.md), and [uptime](UPTIME.md) procedures. Preserve incident evidence and note whether the recovery changed the active data pointer.
