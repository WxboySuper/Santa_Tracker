import { render, screen } from '@testing-library/react';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders a decorative horizontal separator by default', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('role', 'none');
    expect(separator).not.toHaveAttribute('aria-orientation');
    expect(separator).toHaveClass('h-[1px]', 'w-full');
    expect(separator).toBeInTheDocument();
  });

  it('renders an accessible vertical separator when not decorative', () => {
    render(<Separator decorative={false} orientation="vertical" className="custom" />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveClass('h-full', 'w-[1px]', 'custom');
  });
});
