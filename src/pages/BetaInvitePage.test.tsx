import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import BetaInvitePage from './BetaInvitePage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

const renderBetaInvite = (entry = '/beta-access/discord-invite?t=secret-token') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/beta" element={<div>Beta Landing</div>} />
        <Route path="/beta-access/:invitePath?" element={<BetaInvitePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('BetaInvitePage', () => {
  beforeEach(() => {
    globalThis.__GFC_BETA_MODE__ = true;
    globalThis.__GFC_BETA_INVITE_PATH__ = 'discord-invite';
  });

  test('shows an invite-required state when the onboarding url is invalid', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      refreshBetaAccess: jest.fn(),
      status: 'signed_out',
      user: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      error: null,
    });

    renderBetaInvite('/beta-access/wrong-path');

    expect(screen.getByText(/Invite required/i)).toBeInTheDocument();
  });

  test('shows the activation card for a signed-in account without beta access', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      refreshBetaAccess: jest.fn(),
      status: 'signed_in',
      user: {
        email: 'tester@example.com',
        getIdToken: jest.fn(),
      },
    });

    renderBetaInvite();

    expect(screen.getByText(/Activate access for this account/i)).toBeInTheDocument();
    expect(screen.getByText(/tester@example.com/i)).toBeInTheDocument();
  });

  test('redirects outside beta mode and shows hosted-disabled/auth/loading/active states', () => {
    globalThis.__GFC_BETA_MODE__ = false;
    mockUseAuth.mockReturnValue({ hostedAuthEnabled: true });
    renderBetaInvite();
    expect(screen.getByText('Home Page')).toBeInTheDocument();

    globalThis.__GFC_BETA_MODE__ = true;
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: false,
      betaAccess: false,
      betaAccessLoading: false,
      status: 'signed_out',
      user: null,
    });
    const disabled = renderBetaInvite();
    expect(screen.getByText(/Hosted accounts are unavailable/i)).toBeInTheDocument();
    disabled.unmount();

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      betaAccess: false,
      betaAccessLoading: false,
      status: 'signed_out',
      user: null,
    });
    const auth = renderBetaInvite();
    expect(screen.getByText(/Sign in or create your beta account/i)).toBeInTheDocument();
    auth.unmount();

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      betaAccess: false,
      betaAccessLoading: true,
      status: 'signed_in',
      user: { email: 'loading@example.com' },
    });
    const loading = renderBetaInvite();
    expect(screen.getByText(/Checking current access/i)).toBeInTheDocument();
    loading.unmount();

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      betaAccess: true,
      betaAccessLoading: false,
      status: 'signed_in',
      user: { email: 'active@example.com' },
    });
    renderBetaInvite();
    expect(screen.getByText(/Beta access already active/i)).toBeInTheDocument();
  });

  test('claims beta access and surfaces claim errors', async () => {
    const refreshBetaAccess = jest.fn();
    const getIdToken = jest.fn().mockResolvedValue('id-token');
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      refreshBetaAccess,
      status: 'signed_in',
      user: { email: 'tester@example.com', getIdToken },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'Invite expired' }),
    });

    const first = renderBetaInvite();
    fireEvent.click(screen.getByRole('button', { name: /Activate Beta Access/i }));
    expect(await screen.findByText('Invite expired')).toBeInTheDocument();
    first.unmount();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    });

    renderBetaInvite();
    fireEvent.click(screen.getByRole('button', { name: /Activate Beta Access/i }));
    await waitFor(() => expect(refreshBetaAccess).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/beta/claim',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
      })
    );
  });
});
