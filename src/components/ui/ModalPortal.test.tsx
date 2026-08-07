import { render, screen, within } from '@testing-library/react';
import ModalPortal from './ModalPortal';

describe('ModalPortal', () => {
  test('renders children on document.body instead of the test container', () => {
    const { container } = render(
      <ModalPortal>
        <div data-testid="portal-child">Modal content</div>
      </ModalPortal>,
    );

    expect(within(container).queryByTestId('portal-child')).not.toBeInTheDocument();
    expect(screen.getByTestId('portal-child')).toBeInTheDocument();
    expect(screen.getByTestId('portal-child')).toHaveTextContent('Modal content');
  });
});
