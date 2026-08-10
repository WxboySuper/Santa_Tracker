import type { ReleaseUpdate } from './types';

/** Public release update content for the v1.7 major release. */
export const v17Update: ReleaseUpdate = {
  version: '1.7',
  title: 'Forecast, reflect, and learn',
  summary:
    'Version 1.7 brings forecast workflows, verification, custom products, monitoring, and hosted account safety into one more continuous learning workspace.',
  sections: [
    {
      title: 'Workflow continuity',
      body:
        'Start a forecast from a reusable workflow, keep discussions scoped to the correct outlook, review a package before completing it, and carry your work through save, load, export, import, and handoff without losing context.',
    },
    {
      title: 'Forecast Grade and Monitor',
      body:
        'Use Forecast Grade to inspect forecast performance with source-aware evidence, report-quality checks, spatial and probability views, and shareable summaries. Monitor keeps radar, satellite, alerts, storm reports, and your forecast in one live workspace, with optional official reference layers that preserve attribution and valid times.',
    },
    {
      title: 'Custom products and premium boundaries',
      body:
        'Create local custom layers and, when premium is active, reusable hosted products with category styling, snapshots, exports, imports, and owner-scoped storage. Built-in Rainfall and Tropical AOI styles are available to every account tier and do not consume personal product slots.',
    },
    {
      title: 'Safer hosted workflows',
      body:
        'Account deletion now requires recent authentication, cleans up hosted data and billing state safely, and leaves local offline forecasts untouched. Product analytics are optional and disabled by default, with separate beta and production reporting boundaries.',
    },
  ],
  improvements: [
    {
      id: 'v17-verification-sources',
      text: 'Verification can use official storm-report and supplemental evidence sources while clearly labeling prototype or source-limited results.',
    },
    {
      id: 'v17-auto-tstm',
      text: 'Auto-TSTM provides cached guidance with preview, cancel, apply, undo, stale-result protection, and public-safe unavailable states on its supported beta targets.',
    },
    {
      id: 'v17-responsive-controls',
      text: 'Forecast, Monitor, custom-product, dialog, and accessibility controls receive responsive and keyboard-focused reliability improvements.',
    },
    {
      id: 'v17-import-safety',
      text: 'Forecast imports are bounded and schema-validated before state changes, while legacy saved shapes remain readable where supported.',
    },
  ],
};
