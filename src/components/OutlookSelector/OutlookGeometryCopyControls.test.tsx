import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OutlookGeometryCopyControls from './OutlookGeometryCopyControls';

jest.mock('../ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('OutlookGeometryCopyControls', () => {
  it('renders a compact menu trigger when a source hazard has geometry', () => {
    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={(source) => source === 'wind'}
        canCopyProbabilityFrom={(source) => source === 'wind'}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Match geometry from another hazard')).toBeInTheDocument();
    expect(screen.queryByText('All levels')).not.toBeInTheDocument();
  });

  it('does not render when no source hazards have copyable geometry', () => {
    const { container } = render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={() => false}
        canCopyProbabilityFrom={() => false}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows source hazards in the dropdown menu', async () => {
    const user = userEvent.setup();

    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind', 'hail']}
        canCopyAllFrom={() => true}
        canCopyProbabilityFrom={() => true}
        onCopyAllFrom={jest.fn()}
        onCopyProbabilityFrom={jest.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Match geometry from another hazard'));

    expect(screen.getByText('Match to Tornado')).toBeInTheDocument();
    expect(screen.getByText('From Wind')).toBeInTheDocument();
    expect(screen.getByText('From Hail')).toBeInTheDocument();
  });

  it('invokes the selected copy mode without requiring a nested submenu', async () => {
    const user = userEvent.setup();
    const onCopyAllFrom = jest.fn();
    const onCopyProbabilityFrom = jest.fn();

    render(
      <OutlookGeometryCopyControls
        activeHazard="tornado"
        activeProbability="15%"
        otherHazards={['wind']}
        canCopyAllFrom={() => true}
        canCopyProbabilityFrom={() => true}
        onCopyAllFrom={onCopyAllFrom}
        onCopyProbabilityFrom={onCopyProbabilityFrom}
      />,
    );

    await user.click(screen.getByLabelText('Match geometry from another hazard'));
    await user.click(screen.getByRole('menuitem', { name: 'All levels' }));
    expect(onCopyAllFrom).toHaveBeenCalledWith('wind');

    await user.click(screen.getByLabelText('Match geometry from another hazard'));
    await user.click(screen.getByRole('menuitem', { name: '15% only' }));
    expect(onCopyProbabilityFrom).toHaveBeenCalledWith('wind');
  });
});
