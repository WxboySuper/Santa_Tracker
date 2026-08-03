import { addCustomLayer } from '../store/forecastSlice';
import forecastReducer from '../store/forecastSlice';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import { asCustomLayerId } from '../lib/customProducts';
import { deserializeForecast, serializeForecast } from './fileUtils';

test('signed-out JSON persistence round-trips self-contained custom layer appearance', () => {
  const category = { id: 'cat-1' as never, label: 'Heavy snow', order: 0, style: { fillColor: '#3b82f6', fillOpacity: .45, strokeColor: '#ffffff', strokeOpacity: .9, strokeWidth: 3, hatch: 'diagonal' as const } };
  const state = forecastReducer(undefined, addCustomLayer({
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    id: asCustomLayerId('snow'), label: 'Snow bands', order: 0, categories: [category], features: [],
    createdAt: '2026-07-17T12:00:00.000Z', updatedAt: '2026-07-17T12:00:00.000Z',
  }));
  const saved = serializeForecast(state.forecastCycle, { center: [40, -97], zoom: 5 });
  const restored = deserializeForecast(JSON.parse(JSON.stringify(saved)));
  expect(restored.days[1]?.customLayers?.layers[0].categories[0]).toEqual(category);
});
