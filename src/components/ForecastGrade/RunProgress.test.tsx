import React from 'react';
import { render, screen } from '@testing-library/react';
import RunProgress from './RunProgress';

describe('RunProgress', () => {
  it('renders one readable progress meter for an active grade run', () => {
    render(<RunProgress progress={{ fraction: 0.05, label: 'Grading tornado product…' }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Grading tornado product…');
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByLabelText('Grading tornado product…: 5% complete')).toBeInTheDocument();
    expect(document.querySelectorAll('.fg-run-progress__track')).toHaveLength(1);
  });

  it('does not render when no run is active', () => {
    const { container } = render(<RunProgress progress={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
