import type { GFCForecastSaveData } from '../types/outlooks';
import { getDoc, onSnapshot } from 'firebase/firestore';
import {
  createCloudCyclePayloadStorage,
  parseCloudCyclePayload,
  subscribeToCloudCycles,
} from './cloudCyclesService';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...parts: unknown[]) => ({ parts })),
  doc: jest.fn((...parts: unknown[]) => ({ parts })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn((value) => value),
  setDoc: jest.fn(),
  where: jest.fn(),
}));
jest.mock('./firebase', () => ({ db: { name: 'db' } }));

const { getDoc: mockGetDoc, getDocs: mockGetDocs, setDoc: mockSetDoc } =
  jest.requireMock('firebase/firestore') as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
});

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

test('legacy reads return data without Firestore writes and remain visible with hosted records', async () => {
  const { listCloudCycles } = await import('./cloudCyclesService');
  const payload = {
    version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-17T00:00:00.000Z',
    forecastCycle: { currentDay: 1, cycleDate: '2026-07-17', days: {} },
  } as GFCForecastSaveData;
  mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'hosted', data: () => ({ id: 'hosted', userId: 'user-1', label: 'Hosted', cycleDate: '2026-07-18' }) }] });
  mockGetDoc.mockResolvedValue({ data: () => ({ cloudCycles: { legacy: {
    id: 'legacy', userId: 'user-1', label: 'Legacy', cycleDate: '2026-07-17',
    createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z', payload,
  } } }) });

  const result = await listCloudCycles({ userId: 'user-1' });

  expect(result.success).toBe(true);
  expect(result.data?.map((cycle) => cycle.id)).toEqual(['legacy', 'hosted']);
  expect(mockSetDoc).not.toHaveBeenCalled();
});

test('subscription checks the legacy store when the initial collection is empty', async () => {
  const onUpdate = jest.fn();
  const onError = jest.fn();
  const unsubscribe = jest.fn();
  const payload = {
    version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-17T00:00:00.000Z',
    forecastCycle: { currentDay: 1, cycleDate: '2026-07-17', days: {} },
  } as GFCForecastSaveData;
  (getDoc as jest.Mock).mockResolvedValue({ data: () => ({ cloudCycles: { legacy: {
    id: 'legacy', userId: 'user-1', label: 'Legacy', cycleDate: '2026-07-17',
    createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z', payload,
  } } }) });
  (onSnapshot as jest.Mock).mockImplementation((_query, next) => {
    void next({ docs: [] });
    return unsubscribe;
  });

  const stop = subscribeToCloudCycles({ userId: 'user-1', onUpdate, onError });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(getDoc).toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledWith([expect.objectContaining({
    id: 'legacy', userId: 'user-1', label: 'Legacy', cycleDate: '2026-07-17',
  })]);
  expect(onError).not.toHaveBeenCalled();
  expect(mockSetDoc).not.toHaveBeenCalled();
  stop();
  expect(unsubscribe).toHaveBeenCalled();
});
