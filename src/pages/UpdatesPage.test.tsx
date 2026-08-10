import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import UpdatesPage from './UpdatesPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = jest.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

describe('UpdatesPage', () => {
  test('renders v1.7 headline and release sections', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Forecast, reflect, and learn/i })).toBeInTheDocument();
    expect(screen.getByText(/What's new · v1\.7/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Workflow continuity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Forecast Grade and Monitor/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Custom products and premium boundaries/i })).toBeInTheDocument();
    expect(screen.getByText(/Auto-TSTM provides cached guidance/i)).toBeInTheDocument();
    expect(screen.queryByTestId('updates-promo-image')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });

  test('keeps the release page useful without optional image assets', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });
});
