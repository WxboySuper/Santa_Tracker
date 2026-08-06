import {
  validateForecastImport,
  validateImportFileBytes,
  MAX_IMPORT_BYTES,
} from './forecastImportValidation';
import { validateForecastData } from './fileUtils';

const validFeature = () => ({
  type: 'Feature',
  id: 'f1',
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  },
  properties: {},
});

const validSave = () => ({
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-07-20T00:00:00.000Z',
  forecastCycle: {
    days: {
      1: {
        day: 1,
        metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600' },
        data: { tornado: [['30%', [validFeature()]]] },
      },
    },
    currentDay: 1,
    cycleDate: '2026-07-20',
  },
});

const withTornado = (tornado: unknown) => {
  const save = validSave();
  const day = (save.forecastCycle?.days as Record<string, { data: Record<string, unknown> }>)[1];
  day.data.tornado = tornado;
  return save;
};

describe('validateImportFileBytes', () => {
  it('accepts empty and small files', () => {
    expect(validateImportFileBytes(null)).toEqual({ ok: true });
    expect(validateImportFileBytes(undefined)).toEqual({ ok: true });
    expect(validateImportFileBytes(new Uint8Array(10))).toEqual({ ok: true });
  });

  it('rejects files over the byte budget', () => {
    const oversized = new Uint8Array(MAX_IMPORT_BYTES + 1);
    const result = validateImportFileBytes(oversized);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too large/i);
  });

  it('accepts files exactly at the byte budget', () => {
    expect(validateImportFileBytes(new Uint8Array(MAX_IMPORT_BYTES)).ok).toBe(true);
  });
});

describe('validateForecastImport', () => {
  it('accepts a valid forecast-cycle save', () => {
    expect(validateForecastImport(validSave()).ok).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 42, 'text', true]) {
      const result = validateForecastImport(value);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/not a valid object/i);
    }
  });

  it('rejects documents with neither forecastCycle nor outlooks', () => {
    expect(validateForecastImport({ nope: true }).ok).toBe(false);
    expect(validateForecastImport({}).ok).toBe(false);
  });

  it('rejects deep nesting', () => {
    const save = withTornado([]);
    const days = save.forecastCycle?.days as Record<string, { data: Record<string, unknown> }>;
    const day = days[1];
    let deeplyNested: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      deeplyNested = { nested: deeplyNested };
    }
    day.data = deeplyNested;
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/nests too deeply/i);
  });

  it('rejects oversized arrays', () => {
    const save = withTornado([['30%', Array.from({ length: 200000 }, validFeature)]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/excessively large array|too many/i);
  });

  it('rejects excessively long strings', () => {
    const save = validSave();
    (save.forecastCycle as { days: Record<string, { metadata: Record<string, unknown> }> }).days[1].metadata.issueDate = 'x'.repeat(200000);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/excessively long string/i);
  });

  it('rejects unsupported geometry types', () => {
    const save = withTornado([['30%', [{ type: 'Feature', geometry: { type: 'Bogus', coordinates: [] }, properties: {} }]]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported type/i);
  });

  it('rejects invalid geometry types at the top level', () => {
    const save = withTornado([['30%', [{ type: 'Feature', geometry: { type: 42 }, properties: {} }]]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported type/i);
  });

  it('rejects missing geometry coordinates', () => {
    const save = withTornado([['30%', [{ type: 'Feature', geometry: { type: 'Polygon' }, properties: {} }]]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing coordinates/i);
  });

  it('rejects coordinate counts over the geometry budget', () => {
    const ring: number[][] = [];
    for (let i = 0; i < 90000; i++) {
      ring.push([i, i]);
    }
    const save = withTornado([['30%', [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring, ring, ring, ring, ring, ring, ring] }, properties: {} }]]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many coordinates/i);
  });

  it('accepts legacy plain-object outlook maps', () => {
    const save = {
      version: '0.5.0',
      type: 'forecast-cycle',
      timestamp: '2026-07-20T00:00:00.000Z',
      forecastCycle: {
        days: {
          1: {
            day: 1,
            metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600' },
            data: { tornado: { '30%': [validFeature()] } },
          },
        },
        currentDay: 1,
        cycleDate: '2026-07-20',
      },
    };
    expect(validateForecastImport(save).ok).toBe(true);
  });

  it('accepts the legacy single-day outlooks format', () => {
    const save = {
      version: '0.5.0',
      type: 'single-day',
      timestamp: '2026-07-20T00:00:00.000Z',
      outlooks: { tornado: [['30%', [validFeature()]]] },
      mapView: { center: [0, 0], zoom: 4 },
    };
    expect(validateForecastImport(save).ok).toBe(true);
  });

  it('rejects invalid days in the forecast cycle', () => {
    const save = validSave();
    (save.forecastCycle as { days: Record<string, unknown> }).days['99'] = {
      day: 99,
      metadata: {},
      data: { tornado: [] },
    };
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid day/i);
  });

  it('rejects malformed outlook map entries', () => {
    const save = withTornado([['30%', 'not-an-array']]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
  });

  it('rejects features that are not Feature objects', () => {
    const save = withTornado([['30%', [{ type: 'NotFeature', properties: {} }]]]);
    const result = validateForecastImport(save);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Feature/i);
  });
});

describe('validateForecastData compatibility', () => {
  it('returns true for valid saves and workflow wrappers', () => {
    expect(validateForecastData(validSave())).toBe(true);
  });

  it('returns false for invalid inputs', () => {
    expect(validateForecastData(null)).toBe(false);
    expect(validateForecastData({})).toBe(false);
    expect(validateForecastData({ forecastCycle: { days: {} } })).toBe(true);
  });

  it('rejects pathological geometry through the shared validator', () => {
    const save = withTornado([['30%', [{ type: 'Feature', geometry: { type: 'Point', coordinates: [NaN, NaN] }, properties: {} }]]]);
    expect(validateForecastData(save)).toBe(false);
  });
});
