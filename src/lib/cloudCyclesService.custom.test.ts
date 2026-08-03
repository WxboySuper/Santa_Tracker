import type { GFCForecastSaveData } from '../types/outlooks';
import { createCloudCyclePayloadStorage, parseCloudCyclePayload } from './cloudCyclesService';

test('cloud payload encoding round-trips custom geometry and appearance', () => {
  const payload = {
    version: '1.0.0',
    type: 'forecast-cycle',
    timestamp: '2026-07-17T00:00:00.000Z',
    forecastCycle: {
      currentDay: 1,
      cycleDate: '2026-07-17',
      days: {
        1: {
          day: 1,
          data: {},
          metadata: { issueDate: '2026-07-17', validDate: '2026-07-17', issuanceTime: '0600' },
          customLayers: {
            schemaVersion: '1.0.0',
            layers: [{
              schemaVersion: '1.0.0', id: 'layer-1', label: 'Fire', order: 0,
              categories: [{ id: 'cat-1', label: 'Critical', order: 0, style: { fillColor: '#ef4444', fillOpacity: .6, strokeColor: '#123456', strokeOpacity: .4, strokeWidth: 4, hatch: 'crosshatch' } }],
              features: [{ type: 'Feature', id: 'feature-1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Critical' } }],
              createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
            }],
          },
        },
      },
    },
  } as GFCForecastSaveData;

  const encoded = createCloudCyclePayloadStorage(payload);
  const restored = parseCloudCyclePayload(encoded.payloadJson);

  expect(encoded.payloadBytes).toBeGreaterThan(0);
  expect(restored?.forecastCycle?.days[1]?.customLayers).toEqual(payload.forecastCycle?.days[1]?.customLayers);
});
