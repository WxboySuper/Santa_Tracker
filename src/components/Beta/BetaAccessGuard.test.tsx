import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Outlet, useOutletContext } from 'react-router';
import BetaAccessGuard from './BetaAccessGuard';
import { useAuth } from '../../auth/AuthProvider';
import { isBetaModeEnabled, isLocalBetaBypassEnabled } from '../../lib/betaAccess';

// Mock useAuth
jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock lib/betaAccess
jest.mock('../../lib/betaAccess', () => ({
  isBetaModeEnabled: jest.fn(),
  isLocalBetaBypassEnabled: jest.fn(),
}));

// Mock BetaPageLayout
jest.mock('./BetaPageLayout', () => ({
  BetaStatusPanel: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('BetaAccessGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderGuard = (initialEntries = ['/protected']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<BetaAccessGuard />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/beta" element={<div>Beta Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it.each([
    {
      name: 'renders children if beta mode is disabled',
      betaEnabled: false,
      bypassEnabled: false,
      authState: {},
      expectedText: 'Protected Content',
    },
    {
      name: 'renders children if local beta bypass is enabled',
      betaEnabled: true,
      bypassEnabled: true,
      authState: {},
      expectedText: 'Protected Content',
    },
    {
      name: 'renders children if signed in and has beta access',
      betaEnabled: true,
      bypassEnabled: false,
      authState: {
        hostedAuthEnabled: true,
        status: 'signed_in',
        betaAccessLoading: false,
        betaAccess: true,
      },
      expectedText: 'Protected Content',
    },
  ])('$name', ({ betaEnabled, bypassEnabled, authState, expectedText }) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(betaEnabled);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(bypassEnabled);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it.each([
    [
      'redirects to /beta if hosted auth is disabled',
      {
        hostedAuthEnabled: false,
      },
    ],
    [
      'redirects to /beta if signed out',
      {
        hostedAuthEnabled: true,
        status: 'signed_out',
        betaAccessLoading: false,
      },
    ],
  ])('%s', (_name, authState) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText('Beta Page')).toBeInTheDocument();
  });

  it('forwards parent outlet context to nested routes', async () => {
    const user = userEvent.setup();
    const addToast = jest.fn();

    const ContextConsumer = () => {
      const { addToast: toast } = useOutletContext<{ addToast: typeof addToast }>();
      return (
        <button type="button" onClick={() => toast('hello')}>
          Trigger toast
        </button>
      );
    };

    (isBetaModeEnabled as jest.Mock).mockReturnValue(false);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_out',
      betaAccessLoading: false,
      betaAccess: false,
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<Outlet context={{ addToast }} />}>
            <Route element={<BetaAccessGuard />}>
              <Route path="/protected" element={<ContextConsumer />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger toast' }));
    expect(addToast).toHaveBeenCalledWith('hello');
  });

  it.each([
    [
      'shows checking status when status is loading',
      { hostedAuthEnabled: true, status: 'loading', betaAccessLoading: false },
    ],
    [
      'shows checking status when betaAccessLoading is true',
      { hostedAuthEnabled: true, status: 'signed_in', betaAccessLoading: true },
    ],
  ])('%s', (_name, authState) => {
    (isBetaModeEnabled as jest.Mock).mockReturnValue(true);
    (isLocalBetaBypassEnabled as jest.Mock).mockReturnValue(false);
    (useAuth as jest.Mock).mockReturnValue(authState);

    renderGuard();
    expect(screen.getByText('Checking beta access')).toBeInTheDocument();
  });
});
