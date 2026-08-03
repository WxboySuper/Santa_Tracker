import { countForecastMetrics } from './forecastMetrics';

describe('forecastMetrics', () => {
  test('countForecastMetrics counts days/outlooks/features', () => {
    const forecast = {
      days: {
        1: {
          day: 1,
          metadata: { lowProbabilityOutlooks: [], issueDate:'', validDate:'', issuanceTime:'', createdAt:'', lastModified:'' },
          data: {
            categorical: new Map([['TSTM', [{ type: 'Feature', geometry: null, properties: {} }]]])
          }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    };
    const metrics = countForecastMetrics(forecast);
    expect(metrics.forecastDays).toBe(1);
    expect(metrics.totalOutlooks).toBe(1);
    expect(metrics.totalFeatures).toBe(1);
  });

  test('explicitly excludes custom layers from unsupported severe analytics', () => {
    const forecast = {
      days: {
        1: {
          day: 1,
          metadata: { lowProbabilityOutlooks: [], issueDate: '', validDate: '', issuanceTime: '', createdAt: '', lastModified: '' },
          data: { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() },
          customLayers: {
            schemaVersion: '1.0.0',
            layers: [{
              schemaVersion: '1.0.0', id: 'layer-1', label: 'Fire', order: 0,
              categories: [{ id: 'cat-1', label: 'Elevated', order: 0, style: { fillColor: '#f97316', fillOpacity: .5, strokeColor: '#111827', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' } }],
              features: [{ type: 'Feature', id: 'custom-1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Elevated' } }],
              createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
            }],
          },
        },
      },
      currentDay: 1,
      cycleDate: '2026-07-17',
    } as never;

    expect(countForecastMetrics(forecast)).toEqual({ forecastDays: 0, totalOutlooks: 0, totalFeatures: 0 });
  });
});
