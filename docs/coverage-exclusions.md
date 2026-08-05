# Coverage Exclusions Inventory

This document lists every coverage exclusion in `jest.config.js` with an owner
and justification, so no behavior is hidden behind a blanket exclusion without
review.

## Excluded application files

| File | Justification | Owner |
|------|---------------|-------|
| `src/index.tsx` | Application entry point; no behavior to unit test. | Maintainer |
| `src/reportWebVitals.ts` | Vendor glue for the `web-vitals` callback; covered by e2e smoke. | Maintainer |
| `src/setupTests.ts` | Jest setup only; not application behavior. | Maintainer |
| `src/immerSetup.ts` | Immer configuration; no branching behavior. | Maintainer |
| `src/testUtils.ts` | Test helpers only. | Maintainer |
| `src/maps/contracts.ts` | Type-only map adapter contracts. | Maintainer |
| `src/components/Map/OpenLayersForecastMap.tsx` | Large imperative OpenLayers view layer; covered by focused helper tests (`OpenLayersForecastMap.extra.test.ts`) and e2e smoke. The blanket exclusion remains because the component mixes canvas/draw imperatives that are impractical to unit test, but helpers are tested. | Maintainer |
| `src/**/index.ts` / `src/**/index.tsx` | Barrel re-exports only. | Maintainer |
| `src/types/**` | Type-only definitions. | Maintainer |
| `src/**/__mocks__/**` | Test mocks. | Maintainer |
| `src/**/*.d.ts` | Ambient type declarations. | Maintainer |

## Removed exclusions

The following files previously had blanket exclusions but now have direct
behavioral coverage and are therefore included in the coverage report:

| File | Coverage |
|------|----------|
| `src/components/Map/OpenLayersVerificationMap.tsx` | `OpenLayersVerificationMap.test.ts`, `VerificationMap.test.ts` |
| `src/hooks/useCloudCycles.ts` | `useCloudCycles.test.ts` |
| `src/lib/cloudCyclesService.ts` | `cloudCyclesService.custom.test.ts` |

Any new exclusion must be added here with a justification and owner before it
is accepted in a PR.
