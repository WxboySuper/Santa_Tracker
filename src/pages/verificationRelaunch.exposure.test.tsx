import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BUILD_TARGETS } from '../config/buildTarget';
import { assertNoFetchTo, withNoAsyncSideEffects } from '../testing/featureExposure/harness';

// Track whether the lazily loaded v2 dashboard module factory ever runs. The
// prefix `mock` is required for jest.mock factories to reference it.
const mockV2Load = jest.fn();

jest.mock('../components/VerificationMode/VerificationMode', () => ({
  __esModule: true,
  default: () => <div>Classic Verification Mode</div>,
}));

jest.mock('../components/ForecastGrade/ForecastGradeDashboard', () => {
  mockV2Load();
  return {
    __esModule: true,
    default: () => <div>V2 Forecast Grade dashboard</div>,
  };
});

const renderPage = () => {
  // Import after mocks/spies are installed so the gate reads the mocked exposure.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const VerificationPage = require('./VerificationPage').default;
  return render(
    <MemoryRouter>
      <VerificationPage />
    </MemoryRouter>
  );
};

describe('verificationRelaunch route gate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockV2Load.mockClear();
  });

  test('renders classic VerificationMode and never boots the v2 module while disabled', async () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);

    await assertNoFetchTo('spc.noaa.gov', () => {
      withNoAsyncSideEffects(() => {
        renderPage();
      });
    });

    expect(screen.getByText('Classic Verification Mode')).toBeInTheDocument();
    expect(screen.queryByText('V2 Forecast Grade dashboard')).not.toBeInTheDocument();
    expect(mockV2Load).not.toHaveBeenCalled();
  });

  test('mounts the v2 dashboard only when the flag is exposed', async () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);

    renderPage();

    expect(await screen.findByText('V2 Forecast Grade dashboard')).toBeInTheDocument();
    expect(mockV2Load).toHaveBeenCalled();
  });

  test('keeps verificationRelaunch off for every non-local build target in the registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isFeatureExposedOnTarget } = require('../config/featureExposure');
    for (const target of BUILD_TARGETS) {
      expect(isFeatureExposedOnTarget('verificationRelaunch', target)).toBe(target === 'local');
    }
  });
});
