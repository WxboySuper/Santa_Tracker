import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  setReports,
  setDate,
  setLoading,
  setError,
  toggleVisibility,
  toggleReportType,
  clearReports
} from '../../store/stormReportsSlice';
import { selectVerificationOutlooksForDay } from '../../store/verificationSlice';
import { fetchStormReports, fetchTodayStormReports, fetchYesterdayStormReports, formatReportDate } from '../../utils/stormReportParser';
import {
  getCurrentSpcReportDate,
  isTodayReportDate,
  isYesterdayReportDate,
} from '../../utils/verificationV2/archiveDate';
import { analyzeVerification, formatVerificationSummary } from '../../utils/verificationUtils';
import type { OutlookTypeVerification, VerificationResult } from '../../utils/verificationUtils';
import type { StormReport } from '../../types/stormReports';
import { DayType } from '../../types/outlooks';
import './VerificationPanel.css';

/** Resolves the report source for a selected date relative to today. */
const reportSourceForDate = (reportDate: string, now: Date): 'today' | 'yesterday' | 'archive' => {
  if (isTodayReportDate(reportDate, now)) {
    return 'today';
  }
  if (isYesterdayReportDate(reportDate, now)) {
    return 'yesterday';
  }
  return 'archive';
};

/** Fetches reports from the SPC source resolved for a date. */
const fetchReportsForSource = (
  source: 'today' | 'yesterday' | 'archive',
  reportDate: string,
): Promise<StormReport[]> => {
  if (source === 'today') {
    return fetchTodayStormReports();
  }
  if (source === 'yesterday') {
    return fetchYesterdayStormReports();
  }
  return fetchStormReports(reportDate);
};

interface VerificationPanelProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
  activePanel?: 'setup' | 'analysis';
}

type ActiveOutlookType = NonNullable<VerificationPanelProps['activeOutlookType']>;

interface ReportTypeFilter {
  tornado: boolean;
  wind: boolean;
  hail: boolean;
}

interface ReportCounts {
  tornado: number;
  wind: number;
  hail: number;
}

type RiskEntry = [
  string,
  {
    hits: number;
    misses: number;
    hitRate: number;
    total: number;
  }
];

// Define a consistent order for risk levels to ensure they are displayed in a logical sequence in the UI.
const RISK_LEVEL_ORDER = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH', '2%', '5%', '10%', '15%', '30%', '45%', '60%', 'SIG'];

// Utility function to compare risk levels based on the defined order,
// used for sorting risk level breakdowns in the verification analysis.
const getReportCounts = (reports: { type: 'tornado' | 'wind' | 'hail' }[]): ReportCounts => ({
  tornado: reports.filter((r) => r.type === 'tornado').length,
  wind: reports.filter((r) => r.type === 'wind').length,
  hail: reports.filter((r) => r.type === 'hail').length
});

// Calculates hit rates for each risk level within an outlook type, based on the total relevant reports for that type.
const ErrorBanner: React.FC<{ error: string }> = ({ error }) => {
  const isInfo = error.startsWith('info:');
  const message = isInfo ? error.replace('info:', '') : error;
  const icon = isInfo ? 'ℹ️' : '⚠️';

  return (
    <div className={isInfo ? 'info-message' : 'error-message'}>
      <p>{icon} {message}</p>
    </div>
  );
};

// The ReportSummarySection component displays a summary of the loaded storm reports,
// including the date, total count, and breakdown by type.
// It provides users with a quick overview of the data they are working with before diving into the verification analysis.
const ReportSummarySection: React.FC<{ date: string | null; totalReports: number; reportCounts: ReportCounts }> = ({
  date,
  totalReports,
  reportCounts
}) => (
  <div className="verification-section">
    <h3>Report Summary</h3>
    <div className="report-summary">
      <p><strong>Date:</strong> {date}</p>
      <p><strong>Total Reports:</strong> {totalReports}</p>
      <ul>
        <li>Tornado: {reportCounts.tornado}</li>
        <li>Wind: {reportCounts.wind}</li>
        <li>Hail: {reportCounts.hail}</li>
      </ul>
    </div>
  </div>
);

// The DisplayOptionsSection component provides a simple checkbox for toggling the visibility of storm reports on the map.
const DisplayOptionsSection: React.FC<{ visible: boolean; onToggleVisibility: () => void }> = ({
  visible,
  onToggleVisibility
}) => (
  <div className="verification-section">
    <h3>Display Options</h3>
    <div className="display-controls">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visible}
          onChange={onToggleVisibility}
        />
        <span>Show Reports on Map</span>
      </label>
    </div>
  </div>
);

