import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  test('renders v1.6 headline and improvement list', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Monitor/i })).toBeInTheDocument();
    expect(screen.getByText(/What's new · v1\.6/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View larger: Monitor in light mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View larger: Monitor in dark mode/i })).toBeInTheDocument();
    expect(screen.getByText('', { selector: 'img[src="/updates/v1.6/v1.6-promo-image-light-mrms-visible.png"]' })).toBeTruthy();
    expect(screen.getByText('', { selector: 'img[src="/updates/v1.6/v1.6-promo-image-dark-single-site-shortwave-ir.png"]' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Monitor workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /v1\.6 Hotfixes/i })).toBeInTheDocument();
    expect(screen.getByText(/OpenLayers and React disagreed about popup DOM ownership/i)).toBeInTheDocument();
    expect(screen.getByText(/Signed-in home page primary buttons are easier to read/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });

  test('opens an enlarged preview when a promo image is clicked', async () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /View larger:.*light mode/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /light mode with MRMS reflectivity/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close enlarged image/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
