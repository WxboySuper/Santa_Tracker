import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OutlookTrimPopover from './OutlookTrimPopover';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';

const buildController = (
  overrides: Partial<ForecastWorkspaceController> = {},
): ForecastWorkspaceController =>
  ({
    outlookTrimStrategy: 'us-country-minus-great-lakes',
    outlookTrimAutoOnDraw: false,
    outlookTrimPreviewOnly: false,
    isTrimmingOutlooks: false,
    onOutlookTrimStrategyChange: jest.fn(),
    onToggleOutlookTrimAutoOnDraw: jest.fn(),
    onToggleOutlookTrimPreviewOnly: jest.fn(),
    onTrimCurrentDayOutlooks: jest.fn(),
    ...overrides,
  }) as ForecastWorkspaceController;

describe('OutlookTrimPopover', () => {
  test('renders compact trim trigger without expanding toolbar sections', () => {
    render(<OutlookTrimPopover controller={buildController()} />);
    expect(screen.getByRole('button', { name: /trim outlooks to land/i })).toBeInTheDocument();
    expect(screen.queryByText(/trim prototype/i)).not.toBeInTheDocument();
  });

  test('opens popover settings from the trim trigger', async () => {
    const user = userEvent.setup();
    render(<OutlookTrimPopover controller={buildController()} />);

    await user.click(screen.getByRole('button', { name: /trim outlooks to land/i }));

    expect(screen.getByText('Trim to land')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-trim while drawing')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview trim only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trim current day/i })).toBeInTheDocument();
  });
});
