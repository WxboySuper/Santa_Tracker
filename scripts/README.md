# Repository scripts

Root scripts are command-line entry points for validation, generation, release,
branch, changelog, and feature-exposure workflows. Reusable logic belongs in
`scripts/lib` so entry points remain small and testable.

Run scripts through the package-manager command documented in `package.json`.
Scripts that write local artifacts should write only to ignored paths and make
their output reproducible.
