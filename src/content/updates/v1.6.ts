import type { ReleaseUpdate, UpdateScreenshot } from './types';

export type {
  ReleaseHotfixes,
  ReleaseImprovement,
  ReleaseUpdate,
  UpdateScreenshot,
  UpdateSection,
} from './types';

/** Builds a screenshot descriptor under public/updates/v1.6/. */
function buildUpdateImage(fileName: string, alt: string, caption?: string): UpdateScreenshot {
  return {
    src: `/updates/v1.6/${fileName}`,
    alt,
    caption,
  };
}

export const v16Update: ReleaseUpdate = {
  version: '1.6',
  title: 'Monitor — live weather at a glance',
  summary:
    'Version 1.6 introduces Monitor: a dedicated workspace for live radar, satellite, your forecast outlook, NWS alerts, and storm reports — built for quick situational awareness while you work.',
  promoImages: [
    buildUpdateImage(
      'v1.6-promo-image-light-mrms-visible.png',
      'Monitor in light mode with MRMS reflectivity and GOES visible satellite',
      'Light theme — CONUS MRMS reflectivity plus visible satellite on the Monitor map.',
    ),
    buildUpdateImage(
      'v1.6-promo-image-dark-single-site-shortwave-ir.png',
      'Monitor in dark mode with single-site reflectivity and GOES shortwave IR satellite',
      'Dark theme — single-site base reflectivity plus shortwave IR satellite.',
    ),
  ],
  sections: [
    {
      title: 'Monitor workspace',
      body:
        'Open Monitor from the main navigation to see radar and satellite imagery, animate recent frames, and keep your active or saved outlook on the map for context. Premium users can also pull outlooks from the cloud library.',
      screenshots: [
        buildUpdateImage(
          'monitor-overview.png',
          'Monitor page showing the map and control sidebar',
          'Monitor layout with map and controls',
        ),
        buildUpdateImage(
          'monitor-radar-outlook.png',
          'Radar imagery with a semi-transparent outlook overlay',
          'Radar plus your outlook overlay',
        ),
      ],
    },
    {
      title: 'Alerts and storm reports',
      body:
        'Toggle NWS watches, warnings, and advisories with adjustable opacity. Layer storm reports and filter by hazard type, optionally matching your outlook type for faster verification.',
      screenshots: [
        buildUpdateImage('monitor-alerts.png', 'NWS alerts displayed on the Monitor map'),
        buildUpdateImage('monitor-storm-reports.png', 'Storm reports plotted on the Monitor map'),
      ],
    },
  ],
  hotfixes: {
    title: 'v1.6 Hotfixes',
    body:
      'Stability fixes shipped after the v1.6 release for map-heavy workflows on forecast, verification, and monitor.',
    items: [
      {
        id: 'openlayers-removechild',
        text: 'Fixed a map error that could surface as a blank or unstable editor when OpenLayers and React disagreed about popup DOM ownership — especially on Monitor alert popups and when switching outlook types or routes.',
      },
      {
        id: 'map-translation-guard',
        text: 'Map shells and legends are now marked notranslate so Chrome auto-translate is less likely to rewrite map UI text and trigger React DOM errors on mobile browsers.',
      },
    ],
  },
  improvements: [
    {
      id: 'safari-hosted-sleep',
      text: 'Hosted accounts on Safari and macOS are less likely to lose connection after the computer sleeps overnight.',
    },
    {
      id: 'forecast-shortcuts',
      text: 'Forecast keyboard shortcuts no longer break when the browser sends an unusual key event.',
    },
    {
      id: 'map-transparency',
      text: 'Map layer transparency controls behave consistently again on the forecast editor.',
    },
    {
      id: 'forecast-persistence',
      text: 'Saving, loading, and exporting forecasts is more resilient when outlook data was stored in an unexpected shape.',
    },
    {
      id: 'home-primary-cta',
      text: 'Signed-in home page primary buttons are easier to read in light mode.',
    },
  ],
};
