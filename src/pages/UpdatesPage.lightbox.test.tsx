import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import UpdatesPage from './UpdatesPage';

jest.mock('../content/updates/v1.7', () => ({
  v17Update: {
    version: '1.7',
    title: 'Test release',
    summary: 'Test release summary.',
    promoImages: [
      {
        src: '/updates/v1.7/test-screenshot.png',
        alt: 'Test release screenshot',
        caption: 'Test release screenshot caption.',
      },
    ],
    sections: [],
    improvements: [],
  },
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = jest.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

test('opens and closes an enlarged release screenshot', async () => {
  render(
    <MemoryRouter>
      <UpdatesPage />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: /View larger: Test release screenshot/i }));

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Test release screenshot/i })).toBeInTheDocument();
  expect(within(dialog).getByText('Test release screenshot caption.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Close enlarged image/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
