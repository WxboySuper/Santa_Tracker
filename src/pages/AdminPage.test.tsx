import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AdminPage } from './AdminPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../instrument', () => ({
  isSentryEnabled: jest.fn(() => false),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;
const mockIsSentryEnabled = jest.requireMock('../instrument').isSentryEnabled as jest.Mock;
const mockFetch = jest.fn();

const DEFAULT_ADMIN_SUMMARY = {
  totalAccounts: 0,
  activeDevices: 0,
  activeSignedInAccounts: 0,
  premiumSubscriptions: 0,
  storageBytes: 0,
  signups: 0,
  signIns: 0,
  upgrades: 0,
  cancellations: 0,
  cloudSaves: 0,
  cloudLoads: 0,
};

const renderAdminPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/account" element={<div>Account Page</div>} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('AdminPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockIsSentryEnabled.mockReturnValue(false);
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  test('redirects to home when hosted auth is disabled', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: false,
      status: 'disabled',
      user: null,
    });

    renderAdminPage();

    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  test('redirects signed-out users to account', () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_out',
      user: null,
    });

    renderAdminPage();

    expect(screen.getByText('Account Page')).toBeInTheDocument();
  });

  test('redirects forbidden users away from admin', async () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    });
    mockFetch.mockResolvedValue({
      status: 403,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'forbidden' }),
    });

    renderAdminPage();

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Loading daily metrics...')).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalled();
  });

  test('renders summary data for allowlisted admins', async () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    });
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        metricsEnabled: true,
        window: 7,
        summary: {
          totalAccounts: 2,
          signIns: 3,
          premiumSubscriptions: 1,
          storageBytes: 1024,
          signups: 1,
          upgrades: 0,
          cancellations: 0,
          cloudSaves: 2,
          cloudLoads: 1,
          activeDevices: 1,
        },
        dailyMetrics: [],
      }),
    });

    renderAdminPage();

    await waitFor(() => expect(screen.getByText(/1(\.0)? KB/)).toBeInTheDocument());
    expect(screen.getByText('Total accounts')).toBeInTheDocument();
    expect(screen.getByText('Premium subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Hosted data footprint')).toBeInTheDocument();
  });

  test('shows Sentry test control when monitoring is enabled in the build', async () => {
    mockIsSentryEnabled.mockReturnValue(true);
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    });
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        metricsEnabled: true,
        window: 7,
        summary: DEFAULT_ADMIN_SUMMARY,
        dailyMetrics: [],
      }),
    });

    renderAdminPage();

    expect(await screen.findByRole('button', { name: 'Send Sentry test error' })).toBeInTheDocument();
  });
});
