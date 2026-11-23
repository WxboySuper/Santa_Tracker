# Western Hemisphere route confidence thresholds

**Status:** Proposed (owner approval required)
**Date:** 2026-11-23

This proposal responds to issue #245. The current generator report warns when fewer than four stops appear in each of its final eight elapsed-hour buckets. Runs of 120, 160, and 200 stops all had a zero-stop bucket in that span. The data source documentation also warns that verified candidates are sparse in UTC-11 and UTC-12. A hard four-stop requirement in every hour would therefore reject every tested draft without identifying the cause.

## Proposed thresholds

Apply these to the final approved route after owner curation, not to raw candidate generation alone.

| Check | Proposed threshold | Purpose |
| --- | --- | --- |
| North America through the Caribbean | At least 2 verified stops per elapsed route hour over the 8-hour Western sweep window | Avoid empty broadcast segments in the main Americas viewing window. |
| Alaska and Hawaii | At least 1 verified stop in each area during the sweep | Require explicit representation, rather than assuming an offset bucket implies a stop there. |
| Final Pacific legs | At least 1 verified stop in UTC-10 or westward after Hawaii, where the source set provides a verified candidate | Make the end of the sweep visible while avoiding fictional coverage. |
| Any elapsed-hour bucket in the Western window | At least 1 stop. Any zero-stop bucket fails validation. | Catch complete dead zones. |
| Gap within the Western window | No gap longer than 90 minutes between scheduled stop arrivals, except the final UTC-11/UTC-12 tail, which may have one documented gap up to 150 minutes | Limit long quiet stretches while preserving a narrow explicit exception for sparse final zones. |
| Consecutive-leg speed | No leg above the configured 25,000 km/h ceiling; flag any leg above 15,000 km/h for editorial review | Preserve the current geometry guardrail and make implausibly fast legs visible. |
| Local arrival | Every stop must remain within the configured local arrival window; report offsets that depend on approximate timezone lookup for manual review | Avoid schedule violations and call out known timezone uncertainty. |

These numbers are proposals for review. The current generator cannot yet classify stops as Alaska, Hawaii, or the final Pacific segment with dedicated semantics; country and timezone fields alone are insufficient for all edge cases.

## Validator behavior

Add a separate Western confidence report to the route generator. For each stop, retain the candidate ID, timezone, country, coordinates, source URL, and editorial area tag. The validator should:

1. Derive elapsed-hour bins from scheduled arrivals, using the approved route start as hour zero.
2. Count arrivals and calculate maximum arrival-to-arrival gaps in the Western window.
3. Check explicit `alaska`, `hawaii`, and `final-pacific` tags against verified candidate IDs.
4. Treat zero-count buckets, missing required area tags, out-of-window local arrivals, and speeds over the hard ceiling as errors.
5. Treat sub-threshold two-stop hours, long but allowed tail gaps, speeds above 15,000 km/h, and timezone approximation as warnings requiring an owner-visible report.
6. Require an issue-linked waiver for a warning exception. A waiver must name the affected hour or leg, reason, reviewer, and expiry. It cannot waive invalid coordinates, fabricated sources, schema errors, or the hard speed ceiling.

Do not automatically insert locations to meet a threshold. Candidate refresh and editorial approval remain separate from validation. See [route generator docs](../ROUTE_GENERATOR.md) and [ADR 0006](../adr/0006-route-pacing-model.md).
