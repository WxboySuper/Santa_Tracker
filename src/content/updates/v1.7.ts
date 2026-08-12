import type { ReleaseUpdate, UpdateScreenshot } from './types';

const image = (fileName: string, alt: string, caption: string): UpdateScreenshot => ({
  src: `/updates/v1.7/${fileName}`,
  alt,
  caption,
});

/** Public release update content for the v1.7 major release. */
export const v17Update: ReleaseUpdate = {
  version: '1.7',
  title: 'The biggest update yet.',
  summary:
    'A bigger, more connected way to make forecasts, test your thinking, and build the products you actually want to use.',
  heroImage: image(
    'verification-v2.png',
    'Verification v2 Forecast Grade workspace with observed reports and a score breakdown',
    'Verification v2 turns a finished forecast into a structured learning session.',
  ),
  sections: [
    {
      title: 'Verification v2',
      eyebrow: 'The headliner',
      kind: 'feature',
      body:
        'Forecasting is only half the work. Verification v2 gives you a dedicated place to compare what you forecast with what actually happened, so every event becomes a chance to sharpen your judgment.',
      bullets: [
        'Source-aware evidence from SPC storm reports and NOAA Damage Assessment Toolkit surveys.',
        'Report-quality checks, event capture, severity intent, and spatial scoring that show where a forecast worked—or missed.',
        'Probability skill, false-alarm discipline, score breakdowns, shareable summaries, and grade trends over time.',
      ],
      link: { label: 'Open Verification', href: '/verification' },
    },
    {
      title: 'Custom Products',
      eyebrow: 'The other headliner',
      kind: 'feature',
      body:
        'Make the forecast product you wish existed. Custom Products let you draw your own areas, define meaningful categories, and keep the style consistent from the map to the export.',
      bullets: [
        'Local custom layers and reusable hosted products with category styling, snapshots, exports, and imports.',
        'Built-in Rainfall and Tropical AOI products are available to every account tier and do not use personal product slots.',
        'Owner-scoped storage and premium boundaries keep hosted products useful without blurring who owns them.',
      ],
      link: { label: 'Explore Custom Products', href: '/custom-products' },
      screenshots: [
        image(
          'custom-products.png',
          'Custom Products forecast map showing Rainfall and Tropical AOI product styling',
          'Custom Products make room for the forecasts that do not fit a standard outlook.',
        ),
      ],
    },
    {
      title: 'Forecast workflows that hold together',
      eyebrow: 'The connective tissue',
      kind: 'support',
      body:
        'v1.7 gives a forecast a clearer beginning, middle, and end. Start from a reusable workflow, keep each discussion attached to the right outlook, review the package, and carry it through save, load, export, import, and handoff.',
      bullets: [
        'Versioned workflow packages with scoped discussion and draft persistence.',
        'Review and completion flows that surface missing work before you call a forecast finished.',
        'Handoff guidance, lifecycle metrics, and same-cycle update support for forecasts that keep evolving.',
      ],
      link: { label: 'Start a Forecast', href: '/forecast' },
      screenshots: [
        image(
          'workflows.png',
          'Forecast workflow workspace showing an outlook map, review package action, and discussion pane',
          'A forecast package now carries its map, discussion, review, and next step together.',
        ),
      ],
    },
    {
      title: 'Auto-TSTM',
      eyebrow: 'Less setup, more thinking',
      kind: 'support',
      body:
        'Auto-TSTM uses SPC-calibrated HREF guidance to create a reviewable starting point for categorical work. Preview it, decide what belongs in your forecast, and keep control of the final map.',
      bullets: [
        'Preview, apply, cancel, and undo flows instead of silent map changes.',
        'Cache health and stale-result protection make upstream guidance easier to trust.',
        'Unavailable and server-capability states are explicit across supported release targets.',
      ],
      link: { label: 'Try it in Forecast', href: '/forecast' },
      screenshots: [
        image(
          'auto-tstm.png',
          'Forecast map with Auto-TSTM tools visible in the toolbar',
          'Auto-TSTM helps you get to a thoughtful categorical starting point faster.',
        ),
      ],
    },
    {
      title: 'Monitor and reference data',
      eyebrow: 'Stay with the event',
      kind: 'support',
      body:
        'Monitor keeps radar, satellite, alerts, storm reports, and your forecast in one live workspace. v1.7 adds an opt-in SPC mesoscale discussion reference layer with attribution, valid-time state, and bounded caching.',
      bullets: [
        'Source metadata stays visible so reference data remains explainable.',
        'Refresh, retry, stale-data, and phone-layout behavior are more resilient.',
      ],
      link: { label: 'Open Monitor', href: '/monitor' },
    },
    {
      title: 'Privacy and account safety',
      eyebrow: 'A clearer boundary around your data',
      kind: 'privacy',
      body:
        'The v1.7 privacy update makes the local-first promise more explicit and separates essential account operation from optional measurement. Your forecasts remain yours whether you sign in or stay offline.',
      bullets: [
        'Local forecasts, preferences, and cycle history stay on your device unless you choose hosted sync.',
        'Non-essential product analytics are disabled by default, require separate opt-in, and can be withdrawn at any time.',
        'Beta and production telemetry use separate reporting zones; analytics do not receive account identity, forecast contents, coordinates, filenames, or export contents.',
        'Account deletion now requires recent authentication, cleans up hosted data and billing state, and leaves local offline forecasts untouched.',
      ],
      link: { label: 'Open account safety controls', href: '/account' },
    },
    {
      title: 'The quiet work underneath',
      eyebrow: 'More reliable by default',
      kind: 'under-the-hood',
      body:
        'There is a lot in this release that does not fit neatly into a poster. v1.7 also hardens the surfaces you use every day—from importing a saved forecast to opening a map on a phone.',
      bullets: [
        'Bounded, schema-validated forecast imports and safer handling of legacy saved shapes.',
        'Auto-categorical recovery that preserves the last known-good result when geometry work fails or times out.',
        'Keyboard, dialog, toolbar, map popup, session restore, and responsive-control improvements across the app.',
        'TypeScript 7 tooling, expanded E2E coverage, dependency/license gates, release manifests, rollback support, and explicit target exposure for local, beta, staging, and production.',
      ],
    },
  ],
  improvements: [
    {
      id: 'v17-reference-integrity',
      text: 'Prototype and source-limited evidence remains labeled clearly; NOAA DAT damage points supplement official verification evidence rather than replacing it.',
    },
    {
      id: 'v17-sentry-boundaries',
      text: 'Error monitoring remains separate from product analytics, with environment tags and payload minimization on hosted deployments.',
    },
    {
      id: 'v17-free-core',
      text: 'Core forecasting and learning workflows remain free; premium is reserved for hosted capabilities that carry an operating cost.',
    },
    {
      id: 'v17-release-surfaces',
      text: 'The release is exposed deliberately across local, beta, staging, and production, with emergency disable controls and server capability boundaries where needed.',
    },
  ],
};
