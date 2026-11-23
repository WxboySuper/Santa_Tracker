# ADR 0005: Live weather in the 2026 tracker

**Status:** Proposed (owner approval required)
**Date:** 2026-11-23

## Context

The product plan treats live weather as a flagged expansion. Route data already permits a nullable `weather_condition` field, but the repo does not contain a production weather provider integration. Christmas Eve traffic is expected to be bursty, and the tracker must keep working when optional services fail.

## Options

| Approach | Cost, limits, and attribution | Fit for the tracker |
| --- | --- | --- |
| Defer live weather | No API spend, provider dependency, weather-data display obligation, or location-data flow. Existing route facts and statistics remain. | Safest for the 2026 launch. It avoids a feature that is not needed for route correctness and cannot be meaningfully load-tested without a provider contract. |
| Open-Meteo prototype | Its public free endpoint is for non-commercial use, limited to 10,000 calls/day, and has no uptime guarantee. Its pricing page lists paid commercial plans, a 99.9% uptime target for paid plans, and CC BY 4.0 data attribution. | A good flagged prototype for one aggregate forecast per current stop, fetched server-side and cached. It must not be called from every visitor browser. Weather data can be stale or unavailable without affecting the route. |
| Paid weather API | A paid contract can establish a commercial licence, usage limit, support channel, and service target. Price and rights vary by provider and plan, so they need a specific quote and review. | Could support production after a small pilot. Adds a recurring dependency and cost for a detail that is not core to the journey. |
| Self-hosted weather models | Data ingestion and compute are open-source, but hosting, refresh cadence, provenance, and operational load become project responsibilities. | Not justified for a seasonal tracker. |

Reference: [Open-Meteo pricing and licensing](https://open-meteo.com/en/pricing). The current price and terms were checked on 2026-11-23 and may change.

## Decision

Recommend deferring public live weather for Christmas Eve 2026. Keep weather optional in the schema and do not make the tracker wait for it. The current null field is sufficient for the route contract; it does not prove that a provider integration exists.

If the owner wants evidence of visitor value, allow a short, disabled-by-default prototype behind a typed feature flag. Fetch weather only for the current stop through a server route, cache the result, show its source and freshness, and display no weather when the fetch fails. Record provider limits, forecast timestamp, cache age, and request volume during rehearsal. Do not send a visitor's precise location to a provider.

Before enabling it publicly, obtain a production-appropriate licence, recheck attribution and request limits, run a burst test, and name an owner for stale-data and provider incidents. If any of those conditions is missing, leave the flag off.

## Consequences

- Route state and Christmas Eve launch do not depend on an external forecast.
- A prototype can answer the product question without turning the API into a required path.
- The provider, paid plan, and public launch date remain unselected pending owner approval.
