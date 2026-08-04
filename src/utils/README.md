# Utilities

Utilities contain pure transformations and focused browser helpers for
serialization, persistence, geometry, exports, metrics, and compatibility
handling. Prefer deterministic functions with explicit inputs and outputs.

Do not add React rendering or hidden global state here. Feature-specific
helpers should remain discoverable and may later move behind a feature API.
Keep tests beside the utility and include real serialized fixtures when data
shape matters.
