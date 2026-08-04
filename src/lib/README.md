# Client services and domain helpers

`src/lib` contains reusable client services and domain helpers that do not
belong to a single route or UI component. It includes Firebase, cloud-cycle,
custom-product, analytics, and workflow helpers.

Keep React rendering and route registration out of this boundary. Preserve
local/offline behavior where provided and update colocated tests for contract
or persistence changes.
