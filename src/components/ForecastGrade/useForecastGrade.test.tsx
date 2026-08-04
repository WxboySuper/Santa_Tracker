import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import verificationReducer from '../../store/verificationSlice';
import stormReportsReducer from '../../store/stormReportsSlice';

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));

jest.mock('../../utils/fileUtils', () => ({
  serializeForecast: jest.fn(() => ({ kind: 'serialized' })),
  deserializeForecast: jest.fn((payload: unknown) => payload),
}));

jest.mock('../../utils/verificationV2/sources', () => ({
  buildGradeCard: jest.fn(),
  loadForecastFromFile: jest.fn(),
  loadReportsForDate: jest.fn(),
  resolveAccountTier: jest.fn(),
  SourceLoadError: class SourceLoadError extends Error {},
  tierHasSnapshots: jest.fn(),
}));

jest.mock('../../utils/verificationV2/gradeHistory', () => ({
  accountScope: jest.fn(),
  loadGradeCards: jest.fn(() => []),
  loadGradeSnapshot: jest.fn(),
  recordGradeResult: jest.fn(() => []),
}));

const mockIsReachedArchiveDate = jest.fn(() => true) as unknown as jest.MockedFunction<
  (reportDate: string, now?: Date) => boolean
>;
const mockRunForecastGrade = jest.fn() as unknown as jest.MockedFunction<
  (input: unknown, onProgress?: unknown) => Promise<unknown>
>;
const mockValidateGradeInputs = jest.fn(() => ({ valid: true as boolean })) as unknown as jest.MockedFunction<
  (input: unknown) => { valid: boolean; reason?: string }
>;

jest.mock('../../utils/verificationV2', () => ({
  FORECAST_GRADE_FORMULA_VERSION: 'gfc-ver-3',
  isReachedArchiveDate: (arg: string) => mockIsReachedArchiveDate(arg),
  runForecastGrade: (input: unknown, onProgress?: unknown) =>
    mockRunForecastGrade(input, onProgress),
  validateGradeInputs: (input: unknown) => mockValidateGradeInputs(input),
  __esModule: true,
}));

import { useAuth } from '../../auth/AuthProvider';
import { useEntitlement } from '../../billing/EntitlementProvider';
import { deserializeForecast, serializeForecast } from '../../utils/fileUtils';
import {
  buildGradeCard,
  loadForecastFromFile,
  loadReportsForDate,
  resolveAccountTier,
  SourceLoadError,
  tierHasSnapshots,
} from '../../utils/verificationV2/sources';
import {
  accountScope,
  loadGradeCards,
  loadGradeSnapshot,
  recordGradeResult,
} from '../../utils/verificationV2/gradeHistory';
import { resolvePackageReportDate, useForecastGrade } from './useForecastGrade';

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseEntitlement = useEntitlement as jest.MockedFunction<typeof useEntitlement>;
const mockResolveAccountTier = resolveAccountTier as jest.MockedFunction<typeof resolveAccountTier>;
const mockAccountScope = accountScope as jest.MockedFunction<typeof accountScope>;
const mockLoadGradeCards = loadGradeCards as jest.MockedFunction<typeof loadGradeCards>;
const mockLoadGradeSnapshot = loadGradeSnapshot as jest.MockedFunction<typeof loadGradeSnapshot>;
const mockRecordGradeResult = recordGradeResult as jest.MockedFunction<typeof recordGradeResult>;
const mockBuildGradeCard = buildGradeCard as jest.MockedFunction<typeof buildGradeCard>;
const mockTierHasSnapshots = tierHasSnapshots as jest.MockedFunction<typeof tierHasSnapshots>;
const mockSerializeForecast = serializeForecast as jest.MockedFunction<typeof serializeForecast>;
const mockDeserializeForecast = deserializeForecast as jest.MockedFunction<typeof deserializeForecast>;
const mockLoadReportsForDate = loadReportsForDate as jest.MockedFunction<typeof loadReportsForDate>;
const mockLoadForecastFromFile = loadForecastFromFile as jest.MockedFunction<typeof loadForecastFromFile>;

const sampleCycle = {
  id: 'cycle-1',
  createdAt: '2026-07-29T00:00:00Z',
  days: {
    1: {
      data: {
        tornado: new Map([['5%', [{ type: 'Feature', id: 't1', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] }, properties: {} }]]]),
        wind: new Map(),
        hail: new Map(),
        categorical: new Map(),
      },
    },
  },
} as never;

