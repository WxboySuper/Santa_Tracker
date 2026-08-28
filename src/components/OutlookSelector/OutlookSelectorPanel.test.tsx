import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OutlookSelectorPanel from './OutlookSelectorPanel';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';

jest.mock('../OutlookPanel/useOutlookPanelLogic');

jest.mock('../ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockUseOutlookPanelLogic = useOutlookPanelLogic as jest.MockedFunction<typeof useOutlookPanelLogic>;

describe('OutlookSelectorPanel', () => {
  const tornadoHandler = jest.fn();
  const categoricalHandler = jest.fn();
  const prob10Handler = jest.fn();
  const probSigHandler = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOutlookPanelLogic.mockReturnValue({
      activeOutlookType: 'tornado',
      activeProbability: '10%',
      isSignificant: true,
      significantThreatsEnabled: true,
      getOutlookTypeEnabled: (type) => ['tornado', 'categorical', 'wind', 'hail'].includes(type),
      outlookTypeHandlers: {
        tornado: tornadoHandler,
        wind: jest.fn(),
        hail: jest.fn(),
        categorical: categoricalHandler,
        totalSevere: jest.fn(),
        'day4-8': jest.fn(),
      },
      probabilities: ['2%', '10%', 'SIG'],
      probabilityHandlers: {
        '2%': jest.fn(),
        '10%': prob10Handler,
        SIG: probSigHandler,
      },
      outlookOpacity: 1,
      handleOutlookOpacityChange: jest.fn(),
      activeProbabilisticHazard: 'tornado',
      otherProbabilisticHazards: ['wind', 'hail'],
      canCopyAllFrom: jest.fn(() => false),
      canCopyProbabilityFrom: jest.fn(() => false),
      handleCopyAllGeometryFrom: jest.fn(),
      handleCopyProbabilityGeometryFrom: jest.fn(),
    } as ReturnType<typeof useOutlookPanelLogic>);
  });

  it('renders available outlook types, probabilities, and current selection', () => {
    render(<OutlookSelectorPanel />);

    expect(screen.getByRole('button', { name: /Tornado/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Categorical/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Total Severe/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10%' })).toBeInTheDocument();
    expect(screen.getByText('Tornado - 10% (Sig)')).toBeInTheDocument();
  });

  it('calls outlook and probability handlers', async () => {
    const user = userEvent.setup();
    render(<OutlookSelectorPanel />);

    await user.click(screen.getByRole('button', { name: /Tornado/ }));
    await user.click(screen.getByRole('button', { name: 'SIG' }));

    expect(tornadoHandler).toHaveBeenCalledTimes(1);
    expect(probSigHandler).toHaveBeenCalledTimes(1);
  });

  it('uses categorical labeling and readable text colors', () => {
    mockUseOutlookPanelLogic.mockReturnValue({
      ...mockUseOutlookPanelLogic(),
      activeOutlookType: 'categorical',
      activeProbability: 'MRGL',
      isSignificant: false,
      probabilities: ['TSTM', 'MRGL', 'ENH'],
      probabilityHandlers: {
        TSTM: jest.fn(),
        MRGL: prob10Handler,
        ENH: jest.fn(),
      },
    } as ReturnType<typeof useOutlookPanelLogic>);

    render(<OutlookSelectorPanel />);

    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Marginal Risk (1/5)')).toBeInTheDocument();
    expect(screen.getByText('Categorical - MRGL')).toHaveClass('text-black');
  });
});
