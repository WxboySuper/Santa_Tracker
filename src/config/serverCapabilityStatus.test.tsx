import { render, screen, waitFor } from '@testing-library/react';
import {
  fetchServerCapabilityStatus,
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
