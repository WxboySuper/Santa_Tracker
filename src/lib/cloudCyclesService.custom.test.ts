jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args: unknown[]) => ({ firestore: {}, args })),
  deleteField: jest.fn(() => 'delete-field'),
  deleteDoc: jest.fn(),
  doc: jest.fn((...args: unknown[]) => ({ args })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn((...args: unknown[]) => ({ args })),
  setDoc: jest.fn(),
  where: jest.fn((...args: unknown[]) => ({ args })),
  writeBatch: jest.fn(() => ({ commit: jest.fn(), set: jest.fn() })),
}));
jest.mock('./firebase', () => ({ auth: null, db: {} }));

import type { GFCForecastSaveData } from '../types/outlooks';
import { getDoc, onSnapshot } from 'firebase/firestore';
import {
  createCloudCyclePayloadStorage,
  parseCloudCyclePayload,
  subscribeToCloudCycles,
} from './cloudCyclesService';

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

test('subscription checks the legacy store when the initial collection is empty', async () => {
  const onUpdate = jest.fn();
  const onError = jest.fn();
  const unsubscribe = jest.fn();
  (getDoc as jest.Mock).mockResolvedValue({ data: () => ({}) });
  (onSnapshot as jest.Mock).mockImplementation((_query, next) => {
    void next({ docs: [] });
    return unsubscribe;
  });

  const stop = subscribeToCloudCycles({ userId: 'user-1', onUpdate, onError });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(getDoc).toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledWith([]);
  expect(onError).not.toHaveBeenCalled();
  stop();
  expect(unsubscribe).toHaveBeenCalled();
});
