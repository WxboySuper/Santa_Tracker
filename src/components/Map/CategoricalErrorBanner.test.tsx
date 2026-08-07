import { render, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import CategoricalErrorBanner from './CategoricalErrorBanner';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;

describe('CategoricalErrorBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when there is no derivation error', () => {
    mockUseSelector.mockReturnValue(null);

    const { container } = render(<CategoricalErrorBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders an alert with the error message and recovery copy', () => {
    mockUseSelector.mockReturnValue('Turf union failed for 2 polygon(s)');

    render(<CategoricalErrorBanner />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Categorical generation paused');
    expect(alert).toHaveTextContent('Turf union failed for 2 polygon(s)');
    expect(alert).toHaveTextContent('previous categorical geometry is still intact');
  });
});
