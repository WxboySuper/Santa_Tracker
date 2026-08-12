# v1.7 feature exposure workstreams

Single adoption manifest for every unfinished v1.7 workstream registered in `src/config/featureExposure.ts`. Completing this adoption is tracked in FND-14 (#530).

## Adoption rule

Every workstream must:

1. Declare a registry key with an exposure matrix that reflects the current rollout stage (unreleased targets stay off until enablement criteria pass).
2. Gate routes, navigation, boundaries, side-effect modules, and server capabilities **before** the first exposed slice merges.
3. Ship disabled-side-effect tests or a documented acknowledgement (see [feature-exposure-testing.md](./feature-exposure-testing.md)).
4. Record the tracker issue and the PR that may first flip `exposure.beta` (TBD until an implementation slice is ready).

## Summary

| Workstream | Registry key | Tracker | Surfaces today | Coverage |
| --- | --- | --- | --- | --- |
| Auto-TSTM | `autoTstm` | #427 | Side-effect module + server capability gate | Exemplar + server exposure tests |
| Forecast workflow v2 | `forecastWorkflowV2` | #429 | Home entry + forecast workspace workflow slice | Home interaction + adoption tests |
| Verification relaunch | `verificationRelaunch` | #430 | Registry-backed Forecast Grade relaunch | Acknowledgement + adoption test |
| Custom products | `customProducts` | #431 | Forecast editor, product library, entitlement, and storage gates | Acknowledgement + adoption and E2E tests |
| Tropical workspace | `tropicalWorkspace` | #432 | Gated route `/tropical` + navbar | Exemplar + route/nav tests |
| Collaboration room | `collaborationRoom` | #433 | Gated route `/collaborate` + navbar | Exemplar + route/nav tests |

Unreleased rows remain disabled until their enablement criteria pass. Auto-TSTM, Forecast Workflow v2, Verification relaunch, and Custom Products are release-approved across local, beta, staging, and production for v1.7.

## Per-workstream detail

### Auto-TSTM (`autoTstm`, #427)

- **Registry:** `temporary: true`, `serverBacked: true`, `serverCapabilityKey: TSTM_GENERATION_ENABLED`
- **Gates:** `FEATURE_SIDE_EFFECT_MODULES.autoTstm`, `ServerBackedFeatureBoundary`, `server/tstm.js` capability gate
- **Tests:** `src/testing/featureExposure/exemplar.exposure.test.tsx`, `server/testing/autoTstm.exposure.test.js`
- **Ops:** [auto-tstm-operations.md](./auto-tstm-operations.md)
- **Release enablement:** tracker #427; client and server exposure are enabled on every release target with TSTM-05 editor integration (#476)

### Forecast workflow v2 (`forecastWorkflowV2`, #429)

- **Registry:** `temporary: true`, client-only
- **Gates:** home workflow actions and forecast workspace workflow panel
- **Tests:** signed-in home interaction coverage in `src/pages/home/HomePage.test.tsx`, adoption contract in `src/config/v17WorkstreamAdoption.exposure.test.ts`
- **Release enablement:** approved for local, beta, staging, and production after workflow continuity and adoption coverage

### Verification relaunch (`verificationRelaunch`, #430)

- **Registry:** `temporary: true`, client-only
- **Gates:** none yet — the existing `/verification` route is core product, not this relaunch key
- **Tests:** acknowledgement in `featureExposure.acknowledgements.json`, `src/config/v17WorkstreamAdoption.exposure.test.ts`
- **Release enablement:** approved for local, beta, staging, and production after dashboard, coexistence, and adoption coverage

### Custom products (`customProducts`, #431)

- **Registry:** `temporary: true`, client-only
- **Gates:** custom route, navigation, toolbar, repository, entitlement, and Firestore capability checks
- **Tests:** acknowledgement in `featureExposure.acknowledgements.json`, `src/config/v17WorkstreamAdoption.exposure.test.ts`
- **Release enablement:** approved for local, beta, staging, and production after implementation, UI review, and regression/E2E coverage

### Tropical workspace (`tropicalWorkspace`, #432)

- **Registry:** `temporary: true`, client-only
- **Gates:** gated lazy route `/tropical`, navbar item `tropical-workspace`
- **Tests:** exemplar + `buildFeatureGatedRoutes.test.tsx` + `featureNavigation.test.ts`
- **Beta enablement:** tracker #432; first enable PR: TBD

### Collaboration room (`collaborationRoom`, #433)

- **Registry:** `temporary: true`, client-only
- **Gates:** gated lazy route `/collaborate`, navbar item `collaboration-room`
- **Tests:** exemplar contract runner + route/nav tests
- **Beta enablement:** tracker #433; first enable PR: TBD

## Commands

```powershell
pnpm test:exposure
pnpm validate:feature-exposure
pnpm exposure:report
```
