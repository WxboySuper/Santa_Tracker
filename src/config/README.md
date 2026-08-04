# Configuration and exposure

This boundary owns build targets, feature exposure, navigation, product
surfaces, Firebase/Sentry configuration, and runtime capability status.

Exposure policy is fail-closed for hosted capabilities. Keep access decisions
centralized here and in `src/features`; do not duplicate entitlement or target
checks inside unrelated UI. Update policy fixtures and exposure tests with
every registry change.
