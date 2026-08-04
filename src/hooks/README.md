# Hooks

Hooks contain reusable React orchestration and browser workflows such as
auto-save, cloud cycles, Auto-TSTM, and data loading. They may depend on
components' contracts, store selectors, services, and shared types, but should
not own route registration or server-only behavior.

Keep async lifecycle and cancellation behavior explicit. Colocate hook tests
under `__tests__` or beside the hook, then run the focused Jest suite.
