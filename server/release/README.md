# Release helpers

`server/release` contains VPS rollout and promotion helpers used by release
automation. It is operational code, not application request handling.

Preserve target validation, rollback-safe sequencing, and explicit production
versus staging behavior. Update operational documentation and tests when a
release contract changes.
