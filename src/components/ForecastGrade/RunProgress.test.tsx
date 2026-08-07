import { render, screen } from '@testing-library/react';
import RunProgress from './RunProgress';

describe('RunProgress', () => {
  it('renders one readable progress meter for an active grade run', () => {
    render(<RunProgress progress={{ fraction: 0.05, label: 'Grading tornado product…' }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Grading tornado product…');
    expect(screen.getByText('5%')).toBeInTheDocument();
    const track = screen.getByLabelText('Grading tornado product…: 5% complete');
    expect(track).toHaveClass('fg-run-progress__track');
    expect(screen.getAllByLabelText('Grading tornado product…: 5% complete')).toHaveLength(1);
  });

  it('does not render when no run is active', () => {
    const { container } = render(<RunProgress progress={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
