import { render, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import StatusOverlay from './StatusOverlay';
import { RootState } from '../../store';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;

function mockState(isLow: boolean, activeOutlookType = 'tornado') {
  mockUseSelector.mockImplementation((selector: (state: RootState) => unknown) => {
    if (selector.name === 'selectIsLowProbability') {
      return isLow;
    }
    return selector({
      forecast: {
        drawingState: { activeOutlookType },
      },
    } as RootState);
  });
}

describe('StatusOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when probability is not low', () => {
    mockState(false);

    const { container } = render(<StatusOverlay />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows probability warning for non-categorical outlooks', () => {
    mockState(true, 'hail');

    render(<StatusOverlay />);

    expect(screen.getByRole('status')).toHaveTextContent('Probability Too Low');
    expect(screen.getByLabelText('Probability Too Low')).toHaveAttribute('title', 'Probability Too Low');
  });

  it('shows no-thunderstorms copy for categorical outlooks', () => {
    mockState(true, 'categorical');

    render(<StatusOverlay />);

    expect(screen.getByRole('status')).toHaveTextContent('No Thunderstorms Forecasted');
  });
});
