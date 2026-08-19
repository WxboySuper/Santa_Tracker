import { render, screen, waitFor } from '@testing-library/react';
import {
  fetchServerCapabilityStatus,
  isServerCapabilityStatusResponse,
  isServerCapabilityAvailable,
  loadSharedServerCapabilityStatus,
  markServerCapabilityUnavailable,
  resetServerCapabilityStatusState,
  resolveServerBackedFeatureRuntimeState,
  useServerCapabilityAvailable,
} from './serverCapabilityStatus';
import { ServerBackedFeatureBoundary } from '../features/ServerBackedFeatureBoundary';

const CapabilityProbe = () => {
  const available = useServerCapabilityAvailable('autoTstm');
  return <div>{available ? 'available' : 'unavailable'}</div>;
};

describe('serverCapabilityStatus', () => {
  afterEach(() => {
    resetServerCapabilityStatusState();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('fails closed before status is loaded', () => {
    expect(isServerCapabilityAvailable('TSTM_GENERATION_ENABLED')).toBe(false);
    expect(resolveServerBackedFeatureRuntimeState('autoTstm')).toBe('loading');
  });

  test('treats unavailable server status as disabled', () => {
    expect(
      isServerCapabilityAvailable('TSTM_GENERATION_ENABLED', {
        loaded: true,
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      })
    ).toBe(false);
  });

  test('marks a capability unavailable after a disabled API response', () => {
    markServerCapabilityUnavailable('TSTM_GENERATION_ENABLED');
    expect(
      isServerCapabilityAvailable('TSTM_GENERATION_ENABLED', {
        loaded: true,
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      })
    ).toBe(false);
  });

  test('fetchServerCapabilityStatus validates the response shape', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      }),
    }) as jest.Mock;

    try {
      await expect(fetchServerCapabilityStatus()).resolves.toMatchObject({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('rejects capability entries with invalid fields', () => {
    expect(isServerCapabilityStatusResponse({
      capabilities: {
        TSTM_GENERATION_ENABLED: { available: 'yes', reason: 'available' },
      },
    })).toBe(false);
    expect(isServerCapabilityStatusResponse({
      capabilities: {
        TSTM_GENERATION_ENABLED: { available: true, reason: 'not-a-reason' },
      },
    })).toBe(false);
    expect(isServerCapabilityStatusResponse({
      capabilities: {
        TSTM_GENERATION_ENABLED: {
          available: true,
          reason: 'available',
          extra: true,
        },
      },
    })).toBe(false);
  });

  test('accepts every documented reason and empty capability maps', () => {
    expect(isServerCapabilityStatusResponse({ capabilities: {} })).toBe(true);
    expect(isServerCapabilityStatusResponse({
      capabilities: {
        available: { available: true, reason: 'available' },
        registry: { available: false, reason: 'registry_disabled' },
        deployment: { available: false, reason: 'deployment_disabled' },
        emergency: { available: false, reason: 'emergency_disabled' },
        unknown: { available: false, reason: 'unknown' },
      },
    })).toBe(true);
  });

  test('rejects malformed payloads at the fetch boundary', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: { available: 'yes', reason: 'available' },
        },
      }),
    }) as jest.Mock;

    try {
      await expect(fetchServerCapabilityStatus()).rejects.toThrow(
        'Server capability status response was malformed.'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('useServerCapabilityAvailable fails closed when status fetch fails', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as jest.Mock;

    try {
      render(<CapabilityProbe />);
      await waitFor(() => {
        expect(screen.getByText('unavailable')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('retries a transient failure and recovers after the scheduled retry', async () => {
    jest.useFakeTimers();
    const firstFailure = Promise.reject(new Error('network'));
    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockReturnValueOnce(firstFailure)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          capabilities: {
            TSTM_GENERATION_ENABLED: { available: true, reason: 'available' },
          },
        }),
      }) as jest.Mock;

    try {
      await expect(loadSharedServerCapabilityStatus()).resolves.toMatchObject({ loaded: false });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await expect(loadSharedServerCapabilityStatus()).resolves.toMatchObject({
        loaded: true,
        capabilities: { TSTM_GENERATION_ENABLED: { available: true } },
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('coalesces retry timers and cancels them on reset', async () => {
    jest.useFakeTimers();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as jest.Mock;

    try {
      await Promise.all([
        loadSharedServerCapabilityStatus(),
        loadSharedServerCapabilityStatus(),
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      resetServerCapabilityStatusState();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('falls back to unavailable after the retry budget is exhausted', async () => {
    jest.useFakeTimers();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as jest.Mock;

    try {
      await loadSharedServerCapabilityStatus();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await loadSharedServerCapabilityStatus();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await expect(loadSharedServerCapabilityStatus()).resolves.toMatchObject({ loaded: true });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('useServerCapabilityAvailable reflects emergency-disabled server status', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      }),
    }) as jest.Mock;

    try {
      render(<CapabilityProbe />);
      await waitFor(() => {
        expect(screen.getByText('unavailable')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('loadSharedServerCapabilityStatus fetches once for concurrent consumers', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      }),
    }) as jest.Mock;

    try {
      await Promise.all([
        loadSharedServerCapabilityStatus(),
        loadSharedServerCapabilityStatus(),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('multiple mounted server-backed boundaries share one status fetch', async () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      }),
    }) as jest.Mock;

    try {
      render(
        <>
          <ServerBackedFeatureBoundary feature="autoTstm">
            <div>First boundary</div>
          </ServerBackedFeatureBoundary>
          <ServerBackedFeatureBoundary feature="autoTstm">
            <div>Second boundary</div>
          </ServerBackedFeatureBoundary>
        </>
      );

      await waitFor(() => {
        expect(screen.getByText('First boundary')).toBeInTheDocument();
        expect(screen.getByText('Second boundary')).toBeInTheDocument();
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
