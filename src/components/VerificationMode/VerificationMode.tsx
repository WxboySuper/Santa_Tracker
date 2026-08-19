import React, { useRef, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { Eye, FileUp, Layers3 } from 'lucide-react';
import VerificationMap, { VerificationMapHandle } from '../Map/VerificationMap';
import VerificationPanel from '../Verification/VerificationPanel';
import { loadVerificationForecast, clearVerificationForecast } from '../../store/verificationSlice';
import { deserializeForecast, readForecastImportFile, validateForecastDataReason } from '../../utils/fileUtils';
import { DayType } from '../../types/outlooks';
import { useAppLayout } from '../Layout/AppLayout';
import { useAuth } from '../../auth/AuthProvider';
import { queueProductMetric } from '../../utils/productMetrics';
import './VerificationMode.css';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

type VerificationOutlookType = 'categorical' | 'tornado' | 'wind' | 'hail';

// Helper function to extract available days from the loaded forecast data, which checks the days object in the deserialized forecast and returns an array of day types that have data. This is used to populate the day selector buttons in the UI so users can only select days that actually have forecast data to view.
const getAvailableDays = (days: Record<string, unknown> | undefined): DayType[] => {
  if (!days) {
    return [];
  }

  return (Object.keys(days) as unknown as DayType[])
    .filter((day) => Boolean((days as Record<DayType, unknown>)[day]))
    .sort((a, b) => a - b);
};

// Parses and validates through the shared JSON and workflow-package import pipeline.
const parseAndValidateForecast = async (file: File) => {
  const json = await readForecastImportFile(file);

  const validationError = validateForecastDataReason(json);
  if (validationError) {
    throw new Error(validationError);
  }

  return deserializeForecast(json);
};

// Helper function to analyze verification results by comparing storm reports against the forecast outlooks, which takes in the storm reports and the outlook data for the selected day and calculates various metrics such as total reports, reports by type, and hit/miss analysis for each outlook type. It returns a structured result that can be used to display verification summaries in the UI.
const VerificationModeHeader: React.FC<{ forecastLoaded: boolean }> = ({ forecastLoaded }) => (
  <div className="verification-topbar">
    <div className="verification-topbar-copy">
      <h2>Forecast Verification</h2>
      <p className="verification-subtitle">
        {forecastLoaded
          ? 'Compare the loaded outlook against observed storm reports.'
          : 'Load a saved forecast, then bring in storm reports to verify performance.'}
      </p>
    </div>
  </div>
);

// Component for selecting the forecast day to view in verification mode, which renders a set of buttons for each available day based on the loaded forecast data. When a day button is clicked, it calls the onDayClick handler passed in as a prop to update the selected day in the parent component's state.
const DaySelectorSection: React.FC<{
  selectedDay: DayType;
  availableDays: DayType[];
  onDayClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ selectedDay, availableDays, onDayClick }) => (
  <div className="day-selector-section">
    <label>Forecast Day:</label>
    <div className="day-selector-buttons">
      {availableDays.map((day) => (
        <button
          key={day}
          className={`day-btn ${selectedDay === day ? 'active' : ''}`}
          data-day={day}
          onClick={onDayClick}
          title={`Day ${day}`}
        >
          Day {day}
        </button>
      ))}
    </div>
  </div>
);

// Helper function to compare risk levels for sorting purposes, which defines a specific order for risk levels (e.g., High > Moderate > Slight > Marginal) and returns a value that can be used to sort them accordingly when displaying verification summaries by risk level.
const OutlookTypeSelector: React.FC<{
  activeOutlookType: VerificationOutlookType;
  onSelectCategorical: () => void;
  onSelectTornado: () => void;
  onSelectWind: () => void;
  onSelectHail: () => void;
}> = ({
  activeOutlookType,
  onSelectCategorical,
  onSelectTornado,
  onSelectWind,
  onSelectHail
}) => (
  <div className="outlook-type-selector">
    <label>View Outlook Type</label>
    <div className="outlook-type-buttons" role="tablist" aria-label="Verification outlook type">
      <button
        type="button"
        className={`outlook-type-btn ${activeOutlookType === 'categorical' ? 'active' : ''}`}
        onClick={onSelectCategorical}
      >
        <Layers3 className="h-4 w-4" />
        Categorical
      </button>
      <button
        type="button"
        className={`outlook-type-btn ${activeOutlookType === 'tornado' ? 'active' : ''}`}
        onClick={onSelectTornado}
      >
        Tornado
      </button>
      <button
        type="button"
        className={`outlook-type-btn ${activeOutlookType === 'wind' ? 'active' : ''}`}
        onClick={onSelectWind}
      >
        Wind
      </button>
      <button
        type="button"
        className={`outlook-type-btn ${activeOutlookType === 'hail' ? 'active' : ''}`}
        onClick={onSelectHail}
      >
        Hail
      </button>
    </div>
  </div>
);

