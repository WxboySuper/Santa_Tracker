import { render, screen, act } from '@testing-library/react';
import App from './App';
import { Outlet as MockOutlet } from 'react-router';

// Mock lightweight routes directly so the application test does not execute page logic.
jest.mock('./pages/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage Mock</div>,
}));
jest.mock('./pages/ComingSoonPage', () => ({
  ComingSoonPage: () => <div>ComingSoonPage Mock</div>,
}));
jest.mock('./pages/AccountPage', () => ({
  __esModule: true,
  default: () => <div>AccountPage Mock</div>,
}));
jest.mock('./pages/PricingPage', () => ({
  __esModule: true,
  default: () => <div>PricingPage Mock</div>,
}));
jest.mock('./pages/UpdatesPage', () => ({
  UpdatesPage: () => <div>UpdatesPage Mock</div>,
}));
jest.mock('./pages/BetaLandingPage', () => ({
  __esModule: true,
  default: () => <div>BetaLandingPage Mock</div>,
}));
jest.mock('./pages/BetaInvitePage', () => ({
  __esModule: true,
  default: () => <div>BetaInvitePage Mock</div>,
}));
jest.mock('./pages/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage Mock</div>,
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
    // eslint-disable-next-line testing-library/no-unnecessary-act -- explicit act keeps the render async-safe if App gains effect-driven updates
    act(() => {
      render(<App />);
    });
    expect(screen.getByText(/HomePage Mock/i)).toBeInTheDocument();
  });
});
