# Components

This folder contains feature UI and shared presentation primitives. Route pages
compose components; components should not register routes or hide new global
state ownership in leaf UI.

Major boundaries include ForecastWorkspace, Map, Verification, DrawingTools,
CycleManager, DiscussionEditor, and `ui` primitives. Monitor-specific UI is
owned by `src/monitor/components`; this folder should not grow a parallel
Monitor boundary. Keep feature logic with its surface and use `src/store`,
`src/hooks`, or `src/utils` for reusable behavior. Colocate component tests and
update related docs when a boundary moves. Validate with the focused Jest suite
and `pnpm run build` for shared or user-facing changes.
