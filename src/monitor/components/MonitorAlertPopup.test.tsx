import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonitorAlertPopup from './MonitorAlertPopup';

describe('MonitorAlertPopup', () => {
  test('renders alert fields and closes on request', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <MonitorAlertPopup
        details={{
          event: 'Tornado Warning',
          headline: null,
          areaDesc: 'Oklahoma County',
          severity: 'Extreme',
          certainty: 'Observed',
          urgency: 'Immediate',
          effective: '2026-04-20T18:00:00-05:00',
          expires: '2026-04-20T19:00:00-05:00',
          description: 'Take shelter now.',
          instruction: 'Move to basement.',
          senderName: 'NWS Norman OK',
          detailUrl: 'https://api.weather.gov/alerts/1',
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Tornado Warning details/i })).toBeInTheDocument();
    expect(screen.getByText('Oklahoma County')).toBeInTheDocument();
    expect(screen.getByText('Take shelter now.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /weather.gov/i })).toHaveAttribute(
      'href',
      'https://api.weather.gov/alerts/1',
    );

    await user.click(screen.getByRole('button', { name: /Close alert details/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
