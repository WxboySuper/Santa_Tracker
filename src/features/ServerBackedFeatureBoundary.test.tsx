import { render, screen, waitFor } from '@testing-library/react';
import { resetServerCapabilityStatusState } from '../config/serverCapabilityStatus';
import { ServerBackedFeatureBoundary } from './ServerBackedFeatureBoundary';

describe('ServerBackedFeatureBoundary', () => {
  afterEach(() => {
    resetServerCapabilityStatusState();
    jest.restoreAllMocks();
  });

  test('renders children when compile-time exposure and server status both allow it', async () => {
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
        <ServerBackedFeatureBoundary feature="autoTstm">
          <div>Auto-TSTM controls</div>
        </ServerBackedFeatureBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText('Auto-TSTM controls')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('renders a fallback when the server reports emergency disable', async () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
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
      render(
        <ServerBackedFeatureBoundary feature="autoTstm">
          <div>Auto-TSTM controls</div>
        </ServerBackedFeatureBoundary>
      );

      await waitFor(() => {
        expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();
        expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('does not render children while compile-time exposure is disabled', () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);

    render(
      <ServerBackedFeatureBoundary feature="autoTstm">
        <div>Auto-TSTM controls</div>
      </ServerBackedFeatureBoundary>
    );

    expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  test('does not render unavailable fallback while server status is loading', () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;

    try {
      render(
        <ServerBackedFeatureBoundary feature="autoTstm">
          <div>Auto-TSTM controls</div>
        </ServerBackedFeatureBoundary>
      );

      expect(screen.queryByText('Auto-TSTM controls')).not.toBeInTheDocument();
      expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
