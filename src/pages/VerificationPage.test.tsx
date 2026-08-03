import { render, screen, waitFor } from '@testing-library/react';
import * as featureExposure from '../config/featureExposure';

jest.mock('../components/VerificationMode/VerificationMode', () => () => (
  <div data-testid="verification-mode">Verification Mode</div>
));

jest.mock('../components/ForecastGrade/ForecastGradeDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="forecast-grade-dashboard">Forecast Grade dashboard</div>,
}));

const renderPage = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const VerificationPage = require('./VerificationPage').default;
  return render(<VerificationPage />);
};

describe('VerificationPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders classic verification mode when verificationRelaunch is off', () => {
    jest.spyOn(featureExposure, 'isFeatureExposed').mockReturnValue(false);
    renderPage();
    expect(screen.getByTestId('verification-mode')).toHaveTextContent('Verification Mode');
  });

  it('renders the Forecast Grade dashboard when verificationRelaunch is on', async () => {
    jest.spyOn(featureExposure, 'isFeatureExposed').mockReturnValue(true);
    renderPage();
    expect(await screen.findByTestId('forecast-grade-dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('verification-mode')).not.toBeInTheDocument();
    });
  });
});
