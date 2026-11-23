# Advent archive takedown policy

**Status:** Proposed for runbook adoption
**Date:** 2026-11-23

## Current behavior

The current implementation already supports an exceptional takedown using `is_unlocked_override: false`. The Advent API documentation says this hides payloads from live, preview, and archive reads. `apps/web/src/lib/__tests__/parity.test.ts` verifies that a past day with a false override is not playable in archive mode and its payload is omitted. The archive API tests also cover the hidden feature gate. An override of `true` does not unlock an archive day before its scheduled time.

This differs from the older issue description, which says the false override does not remove content from archives. Before adopting this proposal, treat the current code and tests as the evidence for behavior. No separate archive withdrawal field is needed for the described launch policy.

## Options considered

1. Keep archives schedule-based and immutable, with no takedown mechanism. This protects historical continuity but cannot respond to a safety, privacy, copyright, or material factual problem.
2. Add a separate archive withdrawal field. This is clearer in the data model, but adds another control, migration, admin interface, and public-state contract.
3. Use the existing explicit false override as an emergency visibility lock. This is already implemented and tested, although its name is broader than its archive effect.

## Recommendation

Use option 3 for the 2026 season. Do not add a second control until an owner review shows that the existing override creates operational confusion or cannot distinguish ordinary live locking from archive withdrawal. Clarify the admin label and audit expectations in the runbook before launch. This document is a proposal, not confirmation that the admin UI currently provides an archive-specific label.

## Exceptional takedown procedure

1. The owner or delegated incident lead records the day number, affected content, reason, reporter/source, and time in the incident log.
2. Set that day's `is_unlocked_override` to `false` through the authenticated admin workflow. Do not delete the schedule or payload as the first response; retaining it preserves review and restoration options.
3. Verify as an anonymous visitor that both `/api/advent/day/:day` and `/api/advent/archive/:day` omit the payload. Verify the public page does not render archived content.
4. Record the operator, change time, evidence, and whether the withdrawal is temporary or permanent. If a content correction is appropriate, prepare a replacement, review its sources, then restore the normal schedule behavior by clearing the override after approval.
5. If storage or API behavior does not match the expected lock, hide Advent through the emergency switch in [launch readiness](../LAUNCH_READINESS.md), then follow [the rollback runbook](../ROLLBACK_RUNBOOK.md). Check CDN and Worker caching before declaring the takedown complete.

Only the owner may approve restoration after a safety, privacy, or rights-based withdrawal. The trigger for a takedown is credible risk of harm, personal information exposure, rights complaint, or a material error that would mislead visitors. Routine disagreement over style or an unverified complaint is not by itself a reason to erase an archive entry; hide it while the owner checks the report if the risk is plausible.

## References

- [Advent Calendar API](../ADVENT_CALENDAR_API.md)
- `apps/web/src/lib/__tests__/parity.test.ts`
- `apps/web/src/lib/__tests__/advent-archive-api.test.ts`
- [Rollback runbook](../ROLLBACK_RUNBOOK.md)
