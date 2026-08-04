import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlertBanner from './AlertBanner';

const renderBanner = () =>
  render(
    <MemoryRouter>
      <AlertBanner />
    </MemoryRouter>,
  );

describe('AlertBanner', () => {
  const mockBannerFetch = (config: unknown, ok = true) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok,
      json: () => Promise.resolve(config),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('renders alert when enabled', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Test Alert',
      type: 'warning',
      dismissible: true,
    });

    renderBanner();

    expect(await screen.findByText('Test Alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('alert-banner--warning');
  });

  test('renders internal link CTA', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'v1.6 is live',
      type: 'info',
      dismissible: true,
      linkUrl: '/updates',
      linkLabel: "What's new",
    });

    renderBanner();
    await waitFor(() => expect(screen.getByRole('link', { name: "What's new" })).toHaveAttribute('href', '/updates'));
  });

  test('hides banner before startsAt', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Future alert',
      type: 'info',
      dismissible: true,
      startsAt: '2099-01-01T00:00:00.000Z',
    });

    renderBanner();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it.each([
    ['remains hidden when disabled', { enabled: false, message: 'Hidden', type: 'info', dismissible: true }, true],
    ['remains hidden on fetch failure', new Error('Fetch failed'), false],
    ['handles non-ok response', null, null],
  ])('%s', async (_name, config, ok) => {
    if (config instanceof Error) {
      (global.fetch as jest.Mock).mockRejectedValue(config);
    } else if (config === null) {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    } else {
      mockBannerFetch(config, ok ?? true);
    }

    renderBanner();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  test('can be dismissed', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Dismiss me',
      type: 'error',
      dismissible: true,
    });

    renderBanner();

    expect(await screen.findByText('Dismiss me')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Dismiss alert'));
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  test('does not render unsafe javascript banner links', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Click me',
      type: 'info',
      dismissible: true,
      linkUrl: 'javascript:alert(1)',
      linkLabel: 'Bad link',
    });

    renderBanner();

    expect(await screen.findByText('Click me')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bad link' })).not.toBeInTheDocument();
  });

  test('is not dismissible when dismissible is false', async () => {
    mockBannerFetch({
      enabled: true,
      message: 'Permanent',
      type: 'info',
      dismissible: false,
    });

    renderBanner();

    expect(await screen.findByText('Permanent')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dismiss alert')).not.toBeInTheDocument();
  });
});
