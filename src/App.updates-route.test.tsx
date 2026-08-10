import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import BetaAccessGuard from './components/Beta/BetaAccessGuard';
import UpdatesPage from './pages/UpdatesPage';

jest.mock('./lib/betaAccess', () => ({
  isBetaModeEnabled: () => true,
  isLocalBetaBypassEnabled: () => false,
}));

jest.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signed_out',
    betaAccess: false,
    betaAccessLoading: false,
    hostedAuthEnabled: true,
  }),
}));

describe('Updates route access', () => {
  test('renders /updates without passing BetaAccessGuard', () => {
    render(
      <MemoryRouter initialEntries={['/updates']}>
        <Routes>
          <Route path="updates" element={<UpdatesPage />} />
          <Route element={<BetaAccessGuard />}>
            <Route path="*" element={<div>Blocked</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Forecast, reflect, and learn/i })).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });
});
