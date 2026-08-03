import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  setActiveOutlookType,
  setActiveProbability,
  selectCurrentDay,
} from '../../store/forecastSlice';
import {
  OutlookType,
  CategoricalRiskLevel,
  TornadoProbability,
  WindProbability,
  HailProbability,
  CIGLevel
} from '../../types/outlooks';
import { getAvailableProbabilities } from './outlookPanelUtils';
import { getOutlookConstraints } from '../../utils/outlookUtils';
import {
  isOutlookTypeExposed,
  isSignificantThreatsExposed,
} from '../../config/productExposureSelectors';

export function useOutlookPanelLogic() {
  const dispatch = useDispatch();
  const drawingState = useSelector((s: RootState) => s.forecast.drawingState);
  const emergencyMode = useSelector((s: RootState) => s.forecast.emergencyMode);
  const currentDay = useSelector(selectCurrentDay);
  const { activeOutlookType, activeProbability, isSignificant } = drawingState;

  const significantThreatsEnabled = isSignificantThreatsExposed();

  const getOutlookTypeEnabled = useCallback((type: OutlookType) => {
    // Check against current day's constraints
    const constraints = getOutlookConstraints(currentDay);
    const isTypeAllowedForDay = (constraints.outlookTypes as readonly OutlookType[]).includes(type);
    
    if (!isTypeAllowedForDay) {
      return false;
    }
    
    return isOutlookTypeExposed(type);
  }, [currentDay]);

  const handleOutlookTypeChange = useCallback(
    (type: OutlookType) => {
      if (!getOutlookTypeEnabled(type)) {
        return;
      }
      dispatch(setActiveOutlookType(type));
    },
    [dispatch, getOutlookTypeEnabled]
  );

  const handleProbabilityChange = useCallback(
    (probability: TornadoProbability | WindProbability | HailProbability | CategoricalRiskLevel | CIGLevel | any) => {
      dispatch(setActiveProbability(probability));
    },
    [dispatch]
  );

  const handleToggleSignificant = useCallback(() => {
    // Legacy support removed/disabled
  }, []);

  const probabilities = getAvailableProbabilities(activeOutlookType, currentDay);

  const probabilityHandlers = useMemo(
    () => Object.fromEntries(
      probabilities.map((p) => [p, () => handleProbabilityChange(p)])
    ),
    [probabilities, handleProbabilityChange]
  ) as Record<string, () => void>;

  const outlookTypeHandlers = useMemo(
    () => ({
      tornado: () => handleOutlookTypeChange('tornado'),
      wind: () => handleOutlookTypeChange('wind'),
      hail: () => handleOutlookTypeChange('hail'),
      categorical: () => handleOutlookTypeChange('categorical'),
      totalSevere: () => handleOutlookTypeChange('totalSevere'),
      'day4-8': () => handleOutlookTypeChange('day4-8'),
    }),
    [handleOutlookTypeChange]
  );

  return {
    emergencyMode,
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    handleOutlookTypeChange,
    outlookTypeHandlers,
    handleProbabilityChange,
    handleToggleSignificant,
    probabilities,
    probabilityHandlers,
  } as const;
}

export default useOutlookPanelLogic;
