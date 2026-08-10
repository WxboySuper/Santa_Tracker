import { renderHook, waitFor } from '@testing-library/react';
import type { MonitorMesoscaleDiscussionCollection } from './referenceLayers';
import * as referenceLayers from './referenceLayers';
import * as wms from './wms';
import { useMonitorReferenceLayers } from './useMonitorReferenceLayers';

const collection: MonitorMesoscaleDiscussionCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    properties: {
      label: 'Mesoscale Discussion 0001',
      validityText: 'MD 0001 Active Till 2100 UTC',
    },
  }],
};

const baseArgs = {
  ndfdEnabled: false,
  spcEnabled: true,
  refreshToken: 0,
  addToast: jest.fn(),
};

describe('useMonitorReferenceLayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads SPC metadata without treating provider validity text as a timestamp', async () => {
    jest.spyOn(referenceLayers, 'fetchSpcMesoscaleDiscussions').mockResolvedValue(collection);

    const { result } = renderHook(() => useMonitorReferenceLayers(baseArgs));

    await waitFor(() => expect(result.current.spcMesoscaleDiscussion.status).toBe('ready'));

    expect(result.current.spcMesoscaleDiscussion.itemCount).toBe(1);
    expect(result.current.spcMesoscaleDiscussion.validTime).toBeNull();
    expect(result.current.mesoscaleDiscussions).toEqual(collection);
  });

  test('keeps the SPC cache scoped to the hook instance', async () => {
    const fetchSpy = jest.spyOn(referenceLayers, 'fetchSpcMesoscaleDiscussions').mockResolvedValue(collection);

    const first = renderHook(() => useMonitorReferenceLayers(baseArgs));
    await waitFor(() => expect(first.result.current.spcMesoscaleDiscussion.status).toBe('ready'));
    first.unmount();

    const second = renderHook(() => useMonitorReferenceLayers(baseArgs));
    await waitFor(() => expect(second.result.current.spcMesoscaleDiscussion.status).toBe('ready'));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('uses a recent snapshot as stale data when refresh fails, then expires it', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetchSpy = jest.spyOn(referenceLayers, 'fetchSpcMesoscaleDiscussions')
      .mockResolvedValueOnce(collection)
      .mockRejectedValue(new Error('SPC unavailable'));
    const { result, rerender } = renderHook(
      (args: typeof baseArgs) => useMonitorReferenceLayers(args),
      { initialProps: baseArgs },
    );

    await waitFor(() => expect(result.current.spcMesoscaleDiscussion.status).toBe('ready'));

    now.mockReturnValue(1_000_000 + 11 * 60 * 1000);
    rerender({ ...baseArgs, spcEnabled: false, refreshToken: 1 });
    rerender({ ...baseArgs, refreshToken: 1 });
    await waitFor(() => expect(result.current.spcMesoscaleDiscussion.status).toBe('stale'));
    expect(result.current.mesoscaleDiscussions).toEqual(collection);

    now.mockReturnValue(1_000_000 + 31 * 60 * 1000);
    rerender({ ...baseArgs, spcEnabled: false, refreshToken: 2 });
    rerender({ ...baseArgs, refreshToken: 2 });
    await waitFor(() => expect(result.current.spcMesoscaleDiscussion.status).toBe('error'));
    expect(result.current.mesoscaleDiscussions.features).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test('reports NDFD metadata failures while leaving the optional layer usable', async () => {
    const toast = jest.fn();
    jest.spyOn(wms, 'fetchLayerTimeValues').mockRejectedValue(new Error('Capabilities unavailable'));

    const { result } = renderHook(() => useMonitorReferenceLayers({
      ...baseArgs,
      ndfdEnabled: true,
      spcEnabled: false,
      addToast: toast,
    }));

    await waitFor(() => expect(result.current.ndfdTemperature.status).toBe('error'));

    expect(result.current.ndfdTemperature.itemCount).toBeNull();
    expect(toast).toHaveBeenCalledWith(
      'NDFD temperature metadata is unavailable; the map may still show the provider latest image.',
      'warning',
    );
  });
});
