import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AlertBannerLink } from './AlertBannerLink';

describe('AlertBannerLink', () => {
  it('renders internal router links', () => {
    render(
      <MemoryRouter>
        <AlertBannerLink linkUrl="/updates" linkLabel="Updates" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Updates' })).toHaveAttribute('href', '/updates');
  });

  it('renders https external links', () => {
    render(
      <MemoryRouter>
        <AlertBannerLink linkUrl="https://example.com" linkLabel="Example" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render javascript URLs', () => {
    const { container } = render(
      <MemoryRouter>
        <AlertBannerLink linkUrl="javascript:alert(1)" linkLabel="XSS" />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
