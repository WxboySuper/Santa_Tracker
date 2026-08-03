import { render, screen, fireEvent } from '@testing-library/react';
import CompletionValidationModal from './CompletionValidationModal';
import type { CycleValidationResult } from '../../types/workflow';

jest.mock('lucide-react', () => ({
  CheckCircle2: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
  X: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

const completeResult: CycleValidationResult = {
  isComplete: true,
  issues: [],
  missingGroupings: [],
};

const incompleteResult: CycleValidationResult = {
  isComplete: false,
  issues: [
    {
      day: 'day1',
      outlookType: 'tornado',
      type: 'missing-polygon',
      message: 'Day 1 tornado outlook: no polygon drawn',
      severity: 'critical',
      canNavigate: true,
    },
    {
      day: 'day2',
      outlookType: 'categorical',
      type: 'missing-discussion',
      message: 'Day 2: discussion is missing or empty',
      severity: 'warning',
      canNavigate: true,
    },
  ],
  missingGroupings: ['day1'],
};

const defaultHandlers = {
  onClose: jest.fn(),
  onComplete: jest.fn(),
  onCompleteWithOmissions: jest.fn(),
  onOmitDay: jest.fn(),
  omittedDays: {},
};

const renderModal = (
  validationResult: CycleValidationResult,
  overrides: Partial<React.ComponentProps<typeof CompletionValidationModal>> = {},
) => render(
  <CompletionValidationModal
    isOpen={true}
    validationResult={validationResult}
    omittedDays={{}}
    {...defaultHandlers}
    {...overrides}
  />,
);

describe('CompletionValidationModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CompletionValidationModal
        isOpen={false}
        validationResult={completeResult}
        {...defaultHandlers}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders complete status badge', () => {
    renderModal(completeResult);
    expect(screen.getByText('Ready for export')).toBeInTheDocument();
  });

  it('renders incomplete status badge with issue count', () => {
    renderModal(incompleteResult);
    expect(screen.getByText('1 item missing for completion')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = jest.fn();
    renderModal(completeResult, { onClose });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete when Complete is clicked', () => {
    const onComplete = jest.fn();
    renderModal(completeResult, { onComplete });
    fireEvent.click(screen.getByText('Mark Reviewed'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete and onExport when Mark Reviewed & Export is clicked', () => {
    const onComplete = jest.fn();
    const onExport = jest.fn();
    renderModal(completeResult, { onComplete, onExport });
    fireEvent.click(screen.getByText('Mark Reviewed & Export'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('shows "Complete Anyway" for incomplete cycle', () => {
    renderModal(incompleteResult);
    expect(screen.getByText('Complete Anyway')).toBeInTheDocument();
  });

  it('calls onCompleteWithOmissions when "Complete with Omissions" is clicked', () => {
    const onCompleteWithOmissions = jest.fn();
    renderModal(incompleteResult, {
      onCompleteWithOmissions,
      omittedDays: { 1: 'No severe weather expected' },
    });
    fireEvent.click(screen.getByText('Complete with Omissions'));
    expect(onCompleteWithOmissions).toHaveBeenCalledTimes(1);
  });

  it('disables Complete with Omissions until all missing groupings have reasons', () => {
    renderModal(incompleteResult);
    expect(screen.getByText('Complete with Omissions')).toBeDisabled();
  });

  it('calls onOmitDay when an omission reason is entered', () => {
    const onOmitDay = jest.fn();
    renderModal(incompleteResult, { onOmitDay });
    fireEvent.change(
      screen.getByPlaceholderText('Why is Day 1 being omitted?'),
      { target: { value: 'No severe weather expected' } },
    );
    expect(onOmitDay).toHaveBeenCalledWith(1, 'No severe weather expected');
  });

  it('calls onNavigateToIssue when Go button is clicked', () => {
    const onNavigateToIssue = jest.fn();
    renderModal(incompleteResult, { onNavigateToIssue });
    fireEvent.click(screen.getAllByText('Go')[0]);
    expect(onNavigateToIssue).toHaveBeenCalledWith(1, 'tornado');
  });

  it('shows missing groupings summary', () => {
    renderModal(incompleteResult);
    expect(screen.getByText(/Missing groupings: day1/)).toBeInTheDocument();
  });
});
