import {
  buildDatQueryParams,
  DatClient,
  DatClientError,
  DAT_ASSOCIATION_BATCH_SIZE,
  DAT_MAX_RECORD_COUNT,
} from './client';

const responseFor = (payload: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => payload,
});

const trackFeature = (objectid: number, globalid = '{TRACK-1}') => ({
  type: 'Feature',
  id: objectid,
  geometry: { type: 'LineString', coordinates: [[-97, 35], [-96, 36]] },
  properties: {
    objectid,
    globalid,
    event_id: '',
    stormdate: 1_767_225_600_000,
    starttime: null,
    endtime: null,
    efscale: 'EF2',
    efnum: 2,
    width: -99,
    length: 4.5,
  },
});

describe('NOAA DAT query construction', () => {
  test('adds GeoJSON, time, and pagination parameters', () => {
    const params = buildDatQueryParams({
      outFields: ['objectid', 'globalid'],
      timeRange: { start: '2026-08-01T00:00:00Z', end: '2026-08-02T00:00:00Z' },
      pageSize: 50,
    });

    expect(params.get('f')).toBe('geojson');
    expect(params.get('outFields')).toBe('objectid,globalid');
    expect(params.get('returnGeometry')).toBe('true');
    expect(params.get('outSR')).toBe('4326');
    expect(params.get('time')).toBe('1785542400000,1785628800000');
    expect(params.get('resultOffset')).toBe('0');
    expect(params.get('resultRecordCount')).toBe('50');
  });

  test('builds an ArcGIS envelope spatial filter', () => {
    const params = buildDatQueryParams({
      bounds: { minLon: -101, minLat: 33, maxLon: -94, maxLat: 38 },
    });

    expect(params.get('geometry')).toBe('-101,33,-94,38');
    expect(params.get('geometryType')).toBe('esriGeometryEnvelope');
    expect(params.get('inSR')).toBe('4326');
    expect(params.get('spatialRel')).toBe('esriSpatialRelIntersects');
  });
});

