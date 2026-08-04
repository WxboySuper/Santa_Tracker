# Monitor domain

`src/monitor` contains Monitor data contracts, upstream weather/alert adapters,
layer configuration, normalization, map synchronization helpers, and the
co-located UI under `src/monitor/components`.

Keep upstream failures and stale data explicit at this boundary. Keep generic
presentation primitives in `src/components/ui`; Monitor-specific components
belong under `src/monitor/components`. Update monitor fixtures and colocated
tests when a normalized shape changes.
