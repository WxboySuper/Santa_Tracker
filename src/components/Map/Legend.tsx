// skipcq: JS-W1028
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import { CategoricalRiskLevel } from '../../types/outlooks';
import './Legend.css';
import { isFeatureExposed } from '../../config/featureExposure';
import { selectCurrentCustomLayers } from '../../store/forecastSlice';
import type { CustomCategoryTemplate } from '../../types/customProducts';

type LegendOutlookType = 'categorical' | 'tornado' | 'wind' | 'hail' | 'totalSevere' | 'day4-8';

interface LegendProps {
  activeOutlookType?: LegendOutlookType;
  desktopOpen?: boolean;
  mobileOpen?: boolean;
  showReportLegend?: boolean;
}

// Optimized: Memoized to prevent re-renders when parent re-renders
const Legend: React.FC<LegendProps> = React.memo(({
  activeOutlookType: activeOutlookTypeOverride,
  desktopOpen = true,
  mobileOpen = false,
  showReportLegend = false,
}) => {
  // Optimized: Select only activeOutlookType to avoid re-rendering on other drawing state changes (like activeProbability)
  const storeActiveOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const reportsVisible = useSelector((state: RootState) => showReportLegend && (state.stormReports?.visible ?? false));
  const reportFilters = useSelector((state: RootState) => showReportLegend
    ? state.stormReports?.filterByType ?? { tornado: true, wind: true, hail: true }
    : { tornado: true, wind: true, hail: true });
  const customEditor = useSelector((state: RootState) => state.forecast.customEditor) ?? { mode: 'severe' as const, activeLayerId: null, activeCategoryId: null };
  const customLayers = useSelector(selectCurrentCustomLayers);
  const activeOutlookType = activeOutlookTypeOverride || storeActiveOutlookType;
  const customMode = !activeOutlookTypeOverride && isFeatureExposed('customProducts') && customEditor.mode === 'custom';
  const activeCustomLayer = customLayers.layers.find(({ id }) => id === customEditor.activeLayerId) ?? customLayers.layers[0];

  /** Builds the fill and hatch styles for a custom category swatch. */
  const customSwatchBackground = (category: CustomCategoryTemplate): React.CSSProperties => {
    const angle = category.style.hatch === 'reverse-diagonal' ? '-45deg' : '45deg';
    const diagonal = `repeating-linear-gradient(${angle}, transparent 0 6px, ${category.style.strokeColor} 6px 8px)`;
    const reverse = `repeating-linear-gradient(-45deg, transparent 0 6px, ${category.style.strokeColor} 6px 8px)`;
    return {
      backgroundColor: category.style.fillColor,
      opacity: 1,
      backgroundImage: category.style.hatch === 'none' ? undefined : category.style.hatch === 'crosshatch' ? `${diagonal}, ${reverse}` : diagonal,
      borderColor: category.style.strokeColor,
      borderWidth: category.style.strokeWidth,
    };
  };

  /** Renders the categories for the active custom layer. */
  const renderCustomLegend = () => (
    <>
      <h4 id="legend-title">{activeCustomLayer?.label ?? 'Custom Layers'}</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {activeCustomLayer ? [...activeCustomLayer.categories].sort((a, b) => a.order - b.order).map((category) => (
          <div key={category.id} className="legend-item" role="listitem">
            <div className="legend-color" style={customSwatchBackground(category)} role="img" aria-label={`${category.label} custom style`} />
            <span>{category.label}</span>
          </div>
        )) : <span>No custom layer selected</span>}
      </div>
    </>
  );

  /** Renders the categorical legend swatches using the released opaque map treatment. */
  const renderCategoricalLegend = () => (
    <>
      <h4 id="legend-title">Categorical Risk Levels</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {(['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL', 'TSTM'] as const).map(risk => (
          <div key={risk} className="legend-item" role="listitem">
            <div 
              className="legend-color" 
              style={{ backgroundColor: colorMappings.categorical[risk], opacity: 1 }}
              role="img"
              aria-label={`Color for ${getCategoricalRiskDisplayName(risk as CategoricalRiskLevel)}`}
            />
            <span>{getCategoricalRiskDisplayName(risk as CategoricalRiskLevel)}</span>
          </div>
        ))}
      </div>
    </>
  );

  /** Renders probabilistic legend entries, including inline SVG hatch previews for CIG layers. */
  // @codescene(disable:"Complex Method")
  const renderProbabilisticLegend = () => {
    let probabilities: string[] = [];
    let colorMap: Record<string, string> = {};

    if (activeOutlookType === 'tornado') {
      probabilities = ['2%', '5%', '10%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2', 'CIG3'];
      colorMap = colorMappings.tornado;
    } else if (activeOutlookType === 'wind') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', '75%', '90%', 'CIG1', 'CIG2', 'CIG3'];
      colorMap = colorMappings.wind;
    } else if (activeOutlookType === 'hail') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2'];
      colorMap = colorMappings.hail;
    } else if (activeOutlookType === 'totalSevere') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2'];
      colorMap = colorMappings.totalSevere;
    } else if (activeOutlookType === 'day4-8') {
      probabilities = ['15%', '30%'];
      colorMap = colorMappings['day4-8'];
    }

    return (
      <>
        <h4 id="legend-title">
          {activeOutlookType === 'totalSevere' ? 'TotalSevere' : 
           activeOutlookType === 'day4-8' ? 'Day4-8' :
           activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} Probabilities
        </h4>
        <div className="legend-items" role="list" aria-labelledby="legend-title">
          {probabilities.map(prob => {
            const isCig = prob.startsWith('CIG');
            const label = isCig ? `${prob} (Hatching)` : prob;

            return (
              <div key={prob} className="legend-item" role="listitem">
                {isCig ? (
                  // Inline SVG swatch so the pattern renders correctly in HTML context
                  <svg
                    width="24"
                    height="24"
                    aria-label={`Legend for ${label}`}
                    role="img"
                    style={{
                      flexShrink: 0,
                      borderRadius: 2,
                      border: darkMode ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(0,0,0,0.4)'
                    }}
                  >
                    <defs>
                      {prob === 'CIG1' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Broken diagonal — matches createHatchPattern CIG1 */}
                          <line x1="0" y1="0" x2="3" y2="3" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                          <line x1="5" y1="5" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                      {prob === 'CIG2' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Solid diagonal */}
                          <line x1="0" y1="0" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                      {prob === 'CIG3' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Crosshatch */}
                          <line x1="0" y1="0" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                          <line x1="0" y1="10" x2="10" y2="0" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                    </defs>
                    <rect width="24" height="24" fill={darkMode ? '#3a3a3a' : '#d9d9d9'}/>
                    <rect width="24" height="24" fill={`url(#legend-${prob})`}/>
                  </svg>
                ) : (
                  <div
                    className="legend-color"
                    style={{ backgroundColor: colorMap[prob] }}
                    role="img"
                    aria-label={`Legend for ${label}`}
                  />
                )}
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  /** Renders the visible SPC report types in the map legend. */
  const renderReportLegend = () => {
    if (!reportsVisible) {
      return null;
    }
    const reports = [
      ['tornado', 'Tornado', '#8b5cf6'],
      ['wind', 'Wind', '#2563eb'],
      ['hail', 'Hail', '#16a34a'],
    ] as const;
    return (
      <div className="legend-reports" aria-labelledby="reports-legend-title">
        <h4 id="reports-legend-title">Reports visible</h4>
        <div className="legend-items" role="list">
          {reports.filter(([type]) => reportFilters[type]).map(([type, label, color]) => (
            <div key={type} className="legend-item" role="listitem">
              <span className="legend-report-dot" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      id="map-legend"
      className={`map-legend ${desktopOpen ? '' : 'map-legend--desktop-hidden'} ${mobileOpen ? 'map-legend--mobile-open' : ''}`}
      role="complementary"
      aria-label="Map Legend"
      translate="no"
    >
      {customMode ? renderCustomLegend() : activeOutlookType === 'categorical' ? renderCategoricalLegend() : renderProbabilisticLegend()}
      {renderReportLegend()}
    </div>
  );
});

Legend.displayName = 'Legend';

export default Legend;