// The FilterByTypeSection component provides checkboxes for filtering the displayed storm reports by type (tornado, wind, hail).
const FilterByTypeSection: React.FC<{
  visible: boolean;
  filterByType: ReportTypeFilter;
  reportCounts: ReportCounts;
  onToggleType: (type: 'tornado' | 'wind' | 'hail') => void;
}> = ({ visible, filterByType, reportCounts, onToggleType }) => {
  if (!visible) {
    return null;
  }

  // Handlers for toggling each report type filter, which call the onToggleType prop with the corresponding type to update the Redux store state.
  const handleToggleTornado = () => {
    onToggleType('tornado');
  };

  // Handler to toggle the wind report type filter
  const handleToggleWind = () => {
    onToggleType('wind');
  };

  // Handler to toggle the hail report type filter
  const handleToggleHail = () => {
    onToggleType('hail');
  };

  return (
    <div className="verification-section">
      <h3>Filter by Type</h3>
      <div className="filter-controls">
        <label className="checkbox-label tornado-label">
          <input
            type="checkbox"
            checked={filterByType.tornado}
            onChange={handleToggleTornado}
          />
          <span>🌪️ Tornado ({reportCounts.tornado})</span>
        </label>
        <label className="checkbox-label wind-label">
          <input
            type="checkbox"
            checked={filterByType.wind}
            onChange={handleToggleWind}
          />
          <span>💨 Wind ({reportCounts.wind})</span>
        </label>
        <label className="checkbox-label hail-label">
          <input
            type="checkbox"
            checked={filterByType.hail}
            onChange={handleToggleHail}
          />
          <span>🧊 Hail ({reportCounts.hail})</span>
        </label>
      </div>
    </div>
  );
};

// The RiskLevelStatRow component displays a single row of the risk level breakdown,
// showing the risk level name, hit count, and hit rate percentage.
const RiskLevelStatRow: React.FC<{ level: string; hitRate: number; hits: number }> = ({ level, hitRate, hits }) => (
  <div className="risk-level-stat">
    <span className="risk-level-name">{level}:</span>
    <span className="risk-level-value">
      {hits} hits ({hitRate.toFixed(1)}%)
    </span>
  </div>
);

// The VerificationMetrics component displays the key metrics (hit rate, hits, misses) for the active outlook type,
const VerificationMetrics: React.FC<{ activeVerification: OutlookTypeVerification }> = ({ activeVerification }) => (
  <div className="verification-metrics">
    <div className="verification-stat-card verification-stat-card-primary">
      <span className="verification-stat-label">Hit Rate</span>
      <strong className="verification-stat-number">{activeVerification.hitRate.toFixed(1)}%</strong>
    </div>
    <div className="verification-stat-card verification-stat-card-hit">
      <span className="verification-stat-label">Hits</span>
      <strong className="verification-stat-number">{activeVerification.hits}</strong>
    </div>
    <div className="verification-stat-card verification-stat-card-miss">
      <span className="verification-stat-label">Misses</span>
      <strong className="verification-stat-number">{activeVerification.misses}</strong>
    </div>
  </div>
);

// The RiskLevelBreakdown component displays a breakdown of hits by risk level for the active outlook type,
const RiskLevelBreakdown: React.FC<{ riskEntries: RiskEntry[] }> = ({ riskEntries }) => {
  if (riskEntries.length === 0) {
    return null;
  }

  return (
    <div className="risk-level-breakdown">
      <h4>By Risk Level:</h4>
      <div className="risk-level-stats">
        {riskEntries.map(([level, data]) => (
          <RiskLevelStatRow
            key={level}
            level={level}
            hits={data.hits}
            hitRate={data.hitRate}
          />
        ))}
      </div>
    </div>
  );
};

// The VerificationSummaryDetails component provides a collapsible section that shows a detailed textual summary
// of the verification results,
const VerificationSummaryDetails: React.FC<{
  verificationResult: VerificationResult;
  activeOutlookType: ActiveOutlookType;
}> = ({ verificationResult, activeOutlookType }) => (
  <>
    <details className="verification-details">
      <summary>View Detailed Summary</summary>
      <pre className="verification-summary">
        {formatVerificationSummary(verificationResult, activeOutlookType)}
      </pre>
    </details>
    <p className="verification-note">
      <small>
        <strong>Note:</strong> A &quot;hit&quot; means the report falls within the forecast outlook area.
        Risk levels show how many reports fell within each specific risk category.
      </small>
    </p>
  </>
);

// The VerificationAnalysisSection component displays the results of the verification analysis for the selected outlook type.
const VerificationAnalysisSection: React.FC<{
  verificationResult: VerificationResult;
  activeOutlookType: ActiveOutlookType;
}> = ({ verificationResult, activeOutlookType }) => {
  const activeVerification = verificationResult[activeOutlookType] as OutlookTypeVerification;
  const riskEntries = Object.entries(activeVerification.byRiskLevel).sort(
    (a, b) => RISK_LEVEL_ORDER.indexOf(b[0].toUpperCase()) - RISK_LEVEL_ORDER.indexOf(a[0].toUpperCase())
  ) as RiskEntry[];

  return (
    <div className="verification-section">
      <h3>Verification Analysis - {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)}</h3>
      <div className="verification-results">
        <VerificationMetrics activeVerification={activeVerification} />
        <RiskLevelBreakdown riskEntries={riskEntries} />
        <VerificationSummaryDetails
          verificationResult={verificationResult}
          activeOutlookType={activeOutlookType}
        />
      </div>
    </div>
  );
};

