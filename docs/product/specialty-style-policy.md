# Built-in specialty products

Status: approved for HOT-01/HOT-02

Built-in specialty products are a small, immutable catalog of ready-to-use
custom products. They use the existing custom-layer schema and do not carry
forecast, severe-weather, or verification semantics.

## Decision

- Rainfall and Tropical AOI ship as stable, immutable built-in custom products
  with a stable code, display label, registry version, and ordered
  `CustomCategoryTemplate` values.
- Built-in products are available by default to signed-out users, free users,
  active premium users, expired-premium users, and self-hosted builds. They
  can be used directly from the custom-product catalog and saved-products
  panel without creating a user-owned product.
- Using a built-in product creates a detached `OneOffCustomLayer` using the
  existing custom-layer schema. The layer owns a deep copy of every category
  style; it does not retain a live reference to the registry.
- The existing package, cloud-cycle, image-export, legend, and import paths
  remain the source of truth for serialized style snapshots. An imported layer
  renders from its embedded categories and never needs the registry, an
  account, or a premium entitlement.
- Built-in products are free and do not count against the personal hosted
  product limit. They cannot be edited, duplicated, archived, or deleted by a
  user. Personal hosted reusable products remain subject to the existing
  premium entitlement, rollout checks, and personal product limit.
- Built-in products are immutable in the client. Edits to a detached forecast
  layer never change the registry or another layer.

## Access and lifecycle matrix

| Surface/state | Built-in product use | Existing embedded snapshot | New personal hosted reusable product |
| --- | --- | --- | --- |
| Signed out/free account | Allowed by default | Renders | Existing premium/rollout rules |
| Active premium | Allowed by default; excluded from personal limit | Renders | Allowed when the current rollout is enabled |
| Expired premium | Allowed by default; excluded from personal limit | Renders read-only | Blocked by existing product rules |
| Imported package | Not required | Renders from embedded categories | Not required |
| Self-hosted/local build | Allowed by default | Renders | Uses the configured repository boundary |

An expired or archived personal reusable product cannot seed a new layer
through the personal reusable-product flow. That rule does not affect an
already embedded snapshot, and it does not disable the built-in catalog.

## Approved HOT-02 scope

HOT-02 may add only the first reviewed built-in products:

- Rainfall: a WPC-style Excessive Rainfall Outlook custom product with Marginal
  (≥5%), Slight (≥15%), Moderate (≥40%), and High (≥70%) risk categories.
- Tropical AOI: an ordered tropical area-of-interest custom product.

Rainfall's category labels and colors follow the WPC Excessive Rainfall Outlook
convention. A built-in product must not alter forecast completion, verification
grading, Auto-TSTM, outlook type, or severe-outlook analytics.

Adding a future built-in product requires a new registry test covering
detached-copy isolation, catalog access, rendering, legend output, and package
round-tripping before the product can be exposed. It also needs an approved
label, category order, entitlement decision, and changelog entry; an
implementation-only registry addition is not a complete product change.

## Compatibility and follow-up

The implementation must reuse the current `CustomCategoryTemplate`,
`HostedCustomProduct`, `OneOffCustomLayer`, and `CustomLayerCollection`
contracts. No built-in product ID may be required to validate or render an
exported package. If a future release needs to rename or replace a built-in
product, it adds a new registry version/code and leaves existing detached
snapshots untouched.

HOT-02 owns registry, catalog-access, and selection tests. The existing
custom-layer serialization and rendering tests remain the compatibility gate.
A later follow-up may add an explicit provenance field if product analytics
needs to distinguish a built-in-origin layer from a manually authored layer;
that field is not required for rendering or entitlement decisions.
