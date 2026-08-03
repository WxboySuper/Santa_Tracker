import { render, screen } from '@testing-library/react';
import ModalPortal from './ModalPortal';

describe('ModalPortal', () => {
  test('renders children on document.body instead of the test container', () => {
    const { container } = render(
      <ModalPortal>
        <div data-testid="portal-child">Modal content</div>
      </ModalPortal>,
    );

    expect(container.querySelector('[data-testid="portal-child"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="portal-child"]')).toBeInTheDocument();
    expect(screen.getByTestId('portal-child')).toHaveTextContent('Modal content');
  });
});
