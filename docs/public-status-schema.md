# Public Capability and Status Schema

Every unauthenticated capability/status endpoint must expose only a stable,
intentionally supported set of fields. This page documents the public schemas,
what is safe for monitoring, and what requires authentication or stays
server-side.

## Endpoints

- `GET /api/capabilities/status` — public capability availability.
- `GET /api/billing/config` — public billing configuration.

## Public capability status schema

```json
{
  "capabilities": {
    "<CAPABILITY_KEY>": {
      "available": true,
      "reason": "available"
    }
  }
}
```

Each entry exposes exactly two fields:

| Field | Type | Monitoring-safe | Notes |
|-------|------|-----------------|-------|
| `available` | boolean | Yes | Whether the capability is currently usable on this deployment. |
| `reason` | string | Yes | One of `available`, `registry_disabled`, `deployment_disabled`, `emergency_disabled`, `unknown`. |

Only capabilities exposed on the current build target appear. Unknown keys are
omitted (they never appear with `reason: unknown` in the public response).

### Guarantees

- The public envelope is exactly `{ capabilities: { ... } }`.
- Every entry is exactly `{ available, reason }`.
- No implementation detail is serialized: no feature key, exposure matrix,
  deployment path, provider name, cache state, exception text, or stack.

## Public billing config schema

```json
{
  "billingEnabled": true,
  "checkoutEnabled": true,
  "annualPromoActive": false,
  "monthlyDisplayPrice": "$3/month",
  "annualDisplayPrice": "$30/year"
}
```

Stripe price IDs, the base URL, and Firebase admin availability are never
serialized.

## Diagnostics that stay authenticated or server-side

The following are NOT exposed on any unauthenticated status route:

- The full `SERVER_FEATURE_EXPOSURE_REGISTRY` and per-target exposure matrix.
- Environment variable names and raw deployment switches.
- Emergency-disable override lists.
- Stripe price IDs, provider credentials, or Firebase admin config.
- Exception messages, stack traces, or cache internals.

These remain available to operators via the admin metrics route
(`/api/admin/metrics`, authenticated) or the server logs.

## Schema snapshots

The route tests (`server/server-stack.test.js`) and unit tests
(`server/lib/capabilityStatus.test.js`) assert the exact public shape and will
fail if a field is added or removed unintentionally.
