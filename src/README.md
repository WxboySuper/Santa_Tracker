# Frontend source

`src` contains the browser application. `index.tsx` bootstraps React and
`App.tsx` composes providers and routes.

## Boundaries

- `pages` owns route-level composition.
- `components` owns feature UI and shared UI primitives.
- `hooks` owns reusable React workflows.
- `store` owns Redux state transitions.
- `utils`, `types`, and `maps` provide reusable contracts and pure helpers.
- `config` and `features` own exposure and capability policy.

Start changes at the relevant page, then follow its component and state
dependencies. Run `pnpm run typecheck` and the focused Jest suite.
