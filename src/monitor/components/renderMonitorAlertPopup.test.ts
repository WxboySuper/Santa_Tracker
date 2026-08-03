import { renderMonitorAlertPopup, clearMonitorAlertPopup } from './renderMonitorAlertPopup';
import type { NwsAlertDetails } from '../nwsAlertDetails';

const sampleDetails: NwsAlertDetails = {
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
};

describe('renderMonitorAlertPopup', () => {
  test('renders alert fields and invokes onClose from the close button', () => {
    const container = document.createElement('div');
    const onClose = jest.fn();

    const cleanup = renderMonitorAlertPopup(container, sampleDetails, onClose);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toHaveAttribute('aria-label', 'Tornado Warning details');
    expect(container.textContent).toContain('Oklahoma County');
    expect(container.textContent).toContain('Take shelter now.');

    const link = container.querySelector('a.monitor-alert-popup__link');
    expect(link).toHaveAttribute('href', 'https://api.weather.gov/alerts/1');

    const closeButton = container.querySelector('button[aria-label="Close alert details"]');
    expect(closeButton).not.toBeNull();
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    clearMonitorAlertPopup(container);
    expect(container.childElementCount).toBe(0);
  });
});
