# Shared client logic documentation policy

The shared client layer is organized around small, purpose-specific modules rather than a single service boundary:

- `src/hooks/` coordinates React lifecycle state and user actions.
- `src/lib/` contains reusable validation, persistence, analytics, and domain helpers.
- `src/monitor/` adapts external observations into monitor state and map-ready data.
- `src/utils/` contains pure parsing, normalization, grading, and geometry operations.

These modules use descriptive names, typed parameters, and nearby module-level documentation for the contracts that are not obvious from a signature. Generic comments that only repeat a symbol name do not improve that contract and should not be added solely to satisfy JS-D1001.

The repository therefore skips generic DeepSource documentation coverage categories for these shared helpers. New documentation is expected when a function has behavior, invariants, failure modes, or integration rules that a reader cannot infer from its name and types.

## Contracts worth documenting

- Persistence helpers normalize stored values before returning them so malformed local data cannot leak into Redux state. Their documentation should call out the accepted fallback behavior.
- Monitor adapters translate external timestamps, alert payloads, and map-source metadata into stable display models. Documentation should identify the source format and the normalization boundary.
- Geometry and verification utilities are pure transformations: callers should be able to rely on no mutation of input features, deterministic output ordering, and explicit handling of invalid or empty geometry.
- React hooks own lifecycle cleanup for timers, subscriptions, and in-flight requests. Documentation should state what is started, what is cleaned up, and which state transition the hook coordinates.

When a helper has one of these contracts, add a short description beside the exported symbol or the boundary where the contract is enforced. Do not add a comment merely because a function name appears in an audit report.
