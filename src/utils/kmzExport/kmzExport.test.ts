import type { Feature, Polygon } from 'geojson';
import type { ForecastCycle } from '../../types/outlooks';
import { buildStructuredKmlDocument } from './buildKml';
import { buildSplitKmzArchive, buildStructuredKmzArchive } from './buildKmz';
import { collectKmzExportFeatures } from './collectFeatures';
import { hexToKmlColor } from './color';
import { geometryToKml } from './geometry';

const square = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]],
  },
});

const buildForecast = (): ForecastCycle => ({
  cycleDate: '2026-08-18',
  currentDay: 1,
  days: {
    1: {
      day: 1,
      metadata: {
        issueDate: '2026-08-18',
        validDate: '2026-08-19',
        issuanceTime: '1200',
        createdAt: '2026-08-18T12:00:00.000Z',
        lastModified: '2026-08-18T12:00:00.000Z',
        lowProbabilityOutlooks: [],
        outlookOpacities: { tornado: 0.5 },
      },
      data: {
        tornado: new Map([
          ['15%', [square()]],
          ['30%#', [square()]],
          ['CIG2', [square()]],
        ]),
        categorical: new Map([
          ['SLGT', [square()]],
        ]),
      },
    },
    2: {
      day: 2,
      metadata: {
        issueDate: '2026-08-18',
        validDate: '2026-08-20',
        issuanceTime: '1200',
        createdAt: '2026-08-18T12:00:00.000Z',
        lastModified: '2026-08-18T12:00:00.000Z',
        lowProbabilityOutlooks: [],
      },
      data: {
        wind: new Map([['30%', [square()]]]),
      },
    },
  },
});

describe('kmzExport', () => {
  test('hexToKmlColor converts RGB hex to aabbggrr', () => {
    expect(hexToKmlColor('#FF8080', 1)).toBe('ff8080ff');
    expect(hexToKmlColor('#000000', 0.5)).toBe('80000000');
  });

  test('geometryToKml serializes polygon rings and holes', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
        [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]],
      ],
    };

    const kml = geometryToKml(geometry);
    expect(kml).toContain('<outerBoundaryIs>');
    expect(kml).toContain('<innerBoundaryIs>');
    expect(kml).toContain('0,0,0');
  });

  test('collectKmzExportFeatures respects scope and outlook filters', () => {
    const forecast = buildForecast();

    const currentDay = collectKmzExportFeatures({
      forecastCycle: forecast,
      options: { scope: 'current-day', day: 1 },
    });
    expect(currentDay.some((feature) => feature.outlookType === 'wind')).toBe(false);
    expect(currentDay.some((feature) => feature.probabilityKey === '15%')).toBe(true);

    const cycle = collectKmzExportFeatures({
      forecastCycle: forecast,
      options: { scope: 'cycle' },
    });
    expect(cycle.some((feature) => feature.day === 2 && feature.outlookType === 'wind')).toBe(true);

    const tornadoOnly = collectKmzExportFeatures({
      forecastCycle: forecast,
      options: { scope: 'current-day', day: 1, outlookTypes: ['tornado'] },
    });
    expect(tornadoOnly.every((feature) => feature.outlookType === 'tornado')).toBe(true);
    expect(tornadoOnly.some((feature) => feature.isSignificant)).toBe(true);
    expect(tornadoOnly.some((feature) => feature.isCig)).toBe(true);
    expect(tornadoOnly.find((feature) => feature.probabilityKey === 'CIG2')?.fillColor).toBe('#000000');
  });

  test('buildStructuredKmlDocument emits placemarks with ExtendedData', () => {
    const forecast = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle: forecast,
      options: { scope: 'current-day', day: 1 },
    });

    expect(kml).toContain('<kml');
    expect(kml).toContain('<Folder><name>Day 1</name>');
    expect(kml).toContain('<Data name="gfc_probability_key"><value>30%#</value></Data>');
    expect(kml).toContain('<Data name="gfc_cig"><value>CIG2</value></Data>');
    expect(kml).toContain('<Polygon>');
  });

  test('buildStructuredKmzArchive and split strategy produce KMZ blobs', async () => {
    const forecast = buildForecast();
    const input = {
      forecastCycle: forecast,
      options: { scope: 'cycle' as const },
    };

    const structured = await buildStructuredKmzArchive(input);
    const split = await buildSplitKmzArchive(input);

    expect(structured.type).toBe('application/zip');
    expect(split.type).toBe('application/zip');
    expect(structured.size).toBeGreaterThan(100);
    expect(split.size).toBeGreaterThan(structured.size);
  });
});
