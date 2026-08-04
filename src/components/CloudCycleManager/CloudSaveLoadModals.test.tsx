import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloudSaveModal, CloudLoadModal } from './CloudSaveLoadModals';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-icon" />,
  Cloud: () => <div data-testid="cloud-icon" />,
  Loader: () => <div data-testid="loader-icon" />,
  X: () => <div data-testid="x-icon" />,
}));

describe('CloudSaveModal', () => {
  const onOpenChange = jest.fn();
  const onSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders when open', () => {
    render(
      <CloudSaveModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        currentLabel="Test Forecast"
      />
    );
    // Use getAllByText or specific roles since the title and button share text
    expect(screen.getByRole('heading', { name: 'Save to Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to Cloud' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Forecast')).toBeInTheDocument();
  });

  test('handles label change and save success', async () => {
    onSave.mockResolvedValue(true);
    render(
      <CloudSaveModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const input = screen.getByLabelText('Cycle name');
    fireEvent.change(input, { target: { value: 'New Label' } });
    
    const saveButton = screen.getByRole('button', { name: 'Save to Cloud' });
    
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('New Label'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('handles save failure', async () => {
    onSave.mockResolvedValue(false);
    render(
      <CloudSaveModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        currentLabel="Fail Test"
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Save to Cloud' });
    
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('disables save button when label is empty', () => {
    render(
      <CloudSaveModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        currentLabel=""
      />
    );
    const saveButton = screen.getByRole('button', { name: 'Save to Cloud' });
    expect(saveButton).toBeDisabled();
  });

  test('displays error message', () => {
    render(
      <CloudSaveModal
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        error="Something went wrong"
      />
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('CloudLoadModal', () => {
  const onOpenChange = jest.fn();
  const onLoad = jest.fn();
  const mockCycles = [
    { id: '1', label: 'Cycle 1', updatedAt: '2026-04-01T12:00:00Z', cycleDate: '20260401' },
    { id: '2', label: 'Cycle 2', updatedAt: '2026-04-02T12:00:00Z', cycleDate: '20260402' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders cycles and handles selection', async () => {
    render(
      <CloudLoadModal
        open
        onOpenChange={onOpenChange}
        onLoad={onLoad}
        cycles={mockCycles}
      />
    );

    expect(screen.getByText('Cycle 1')).toBeInTheDocument();
    expect(screen.getByText('Cycle 2')).toBeInTheDocument();

    const cycle1Button = screen.getByRole('button', { name: /Cycle 1/i });
    fireEvent.click(cycle1Button);

    const loadButton = screen.getByRole('button', { name: 'Load' });
    fireEvent.click(loadButton);

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it.each([
    { name: 'shows empty message when no cycles', cycles: [], expected: 'No cloud cycles saved yet' },
    { name: 'shows loading indicator', cycles: [], expected: 'loader-icon' },
  ])('$name', ({ cycles, expected }) => {
    render(
      <CloudLoadModal
        open
        onOpenChange={onOpenChange}
        onLoad={onLoad}
        cycles={cycles}
        isLoading={expected === 'loader-icon'}
      />
    );

    const indicator = expected === 'loader-icon'
      ? screen.queryByTestId('loader-icon')
      : screen.queryByText(expected);
    expect(indicator).toBeInTheDocument();
  });
});
