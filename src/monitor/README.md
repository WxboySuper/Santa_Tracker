# Monitor domain

`src/monitor` contains Monitor data contracts, upstream weather/alert adapters,
layer configuration, normalization, and map synchronization helpers. The UI
counterpart lives in `src/components/Monitor`.

Keep upstream failures and stale data explicit at this boundary. Avoid adding
generic presentation components here. Update monitor fixtures and colocated
tests when a normalized shape changes.
