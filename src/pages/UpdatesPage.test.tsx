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

    expect(screen.getByRole('heading', { level: 1, name: /The biggest update yet/i })).toBeInTheDocument();
    expect(screen.getByText(/Release briefing · v1\.7/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Verification v2/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Custom Products/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Forecast workflows that hold together/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Privacy and account safety/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open account safety controls/i })).toHaveAttribute('href', '/account');
    expect(screen.getByText(/Auto-TSTM uses SPC-calibrated HREF guidance/i)).toBeInTheDocument();
    expect(screen.getByTestId('updates-hero-image')).toBeInTheDocument();
    expect(screen.getAllByRole('presentation')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });

  test('keeps the release page useful without optional image assets', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('updates-hero-image')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });
});
