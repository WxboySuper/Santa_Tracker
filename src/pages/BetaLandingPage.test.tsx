import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import BetaLandingPage from './BetaLandingPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

const renderBetaLanding = () =>
  render(
    <MemoryRouter initialEntries={['/beta']}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/beta" element={<BetaLandingPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('BetaLandingPage', () => {
  beforeEach(() => {
    globalThis.__GFC_BETA_MODE__ = true;
  });

  test('shows the beta sign-in card for signed-out visitors', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      signOutUser: jest.fn(),
      status: 'signed_out',
      user: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      error: null,
    });

    renderBetaLanding();

    expect(screen.getByRole('heading', { name: /Closed beta sign-in/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tester sign in/i })).toBeInTheDocument();
  });

  test('shows the locked-account message for signed-in users without beta access', () => {
    mockUseAuth.mockReturnValue({
      betaAccess: false,
      betaAccessLoading: false,
      hostedAuthEnabled: true,
      signOutUser: jest.fn(),
      status: 'signed_in',
      user: { email: 'tester@example.com' },
    });

    renderBetaLanding();

    expect(screen.getByText(/This account is not enrolled yet/i)).toBeInTheDocument();
    expect(screen.getByText(/tester@example.com/i)).toBeInTheDocument();
  });
});