// Sub-component showing the checkmark and file name once a forecast is loaded.
const LoadedIndicator: React.FC<{ fileName: string }> = ({ fileName }) => (
  <div className="loaded-indicator">
    <span className="checkmark">✓</span>
    <div>
      <strong>Forecast Loaded</strong>
      <p className="file-name">{fileName}</p>
    </div>
  </div>
);

// Sidebar component that shows the forecast loading section and the verification panel, which conditionally renders either a file upload area for loading a forecast or the verification panel with storm report filters based on whether a forecast has been loaded. It also includes handlers for loading a forecast file and clearing the loaded forecast, which are passed down as props from the parent component.
const ForecastLoaderSection: React.FC<{
  forecastLoaded: boolean;
  fileName: string;
  onLoadForecast: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearForecast: () => void;
}> = ({ forecastLoaded, fileName, onLoadForecast, onClearForecast }) => {
  if (!forecastLoaded) {
    return (
      <div className="forecast-loader-section">
        <div className="verification-section-header">
          <span className="verification-section-step">Step 1</span>
          <h3>Load Forecast</h3>
        </div>
        <div className="file-upload-area">
          <label htmlFor="forecast-file" className="file-upload-label">
            <div className="upload-icon"><FileUp className="h-4 w-4" /></div>
            <span>Choose Forecast File</span>
            <input
              type="file"
              id="forecast-file"
              accept=".json"
              onChange={onLoadForecast}
              className="file-input"
            />
          </label>
          <p className="upload-hint">
            Select a .json forecast file exported from the Outlook Creator
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="forecast-loader-section">
      <div className="verification-section-header">
        <span className="verification-section-step">Step 1</span>
        <h3>Load Forecast</h3>
      </div>
      <div className="forecast-loaded">
        <LoadedIndicator fileName={fileName} />
        <button type="button" onClick={onClearForecast} className="clear-forecast-btn">
          Load Different Forecast
        </button>
      </div>
    </div>
  );
};

// Main sidebar component that conditionally renders the forecast loader or the verification panel based on whether a forecast has been loaded, which also manages the state for the loaded forecast file name, active outlook type, selected day, and available days. It passes down necessary handlers and state as props to the child components for loading forecasts, selecting outlook types, and selecting days.
const VerificationSidebar: React.FC<{
  forecastLoaded: boolean;
  fileName: string;
  activeOutlookType: VerificationOutlookType;
  selectedDay: DayType;
  onLoadForecast: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearForecast: () => void;
}> = ({
  forecastLoaded,
  fileName,
  activeOutlookType,
  selectedDay,
  onLoadForecast,
  onClearForecast
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<'setup' | 'analysis'>('setup');

  if (!forecastLoaded) {
    return (
      <div className="verification-sidebar">
        <ForecastLoaderSection
          forecastLoaded={forecastLoaded}
          fileName={fileName}
          onLoadForecast={onLoadForecast}
          onClearForecast={onClearForecast}
        />
        <div className="waiting-message">
          <p>👈 Load a forecast to begin verification</p>
        </div>
      </div>
    );
  }

  return (
    <div className="verification-sidebar">
      <div className="verification-sidebar-tabs" role="tablist" aria-label="Verification sidebar">
        <button
          type="button"
          className={`verification-sidebar-tab ${activeSidebarTab === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('setup')}
        >
          <FileUp className="h-4 w-4" />
          Load Data
        </button>
        <button
          type="button"
          className={`verification-sidebar-tab ${activeSidebarTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('analysis')}
        >
          <Eye className="h-4 w-4" />
          Analysis
        </button>
      </div>

      {activeSidebarTab === 'setup' ? (
        <>
          <ForecastLoaderSection
            forecastLoaded={forecastLoaded}
            fileName={fileName}
            onLoadForecast={onLoadForecast}
            onClearForecast={onClearForecast}
          />
          <div className="reports-section">
            <div className="verification-section-header">
              <span className="verification-section-step">Step 2</span>
              <h3>Load Storm Reports</h3>
            </div>
            <VerificationPanel
              activeOutlookType={activeOutlookType}
              selectedDay={selectedDay}
              activePanel="setup"
            />
          </div>
        </>
      ) : (
        <div className="reports-section">
          <div className="verification-section-header">
            <span className="verification-section-step">Analysis</span>
            <h3>Verification Results</h3>
          </div>
          <VerificationPanel
            activeOutlookType={activeOutlookType}
            selectedDay={selectedDay}
            activePanel="analysis"
          />
        </div>
      )}
    </div>
  );
};

// Main component for the verification mode, which manages the overall state for the loaded forecast, selected day, active outlook type, and handles the logic for loading a forecast file, clearing the loaded forecast, and selecting different outlook types and days. It renders the header, day selector, outlook type selector, sidebar with forecast loading and verification panel, and the verification map that displays the forecast and storm reports based on the selected options.
const VerificationMode: React.FC = () => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const { user } = useAuth();
  const mapRef = useRef<VerificationMapHandle>(null);
  const [forecastLoaded, setForecastLoaded] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [activeOutlookType, setActiveOutlookType] = useState<VerificationOutlookType>('categorical');
  const [selectedDay, setSelectedDay] = useState<DayType>(1);
  const [availableDays, setAvailableDays] = useState<DayType[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  // Handler for when a forecast file is selected for loading, which reads the file, parses and validates it, and then dispatches an action to load the forecast data into the Redux store. It also updates local state for the loaded file name, available days based on the forecast data, and shows toast notifications for success or error cases.
  const handleLoadForecast = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);

    try {
      const deserialized = await parseAndValidateForecast(file);
      const daysWithData = getAvailableDays(deserialized.days as Record<string, unknown> | undefined);

      dispatch(loadVerificationForecast(deserialized));
      setAvailableDays(daysWithData);
      setSelectedDay(daysWithData[0] || 1);
      setForecastLoaded(true);
      queueProductMetric({ event: 'verification_run', user });
      addToast('Forecast loaded! Load storm reports to begin verification.', 'success');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to load forecast file. Please ensure it\'s a valid GFC forecast JSON.';
      addToast(message, 'error');
    } finally {
      event.target.value = '';
    }
  }, [dispatch, addToast, user]);

  // Handler for when the user clicks the button to clear the loaded forecast, which opens a confirmation modal to confirm the action. If the user confirms, it dispatches an action to clear the forecast data from the Redux store and resets local state related to the loaded forecast. If the user cancels, it simply closes the confirmation modal without making any changes.
  const handleClearForecast = useCallback(() => {
    setConfirmClear(true);
  }, []);

  // Canceling clear just closes the confirmation modal without changing anything
  const handleCancelClear = useCallback(() => {
    setConfirmClear(false);
  }, []);

  // Outlook type selection handlers
  const handleSelectOutlook = useCallback((type: VerificationOutlookType) => {
    setActiveOutlookType(type);
  }, []);

  const outlookHandlers = React.useMemo(() => ({
    categorical: () => handleSelectOutlook('categorical'),
    tornado: () => handleSelectOutlook('tornado'),
    wind: () => handleSelectOutlook('wind'),
    hail: () => handleSelectOutlook('hail'),
  }), [handleSelectOutlook]);

  // Handler for day selection buttons
  const handleDayButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(event.currentTarget.dataset.day) as DayType;
    if (Number.isNaN(day)) {
      return;
    }

    setSelectedDay(day);
  }, []);

  // Handler for confirming forecast clear, which dispatches an action to clear the forecast data from the Redux store and resets local state related to the loaded forecast. This is called when the user confirms they want to clear the loaded forecast in the confirmation modal.
  const handleConfirmClear = useCallback(() => {
    dispatch(clearVerificationForecast());
    setForecastLoaded(false);
    setAvailableDays([]);
    setSelectedDay(1);
    setFileName('');
    setConfirmClear(false);
  }, [dispatch]);

  return (
    <div className="verification-mode">
      <VerificationModeHeader forecastLoaded={forecastLoaded} />

      {forecastLoaded && (
        <div className="verification-control-rail">
          <DaySelectorSection
            selectedDay={selectedDay}
            availableDays={availableDays}
            onDayClick={handleDayButtonClick}
          />

          <OutlookTypeSelector
            activeOutlookType={activeOutlookType}
            onSelectCategorical={outlookHandlers.categorical}
            onSelectTornado={outlookHandlers.tornado}
            onSelectWind={outlookHandlers.wind}
            onSelectHail={outlookHandlers.hail}
          />
        </div>
      )}

      <div className="verification-content">
        <VerificationSidebar
          forecastLoaded={forecastLoaded}
          fileName={fileName}
          activeOutlookType={activeOutlookType}
          selectedDay={selectedDay}
          onLoadForecast={handleLoadForecast}
          onClearForecast={handleClearForecast}
        />

        <div className="verification-map-container">
          <VerificationMap ref={mapRef} activeOutlookType={activeOutlookType} selectedDay={selectedDay} />
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmClear}
        title="Clear Forecast"
        message="Clear the loaded forecast? This will also clear any storm reports."
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
        confirmLabel="Clear"
      />
    </div>
  );
};

export default VerificationMode;