// The main VerificationPanel component manages the overall state and interactions for loading storm reports,
// displaying summaries, and showing verification analysis results.
// It connects to the Redux store to fetch data and dispatch actions,
// and it uses local state for managing the selected date for report loading.
const VerificationPanel: React.FC<VerificationPanelProps> = ({ 
  activeOutlookType = 'categorical',
  selectedDay = 1,
  activePanel = 'setup',
}) => {
  const dispatch = useDispatch();
  // Select storm report data and UI state from the Redux store.
  const { date, loading, error, visible, filterByType, reports } = useSelector(
    (state: RootState) => state.stormReports
  );
  // Select the relevant outlooks for the currently selected day from the verification slice of the Redux store.
  const outlooks = useSelector((state: RootState) => selectVerificationOutlooksForDay(state, selectedDay));
  
  // Calculate verification results when reports or outlooks change
  const verificationResult = useMemo(() => {
    if (reports.length === 0) return null;
    return analyzeVerification(reports, outlooks);
  }, [reports, outlooks]);

  // Local state for managing the selected date for loading storm reports.
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getCurrentSpcReportDate();
  });
  
  // Handler for loading storm reports based on the selected date.
  const handleLoadReports = async () => {
    try {
      dispatch(setLoading(true));
      dispatch(setError(null));
      
      // Parse YYYY-MM-DD string directly to avoid timezone issues
      const [year, month, day] = selectedDate.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed

      const reportDate = formatReportDate(dateObj);
      const source = reportSourceForDate(reportDate, new Date());
      const fetchedReports = await fetchReportsForSource(source, reportDate);

      dispatch(setReports(fetchedReports));
      dispatch(setDate(reportDate));

      if (fetchedReports.length === 0) {
        dispatch(setError('info:No storm reports found for this date.'));
      }
    } catch (err) {
      dispatch(setError(
        err instanceof Error ? err.message : 'Failed to load storm reports. The date may not have available data.'
      ));
    } finally {
      dispatch(setLoading(false));
    }
  };
  
  // Handler for clearing loaded storm reports from the Redux store, resetting the date and any errors.
  const handleClearReports = () => {
    dispatch(clearReports());
  };
  
  // Handler for toggling the visibility of storm reports on the map, which updates the Redux store state accordingly.
  const handleToggleVisibility = () => {
    dispatch(toggleVisibility());
  };
  
  // Handler for toggling the filter for a specific report type (tornado, wind, hail),
  // which updates the Redux store state to show/hide that type of report on the map.
  const handleToggleType = (type: 'tornado' | 'wind' | 'hail') => {
    dispatch(toggleReportType(type));
  };

  // If there are no reports loaded, we can return early and only show the load section and any messages.
  const handleSelectedDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const reportCounts = getReportCounts(reports);
  const totalReports = reports.length;
  const hasReports = totalReports > 0;
  
  const showSetupPanel = activePanel === 'setup';
  const showAnalysisPanel = activePanel === 'analysis';

  return (
    <div className="verification-panel">
      {showSetupPanel ? (
        <div className="verification-section">
          <div className="date-selector">
            <label htmlFor="report-date">
              Select Date
              <input
                type="date"
                id="report-date"
                value={selectedDate}
                onChange={handleSelectedDateChange}
                disabled={loading}
                max={getCurrentSpcReportDate()}
              />
            </label>
            <button
              type="button"
              onClick={handleLoadReports}
              disabled={loading}
              className="load-button"
            >
              {loading ? 'Loading...' : 'Load Reports'}
            </button>
          </div>

          {error && <ErrorBanner error={error} />}
        </div>
      ) : null}

      {hasReports && showAnalysisPanel && (
        <>
          <ReportSummarySection
            date={date}
            totalReports={totalReports}
            reportCounts={reportCounts}
          />

          <DisplayOptionsSection
            visible={visible}
            onToggleVisibility={handleToggleVisibility}
          />

          <FilterByTypeSection
            visible={visible}
            filterByType={filterByType}
            reportCounts={reportCounts}
            onToggleType={handleToggleType}
          />

          {verificationResult && (
            <VerificationAnalysisSection
              verificationResult={verificationResult}
              activeOutlookType={activeOutlookType}
            />
          )}

          <div className="verification-section">
            <button
              type="button"
              onClick={handleClearReports}
              className="clear-button"
            >
              Clear Reports
            </button>
          </div>
        </>
      )}
      
      <div className="verification-info">
        <p><small>
          Storm reports are loaded from the NOAA Storm Prediction Center archives.
          Data may not be available for all dates.
        </small></p>
      </div>
    </div>
  );
};

export default VerificationPanel;
