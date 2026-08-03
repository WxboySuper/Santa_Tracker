import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../HomePage';

const mockUseHomePageLogic = jest.fn();

jest.mock('./useHomePageLogic', () => ({
  __esModule: true,
  default: () => mockUseHomePageLogic(),
}));

jest.mock('../../components/CycleManager/CycleHistoryModal', () => ({ isOpen }: { isOpen: boolean }) =>
  isOpen ? <div>Cycle history modal open</div> : null
);

jest.mock('../../components/DrawingTools/ConfirmationModal', () => ({ isOpen }: { isOpen: boolean }) =>
  isOpen ? <div>Confirm start new cycle modal open</div> : null
);

const baseStats = {
  daysWithData: [1, 2, 4],
  totalOutlooks: 7,
  totalFeatures: 12,
  savedCyclesCount: 5,
  totalForecastsMade: 9,
  totalCyclesMade: 6,
  forecastStreak: 3,
};

const baseForecastCycle = {
  currentDay: 4,
  cycleDate: '2026-03-27',
  days: {},
};

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  test('renders the signed-out concept view', () => {
    const handlers = {
      handleNavigateForecast: jest.fn(),
      handleNavigateDiscussion: jest.fn(),
      handleNavigateAccount: jest.fn(),
      handleOpenHistoryModal: jest.fn(),
      handleQuickStartClick: jest.fn(),
      handleNewCycle: jest.fn(),
      handleSave: jest.fn(),
      openFilePicker: jest.fn(),
      handleLoadRecentCycleClick: jest.fn(),
      handleConfirmNewCycle: jest.fn(),
      handleCancelNewCycle: jest.fn(),
      handleFileSelect: jest.fn(),
    };

    mockUseHomePageLogic.mockReturnValue({
      variant: 'signed_out',
      stats: baseStats,
      formattedDate: 'Friday, March 27, 2026',
      fileInputRef: { current: null },
      showHistoryModal: false,
      confirmNewCycle: false,
      savedCycles: [],
      forecastCycle: baseForecastCycle,
      workflowMetadata: undefined,
      hasActiveWorkflow: false,
      isSaved: false,
      handleStartWorkflow: jest.fn(),
      handleCreateWorkflowUpdate: jest.fn(),
      ...handlers,
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Create forecasts/i)).toBeInTheDocument();
    expect(screen.getByText(/No account required/i)).toBeInTheDocument();
    expect(screen.getByText(/Powerful tools for every step/i)).toBeInTheDocument();
    expect(screen.getByText(/More with an account/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start a new forecast/i }));
    expect(handlers.handleNavigateForecast).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open a saved forecast/i }));
    expect(handlers.openFilePicker).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /Create a free account/i })[0]);
    expect(handlers.handleNavigateAccount).toHaveBeenCalled();
  });

  test('renders the signed-in concept workspace and wires core actions', () => {
    const quickStart = jest.fn();
    const loadRecent = jest.fn();
    const openHistory = jest.fn();
    const openFilePicker = jest.fn();
    const save = jest.fn();
    const loadFile = jest.fn();
    const navigateForecast = jest.fn();
    const startWorkflow = jest.fn();

    mockUseHomePageLogic.mockReturnValue({
      variant: 'signed_in',
      stats: baseStats,
      formattedDate: 'Friday, March 27, 2026',
      fileInputRef: { current: null },
      showHistoryModal: true,
      confirmNewCycle: true,
      savedCycles: [
        {
          id: 'cycle-1',
          timestamp: '2026-03-25T12:00:00Z',
          cycleDate: '2026-03-25',
          label: 'Cycle 1',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
        {
          id: 'cycle-2',
          timestamp: '2026-03-26T12:00:00Z',
          cycleDate: '2026-03-26',
          label: 'Cycle 2',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
        {
          id: 'cycle-3',
          timestamp: '2026-03-27T12:00:00Z',
          cycleDate: '2026-03-27',
          label: 'Cycle 3',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
        {
          id: 'cycle-4',
          timestamp: '2026-03-28T12:00:00Z',
          cycleDate: '2026-03-28',
          label: 'Cycle 4',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
        {
          id: 'cycle-5',
          timestamp: '2026-03-29T12:00:00Z',
          cycleDate: '2026-03-29',
          label: 'Cycle 5',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
      ],
      forecastCycle: baseForecastCycle,
      workflowMetadata: undefined,
      hasActiveWorkflow: false,
      workflowEnabled: true,
      isSaved: true,
      handleNavigateForecast: navigateForecast,
      handleNavigateDiscussion: jest.fn(),
      handleNavigateAccount: jest.fn(),
      handleOpenHistoryModal: openHistory,
      handleQuickStartClick: quickStart,
      handleNewCycle: jest.fn(),
      handleStartWorkflow: startWorkflow,
      handleCreateWorkflowUpdate: jest.fn(),
      handleSave: save,
      openFilePicker,
      handleLoadRecentCycleClick: loadRecent,
      handleConfirmNewCycle: jest.fn(),
      handleCancelNewCycle: jest.fn(),
      handleFileSelect: loadFile,
    });

    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Continue your forecast/i })).toBeInTheDocument();
    expect(screen.getByText(/At A Glance/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent Cycles/i)).toBeInTheDocument();
    expect(screen.getByText(/Cycle history modal open/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm start new cycle modal open/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View full history/i })).toBeInTheDocument();

    const dayOneButton = screen.getByRole('button', { name: /Day 1/i });
    expect(dayOneButton).toBeEnabled();
    fireEvent.click(dayOneButton);
    expect(startWorkflow).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /2026-03-25/i }));
    expect(loadRecent).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Switch Day/i }));
    expect(openHistory).toHaveBeenCalled();

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    if (fileInput) {
      fireEvent.change(fileInput, {
        target: {
          files: [new File(['{}'], 'forecast.json', { type: 'application/json' })],
        },
      });
    }
    expect(loadFile).toHaveBeenCalled();
    expect(quickStart).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(openFilePicker).not.toHaveBeenCalled();
  });

  test('renders active workflow status and create update on the signed-in home', () => {
    const createUpdate = jest.fn();
    const navigateForecast = jest.fn();
    const startWorkflow = jest.fn();

    mockUseHomePageLogic.mockReturnValue({
      variant: 'signed_in',
      stats: baseStats,
      formattedDate: 'Friday, March 27, 2026',
      fileInputRef: { current: null },
      showHistoryModal: false,
      confirmNewCycle: false,
      savedCycles: [],
      forecastCycle: {
        ...baseForecastCycle,
        days: {
          4: {
            day: 4,
            data: {},
            metadata: {},
          },
        },
      },
      workflowMetadata: {
        workflowId: 'severe-day4-8',
        status: 'draft',
        createdAt: '2026-03-27T12:00:00Z',
        updatedAt: '2026-03-27T12:00:00Z',
        outlookVersions: [{ version: 1, label: 'Initial outlook', createdAt: '2026-03-27T12:00:00Z' }],
      },
      hasActiveWorkflow: true,
      isSaved: true,
      handleNavigateForecast: navigateForecast,
      handleNavigateDiscussion: jest.fn(),
      handleNavigateAccount: jest.fn(),
      handleOpenHistoryModal: jest.fn(),
      handleQuickStartClick: jest.fn(),
      handleNewCycle: jest.fn(),
      handleStartWorkflow: startWorkflow,
      handleCreateWorkflowUpdate: createUpdate,
      handleSave: jest.fn(),
      openFilePicker: jest.fn(),
      handleLoadRecentCycleClick: jest.fn(),
      handleConfirmNewCycle: jest.fn(),
      handleCancelNewCycle: jest.fn(),
      handleFileSelect: jest.fn(),
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Continue your forecast/i })).toBeInTheDocument();
    expect(screen.getByText(/Severe Convective Days 4-8 is draft/i)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Continue Map/i })[0]);
    expect(navigateForecast).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Create update/i }));
    expect(createUpdate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Day 1/i }));
    expect(startWorkflow).toHaveBeenCalled();
  });

  test('keeps the classic home page available with a query switch', () => {
    window.history.pushState({}, '', '/?home=classic');
    const handlers = {
      handleNavigateForecast: jest.fn(),
      handleNavigateDiscussion: jest.fn(),
      handleNavigateAccount: jest.fn(),
      handleOpenHistoryModal: jest.fn(),
      handleQuickStartClick: jest.fn(),
      handleNewCycle: jest.fn(),
      handleSave: jest.fn(),
      openFilePicker: jest.fn(),
      handleLoadRecentCycleClick: jest.fn(),
      handleConfirmNewCycle: jest.fn(),
      handleCancelNewCycle: jest.fn(),
      handleFileSelect: jest.fn(),
    };

    mockUseHomePageLogic.mockReturnValue({
      variant: 'signed_out',
      stats: baseStats,
      formattedDate: 'Friday, March 27, 2026',
      fileInputRef: { current: null },
      showHistoryModal: false,
      confirmNewCycle: false,
      savedCycles: [],
      forecastCycle: baseForecastCycle,
      workflowMetadata: undefined,
      hasActiveWorkflow: false,
      isSaved: false,
      handleStartWorkflow: jest.fn(),
      handleCreateWorkflowUpdate: jest.fn(),
      ...handlers,
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Build outlook packages without fighting the tooling/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Development Disclosure/i)).toBeInTheDocument();
  });

  test('renders the classic signed-in workspace and wires its actions', () => {
    window.history.pushState({}, '', '/?home=classic');
    const handlers = {
      handleNavigateForecast: jest.fn(),
      handleNavigateDiscussion: jest.fn(),
      handleNavigateAccount: jest.fn(),
      handleOpenHistoryModal: jest.fn(),
      handleQuickStartClick: jest.fn(),
      handleNewCycle: jest.fn(),
      handleSave: jest.fn(),
      openFilePicker: jest.fn(),
      handleLoadRecentCycleClick: jest.fn(),
      handleConfirmNewCycle: jest.fn(),
      handleCancelNewCycle: jest.fn(),
      handleFileSelect: jest.fn(),
      handleCloseHistoryModal: jest.fn(),
    };

    mockUseHomePageLogic.mockReturnValue({
      variant: 'signed_in',
      stats: baseStats,
      formattedDate: 'Friday, March 27, 2026',
      fileInputRef: { current: null },
      showHistoryModal: true,
      confirmNewCycle: true,
      savedCycles: [
        {
          id: 'cycle-1',
          timestamp: '2026-03-25T12:00:00Z',
          cycleDate: '2026-03-25',
          label: 'Cycle 1',
          forecastCycle: baseForecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
      ],
      forecastCycle: baseForecastCycle,
      workflowMetadata: undefined,
      hasActiveWorkflow: false,
      isSaved: false,
      handleStartWorkflow: jest.fn(),
      handleCreateWorkflowUpdate: jest.fn(),
      ...handlers,
    });

    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Cycle history modal open/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm start new cycle modal open/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Development Disclosure/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent Cycles/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue Forecast/i }));
    expect(handlers.handleNavigateForecast).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Write Discussion/i }));
    expect(handlers.handleNavigateDiscussion).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open Saved Cycles/i }));
    expect(handlers.handleOpenHistoryModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Start New Cycle/i }));
    expect(handlers.handleNewCycle).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Save Cycle File/i }));
    expect(handlers.handleSave).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Load From File/i }));
    expect(handlers.openFilePicker).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Cycle 1/i }));
    expect(handlers.handleLoadRecentCycleClick).toHaveBeenCalled();

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    if (fileInput) {
      fireEvent.change(fileInput, {
        target: {
          files: [new File(['{}'], 'classic-forecast.json', { type: 'application/json' })],
        },
      });
    }
    expect(handlers.handleFileSelect).toHaveBeenCalled();
  });
});
