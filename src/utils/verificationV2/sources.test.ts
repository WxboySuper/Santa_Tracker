import {
  availablePackageSources,
  loadForecastFromCloud,
  loadForecastFromFile,
  loadReportsForDate,
  resolveAccountTier,
  SourceLoadError,
  tierHasHistory,
  tierHasSnapshots,
  toArchiveDate,
} from './sources';
import { loadCloudCycle } from '../../lib/cloudCyclesService';
import { serializeForecast } from '../fileUtils';
import type { CloudCycle, CloudOperationResult } from '../../types/cloudCycles';

jest.mock('../../lib/cloudCyclesService', () => ({
  loadCloudCycle: jest.fn(),
}));

const mockedLoadCloudCycle = loadCloudCycle as jest.MockedFunction<typeof loadCloudCycle>;

describe('account tiers and sources', () => {
  test('resolves tier from auth + entitlement', () => {
    expect(resolveAccountTier(false, false)).toBe('signed-out');
    expect(resolveAccountTier(true, false)).toBe('free');
    expect(resolveAccountTier(true, true)).toBe('premium');
  });

  test('only premium gets the cloud package source', () => {
    expect(availablePackageSources('signed-out')).toEqual(['file']);
    expect(availablePackageSources('free')).toEqual(['file']);
    expect(availablePackageSources('premium')).toEqual(['file', 'cloud']);
  });

  test('converts ISO date input to SPC archive YYMMDD', () => {
    expect(toArchiveDate('2024-05-06')).toBe('240506');
    expect(toArchiveDate('240506')).toBe('240506');
    expect(toArchiveDate('2024-99-99')).toBeNull();
    expect(toArchiveDate('2024-5-6')).toBeNull();
  });

  test('history and snapshot capability by tier', () => {
    expect(tierHasHistory('signed-out')).toBe(false);
    expect(tierHasHistory('free')).toBe(true);
    expect(tierHasSnapshots('free')).toBe(false);
    expect(tierHasSnapshots('premium')).toBe(true);
  });
});

