import { act, waitFor } from '@testing-library/react';
import { replaceTstmFeatures, setForecastDay } from '../../store/forecastSlice';
import {
  cachedResponse,
  mockedRequestLatest,
  openPanelAndWaitForError,
  openPanelAndWaitForPreview,
  renderAutoTstm,
} from '../../testing/autoTstmTestHarness';

describe('useAutoTstm', () => {
  beforeEach(() => {
    mockedRequestLatest.mockReset();
  });

  test('does not fetch when the panel is closed', () => {
    renderAutoTstm();
    expect(mockedRequestLatest).not.toHaveBeenCalled();
  });

  test('fetches cached guidance when the panel opens and exposes preview metadata', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { result } = renderAutoTstm();

    await openPanelAndWaitForPreview(result);

    expect(mockedRequestLatest).toHaveBeenCalledWith(1, 'full', expect.any(AbortSignal));
    expect(result.current.previewResponse?.run).toBe('2026-06-13T12:00:00Z');
    expect(result.current.previewFeatures).toHaveLength(1);
  });

  test('keeps committed polygons unchanged when guidance is unavailable', async () => {
    mockedRequestLatest.mockResolvedValue(null);
    const { store, result } = renderAutoTstm();

    await openPanelAndWaitForError(result);

    expect(store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM')).toBeUndefined();
  });

  test.each([
  {
    label: 'apply',
    action: (result: ReturnType<typeof renderAutoTstm>['result']) => result.current.applyPreview(),
    expectCommitted: true,
    expectPanelClosed: true,
  },
  {
    label: 'cancel',
    action: (result: ReturnType<typeof renderAutoTstm>['result']) => result.current.cancelPreview(),
    expectCommitted: false,
    expectPanelClosed: true,
  },
] as const)('$label preview updates state without unintended forecast mutation', async ({
  action,
  expectCommitted,
  expectPanelClosed,
}) => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { store, result } = renderAutoTstm();

    await openPanelAndWaitForPreview(result);

    await act(async () => {
      action(result);
    });

    const committed = store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM');
    if (expectCommitted) {
      expect(committed).toHaveLength(1);
    } else {
      expect(committed).toBeUndefined();
      expect(result.current.status).toBe('idle');
    }
    expect(result.current.isPanelOpen).toBe(!expectPanelClosed);
    expect(result.current.previewFeatures).toHaveLength(0);
  });

  test('ignores late responses after the forecast day changes', async () => {
    let resolveRequest: ((value: typeof cachedResponse) => void) | null = null;
    mockedRequestLatest.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await act(async () => {
      store.dispatch(setForecastDay(2));
    });

    await act(async () => {
      resolveRequest?.(cachedResponse);
    });

    await waitFor(() => {
      expect(result.current.status).not.toBe('preview');
    });
    expect(store.getState().forecast.forecastCycle.days[2]?.data.categorical?.get('TSTM')).toBeUndefined();
  });

  test('blocks stale apply after the day changes', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { store, result } = renderAutoTstm();

    await openPanelAndWaitForPreview(result);

    await act(async () => {
      store.dispatch(setForecastDay(2));
    });

    await act(async () => {
      result.current.applyPreview();
    });

    expect(store.getState().forecast.forecastCycle.days[2]?.data.categorical?.get('TSTM')).toBeUndefined();
    expect(result.current.status).toBe('error');
  });

  test('does not wipe committed TSTM when apply is called with zero preview features', async () => {
    mockedRequestLatest.mockResolvedValue({ ...cachedResponse, features: [] });
    const { store, result } = renderAutoTstm();

    await act(async () => {
      store.dispatch(replaceTstmFeatures({ features: cachedResponse.features }));
    });

    await openPanelAndWaitForPreview(result);

    await act(async () => {
      result.current.applyPreview();
    });

    const committed = store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM');
    expect(committed).toHaveLength(1);
    expect(result.current.isPanelOpen).toBe(true);
  });
});
