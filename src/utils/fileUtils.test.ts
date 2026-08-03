import JSZip from 'jszip';
import { serializeForecast, deserializeForecast, readForecastImportFile, validateForecastData } from './fileUtils';
import { buildWorkflowExportPackage } from './workflowPackage';

describe('fileUtils', () => {
  type ForecastCycle = {
    days: Record<number, {
      day: number;
      metadata: Record<string, unknown>;
      data: { categorical: Map<string, unknown[]> };
    }>;
    currentDay: number;
    cycleDate: string;
    discussionGroupings?: { id: string; label: string; days: number[]; discussionDay: number }[];
  };

  test('validateForecastData returns false for invalid input', () => {
    expect(validateForecastData(null)).toBe(false);
    expect(validateForecastData({})).toBe(false);
  });

  test('serialize/deserialize round-trip preserves map types', () => {
    const cycle: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt:'', lastModified:'', lowProbabilityOutlooks:[] },
          data: { categorical: new Map([['TSTM', []]]) }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    };
    const ser = serializeForecast(cycle, { center: [0,0], zoom:0 });
    expect(ser.forecastCycle).toBeDefined();
    expect(validateForecastData(ser)).toBe(true);
    const des = deserializeForecast(ser);
    expect(des.days[1].data.categorical instanceof Map).toBe(true);
  });

  test('validates and deserializes a workflow package wrapper', () => {
    const serialized = serializeForecast({
      days: {}, currentDay: 1, cycleDate: '2026-04-21',
    }, { center: [0, 0], zoom: 0 });
    const wrapper = buildWorkflowExportPackage({ scope: 'cycle', forecast: serialized });
    expect(validateForecastData(wrapper)).toBe(true);
    expect(deserializeForecast(wrapper).cycleDate).toBe('2026-04-21');
  });

  test('reads the workflow manifest from an exported ZIP package', async () => {
    const manifest = { packageType: 'workflow', schemaVersion: '1.0.0', exportedAt: '2026-07-17T00:00:00.000Z', forecast: { forecastCycle: {} } };
    const zip = new JSZip();
    zip.file('forecast_cycle.json', JSON.stringify({ fallback: true }));
    zip.file('workflow_package.json', JSON.stringify(manifest));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = Object.assign(bytes, { name: 'workflow.zip', type: 'application/zip' }) as unknown as File;

    await expect(readForecastImportFile(file)).resolves.toEqual(manifest);
  });

  test('serialize/deserialize preserves discussion scopes without changing day data', () => {
    const grouping = { id: 'custom-all', label: 'All outlooks', days: [1, 2], discussionDay: 1 };
    const cycle: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt: '', lastModified: '', lowProbabilityOutlooks: [] },
          data: { categorical: new Map() },
        },
      },
      currentDay: 1,
      cycleDate: '2026-04-21',
      discussionGroupings: [grouping],
    };

    const restored = deserializeForecast(serializeForecast(cycle, { center: [0, 0], zoom: 0 }));
    expect(restored.discussionGroupings).toEqual([grouping]);
    expect(restored.days[1]?.discussion).toBeUndefined();
  });

  test('serialize/deserialize preserves completion acknowledgement metadata', () => {
    const cycle: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-21',
            issuanceTime: '0600',
            createdAt: '2026-04-21T12:00:00.000Z',
            lastModified: '2026-04-21T12:00:00.000Z',
            lowProbabilityOutlooks: [],
          },
          data: { categorical: new Map([['TSTM', []]]) },
        },
      },
      currentDay: 1,
      cycleDate: '2026-04-21',
      completionAcknowledgedAt: '2026-04-21T15:00:00.000Z',
      omittedDayReasons: { 3: 'No severe weather expected' },
    };

    const serialized = serializeForecast(cycle, { center: [0, 0], zoom: 0 });
    expect(serialized.forecastCycle?.completionAcknowledgedAt).toBe('2026-04-21T15:00:00.000Z');
    expect(serialized.forecastCycle?.omittedDayReasons).toEqual({ 3: 'No severe weather expected' });

    const deserialized = deserializeForecast(serialized);
    expect(deserialized.completionAcknowledgedAt).toBe('2026-04-21T15:00:00.000Z');
    expect(deserialized.omittedDayReasons).toEqual({ 3: 'No severe weather expected' });
  });

  test('serializeForecast handles non-Map data without throwing', () => {
    const corruptedCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt:'', lastModified:'', lowProbabilityOutlooks:[] },
          data: { categorical: {} }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    } as unknown as ForecastCycle;

    let ser: ReturnType<typeof serializeForecast>;
    expect(() => { ser = serializeForecast(corruptedCycle, { center: [0,0], zoom: 0 }); }).not.toThrow();
    expect(ser?.forecastCycle?.days?.[1]?.data?.categorical).toEqual([]);
  });

  test('deserializeForecast handles non-Array data without throwing', () => {
    const corruptedData = {
      version: '0.5.0',
      type: 'forecast-cycle',
      timestamp: '2026-05-26',
      forecastCycle: {
        days: {
          1: {
            day: 1,
            metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', lowProbabilityOutlooks:[] },
            data: { tornado: 'not-an-array' }
          }
        },
        currentDay: 1,
        cycleDate: '2026-05-26'
      },
      mapView: { center: [0,0], zoom: 4 }
    };

    expect(() => deserializeForecast(corruptedData as never)).not.toThrow();
    const result = deserializeForecast(corruptedData as never);
    expect(result.days[1]?.data.tornado instanceof Map).toBe(true);
  });
});