describe('DatClient', () => {
  test('binds the native fetch receiver when no fetch implementation is injected', async () => {
    const originalFetch = globalThis.fetch;
    const nativeFetch = function (this: unknown, _input: RequestInfo | URL): Promise<unknown> {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(responseFor({ features: [], exceededTransferLimit: false }));
    };
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: nativeFetch });

    try {
      const client = new DatClient();
      await expect(client.queryTracks()).resolves.toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    }
  });

  test('normalizes GeoJSON records and paginates up to the service limit', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(responseFor({ features: [trackFeature(1)], exceededTransferLimit: true }))
      .mockResolvedValueOnce(responseFor({ features: [trackFeature(2)], exceededTransferLimit: false }));
    const client = new DatClient({ fetchImpl, pageSize: 2 });

    const tracks = await client.queryTracks();

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ objectId: 1, eventId: null, width: null, efNumber: 2 });
    expect(tracks[0].stormDate).toBe(new Date(1_767_225_600_000).toISOString());
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('resultOffset')).toBe('1');
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('resultRecordCount')).toBe('2');
  });

  test('surfaces ArcGIS errors even when the HTTP response is 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(responseFor({ error: { code: 400, message: 'Invalid where', details: ['bad field'] } }));
    const client = new DatClient({ fetchImpl });

    await expect(client.queryTracks()).rejects.toMatchObject({
      name: 'DatClientError',
      code: 400,
      message: 'Invalid where bad field',
    });
  });

  test('follows path_guid associations and builds attachment URLs', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(responseFor({ features: [trackFeature(7, '{TRACK-7}')], exceededTransferLimit: false }))
      .mockResolvedValueOnce(responseFor({ features: [{
        type: 'Feature',
        id: 8,
        geometry: { type: 'Point', coordinates: [-97, 35] },
        properties: { objectid: 8, globalid: '{POINT-8}', path_guid: '{TRACK-7}', efscale: 'EF3', lat: 35, lon: -97, damage_txt: 'Roof damage' },
      }], exceededTransferLimit: false }))
      .mockResolvedValueOnce(responseFor({ attachmentGroups: [{ parentObjectId: 8, attachmentInfos: [{ id: 9, name: 'survey.jpg', contentType: 'image/jpeg', size: 12 }] }] }));
    const client = new DatClient({ fetchImpl });
    const tracks = await client.queryTracks();
    const points = await client.queryDamagePointsForTrack(tracks[0]);
    const attachments = await client.queryDamagePointAttachments(8);

    expect(points[0]).toMatchObject({ objectId: 8, pathGuid: '{TRACK-7}', efScale: 'EF3' });
    expect(attachments[0]).toMatchObject({ id: 9, name: 'survey.jpg', contentType: 'image/jpeg' });
    expect(client.getAttachmentUrl(8, 9)).toContain('/FeatureServer/0/8/attachments/9');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('merges direct date-layer surveys when path_guid is null', async () => {
    const fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchImpl.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const layer = url.pathname.split('/').at(-2);
      if (layer === '1') {
        return responseFor({ features: [trackFeature(7, '{TRACK-7}')], exceededTransferLimit: false }) as unknown as Response;
      }
      if (layer === '0') {
        return responseFor({ features: [{
          type: 'Feature',
          id: 8,
          geometry: { type: 'Point', coordinates: [-87.8, 41.1] },
          properties: {
            objectid: 8,
            globalid: '{POINT-8}',
            path_guid: null,
            event_id: 'Kankakee - Roselawn',
            stormdate: 1_773_180_000_000,
            surveydate: 1_773_220_000_000,
            efscale: 'EF3',
            lat: 41.1,
            lon: -87.8,
          },
        }], exceededTransferLimit: false }) as unknown as Response;
      }
      return responseFor({ features: [], exceededTransferLimit: false }) as unknown as Response;
    });
    const client = new DatClient({ fetchImpl });

    const evidence = await client.queryEvidenceForDate({
      start: '2026-03-10T00:00:00Z',
      end: '2026-03-11T00:00:00Z',
    });

    expect(evidence.tracks).toHaveLength(1);
    expect(evidence.damagePoints).toMatchObject([{ objectId: 8, pathGuid: null, efScale: 'EF3' }]);
    expect(fetchImpl.mock.calls.some(([input]) => {
      const url = new URL(String(input));
      return url.pathname.endsWith('/0/query') && url.searchParams.has('time');
    })).toBe(true);
  });

  test('batches and date-scopes relationship fallback queries', async () => {
    const tracks = Array.from(
      { length: DAT_ASSOCIATION_BATCH_SIZE + 1 },
      (_, index) => trackFeature(index + 1, `{TRACK-${index + 1}}`),
    );
    const fetchImpl = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const layer = url.pathname.split('/').at(-2);
      if (layer === '1') {
        return responseFor({ features: tracks, exceededTransferLimit: false });
      }
      return responseFor({ features: [], exceededTransferLimit: false });
    });
    const client = new DatClient({ fetchImpl });

    await client.queryEvidenceForDate({
      start: '2026-03-10T00:00:00Z',
      end: '2026-03-11T00:00:00Z',
    });

    const relationshipCalls = fetchImpl.mock.calls.filter(([input]) => {
      const url = new URL(String(input));
      return url.searchParams.get('where')?.includes('path_guid IN') ?? false;
    });
    expect(relationshipCalls).toHaveLength(4);
    relationshipCalls.forEach(([input]) => {
      expect(new URL(String(input)).searchParams.get('time')).toBe('1773100800000,1773187200000');
    });
  });

  test('rejects invalid boxes and preserves explicit page-size construction', () => {
    expect(() => buildDatQueryParams({ bounds: { minLon: 1, minLat: 2, maxLon: -1, maxLat: 3 } })).toThrow(DatClientError);
    expect(buildDatQueryParams({ pageSize: DAT_MAX_RECORD_COUNT * 2 }).get('resultRecordCount')).toBe(String(DAT_MAX_RECORD_COUNT));
  });
});
