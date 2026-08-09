import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'spc-mesoscale-discussion.geojson'), 'utf8')) as unknown;
import {
  buildSpcMesoscaleDiscussionQueryUrl,
  fetchSpcMesoscaleDiscussions,
  formatMonitorReferenceTime,
  normalizeSpcMesoscaleDiscussionCollection,
  withReferenceRetry,
} from './referenceLayers';

describe('monitor reference layers', () => {
  test('normalizes an SPC polygon fixture and preserves attribution metadata', () => {
    const normalized = normalizeSpcMesoscaleDiscussionCollection(fixture);
    expect(normalized.features).toHaveLength(1);
    expect(normalized.features[0].properties).toMatchObject({
      label: 'Mesoscale Discussion 0001',
      productNumber: '0001',
      issuedAt: '2026-08-09T15:00:00.000Z',
      validityText: 'MD 0001 Active Till 2100 UTC',
      sourceUrl: 'http://www.spc.noaa.gov/products/md/md0001.html',
    });
    expect(normalized.features[0].properties.validTo).toBeUndefined();
    expect(normalized.features[0].geometry.type).toBe('Polygon');
  });

  test('drops malformed features and supports an empty valid response', () => {
    const normalized = normalizeSpcMesoscaleDiscussionCollection({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
      ],
    });
    expect(normalized.features).toEqual([]);
  });

  test('fetches and normalizes the official ArcGIS response shape', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    } as Response);
    const normalized = await fetchSpcMesoscaleDiscussions(fetcher);
    expect(fetcher).toHaveBeenCalledWith(buildSpcMesoscaleDiscussionQueryUrl(), {
      headers: { Accept: 'application/geo+json' },
    });
    expect(normalized.features).toHaveLength(1);
  });

  test('queries only current geometries and requests GeoJSON', () => {
    const url = new URL(buildSpcMesoscaleDiscussionQueryUrl());
    expect(url.searchParams.get('where')).toBe('1=1');
    expect(url.searchParams.get('returnGeometry')).toBe('true');
    expect(url.searchParams.get('f')).toBe('geojson');
  });

  test('presents WMS intervals as readable valid-time ranges', () => {
    expect(formatMonitorReferenceTime('2026-08-09T15:00:00Z')).not.toBe('2026-08-09T15:00:00Z');
    expect(formatMonitorReferenceTime('2026-08-09T15:00:00Z/2026-08-09T18:00:00Z/PT1H')).not.toBe('2026-08-09T15:00:00Z/2026-08-09T18:00:00Z/PT1H');
    expect(formatMonitorReferenceTime(null)).toBe('provider latest');
  });

  test('retries transient failures with the bounded backoff schedule', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue('recovered');
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(withReferenceRetry(operation, [10, 20], wait)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledWith(10);
    expect(wait).toHaveBeenCalledWith(20);
  });

  test('surfaces a response containing only malformed features as an upstream error', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
      }),
    } as Response);

    await expect(fetchSpcMesoscaleDiscussions(fetcher)).rejects.toThrow('no usable polygon features');
  });
});
