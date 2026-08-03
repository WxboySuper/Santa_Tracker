# Feature exposure testing

Reusable fixtures and assertions for proving gated features stay inert while disabled. This is the minimum contract expected by FND-13 (#529) before a v1.7 workstream enables beta exposure in FND-14 (#530).

Workstream registry keys, surfaces, and beta-enablement records: [feature-exposure-workstreams.md](./feature-exposure-workstreams.md).

## Minimum test contract

Every gated feature must either:

1. Add a per-feature exposure contract test, or
2. Record a documented acknowledgement in `src/config/featureExposure.acknowledgements.json`

Preferred filename:

- `src/features/<featureKey>.exposure.test.ts(x)`
- `src/features/<featureKey>/<featureKey>.exposure.test.ts(x)`

### Client-only features

Prove for each target in the exposure matrix:

- [ ] Gated routes are not registered (`assertGatedRoutesAbsent`)
- [ ] Navigation items and keyboard shortcuts stay hidden (`assertNavigationHidden`)
- [ ] Lazy route chunks are not loaded while disabled
- [ ] `FeatureBoundary` children and `useFeatureEffect` callbacks do not run
- [ ] Timers, workers, subscriptions, and fetch calls do not start while disabled

### Server-backed features

Also prove:

- [ ] `/api/capabilities/status` is not fetched while compile-time exposure is off
- [ ] Server routes return `404` with zero handler/generator work across disabled fixtures
- [ ] Emergency disable, registry disable, and deployment-disable fixtures all fail closed

## Shared harness

Client helpers live in `src/testing/featureExposure/`:

- `targetMatrix.ts` — `ALL_TARGETS_OFF`, `singleTargetOn`, `runWithBuildTarget`, `mockFeatureExposure`, `mockFeatureExposureOnTarget`
- `harness.tsx` — route/nav/effect/fetch assertions and `runFeatureExposureContract`
- `exemplar.exposure.test.tsx` — reference adoption for `tropicalWorkspace` and `autoTstm`

Server helpers live in `server/testing/`:

- `featureExposureTargetMatrix.js` — shared target overrides for capability gates
- `featureExposureHarness.js` — `assertCapabilityRouteRejectsWithoutWork`, disabled status fixtures
- `autoTstm.exposure.test.js` — server-backed exemplar for Auto-TSTM routes

## Copy-paste template

```tsx
import { BUILD_TARGETS } from '../../config/buildTarget';
import {
  assertStandardClientSurfacesAbsent,
  runFeatureExposureContract,
  runWithBuildTarget,
} from '../../testing/featureExposure/harness';

describe('myFeature exposure contract', () => {
  test.each(BUILD_TARGETS)('stays inert on %s while disabled', (target) => {
    runWithBuildTarget(target, () => {
      assertStandardClientSurfacesAbsent('myFeature', [target]);
    });
  });

  test('runs the shared contract runner', async () => {
    await runFeatureExposureContract({
      feature: 'myFeature',
      surfaces: {
        routePaths: ['my-route'],
        navigationIds: ['my-nav-id'],
      },
      runDisabledAssertions: ({ target }) => {
        assertStandardClientSurfacesAbsent('myFeature', [target]);
      },
    });
  });
});
```

For server-backed features, add a sibling Node test under `server/testing/` using `assertCapabilityRouteRejectsWithoutWork`.

## When acknowledgements are acceptable

Use an acknowledgement only when:

- The feature has no gated routes, navigation, side effects, or server routes yet
- Coverage is temporarily delegated to a shared exemplar test during foundation work

Every acknowledgement must include a non-empty `reason` and positive `trackingIssue`.

## Commands

```powershell
pnpm test:exposure
pnpm validate:feature-exposure
node scripts/run-exposure-suite.mjs
```

The exposure suite also runs in CI inside the `feature-exposure-policy` job.
