# Built-in specialty styles

Status: approved for HOT-01/HOT-02

Built-in specialty styles are a small, immutable registry of visual starting
points for custom layers. They are not a second product system and they do not
carry forecast, severe-weather, or verification semantics.

## Decision

- A preset has a stable code, display label, registry version, and ordered
  `CustomCategoryTemplate` values.
- Selecting a preset creates a detached `OneOffCustomLayer` using the existing
  custom-layer schema. The layer owns a deep copy of every category style; it
  does not retain a live reference to the registry.
- The existing package, cloud-cycle, image-export, legend, and import paths
  remain the source of truth for serialized style snapshots. An imported layer
  renders from its embedded categories and never needs the registry, an
  account, or a premium entitlement.
- Presets are free to use. A user may use one as the starting point for a
  one-off layer or as the category starting point for a reusable product. The
  reusable-product storage entitlement is unchanged: hosted reusable products
  still require the existing premium and rollout checks.
- Presets are immutable in the client. Users can edit the detached layer or
  product copy, but those edits never change the registry or another layer.

## Access and lifecycle matrix

| Surface/state | Preset selection | Existing embedded snapshot | New hosted reusable product |
| --- | --- | --- | --- |
| Free account | Allowed | Renders | Existing premium/rollout rules |
| Active premium | Allowed | Renders | Allowed when the current rollout is enabled |
| Expired premium | Allowed | Renders read-only | Blocked by existing product rules |
| Imported package | Not required | Renders from embedded categories | Not required |
| Self-hosted/local build | Allowed | Renders | Uses the configured repository boundary |

An expired or archived reusable product cannot seed a new layer through the
reusable-product flow. That rule does not affect an already embedded snapshot,
and it does not disable the free built-in preset registry.

## Approved HOT-02 scope

HOT-02 may add only the first reviewed presets:

- Rainfall: an ordered accumulation-style category set.
- Tropical AOI: an ordered tropical area-of-interest category set.

The labels and colors are presentation defaults, not hazard thresholds. A
preset must not alter forecast completion, verification grading, Auto-TSTM,
outlook type, or severe-outlook analytics.

Adding a future preset requires a new registry test covering detached-copy
isolation, rendering, legend output, and package round-tripping before the
preset can be exposed. The preset also needs an approved label, category
order, and changelog entry; an implementation-only registry addition is not a
complete product change.

## Compatibility and follow-up

The implementation must reuse the current `CustomCategoryTemplate`,
`OneOffCustomLayer`, and `CustomLayerCollection` contracts. No preset ID may be
required to validate or render an exported package. If a future release needs
to rename or replace a preset, it adds a new registry version/code and leaves
existing detached snapshots untouched.

HOT-02 owns registry and selection tests. The existing custom-layer
serialization and rendering tests remain the compatibility gate. A later
follow-up may add an explicit provenance field if product analytics needs to
distinguish a preset-origin layer from a manually authored layer; that field is
not required for rendering or entitlement decisions.