describe('source loaders', () => {
  const originalFetch = global.fetch;

  const mockFetch = (body: string, ok = true, statusText = 'OK'): void => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      statusText,
      text: () => Promise.resolve(body),
    }) as unknown as typeof global.fetch;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    mockedLoadCloudCycle.mockReset();
  });

  describe('loadReportsForDate', () => {
    test('fetches archived SPC reports for a valid ISO date', async () => {
      mockFetch('');
      const reports = await loadReportsForDate('2024-05-06');
      expect(reports).toEqual([]);
      expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/240506_rpts_raw.csv');
    });

    test('routes null to today\'s SPC reports feed', async () => {
      mockFetch('');
      const reports = await loadReportsForDate(null);
      expect(reports).toEqual([]);
      expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/today.csv');
    });

    const reportFeedCases: { label: string; date: () => string; url: string }[] = [
      {
        label: 'the current calendar day (ISO)',
        date: () => {
          const now = new Date();
          return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
          ].join('-');
        },
        url: 'https://www.spc.noaa.gov/climo/reports/today.csv',
      },
      {
        label: 'the current calendar day (YYMMDD)',
        date: () => {
          const now = new Date();
          return [
            String(now.getFullYear()).slice(-2),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
          ].join('');
        },
        url: 'https://www.spc.noaa.gov/climo/reports/today.csv',
      },
      {
        label: 'the previous calendar day (ISO)',
        date: () => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return [
            yesterday.getFullYear(),
            String(yesterday.getMonth() + 1).padStart(2, '0'),
            String(yesterday.getDate()).padStart(2, '0'),
          ].join('-');
        },
        url: 'https://www.spc.noaa.gov/climo/reports/yesterday.csv',
      },
      {
        label: 'the previous calendar day (YYMMDD)',
        date: () => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return [
            String(yesterday.getFullYear()).slice(-2),
            String(yesterday.getMonth() + 1).padStart(2, '0'),
            String(yesterday.getDate()).padStart(2, '0'),
          ].join('');
        },
        url: 'https://www.spc.noaa.gov/climo/reports/yesterday.csv',
      },
    ];

    test.each(reportFeedCases)(
      'routes a date matching $label to the matching SPC reports feed',
      async ({ date, url }) => {
        mockFetch('');
        const reports = await loadReportsForDate(date());
        expect(reports).toEqual([]);
        expect(global.fetch).toHaveBeenCalledWith(url);
      }
    );

    test('keeps archived dates on the dated archive feed', async () => {
      const now = new Date();
      const past = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const iso = [
        past.getFullYear(),
        String(past.getMonth() + 1).padStart(2, '0'),
        String(past.getDate()).padStart(2, '0'),
      ].join('-');

      mockFetch('');
      const reports = await loadReportsForDate(iso);
      expect(reports).toEqual([]);
      const archiveDate = iso.slice(2).replace(/-/g, '');
      expect(global.fetch).toHaveBeenCalledWith(
        `https://www.spc.noaa.gov/climo/reports/${archiveDate}_rpts_raw.csv`
      );
    });

    test('treats blank strings as invalid dates, not as today', async () => {
      await expect(loadReportsForDate('')).rejects.toBeInstanceOf(SourceLoadError);
      await expect(loadReportsForDate('not-a-date')).rejects.toBeInstanceOf(SourceLoadError);
      await expect(loadReportsForDate('2024-99-99')).rejects.toBeInstanceOf(SourceLoadError);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('wraps fetch failures as SourceLoadError', async () => {
      mockFetch('', false, 'Server Error');
      await expect(loadReportsForDate('2024-05-06')).rejects.toBeInstanceOf(SourceLoadError);
    });
  });

  describe('loadForecastFromFile', () => {
    const fileFor = (contents: unknown): File => {
      const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
      const bytes = new TextEncoder().encode(text);
      const fileLike = Object.assign(bytes, {
        name: 'forecast.json',
        type: 'application/json',
        arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
      });
      return fileLike as unknown as File;
    };

    const validPayload = serializeForecast(
      { days: {}, currentDay: 1, cycleDate: '2026-05-01' },
      { center: [0, 0], zoom: 0 }
    );

    test('returns a ForecastCycle for a valid uploaded file', async () => {
      const cycle = await loadForecastFromFile(fileFor(validPayload));
      expect(cycle.cycleDate).toBe('2026-05-01');
    });

    test('throws SourceLoadError for malformed file data', async () => {
      await expect(loadForecastFromFile(fileFor('{not-json'))).rejects.toBeInstanceOf(SourceLoadError);
    });

    test('throws SourceLoadError when the JSON does not pass validation', async () => {
      await expect(loadForecastFromFile(fileFor({}))).rejects.toBeInstanceOf(SourceLoadError);
    });
  });

  describe('loadForecastFromCloud', () => {
    const cloudPayload = serializeForecast(
      { days: {}, currentDay: 1, cycleDate: '2026-05-01' },
      { center: [0, 0], zoom: 0 }
    );

    const cloudCycle = (overrides: Partial<CloudCycle> = {}): CloudCycle => ({
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Today',
      cycleDate: '2026-05-01',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      forecastDays: 1,
      totalOutlooks: 0,
      totalFeatures: 0,
      isReadOnly: false,
      payload: cloudPayload,
      ...overrides,
    });

    test('loads and deserializes a premium cloud cycle', async () => {
      mockedLoadCloudCycle.mockResolvedValue({
        success: true,
        data: cloudCycle(),
      } as CloudOperationResult<CloudCycle>);

      const cycle = await loadForecastFromCloud({ userId: 'user-1', cycleId: 'cycle-1' });
      expect(cycle.cycleDate).toBe('2026-05-01');
      expect(mockedLoadCloudCycle).toHaveBeenCalledWith({ userId: 'user-1', cycleId: 'cycle-1' });
    });

    test('throws SourceLoadError when the cloud cycle lookup fails', async () => {
      mockedLoadCloudCycle.mockResolvedValue({
        success: false,
        error: 'Cloud cycle not found',
      });

      await expect(
        loadForecastFromCloud({ userId: 'user-1', cycleId: 'missing' })
      ).rejects.toBeInstanceOf(SourceLoadError);
    });
  });
});
