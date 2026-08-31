# Forecast workspace boundaries

Issue: [#914](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/914)

This document defines the route, ownership, and persistence contract for the
v1.8 Forecast area. It is a boundary decision for the follow-up issues, not a
promise that every workspace already has a page.

## Route contract

The canonical Forecast routes are:

| Workspace | Canonical path | v1.8 state | Exposure owner |
| --- | --- | --- | --- |
| Severe | `/forecast/severe` | available now | core Forecast |
| Mesoscale | `/forecast/mesoscale` | gated until #919 enables it | `mesoscaleWorkspace` |
| Tropical | `/forecast/tropical` | future, disabled | `tropicalWorkspace` |
| Winter | `/forecast/winter` | future, disabled | `winterWorkspace` |
| Custom | `/forecast/custom` | registered by #915 | `customProducts` |

`/forecast` is a compatibility entry point. It redirects to
`/forecast/severe` while preserving the query string and hash. The workspace id comes from the URL, not from a global
"current workspace" value in Redux. That makes refresh, browser history, and
shared links deterministic.

The route contract lives in
`src/routing/forecastWorkspaceRoutes.ts`. A route definition can be present
before its page is registered. This lets exposure tests describe future paths
without importing or initializing unfinished workspace code.

Future routes stay unregistered when their feature is off. A direct request
falls through the normal application fallback instead of mounting a disabled
page or running workspace code. When a workspace is enabled, its route must be
registered only through the same feature exposure decision.

## Compatibility paths

Existing links remain useful during the migration:

- `/forecast` redirects to `/forecast/severe`.
- `/discussion` remains available until #916 supplies the Severe workspace
  discussion surface. That issue owns the redirect or in-workspace handoff.
- `/custom-products` remains available until #915 supplies the Custom route.
  That issue owns the compatibility redirect and product handoff.
- Existing top-level `/monitor` and `/verification` routes do not move.

The compatibility paths are temporary routing concerns. They do not create a
second copy of forecast or discussion state.

## State ownership

The Forecast shell owns state that applies to the active route and the shared
forecast cycle:

- active URL workspace and shell navigation state;
- cycle identity, cycle date, active day, completion status, and save status;
- shared map view only when the workspace uses the common forecast map;
- local/session restore coordination;
- cloud cycle selection and transfer status;
- compatibility metadata such as legacy `cycleMetadata`.

Each workspace owns its domain data and controls:

- Severe owns severe outlook geometry, outlook editing, and its discussion
  content. Existing `ForecastState` and `ForecastCycle` remain the source of
  truth during #914.
- Mesoscale owns provider parameter selection, model context, short-term
  forecast geometry, and its discussion composition. It must not write into
  Severe outlook maps.
- Custom owns custom layer/category/product editing. Existing custom layers
  embedded in forecast days remain readable while #915 moves the UI.
- Tropical and Winter have no production state contract yet. Their exposure
  entries stay disabled.

The URL is the only persistent active-workspace selector. Temporary controls,
map interaction state, and open panels stay local to the workspace or shell.
They must not be added to the forecast save format unless a later issue gives
them a user-facing restore requirement.

## Save, load, export, and restore

Existing Severe data keeps using `GFCForecastSaveData`. A legacy payload with
no workspace metadata means `severe`. Existing `ForecastCycle.days`, embedded
discussion data, discussion groupings, custom layers, and workflow-v2
`cycleMetadata` must load without migration that changes their meaning.

New workspace payloads should use an optional envelope field such as
`workspaceId` around the existing forecast payload. The field is additive and
must not replace `forecastCycle` or change the legacy `version` meaning. The
envelope rules are:

- a missing workspace id reads as `severe`;
- an unknown workspace id is malformed and must not be silently treated as a
  different workspace;
- a known but disabled workspace is not opened from an import; the user gets a
  clear unavailable-workspace result;
- a workspace export contains only data owned by that workspace plus shared
  cycle metadata required to identify the cycle;
- a full-cycle export can retain the current legacy forecast payload so old
  readers keep working;
- restore selects the route from validated metadata, then hydrates only the
  selected workspace's state.

Cloud cycle records follow the same additive rule. `workspaceId` may be added
to metadata for filtering and display, while the existing payload remains the
source of truth until a later persistence issue defines a split storage model.
Monitor and Verification read saved results. They never mutate workspace-owned
editing state.

Discussion drafts remain scoped by their existing scope id. Moving Discussion
inside Severe must not key drafts only by route, because route changes and
shared day groupings would make drafts collide or disappear.

## Exposure and side effects

The exposure registry owns whether Mesoscale, Tropical, Winter, and Custom
workspace pages may be registered. The registry currently leaves Mesoscale and
Winter off on every target. Tropical remains governed by its existing disabled
entry. Custom keeps its current product exposure and entitlement behavior.

No future workspace page, provider client, map layer, or repository may be
imported at module scope from the always-on application shell. Route loaders and
feature boundaries must be the initialization boundary for unfinished or
server-backed work.

## Follow-up ownership

- #915 registers `/forecast/custom`, moves Custom UI, and owns custom-product
  compatibility behavior.
- #916 embeds Discussion in Severe and owns `/discussion` handoff behavior.
- #917 adds the Forecast workspace switcher and removes Discussion as a peer
  navigation item after the handoff exists.
- #918 defines the provider data contract without adding workspace state to
  Severe.
- #919 registers and enables Mesoscale in stages, then defines its payload
  details against this boundary.
- #921 consumes Mesoscale data in Monitor as read-only display state.
