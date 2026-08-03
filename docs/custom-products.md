# Custom layers and reusable products

Custom content uses a snapshot-first contract. A one-off layer contains every category style and polygon needed to render it; it never depends on a hosted template. Loading a premium reusable product into a map copies its current version into an embedded snapshot. Later product edits, archival, deletion, or subscription expiration therefore cannot change an existing map.

## Exposure

The `customProducts` registry key is enabled only for the `local` build target while the feature is implemented and reviewed. Beta, staging, and production must not render custom-product routes, navigation, toolbar controls, unavailable-state messages, or start custom-product side effects. Broader exposure requires separate owner authorization.

## Schema rules

- A reusable product has a stable ID and a monotonically increasing positive version.
- A product or one-off layer contains 1–12 ordered categories.
- Product and category labels are 1–64 trimmed characters.
- Colors use six-digit hex values; opacity is in the inclusive 0–1 interval.
- Supported hatches are none, diagonal, reverse diagonal, and crosshatch.
- Custom geometry is GeoJSON Polygon or MultiPolygon with closed linear rings.
- Embedded snapshots contain no entitlement dependency and remain renderable read-only.
- Archived or premium-expired products are read-only and cannot seed new maps; historical layer snapshots remain usable.

The TypeScript contracts live in `src/types/customProducts.ts`; strict runtime validators and snapshot/version helpers live in `src/lib/customProducts.ts`.

## Local one-off layer workflow

On a local build, the Draw tab starts in the existing Severe mode and exposes a
leftmost Severe/Custom switch. Custom mode replaces the severe controls with
layer and category controls while leaving the severe forecast data untouched.
Each forecast day owns its custom layers independently. Layer/category order,
labels, fill and stroke appearance, hatching, and polygon geometry are included
in normal forecast JSON saves and restored only after strict schema validation.

Custom edits participate in the existing day-scoped undo/redo history. The map,
popup, legend, and image capture use the embedded style values, so a saved file
needs no separate template. Signed-out local users receive the same one-off
layer workflow. Hosted builds take the unchanged Severe-only rendering path.

## Local reusable product workflow

Local premium test accounts can manage reusable products from the gated product
library. A product has a non-reused logical UUID while hosted persistence uses
one of 20 fixed owner-scoped document slots. Create, edit, duplicate, archive,
restore, and delete operations validate the full schema; hosted edits use an
expected version inside a Firestore transaction, and live subscriptions keep
open clients synchronized.

Using a product stages a validated, detached layer snapshot for the forecast
editor. The editor consumes and clears that handoff once, then stores the layer
inside the cycle. Later product edits cannot change the embedded layer. The
Firestore adapter remains unreachable from hosted UI while the
`customProducts` exposure is local-only.

## Hosted authorization boundary

Hosted reusable-product documents use the fixed path
`/users/{userId}/customProducts/{product-01..product-20}`. The logical product
UUID remains inside the document, so deleting and later reusing a slot cannot
reconnect an old forecast to a replacement product.

Hosted create and update requests are fail-closed behind two server-owned
checks: `/userEntitlements/{uid}.premiumActive` and
`/serverFeatureCapabilities/customProducts.enabled` must both be `true`.
Clients cannot write either document and cannot read the rollout capability.
The capability document is intentionally absent in hosted environments until
the owner authorizes rollout. Emulator tests seed it with security rules
disabled to exercise the future hosted boundary without exposing it on beta.

Owners retain read and delete access after premium expires or the rollout is
disabled. Editing, duplication, archive/restore, and loading a product into a
new forecast remain blocked. Deletion removes only the library document and a
matching unconsumed session handoff; snapshots already embedded in forecast
cycles/packages are immutable and are never cascaded or entitlement-checked
during rendering.

Rules enforce the 20-slot account limit, exact document/category/style fields,
category count/order/identity, immutable ownership and creation identity,
one-step version increments, monotonic update timestamps, and status-only
archive/restore transitions. Firestore rules cannot stop a user from manually
copying data they are already authorized to read, so new-forecast use is also
enforced at both official-client staging and consumption boundaries.

## Workflow, package, and cloud integration

Custom collections belong to the same forecast-day grouping as their geometry.
Workflow- and cycle-scoped packages retain each included grouping's complete
layer, category appearance, embedded product snapshot, and polygon geometry.
The Home workflow uploader accepts both the JSON manifest and the ZIP produced
by GFC; ZIP imports prefer `workflow_package.json` and fall back to
`forecast_cycle.json` for older packages. Cloud cycles store the same forecast
payload, so custom content uses the existing payload hash and round-trips
without a separate hosted template lookup.

Copying a previous grouping replaces the target grouping's custom collection
with a detached deep clone. Internal layer/category IDs stay stable so feature
references and product lineage remain valid, but later edits cannot mutate the
source. Starting a new cycle from a previous grouping uses the same rule.
Creating a same-cycle update snapshots all custom geometry and appearance into
the previous version while the active collection remains editable. These
lifecycle clones preserve custom content already present in a loaded cycle even
on hosted builds where the custom editor and its controls remain hidden.

Custom layers do not satisfy severe-outlook completion requirements and are
explicitly excluded from existing severe `forecastDays`, `totalOutlooks`, and
`totalFeatures` analytics. They are also never inputs to Auto-Categorical,
which continues to read only tornado, wind, hail, and total-severe maps. The
local workflow banner discloses these exclusions whenever its active grouping
contains custom content. No disclosure or custom UI is rendered by beta,
staging, or production while `customProducts` remains local-only.

