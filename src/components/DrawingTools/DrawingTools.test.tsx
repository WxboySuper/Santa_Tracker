import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DrawingTools from './DrawingTools';
import forecastReducer from '../../store/forecastSlice';
import * as featureExposure from '../../config/featureExposure';
import type { ForecastMapHandle } from '../Map/ForecastMap';
import type { RootState } from '../../store';

jest.mock('../CycleManager/CycleHistoryModal', () => ({ isOpen }: { isOpen: boolean }) => (
  <div>{isOpen ? 'Cycle history modal open' : 'Cycle history modal closed'}</div>
));

jest.mock('../CycleManager/CopyFromPreviousModal', () => ({ isOpen }: { isOpen: boolean }) => (
  <div>{isOpen ? 'Copy from previous modal open' : 'Copy from previous modal closed'}</div>
));

jest.mock('./useExportMap', () => ({
  useExportMap: jest.fn(),
}));

const mockUseExportMap = jest.requireMock('./useExportMap').useExportMap as jest.Mock;
let initiateExportMock: jest.Mock;
let confirmExportMock: jest.Mock;
let cancelExportMock: jest.Mock;

const buildStore = (overrides?: Partial<RootState['forecast']>) => {
  const forecastState = { ...forecastReducer(undefined, { type: '@@INIT' }), ...(overrides ?? {}) };

  return configureStore({
    reducer: {
      forecast: forecastReducer,
    },
    preloadedState: {
      forecast: forecastState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
};

const renderDrawingTools = (
  store: ReturnType<typeof buildStore>,
  props?: Partial<React.ComponentProps<typeof DrawingTools>>
) => {
  const mapRef = {
    current: {
      getEngine: () => 'leaflet',
      getMap: () => ({ id: 'map-1' }),
    },
  } as unknown as React.RefObject<ForecastMapHandle | null>;

  const defaults: React.ComponentProps<typeof DrawingTools> = {
    onSave: jest.fn(),
    onLoad: jest.fn(),
    onOpenDiscussion: jest.fn(),
    mapRef,
    addToast: jest.fn(),
    ...props,
  };

  return {
    ...render(
      <Provider store={store}>
        <DrawingTools {...defaults} />
      </Provider>
    ),
    props: defaults,
  };
};

describe('DrawingTools', () => {
  let clickSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    initiateExportMock = jest.fn();
    confirmExportMock = jest.fn();
    cancelExportMock = jest.fn();
    mockUseExportMap.mockReturnValue({
      isExporting: false,
      isModalOpen: false,
      initiateExport: initiateExportMock,
      confirmExport: confirmExportMock,
      cancelExport: cancelExportMock,
    });
  });

  afterEach(() => {
    clickSpy?.mockRestore();
    clickSpy = undefined;
    jest.restoreAllMocks();
  });

  test('wires the primary toolbar actions and reset flow', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    const onLoad = jest.fn();
    const onOpenDiscussion = jest.fn();
    const addToast = jest.fn();
    const store = buildStore({ isSaved: false });

    clickSpy = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

    const { container } = renderDrawingTools(store, { onSave, onLoad, onOpenDiscussion, addToast });

    expect(screen.getByText(/Drawing Instructions/i)).toBeInTheDocument();
    expect(screen.getByText(/You have unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByText(/Cycle history modal closed/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy from previous modal closed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save Forecast/i }));
    expect(onSave).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Load Forecast/i }));
    expect(clickSpy).toHaveBeenCalled();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'forecast.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onLoad).toHaveBeenCalledWith(file);

    await user.click(screen.getByRole('button', { name: /Forecast Discussion/i }));
    expect(onOpenDiscussion).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Export as Image/i }));
    expect(initiateExportMock).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Cycle History/i }));
    expect(screen.getByText(/Cycle history modal open/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy from Previous/i }));
    expect(screen.getByText(/Copy from previous modal open/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reset All/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reset/i }));
    expect(addToast).toHaveBeenCalledWith('Forecasts reset successfully.', 'info');
    expect(store.getState().forecast.isSaved).toBe(false);

  });

  test('shows disabled helper text when feature flags are off', () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation((feature) => {
      return feature !== 'exportMap' && feature !== 'saveLoad';
    });

    const store = buildStore({ isSaved: true });

    renderDrawingTools(store);

    expect(screen.getAllByText(/Export feature is temporarily unavailable due to an issue/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/save\/load features are temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/GitHub issue #32/i).length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: /Save Forecast/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Load Forecast/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Export as Image/i })).toBeDisabled();
  });

  test('renders the export modal and loading overlay', async () => {
    const user = userEvent.setup();
    const confirmExport = jest.fn();
    const cancelExport = jest.fn();
    mockUseExportMap.mockReturnValue({
      isExporting: true,
      isModalOpen: true,
      initiateExport: jest.fn(),
      confirmExport,
      cancelExport,
    });

    renderDrawingTools(buildStore({ isSaved: true }));

    expect(screen.getByText(/Generating forecast image/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Export Forecast Image/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Image Title/i), 'Storm Day');
    await user.click(within(screen.getByRole('dialog', { name: /Export Forecast Image/i })).getByRole('button', { name: /^Export$/i }));
    expect(confirmExport).toHaveBeenCalledWith('Storm Day');

    await user.click(within(screen.getByRole('dialog', { name: /Export Forecast Image/i })).getByRole('button', { name: /Cancel/i }));
    expect(cancelExport).toHaveBeenCalled();
  });
});
