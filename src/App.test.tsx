import { render, screen, act } from '@testing-library/react';
import App from './App';
import { Outlet as MockOutlet } from 'react-router-dom';

// Mock pages to avoid heavy modules
jest.mock('./pages', () => ({
  HomePage: () => <div>HomePage Mock</div>,
  ForecastPage: () => <div>ForecastPage Mock</div>,
  DiscussionPage: () => <div>DiscussionPage Mock</div>,
  VerificationPage: () => <div>VerificationPage Mock</div>,
  MonitorPage: () => <div>MonitorPage Mock</div>,
  ComingSoonPage: () => <div>ComingSoonPage Mock</div>,
  AccountPage: () => <div>AccountPage Mock</div>,
  PricingPage: () => <div>PricingPage Mock</div>,
  UpdatesPage: () => <div>UpdatesPage Mock</div>,
  AdminPage: () => <div>AdminPage Mock</div>,
  BetaLandingPage: () => <div>BetaLandingPage Mock</div>,
  BetaInvitePage: () => <div>BetaInvitePage Mock</div>,
}));

// Mock components
jest.mock('./components/Layout', () => ({
  AppLayout: () => (
    <div>
      <div>AppLayout Mock</div>
      <MockOutlet />
    </div>
  ),
}));

jest.mock('./components/Map/ForecastMap', () => () => <div>ForecastMap Mock</div>);
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools Mock</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation Mock</div>);
jest.mock('./components/Beta/BetaAccessGuard', () => () => <MockOutlet />);
jest.mock('./components/ToS/ToSModal', () => ({
  __esModule: true,
  hasAcceptedToS: () => true,
  default: () => <div>ToSModal Mock</div>,
}));
jest.mock('./components/PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  hasAcceptedPrivacyPolicy: () => true,
  default: () => <div>PrivacyPolicyModal Mock</div>,
}));

describe('App Simple', () => {
  test('renders HomePage by default', () => {
    act(() => {
      render(<App />);
    });
    expect(screen.getByText(/HomePage Mock/i)).toBeInTheDocument();
  });
});
