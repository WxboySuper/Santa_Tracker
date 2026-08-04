# Map contracts

`src/maps` contains map adapter interfaces and map-specific contracts shared by
forecast and monitor surfaces. Concrete UI and layer behavior belongs with the
owning feature.

Keep this boundary small so a map implementation can change without pulling
feature state into every consumer. Update map-focused tests when a contract
changes.
