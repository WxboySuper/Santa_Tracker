type SavedCycle = {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle?: unknown;
  forecastData?: unknown;
  stats: unknown;
};

type StoreLike = {
  subscribe: (cb: () => void) => () => void;
  getState: () => { forecast: { savedCycles: SavedCycle[] } };
};

describe('cycleHistoryPersistence', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('saveCycleHistoryToStorage and loadCycleHistoryFromStorage roundtrip persisted shape', async () => {
    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
      deserializeForecast: jest.fn(() => ({ restored: true })),
    }));

    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ total: 1 })),
    }));

    const mod = await import('./cycleHistoryPersistence');
    const savedCycle: SavedCycle = {
      id: '1',
      timestamp: 'ts',
      cycleDate: '2026-04-22',
      label: 'L',
      forecastCycle: { some: 'fc' },
      stats: { total: 1 },
    };

    expect(() => mod.saveCycleHistoryToStorage([savedCycle])).not.toThrow();

    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('1');
    expect(loaded[0].forecastCycle).toEqual({ restored: true });

    const fileUtils = await import('./fileUtils');
    expect(fileUtils.serializeForecast).toHaveBeenCalled();
    expect(fileUtils.deserializeForecast).toHaveBeenCalled();
  });

  test('GFC-WEB-7: legacy saved cycles with plain-object outlook maps normalize on load', async () => {
    const legacy = [{
      id: 'legacy-plain-maps',
      timestamp: '2026-03-01T00:00:00.000Z',
      cycleDate: '2026-03-01',
      label: 'Legacy',
      forecastCycle: {
        currentDay: 1,
        cycleDate: '2026-03-01',
        days: {
          1: {
            day: 1,
            metadata: {
              issueDate: '2026-03-01',
              validDate: '2026-03-01',
              issuanceTime: '0600',
              lowProbabilityOutlooks: [],
            },
            data: {
              tornado: {},
              wind: {
                '30%': [{
                  type: 'Feature',
                  id: 'legacy-wind',
                  properties: {},
                  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                }],
              },
              hail: {},
              categorical: {},
            },
          },
        },
      },
      stats: {},
    }];

    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = await import('./cycleHistoryPersistence');
    const loaded = mod.loadCycleHistoryFromStorage();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].forecastCycle.days[1]?.data.tornado).toBeUndefined();
    expect(loaded[0].forecastCycle.days[1]?.data.wind).toBeInstanceOf(Map);
    expect(loaded[0].forecastCycle.days[1]?.data.wind?.get('30%')).toHaveLength(1);
  });

  test('loadCycleHistoryFromStorage handles legacy format and computes stats when missing', async () => {
    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ computed: 42 })),
    }));

    const legacy: SavedCycle[] = [{
      id: 'legacy',
      timestamp: 't2',
      cycleDate: 'd2',
      label: 'L2',
      forecastCycle: { foo: 'bar' },
      stats: {}
    }];

    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = await import('./cycleHistoryPersistence');
    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('legacy');
    expect(loaded[0].forecastCycle).toEqual({ foo: 'bar' });
    expect(loaded[0].stats).toEqual({});
  });

  test('migrates legacy cycle history into a signed-in scope without overwriting account history', async () => {
    const mod = await import('./cycleHistoryPersistence');
    localStorage.setItem('gfc-cycle-history', JSON.stringify([{ id: 'legacy' }]));

    mod.migrateLegacyCycleHistory('user-1');

    expect(localStorage.getItem('gfc-cycle-history')).toBe(JSON.stringify([{ id: 'legacy' }]));
    expect(localStorage.getItem('gfc-cycle-history:user-user-1')).toBe(JSON.stringify([{ id: 'legacy' }]));

    localStorage.setItem('gfc-cycle-history', JSON.stringify([{ id: 'new-legacy' }]));
    mod.migrateLegacyCycleHistory('user-1');
    expect(localStorage.getItem('gfc-cycle-history')).toBe(JSON.stringify([{ id: 'new-legacy' }]));
    expect(localStorage.getItem('gfc-cycle-history:user-user-1')).toBe(JSON.stringify([{ id: 'new-legacy' }]));
  });

  test('does not import legacy cycle history into a different signed-in account', async () => {
    const mod = await import('./cycleHistoryPersistence');
    localStorage.setItem('gfc-cycle-history', JSON.stringify([{ id: 'legacy' }]));

    mod.migrateLegacyCycleHistory('user-1');
    expect(localStorage.getItem('gfc-cycle-history:user-user-1')).toBe(JSON.stringify([{ id: 'legacy' }]));
    expect(localStorage.getItem('gfc-cycle-history-claim')).toBe('user-1');

    localStorage.removeItem('gfc-cycle-history:user-user-2');
    mod.migrateLegacyCycleHistory('user-2');
    expect(localStorage.getItem('gfc-cycle-history:user-user-2')).toBeNull();
    expect(mod.loadCycleHistoryFromStorage('user-2')).toEqual([]);
    expect(localStorage.getItem('gfc-cycle-history')).toBe(JSON.stringify([{ id: 'legacy' }]));
  });

  test('falls back to usable legacy history when signed-in scope is empty or unusable', async () => {
    jest.doMock('./outlookMapCoercion', () => ({ normalizeForecastCycle: (cycle: unknown) => cycle }));
    const mod = await import('./cycleHistoryPersistence');
    const legacy = [{ id: 'legacy', timestamp: 't1', cycleDate: 'd1', forecastCycle: {} }];
    localStorage.setItem('gfc-cycle-history:user-user-1', JSON.stringify({ invalid: true }));
    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    mod.migrateLegacyCycleHistory('user-1');
    const loaded = mod.loadCycleHistoryFromStorage('user-1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('legacy');
    expect(localStorage.getItem('gfc-cycle-history:user-user-1')).toBe(JSON.stringify(legacy));
    expect(localStorage.getItem('gfc-cycle-history')).toBe(JSON.stringify(legacy));
  });

  test('loadCycleHistoryFromStorage returns empty on invalid stored data', async () => {
    localStorage.setItem('gfc-cycle-history', JSON.stringify({ not: 'an array' }));
    const mod = await import('./cycleHistoryPersistence');
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);

    localStorage.setItem('gfc-cycle-history', JSON.stringify([null, 5, {}]));
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('saveCycleHistoryToStorage swallows localStorage errors', async () => {
    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
    }));

    const mod = await import('./cycleHistoryPersistence');

    const originalStorage = globalThis.localStorage;
    const throwingStorage = {
      ...originalStorage,
      setItem: jest.fn(() => {
        throw new Error('boom');
      }),
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { value: throwingStorage, configurable: true });

    expect(() => mod.saveCycleHistoryToStorage([{
      id: 'x', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {}
    }])).not.toThrow();

    Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
  });

  test('setupCycleHistoryListener persists on store updates', async () => {
    const mod = await import('./cycleHistoryPersistence');
    const spy = jest.spyOn(Storage.prototype, 'setItem');

    const listeners: Array<() => void> = [];
    let state = { forecast: { savedCycles: [] as SavedCycle[] } };
    const store: StoreLike = {
      subscribe: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      getState: () => state,
    };

    const unsubscribe = mod.setupCycleHistoryListener(store as never);
    expect(listeners).toHaveLength(1);
    unsubscribe();
    expect(listeners).toHaveLength(0);

    mod.setupCycleHistoryListener(store as never);

    state = { forecast: { savedCycles: [{ id: 'a', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }] } };
    listeners.forEach((cb) => cb());
    expect(spy).toHaveBeenCalledWith(
      'gfc-cycle-history',
      expect.any(String),
    );
    const stored = JSON.parse(spy.mock.calls[0][1] as string);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'a', timestamp: 't', cycleDate: 'd', stats: {} });
    expect(stored[0]).toHaveProperty('forecastData');

    spy.mockClear();
    listeners.forEach((cb) => cb());
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test('account rollover cleanup prevents the old listener from persisting the hydration clear', async () => {
    const mod = await import('./cycleHistoryPersistence');
    const oldCycle: SavedCycle = { id: 'old', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} };
    const listeners: Array<() => void> = [];
    let state = { forecast: { savedCycles: [oldCycle] } };
    const store: StoreLike = {
      subscribe: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      getState: () => state,
    };

    const oldScopeKey = mod.getCycleHistoryStorageKey('old-user');
    const existingHistory = JSON.stringify([{ id: 'persisted-old-history' }]);
    localStorage.setItem(oldScopeKey, existingHistory);
    const oldScopeCleanup = mod.setupCycleHistoryListener(store as never, 'old-user');
    state = { forecast: { savedCycles: [] } };
    oldScopeCleanup();
    listeners.forEach((listener) => listener());

    expect(localStorage.getItem(oldScopeKey)).toBe(existingHistory);
  });

  test('account switch preserves non-empty target history when listener starts after hydration', async () => {
    const mod = await import('./cycleHistoryPersistence');
    const oldCycle: SavedCycle = { id: 'old', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} };
    const targetCycle: SavedCycle = { id: 'target', timestamp: 't2', cycleDate: 'd2', forecastCycle: {}, stats: {} };
    const listeners: Array<() => void> = [];
    let state = { forecast: { savedCycles: [oldCycle] } };
    const store: StoreLike = {
      subscribe: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      getState: () => state,
    };

    const targetKey = mod.getCycleHistoryStorageKey('target-user');
    const targetHistory = JSON.stringify([{
      id: targetCycle.id,
      timestamp: targetCycle.timestamp,
      cycleDate: targetCycle.cycleDate,
      forecastCycle: targetCycle.forecastCycle,
      stats: targetCycle.stats,
    }]);
    localStorage.setItem(targetKey, targetHistory);

    const oldCleanup = mod.setupCycleHistoryListener(store as never, 'old-user');
    oldCleanup();
    state = { forecast: { savedCycles: [] } };
    listeners.forEach((listener) => listener());

    // The new listener is attached only after account-scoped history is hydrated.
    state = { forecast: { savedCycles: [targetCycle] } };
    mod.setupCycleHistoryListener(store as never, 'target-user');
    expect(localStorage.getItem(targetKey)).toBe(targetHistory);
  });

  test('loadCycleHistoryFromStorage returns empty on JSON parse error', async () => {
    localStorage.setItem('gfc-cycle-history', 'not-json');
    const mod = await import('./cycleHistoryPersistence');
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('loadCycleHistoryFromStorage handles deserializeForecast throwing', async () => {
    jest.doMock('./fileUtils', () => ({
      deserializeForecast: jest.fn(() => {
        throw new Error('boom');
      }),
    }));

    const bad: SavedCycle[] = [{ id: 'b', timestamp: 't', cycleDate: 'd', forecastData: { foo: 'bar' }, stats: {} }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(bad));

    const mod = await import('./cycleHistoryPersistence');
    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded).toEqual([]);
  });

  test('useCycleHistoryPersistence dispatches when saved cycles exist', async () => {
    const dispatchSpy = jest.fn();

    jest.doMock('react', () => ({ useEffect: (fn: () => void) => fn() }));
    jest.doMock('react-redux', () => ({ useDispatch: () => dispatchSpy }));

    const legacy: SavedCycle[] = [{ id: 'l', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = await import('./cycleHistoryPersistence');
    mod.useCycleHistoryPersistence();

    expect(dispatchSpy).toHaveBeenCalled();
  });
});
