import { render, fireEvent, screen } from '@testing-library/react';
import OverlayControls from './OverlayControls';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({
    overlays: { showStateBorders: false, showCounties: false },
  }),
}));
jest.mock('../../store/overlaysSlice', () => ({
  toggleStateBorders: () => ({ type: 'overlays/toggleStateBorders' }),
  toggleCounties: () => ({ type: 'overlays/toggleCounties' }),
}));

beforeEach(() => mockDispatch.mockClear());

describe('OverlayControls', () => {
  it('renders state borders and counties checkboxes', () => {
    render(<OverlayControls />);
    expect(screen.getByLabelText(/state borders/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/counties/i)).toBeInTheDocument();
  });

  it('dispatches toggleStateBorders when checkbox is clicked', () => {
    render(<OverlayControls />);
    fireEvent.click(screen.getByLabelText(/state borders/i));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'overlays/toggleStateBorders' });
  });

  it('dispatches toggleCounties when checkbox is clicked', () => {
    render(<OverlayControls />);
    fireEvent.click(screen.getByLabelText(/counties/i));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'overlays/toggleCounties' });
  });
});