const samplePackage = {
  formulaVersion: 'gfc-ver-3',
  grade: 80,
  letter: 'B',
  products: [
    { product: 'tornado', label: 'Tornado', grade: 80, letter: 'B', components: [], applicable: true, reportCount: 0 },
    { product: 'wind', label: 'Wind', grade: null, letter: null, components: [], applicable: false, reportCount: 0 },
    { product: 'hail', label: 'Hail', grade: null, letter: null, components: [], applicable: false, reportCount: 0 },
  ],
  dataQuality: 'Limited',
  dataQualityReason: 'Sparse reports.',
  hasReports: false,
  generatedAt: '2026-07-29T00:00:00Z',
} as never;

const sampleReports = [
  { id: 'r1', time: 0, type: 'tornado', lat: 0, lon: 0, magnitude: 0, source: 'SPC' },
] as never;

const createStore = () =>
  configureStore({
    reducer: {
      verification: verificationReducer,
      stormReports: stormReportsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

const renderGradeHook = (store: ReturnType<typeof createStore>) => {
  const addToast = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const result = renderHook(({ addToast: toast }) => useForecastGrade(toast), {
    initialProps: { addToast },
    wrapper,
  });
  return { addToast, ...result };
};

const renderWithPackage = () => {
  const store = createStore();
  const rendered = renderGradeHook(store);
  act(() => {
    rendered.result.current.setForecastPackage(sampleCycle, 'file', 'forecast.json');
  });
  return { store, ...rendered };
};

const beginInFlightReportLoad = () => {
  let resolveReports: ((value: typeof sampleReports) => void) | null = null;
  mockLoadReportsForDate.mockImplementationOnce(
    () => new Promise<typeof sampleReports>((resolve) => {
      resolveReports = resolve;
    })
  );
  return () => {
    resolveReports?.(sampleReports);
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: null } as never);
  mockUseEntitlement.mockReturnValue({ premiumActive: false } as never);
  mockResolveAccountTier.mockImplementation(
    (isSignedIn, premiumActive) =>
      isSignedIn ? (premiumActive ? 'premium' : 'free') : 'signed-out'
  );
  mockAccountScope.mockImplementation((tier, userId) =>
    tier === 'signed-out' || !userId ? null : `user:${userId}`
  );
  mockLoadGradeCards.mockReturnValue([]);
  mockRecordGradeResult.mockImplementation(({ card }) => [card]);
  mockBuildGradeCard.mockImplementation((pkg, opts) => ({
    id: 'card-1',
    createdAt: pkg.generatedAt,
    reportDate: opts.reportDate,
    formulaVersion: pkg.formulaVersion,
    grade: pkg.grade,
    letter: pkg.letter,
    dataQuality: pkg.dataQuality,
    productGrades: {},
    sourceLabel: opts.sourceLabel,
    hasSnapshot: opts.hasSnapshot,
  }));
  mockTierHasSnapshots.mockImplementation((tier) => tier === 'premium');
  mockIsReachedArchiveDate.mockReturnValue(true);
  mockValidateGradeInputs.mockReturnValue({ valid: true });
  mockRunForecastGrade.mockResolvedValue(samplePackage);
  mockLoadReportsForDate.mockResolvedValue(sampleReports);
  mockLoadForecastFromFile.mockResolvedValue(sampleCycle);
  mockLoadGradeSnapshot.mockReturnValue(null);
  mockSerializeForecast.mockReturnValue({ kind: 'serialized' } as never);
});

describe('useForecastGrade', () => {
  describe('package report date', () => {
    test('prefers the selected outlook valid date over the cycle date', () => {
      const cycle = {
        cycleDate: '2026-07-28',
        days: { 1: { metadata: { validDate: '2026-07-29T12:00:00Z' } } },
      } as never;

      expect(resolvePackageReportDate(cycle, 1)).toBe('2026-07-29');
    });

    test('falls back to the package cycle date when day metadata is absent', () => {
      const cycle = { cycleDate: '2026-07-28', days: {} } as never;

      expect(resolvePackageReportDate(cycle, 1)).toBe('2026-07-28');
    });

    test('falls back when day metadata contains an impossible calendar date', () => {
      const cycle = {
        cycleDate: '2026-07-28',
        days: { 1: { metadata: { validDate: '2026-02-30T12:00:00Z' } } },
      } as never;

      expect(resolvePackageReportDate(cycle, 1)).toBe('2026-07-28');
    });
  });

  describe('tier and entitlements', () => {
    test('signed-out users see signed-out tier and null scope', () => {
      const store = createStore();
      const { result } = renderGradeHook(store);

      expect(result.current.tier).toBe('signed-out');
      expect(result.current.cards).toEqual([]);
    });

    test('signed-in free users resolve to the free tier with a per-user scope', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as never);
      const store = createStore();
      const { result } = renderGradeHook(store);

      expect(result.current.tier).toBe('free');
    });

    test('signed-in premium users resolve to the premium tier', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as never);
      mockUseEntitlement.mockReturnValue({ premiumActive: true } as never);
      const store = createStore();
      const { result } = renderGradeHook(store);

      expect(result.current.tier).toBe('premium');
    });
  });

  describe('canRun gating', () => {
    test('canRun is false when no forecast is loaded', () => {
      const store = createStore();
      const { result } = renderGradeHook(store);

      expect(result.current.canRun).toBe(false);
    });

    test('canRun is true with a forecast and useToday on', () => {
      const { result } = renderWithPackage();

      expect(result.current.canRun).toBe(true);
    });

    test('canRun is false with an empty report date and useToday off', () => {
      mockIsReachedArchiveDate.mockReturnValue(false);
      const { result } = renderWithPackage();

      act(() => {
        result.current.setUseToday(false);
        result.current.setReportDate('   ');
      });

      expect(result.current.canRun).toBe(false);
    });

    test('canRun is false when the report date is in the future', () => {
      mockIsReachedArchiveDate.mockReturnValue(false);
      const { result } = renderWithPackage();

      act(() => {
        result.current.setUseToday(false);
        result.current.setReportDate('2099-01-01');
      });

      expect(result.current.canRun).toBe(false);
    });

    test('canRun is true when the report date is a reached calendar date', () => {
      mockIsReachedArchiveDate.mockReturnValue(true);
      const { result } = renderWithPackage();

      act(() => {
        result.current.setUseToday(false);
        result.current.setReportDate('2026-07-28');
      });

      expect(result.current.canRun).toBe(true);
    });
  });

  test('defaults a loaded package to its documented outlook date', () => {
    const datedCycle = {
      cycleDate: '2026-07-27',
      days: {
        1: {
          data: { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() },
          metadata: { validDate: '2026-07-28T12:00:00Z' },
        },
      },
    } as never;
    const { result } = renderGradeHook(createStore());

    act(() => {
      result.current.setForecastPackage(datedCycle, 'file', 'forecast.json');
    });

    expect(result.current.reportDate).toBe('2026-07-28');
    expect(result.current.useToday).toBe(false);
  });

  describe('run validation', () => {
    test('refuses to run with no forecast and emits an error toast', async () => {
      const { result, addToast } = renderGradeHook(createStore());

      await act(async () => {
        await result.current.run();
      });

      expect(addToast).toHaveBeenCalledWith('Load a forecast package first.', 'error');
      expect(result.current.phase).toBe('idle');
      expect(mockLoadReportsForDate).not.toHaveBeenCalled();
    });

    test('refuses to run with a future date and emits an error toast', async () => {
      mockIsReachedArchiveDate.mockReturnValue(false);
      const { result, addToast } = renderWithPackage();

      act(() => {
        result.current.setUseToday(false);
        result.current.setReportDate('2099-01-01');
      });

      await act(async () => {
        await result.current.run();
      });

      expect(addToast).toHaveBeenCalledWith(
        'Choose a real, reached report date before grading.',
        'error'
      );
      expect(result.current.phase).toBe('idle');
      expect(result.current.error).toBe('Choose a real, reached report date before grading.');
      expect(mockLoadReportsForDate).not.toHaveBeenCalled();
    });
  });

  describe('report load failures', () => {
    test('surfaces a SourceLoadError and returns to idle', async () => {
      mockLoadReportsForDate.mockRejectedValueOnce(new SourceLoadError('SPC outage'));
      const { result, addToast } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      expect(addToast).toHaveBeenCalledWith('SPC outage', 'error');
      expect(result.current.phase).toBe('idle');
      expect(result.current.error).toBe('SPC outage');
      expect(result.current.progress).toBeNull();
    });

    test('surfaces a non-SourceLoadError with a friendly fallback message', async () => {
      mockLoadReportsForDate.mockRejectedValueOnce(new Error('network'));
      const { result, addToast } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      expect(addToast).toHaveBeenCalledWith('Reports could not be loaded.', 'error');
      expect(result.current.phase).toBe('idle');
    });
  });

  describe('validation and completed runs', () => {
    test('surfaces validation failures and returns to idle', async () => {
      mockValidateGradeInputs.mockReturnValueOnce({
        valid: false,
        reason: 'No geometry.',
      } as ReturnType<typeof mockValidateGradeInputs>);
      const { result, addToast } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      expect(addToast).toHaveBeenCalledWith('No geometry.', 'error');
      expect(result.current.phase).toBe('idle');
      expect(result.current.error).toBe('No geometry.');
      expect(mockRunForecastGrade).not.toHaveBeenCalled();
    });

    test('completes a run, sets result, and records a card for signed-in scopes', async () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as never);
      const { result, addToast, store } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      await waitFor(() => expect(result.current.phase).toBe('complete'));
      expect(result.current.result).toEqual(samplePackage);
      expect(result.current.activeProduct).toBe('tornado');
      expect(mockBuildGradeCard).toHaveBeenCalledWith(
        samplePackage,
        expect.objectContaining({ hasSnapshot: false, sourceLabel: 'forecast.json' })
      );
      expect(mockRecordGradeResult).toHaveBeenCalled();
      const state = store.getState();
      expect(state.stormReports.reports).toEqual(sampleReports);
      expect(state.stormReports.date).toBe('today');
      expect(addToast).not.toHaveBeenCalledWith(expect.stringMatching(/error/i), 'error');
    });

    test('premium runs store a snapshot in addition to the card', async () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as never);
      mockUseEntitlement.mockReturnValue({ premiumActive: true } as never);
      const { result } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      await waitFor(() => expect(result.current.phase).toBe('complete'));
      expect(mockSerializeForecast).toHaveBeenCalledWith(
        sampleCycle,
        expect.objectContaining({ center: [-98, 39], zoom: 4 })
      );
      expect(mockRecordGradeResult).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            package: samplePackage,
            forecast: { kind: 'serialized' },
          }),
        })
      );
    });

    test('silent serialize failures skip the snapshot but still record the card', async () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as never);
      mockUseEntitlement.mockReturnValue({ premiumActive: true } as never);
      mockSerializeForecast.mockImplementationOnce(() => {
        throw new Error('serialize failed');
      });
      const { result } = renderWithPackage();

      await act(async () => {
        await result.current.run();
      });

      await waitFor(() => expect(result.current.phase).toBe('complete'));
      expect(mockRecordGradeResult).toHaveBeenCalledWith(
        expect.objectContaining({ snapshot: undefined })
      );
    });

    test('run uses the selected day outlooks and dispatches the report date', async () => {
      const { result, store } = renderWithPackage();

      act(() => {
        result.current.setUseToday(false);
        result.current.setReportDate('2026-07-28');
      });

      await act(async () => {
        await result.current.run();
      });

      expect(mockLoadReportsForDate).toHaveBeenCalledWith('2026-07-28');
      expect(store.getState().stormReports.date).toBe('2026-07-28');
    });
  });

  describe('reset and stale-run guards', () => {
    test('reset clears local state and dispatches redux clear actions', () => {
      const { result, store } = renderWithPackage();

      act(() => {
        result.current.reset();
      });

      expect(result.current.forecast).toBeNull();
      expect(result.current.phase).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(store.getState().verification.loadedForecast).toBeNull();
      expect(store.getState().stormReports.reports).toEqual([]);
    });

    test('reset during an in-flight report load ignores the late completion', async () => {
      const resolveLoad = beginInFlightReportLoad();
      const { result, store } = renderWithPackage();

      let runPromise: Promise<void> | undefined;
      act(() => {
        runPromise = result.current.run();
      });

      act(() => {
        result.current.reset();
      });

      await act(async () => {
        resolveLoad();
        await runPromise;
      });

      expect(result.current.phase).toBe('idle');
      expect(result.current.reports).toEqual([]);
      expect(result.current.result).toBeNull();
      expect(store.getState().stormReports.reports).toEqual([]);
    });

    test('replacing the forecast package during an in-flight run ignores the late completion', async () => {
      const resolveLoad = beginInFlightReportLoad();
      const { result } = renderWithPackage();

      let runPromise: Promise<void> | undefined;
      act(() => {
        runPromise = result.current.run();
      });

      const secondCycle = { ...(sampleCycle as Record<string, unknown>), id: 'cycle-2' } as never;
      act(() => {
        result.current.setForecastPackage(secondCycle, 'cloud', 'cloud-cycle');
      });

      await act(async () => {
        resolveLoad();
        await runPromise;
      });

      expect(result.current.phase).toBe('idle');
      expect(result.current.result).toBeNull();
      expect(result.current.forecast).toEqual(secondCycle);
    });

    test('applyGradeSnapshot during an in-flight run ignores the late completion', async () => {
      const resolveLoad = beginInFlightReportLoad();
      const { result } = renderWithPackage();

      let runPromise: Promise<void> | undefined;
      act(() => {
        runPromise = result.current.run();
      });

      const snapshot = {
        card: { id: 'card-snap', sourceLabel: 'Cloud snapshot' },
        package: samplePackage,
        forecast: { kind: 'serialized-snap' },
        reportDate: '2026-07-28',
      } as never;
      act(() => {
        result.current.applyGradeSnapshot(snapshot);
      });

      await act(async () => {
        resolveLoad();
        await runPromise;
      });

      expect(result.current.phase).toBe('complete');
      expect(result.current.result).not.toBeNull();
    });

    test('run during an in-flight applyGradeSnapshot ignores the late report load', async () => {
      let resolveReports: ((value: typeof sampleReports) => void) | null = null;
      mockLoadReportsForDate.mockImplementationOnce(
        () => new Promise<typeof sampleReports>((resolve) => {
          resolveReports = resolve;
        })
      );
      // Make the snapshot deserialize to a real cycle so run() can read forecast.days.
      mockDeserializeForecast.mockReturnValueOnce(sampleCycle);
      const { result, store } = renderWithPackage();

      const snapshot = {
        card: { id: 'card-snap', sourceLabel: 'Cloud snapshot' },
        package: samplePackage,
        forecast: { kind: 'serialized-snap' },
        reportDate: '2026-07-28',
      } as never;
      act(() => {
        result.current.applyGradeSnapshot(snapshot);
      });

      const reportsBeforeRun = store.getState().stormReports.reports;
      expect(result.current.reports).toEqual(reportsBeforeRun);

      let runPromise: Promise<void> | undefined;
      act(() => {
        runPromise = result.current.run();
      });

      await act(async () => {
        resolveReports?.(sampleReports);
        await runPromise;
      });

      expect(result.current.reports).toEqual(sampleReports);
    });
  });

  describe('restoreCard', () => {
    test('returns the stored snapshot for premium cards', () => {
      const stored = { id: 'snap-1' } as never;
      mockLoadGradeSnapshot.mockReturnValueOnce(stored);
      const store = createStore();
      const { result } = renderGradeHook(store);

      const card = { id: 'card-1' } as never;
      const snapshot = result.current.restoreCard(card);

      expect(snapshot).toBe(stored);
      expect(mockLoadGradeSnapshot).toHaveBeenCalledWith({
        scope: null,
        cardId: 'card-1',
      });
    });

    test('toasts and returns null when no snapshot is stored', () => {
      mockLoadGradeSnapshot.mockReturnValueOnce(null);
      const store = createStore();
      const { result, addToast } = renderGradeHook(store);

      const card = { id: 'card-2' } as never;
      const snapshot = result.current.restoreCard(card);

      expect(snapshot).toBeNull();
      expect(addToast).toHaveBeenCalledWith(
        'This grade card is trend-only and cannot reopen a full package.',
        'info'
      );
    });
  });

  describe('loadFromFile', () => {
    test('loads a file successfully and surfaces a success toast', async () => {
      const store = createStore();
      const { result, addToast } = renderGradeHook(store);

      await act(async () => {
        await result.current.loadFromFile({ name: 'forecast.json' } as never);
      });

      expect(result.current.forecast).toEqual(sampleCycle);
      expect(result.current.packageSource).toBe('file');
      expect(addToast).toHaveBeenCalledWith(
        'Forecast package loaded. Its outlook date is ready for grading.',
        'success'
      );
    });

    test('surfaces a SourceLoadError and a friendly toast on failure', async () => {
      mockLoadForecastFromFile.mockRejectedValueOnce(new SourceLoadError('Bad file.'));
      const store = createStore();
      const { result, addToast } = renderGradeHook(store);

      await act(async () => {
        await result.current.loadFromFile({ name: 'broken.json' } as never);
      });

      expect(addToast).toHaveBeenCalledWith('Bad file.', 'error');
      expect(result.current.error).toBe('Bad file.');
    });

    test('surfaces a friendly fallback for non-SourceLoadError failures', async () => {
      mockLoadForecastFromFile.mockRejectedValueOnce(new Error('read fail'));
      const store = createStore();
      const { result, addToast } = renderGradeHook(store);

      await act(async () => {
        await result.current.loadFromFile({ name: 'broken.json' } as never);
      });

      expect(addToast).toHaveBeenCalledWith('Failed to load that file.', 'error');
    });
  });
});
