# Feature boundaries

`src/features` provides wrappers for exposure-gated and server-backed features.
These boundaries decide whether a surface may render; they do not replace the
feature implementation.

Keep product logic below the boundary and access policy above it. Server-backed
features need both client exposure policy and server capability validation.
Update the corresponding disabled-side-effect and target-matrix tests.
