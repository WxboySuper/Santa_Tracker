import { buildLoadedCloudForecastPayload } from './useCloudCycles';
import type { CloudCycle } from '../types/cloudCycles';
import type { GFCForecastSaveData } from '../types/outlooks';

const basePayload: GFCForecastSaveData = {
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-07-14T00:00:00.000Z',
  forecastCycle: {
    days: {},
    currentDay: 1,
    cycleDate: '2026-07-14',
  },
  mapView: { center: [39.8283, -98.5795], zoom: 4 },
};

describe('buildLoadedCloudForecastPayload', () => {
  test('attaches normalized workflow metadata for workflow-backed cloud cycles', () => {
    const workflowMetadata = {
      id: 'cycle-1',
      workflowId: 'severe-day1',
      cycleDate: '2026-07-14',
      version: 1,
      status: 'in-progress' as const,
      outlookVersions: [],
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    };

    const payload = buildLoadedCloudForecastPayload({
      payload: basePayload,
      workflowMetadata,
    } as CloudCycle);

    expect(payload.cycleMetadata).toEqual(workflowMetadata);
  });

  test('clears stale embedded workflow metadata for plain cloud cycles', () => {
    const payload = buildLoadedCloudForecastPayload({
      payload: {
        ...basePayload,
        cycleMetadata: {
          id: 'stale-cycle',
          workflowId: 'severe-day1',
          cycleDate: '2026-07-14',
          version: 1,
          status: 'in-progress',
          outlookVersions: [],
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
      },
    } as CloudCycle);

    expect(payload.cycleMetadata).toBeNull();
    expect(payload).not.toHaveProperty('cycleMetadata', expect.objectContaining({ id: 'stale-cycle' }));
  });

  test('preserves custom geometry and appearance when loading a cloud payload', () => {
    const customLayers = {
      schemaVersion: '1.0.0' as const,
      layers: [{
        schemaVersion: '1.0.0' as const, id: 'layer-1' as never, label: 'Fire', order: 0,
        categories: [{ id: 'cat-1' as never, label: 'Critical', order: 0, style: { fillColor: '#ef4444', fillOpacity: .6, strokeColor: '#123456', strokeOpacity: .4, strokeWidth: 4, hatch: 'crosshatch' as const } }],
        features: [{ type: 'Feature' as const, id: 'feature-1', geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1' as never, categoryId: 'cat-1' as never, title: 'Critical' } }],
        createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
      }],
    };
    const cloudPayload = {
      ...basePayload,
      forecastCycle: {
        ...basePayload.forecastCycle!,
        days: { 1: { day: 1, data: {}, metadata: { issueDate: '', validDate: '', issuanceTime: '' }, customLayers } },
      },
    } as GFCForecastSaveData;

    const loaded = buildLoadedCloudForecastPayload({ payload: cloudPayload } as CloudCycle);
    expect(loaded.forecastCycle?.days[1]?.customLayers).toEqual(customLayers);
  });
});
