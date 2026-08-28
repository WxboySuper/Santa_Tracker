# UI Storybook baseline

The shared UI package owns the first visual baseline for the Christmas 2026 redesign. Start Storybook from the repository root with:

```sh
pnpm --filter @santa-tracker/ui storybook
```

The baseline includes Button states and seasonal token states. Use the Storybook toolbar to check the mobile viewport, high contrast, and reduced motion. The accessibility panel runs axe against each story.

For a CI-style check, build the static site and run the browser checks:

```sh
pnpm --filter @santa-tracker/ui storybook:build
pnpm --filter @santa-tracker/ui exec playwright install --with-deps chromium
pnpm --filter @santa-tracker/ui storybook:test
```

The test runner visits every story, fails on accessibility violations, and captures a PNG for each story under `storybook-screenshots/`. Generated output is not committed.

Storybook and its browser-test dependencies are kept in the workspace lockfile so CI can install the same versions with one frozen-lockfile install. The lockfile grows because Storybook brings its own manager, Vite, axe, and Playwright dependencies.
